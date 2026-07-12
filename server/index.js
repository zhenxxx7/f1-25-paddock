// F1 25 Paddock backend.
//  - Listens for F1 25 UDP telemetry on F1_UDP_PORT (default 20777).
//  - Separates senders into independent streams (keyed by source IP), so any
//    number of players can point their game at the same port without their
//    data colliding. Browsers subscribe to one stream over WebSocket.
//  - Serves the built frontend (../dist) over HTTP on HTTP_PORT (default 3000).
//  - Records each completed player lap to disk (per stream) for later replay.
//
// Run with:  npm start   (after `npm run build`)
//            npm run dev (runs vite + this server together)

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSocket } from 'node:dgram';
import { createHash } from 'node:crypto';

import { WebSocketServer } from 'ws';
import { parsePacket, MAX_CARS } from './parser.js';
import { driverName, trackName } from '../shared/enums.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const F1_UDP_PORT = parseInt(process.env.F1_UDP_PORT || '20777', 10);
const LAPS_DIR = join(ROOT, 'recordings');
const STREAM_IDLE_MS = 15 * 60_000; // forget a stream after 15 min of silence

// Sane throughput limits so the browser never gets flooded. High-rate
// packets (motion/telemetry/status) are throttled per type; low-rate
// packets (session, events, history, classification...) are always sent.
const MAX_HZ = {
  0: 30,   // motion
  6: 30,   // car telemetry
  7: 10,   // car status
  10: 10,  // car damage
  13: 30,  // motion ex
};

// ---- streams: one isolated state per telemetry sender ----------------------
// Every game instance that sends packets gets its own stream, keyed by the
// packet's source IP. The public stream id is a short hash so raw IPs are
// never exposed to viewers.
const streams = new Map();     // source address -> stream
const streamsById = new Map(); // public id -> stream

function freshState() {
  return {
    playerCarIndex: 0,
    session: null, participants: null, laps: null, telemetry: null,
    status: null, damage: null, setups: null, motionEx: null,
    histories: {},        // carIdx -> session-history packet
    tyreSets: {},         // carIdx -> tyre-sets packet
    finalClassification: null,
  };
}

function getOrCreateStream(addr) {
  let s = streams.get(addr);
  if (!s) {
    const id = createHash('sha1').update(addr).digest('hex').slice(0, 8);
    s = {
      id, addr,
      label: null, track: null,
      sessionUID: null, badFormat: null, lastPacketAt: 0,
      state: freshState(),
      lastSent: {},
      lapBuffers: new Map(), seenLapNums: new Map(),
    };
    streams.set(addr, s);
    streamsById.set(id, s);
    console.log(`[stream] new sender ${addr} -> stream ${id}`);
    pushStreams();
  }
  return s;
}

function streamsSummary() {
  const now = Date.now();
  return [...streamsById.values()].map(s => ({
    id: s.id,
    label: s.label || 'Driver',
    track: s.track,
    live: now - s.lastPacketAt < 5000,
  }));
}

// Drop streams that have been silent for a while.
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [addr, s] of streams) {
    if (now - s.lastPacketAt > STREAM_IDLE_MS) {
      streams.delete(addr);
      streamsById.delete(s.id);
      changed = true;
    }
  }
  if (changed) pushStreams();
}, 60_000);

// ---- HTTP -------------------------------------------------------------------
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, udp: F1_UDP_PORT, clients: wss.clients.size,
      streams: streamsSummary(),
    }));
    return;
  }

  if (url.pathname === '/api/streams') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(streamsSummary()));
    return;
  }

  // Saved-lap recording endpoints (used by the replay panel).
  // Recordings live in recordings/<streamId>/; the legacy root is still
  // listed when no stream is given.
  if (url.pathname === '/api/laps') {
    const streamId = url.searchParams.get('stream') || '';
    if (streamId && !/^[\w-]+$/.test(streamId)) { res.writeHead(400); res.end('bad stream'); return; }
    const dir = streamId ? join(LAPS_DIR, streamId) : LAPS_DIR;
    try {
      await mkdir(dir, { recursive: true });
      const files = (await readdir(dir)).filter(f => f.endsWith('.json')).sort().reverse();
      const laps = await Promise.all(files.slice(0, 200).map(async f => {
        try {
          const raw = await readFile(join(dir, f), 'utf8');
          const j = JSON.parse(raw);
          return {
            file: f,
            track: j.track, team: j.team, driver: j.driver,
            lapTimeMs: j.lapTimeMs, lapNumber: j.lapNumber,
            mtime: (await stat(join(dir, f))).mtimeMs,
          };
        } catch { return null; }
      }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(laps.filter(Boolean)));
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
    return;
  }

  if (url.pathname.startsWith('/api/laps/')) {
    // /api/laps/<file>  (legacy root)  or  /api/laps/<streamId>/<file>
    const parts = url.pathname.slice('/api/laps/'.length).split('/');
    const file = parts.pop();
    const streamId = parts.pop() || '';
    if (!/^[\w.-]+\.json$/.test(file) || (streamId && !/^[\w-]+$/.test(streamId)) || parts.length) {
      res.writeHead(400); res.end('bad path'); return;
    }
    try {
      const raw = await readFile(join(LAPS_DIR, streamId, file), 'utf8');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(raw);
    } catch { res.writeHead(404); res.end('not found'); }
    return;
  }

  // Static frontend serving.
  await serveStatic(req, res, url);
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function serveStatic(req, res, url) {
  const dist = join(ROOT, 'dist');
  if (!existsSync(dist)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('Frontend not built yet. Run: npm run build');
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' ) rel = '/index.html';
  let filePath = join(dist, rel);
  // SPA fallback + safe pathing.
  if (!filePath.startsWith(dist)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    try {
      const data = await readFile(join(dist, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  }
}

// ---- WebSocket plumbing -------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws' });
// ws re-emits the HTTP server's errors here; binding failures are already
// handled by listenHttp, so just keep the re-emit from crashing the process.
wss.on('error', () => {});

function broadcastAll(msg) {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
}

function broadcastToStream(streamId, msg) {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) {
    if (c.readyState === 1 && c.streamId === streamId) c.send(data);
  }
}

function pushStreams() {
  broadcastAll({ type: 'streams', streams: streamsSummary() });
}

// Send the subscribed stream's full snapshot so the dashboard is populated
// immediately instead of waiting for the next packet of each type.
function sendSnapshot(client, s) {
  const snap = { type: 'snapshot', data: {} };
  for (const k of ['session', 'participants', 'laps', 'telemetry', 'status', 'damage', 'setups', 'motionEx', 'finalClassification']) {
    if (s.state[k]) snap.data[k] = s.state[k];
  }
  snap.data.histories = s.state.histories;
  snap.data.tyreSets = s.state.tyreSets;
  snap.data.playerCarIndex = s.state.playerCarIndex;
  snap.data.badFormat = s.badFormat;
  client.send(JSON.stringify(snap));
}

wss.on('connection', (ws) => {
  ws.streamId = null;
  ws.send(JSON.stringify({ type: 'streams', streams: streamsSummary() }));
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribe' && typeof msg.stream === 'string') {
        const s = streamsById.get(msg.stream);
        if (!s) return;
        ws.streamId = s.id;
        sendSnapshot(ws, s);
      } else if (msg.type === 'replay') {
        broadcastToStream(ws.streamId, { type: 'replay', data: msg.data });
      }
    } catch { /* ignore */ }
  });
});

// ---- UDP listener ---------------------------------------------------------
const udp = createSocket('udp4');
udp.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  UDP port ${F1_UDP_PORT} is already in use — another telemetry app is listening.`);
    console.error(`  Close it, or run with F1_UDP_PORT=<port> and set the same port in F1 25's UDP settings.\n`);
    process.exit(1);
  }
  console.error('[udp] error', e);
});

udp.on('message', (buf, rinfo) => {
  if (buf.length < 2) return;
  const s = getOrCreateStream(rinfo.address);
  s.lastPacketAt = Date.now();

  // The game stamps every packet with its UDP format (2025 for F1 25 and its
  // season/DLC updates). Anything else means the in-game "UDP Format" setting
  // is wrong (or a future game) — tell that stream's viewers instead of
  // failing silently.
  const fmt = buf.readUInt16LE(0);
  if (fmt !== 2025) {
    if (s.badFormat !== fmt) {
      s.badFormat = fmt;
      console.warn(`[udp] ${rinfo.address} sends UDP format ${fmt}, need 2025 — in F1 25 set Settings > Telemetry > UDP Format = 2025`);
      broadcastToStream(s.id, { type: 'format', format: fmt });
    }
    return;
  }
  if (s.badFormat) {
    s.badFormat = null;
    broadcastToStream(s.id, { type: 'format', format: null });
  }

  const pkt = parsePacket(buf);
  if (!pkt || pkt.__error) return;
  const { header } = pkt;
  const packetId = header.packetId;

  // A new session (restart, next weekend session, flashback to menus) resets
  // this stream so viewers don't see stale data from the previous session.
  if (header.sessionUID && header.sessionUID !== '0') {
    if (s.sessionUID && s.sessionUID !== header.sessionUID) {
      s.state = freshState();
      s.lapBuffers = new Map();
      s.seenLapNums = new Map();
      broadcastToStream(s.id, { type: 'reset' });
    }
    s.sessionUID = header.sessionUID;
  }

  if (header.playerCarIndex !== undefined && header.playerCarIndex < MAX_CARS) {
    s.state.playerCarIndex = header.playerCarIndex;
  }

  // Keep the latest of each type, plus keyed stores for per-car packets.
  switch (packetId) {
    case 1: s.state.session = pkt; break;
    case 4: s.state.participants = pkt; break;
    case 2: s.state.laps = pkt; break;
    case 6: s.state.telemetry = pkt; break;
    case 7: s.state.status = pkt; break;
    case 10: s.state.damage = pkt; break;
    case 5: s.state.setups = pkt; break;
    case 13: s.state.motionEx = pkt; break;
    case 8: s.state.finalClassification = pkt; break;
    case 11: s.state.histories[pkt.carIdx] = pkt; break;
    case 12: s.state.tyreSets[pkt.carIdx] = pkt; break;
  }

  // Label the stream for the picker: player name (or driver) + track.
  if (packetId === 4) {
    const p = s.state.participants?.participants?.[s.state.playerCarIndex];
    const name = p ? (p.name || driverName(p.driverId)) : null;
    if (name && name !== s.label) { s.label = name; pushStreams(); }
  }
  if (packetId === 1) {
    const t = trackName(pkt.trackId);
    if (t !== s.track) { s.track = t; pushStreams(); }
  }

  // Throttle high-frequency packets per stream to keep browsers responsive.
  const maxHz = MAX_HZ[packetId];
  if (maxHz) {
    const now = Date.now();
    const minGap = 1000 / maxHz;
    if (s.lastSent[packetId] && now - s.lastSent[packetId] < minGap) return;
    s.lastSent[packetId] = now;
  }

  broadcastToStream(s.id, { type: 'packet', packetId, packet: pkt });

  // Lap recording: whenever this stream's player completes a lap, store the
  // telemetry sample stream captured since the previous lap completion.
  if (packetId === 2 && s.state.participants) {
    recordPlayerLap(s, pkt);
  }
});

// ---- lap recording --------------------------------------------------------
function recordPlayerLap(s, lapDataPkt) {
  const idx = s.state.playerCarIndex;
  const car = lapDataPkt.lapData?.[idx];
  if (!car) return;
  // A lap "completes" when currentLapNum increments relative to the lap
  // we were buffering samples for.
  const prev = s.seenLapNums.get(idx) ?? 0;
  if (car.currentLapNum <= prev) {
    pushSample(s, idx, car);
    return;
  }
  // Lap boundary crossed: flush the previous lap, start a new buffer.
  flushLap(s, car.currentLapNum - 1, car.lastLapTimeInMS);
  s.seenLapNums.set(idx, car.currentLapNum);
}

function pushSample(s, idx, car) {
  if (!s.lapBuffers.has(idx)) s.lapBuffers.set(idx, { lapNum: car.currentLapNum, samples: [] });
  const buf = s.lapBuffers.get(idx);
  const t = s.state.telemetry?.carTelemetryData?.[idx];
  const st = s.state.status?.carStatusData?.[idx];
  const d = s.state.damage?.carDamageData?.[idx];
  if (!t) return;
  buf.samples.push({
    t: car.currentLapTimeInMS / 1000,
    dist: car.lapDistance,
    speed: t.speed, rpm: t.engineRPM, gear: t.gear,
    throttle: t.throttle, brake: t.brake, steer: t.steer, drs: t.drs,
    brakeTemp: t.brakesTemperature, tyreSurfaceTemp: t.tyresSurfaceTemperature,
    tyrePressure: t.tyresPressure,
    fuel: st?.fuelInTank, ersStore: st?.ersStoreEnergy, ersDeploy: st?.ersDeployedThisLap,
    tyreWear: d?.tyresWear,
  });
}

async function flushLap(s, lapNum, lapTimeMs) {
  const buf = s.lapBuffers.get(s.state.playerCarIndex);
  s.lapBuffers.set(s.state.playerCarIndex, { lapNum: lapNum + 1, samples: [] });
  if (!buf || buf.samples.length < 10) return;
  if (!lapTimeMs || lapTimeMs <= 0) return;

  const session = s.state.session ?? {};
  const part = s.state.participants?.participants?.[s.state.playerCarIndex] ?? {};
  const meta = {
    recordedAt: new Date().toISOString(),
    track: session.trackId ?? -1,
    team: part.teamId ?? 0,
    driver: part.driverId ?? 255,
    driverName: part.name || 'Player',
    lapNumber: lapNum,
    lapTimeMs,
    sector2Start: session.sector2LapDistanceStart,
    sector3Start: session.sector3LapDistanceStart,
    trackLength: session.trackLength,
    samples: buf.samples,
  };
  try {
    const dir = join(LAPS_DIR, s.id);
    await mkdir(dir, { recursive: true });
    const fname = `${meta.recordedAt.replace(/[:.]/g, '-')}_lap${lapNum}.json`;
    await writeFile(join(dir, fname), JSON.stringify(meta));
    broadcastToStream(s.id, { type: 'lap-saved', data: { file: fname, lapTimeMs, lapNumber: lapNum } });
  } catch (e) {
    console.error('[record] failed', e.message);
  }
}

// ---- boot -----------------------------------------------------------------
// If the default HTTP port is taken (common: another dev server on 3000),
// walk forward a few ports instead of crashing. An explicit HTTP_PORT is
// respected strictly and fails loudly.
const explicitHttpPort = !!process.env.HTTP_PORT;

function listenHttp(port, attemptsLeft) {
  const onListening = () => {
    server.removeListener('error', onError);
    console.log(`\n  F1 25 Paddock  ->  http://localhost:${port}`);
    if (!explicitHttpPort && port !== HTTP_PORT) {
      console.warn(`  (default port ${HTTP_PORT} was busy; for "npm run dev" restart with HTTP_PORT=${port} so the Vite proxy matches)`);
    }
  };
  const onError = (e) => {
    server.removeListener('listening', onListening);
    if (e.code !== 'EADDRINUSE') throw e;
    if (!explicitHttpPort && attemptsLeft > 0) {
      console.warn(`  Port ${port} is busy -> trying ${port + 1}`);
      listenHttp(port + 1, attemptsLeft - 1);
      return;
    }
    console.error(`\n  Port ${port} is already in use. Pick another one:\n    HTTP_PORT=${port + 1} npm start\n`);
    process.exit(1);
  };
  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(port);
}

listenHttp(HTTP_PORT, 10);
udp.bind(F1_UDP_PORT, () => {
  console.log(`  UDP listener   ->  0.0.0.0:${F1_UDP_PORT}  (point F1 25 telemetry here)`);
  console.log(`  Recordings     ->  ${LAPS_DIR}\n`);
});
