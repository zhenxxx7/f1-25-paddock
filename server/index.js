// F1 25 Paddock backend.
//  - Listens for F1 25 UDP telemetry on F1_UDP_PORT (default 20777).
//  - Parses each packet and relays it to browser clients over WebSocket.
//  - Serves the built frontend (../dist) over HTTP on HTTP_PORT (default 3000).
//  - Records each completed player lap to disk for later replay.
//
// Run with:  npm start   (after `npm run build`)
//            npm run dev (runs vite + this server together)

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSocket } from 'node:dgram';

import { WebSocketServer } from 'ws';
import { parsePacket, HEADER_SIZE, MAX_CARS } from './parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const F1_UDP_PORT = parseInt(process.env.F1_UDP_PORT || '20777', 10);
const LAPS_DIR = join(ROOT, 'recordings');

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
const lastSent = {};

// ---- state: latest snapshot per packet type -------------------------------
const state = {
  badFormat: null,      // set when the game sends a UDP format we can't parse
  playerCarIndex: 0,
  session: null,
  participants: null,
  laps: null,
  telemetry: null,
  status: null,
  damage: null,
  setups: null,
  motionEx: null,
  histories: {},        // carIdx -> session-history packet
  tyreSets: {},         // carIdx -> tyre-sets packet
  finalClassification: null,
};

// ---- WebSocket plumbing ---------------------------------------------------
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, udp: F1_UDP_PORT, clients: wss.clients.size,
      format: state.badFormat ? `unsupported:${state.badFormat}` : '2025',
    }));
    return;
  }

  // Saved-lap recording endpoints (used by the replay panel).
  if (url.pathname === '/api/laps') {
    try {
      await mkdir(LAPS_DIR, { recursive: true });
      const files = (await readdir(LAPS_DIR)).filter(f => f.endsWith('.json')).sort().reverse();
      const laps = await Promise.all(files.slice(0, 200).map(async f => {
        try {
          const raw = await readFile(join(LAPS_DIR, f), 'utf8');
          const j = JSON.parse(raw);
          return {
            file: f,
            track: j.track, team: j.team, driver: j.driver,
            lapTimeMs: j.lapTimeMs, lapNumber: j.lapNumber,
            mtime: (await stat(join(LAPS_DIR, f))).mtimeMs,
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
    const f = url.pathname.slice('/api/laps/'.length);
    if (!/^[\w.-]+\.json$/.test(f)) { res.writeHead(400); res.end('bad file'); return; }
    try {
      const raw = await readFile(join(LAPS_DIR, f), 'utf8');
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

const wss = new WebSocketServer({ server, path: '/ws' });
// ws re-emits the HTTP server's errors here; binding failures are already
// handled by listenHttp, so just keep the re-emit from crashing the process.
wss.on('error', () => {});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(data);
  }
}

// Send the current full snapshot to a freshly connected client so the
// dashboard is populated immediately instead of waiting for the next tick.
function sendSnapshot(client) {
  const snap = { type: 'snapshot', data: {} };
  for (const k of ['session', 'participants', 'laps', 'telemetry', 'status', 'damage', 'setups', 'motionEx', 'finalClassification']) {
    if (state[k]) snap.data[k] = state[k];
  }
  snap.data.histories = state.histories;
  snap.data.tyreSets = state.tyreSets;
  snap.data.playerCarIndex = state.playerCarIndex;
  snap.data.badFormat = state.badFormat;
  client.send(JSON.stringify(snap));
}

wss.on('connection', (ws) => {
  sendSnapshot(ws);
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'replay') broadcast({ type: 'replay', data: msg.data });
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

udp.on('message', (buf) => {
  // The game stamps every packet with its UDP format (2025 for F1 25 and its
  // season/DLC updates). Anything else means the in-game "UDP Format" setting
  // is wrong (or a future game) — tell the dashboard instead of failing silently.
  if (buf.length >= 2) {
    const fmt = buf.readUInt16LE(0);
    if (fmt !== 2025) {
      if (state.badFormat !== fmt) {
        state.badFormat = fmt;
        console.warn(`[udp] receiving UDP format ${fmt}, need 2025 — in F1 25 set Settings > Telemetry > UDP Format = 2025`);
        broadcast({ type: 'format', format: fmt });
      }
      return;
    }
    if (state.badFormat) {
      state.badFormat = null;
      broadcast({ type: 'format', format: null });
    }
  }

  const pkt = parsePacket(buf);
  if (!pkt || pkt.__error) return;
  const { header, ...rest } = pkt;
  const packetId = header.packetId;

  // Track the player car index from every packet's header.
  if (header.playerCarIndex !== undefined && header.playerCarIndex < MAX_CARS) {
    state.playerCarIndex = header.playerCarIndex;
  }

  // Keep the latest of each type, plus keyed stores for per-car packets.
  switch (packetId) {
    case 1: state.session = pkt; break;
    case 4: state.participants = pkt; break;
    case 2: state.laps = pkt; break;
    case 6: state.telemetry = pkt; break;
    case 7: state.status = pkt; break;
    case 10: state.damage = pkt; break;
    case 5: state.setups = pkt; break;
    case 13: state.motionEx = pkt; break;
    case 8: state.finalClassification = pkt; break;
    case 11: state.histories[rest.carIdx] = pkt; break;
    case 12: state.tyreSets[rest.carIdx] = pkt; break;
  }

  // Throttle high-frequency packets to keep the browser responsive.
  const maxHz = MAX_HZ[packetId];
  if (maxHz) {
    const now = Date.now();
    const minGap = 1000 / maxHz;
    if (lastSent[packetId] && now - lastSent[packetId] < minGap) return;
    lastSent[packetId] = now;
  }

  broadcast({ type: 'packet', packetId, packet: pkt });

  // Lap recording: whenever the player completes a lap, store the telemetry
  // sample stream captured since the previous lap completion.
  if (packetId === 2 && state.participants) {
    recordPlayerLap(rest, header);
  }
});

// ---- lap recording --------------------------------------------------------
const lapBuffers = new Map(); // carIdx -> { lapNum, samples: [] }
const seenLapNums = new Map(); // carIdx -> last completed lap num

function recordPlayerLap(lapDataPkt, header) {
  const idx = state.playerCarIndex;
  const car = lapDataPkt.lapData?.[idx];
  if (!car) return;
  // A lap "completes" when currentLapNum increments relative to the lap
  // we were buffering samples for.
  const prev = seenLapNums.get(idx) ?? 0;
  if (car.currentLapNum <= prev) {
    pushSample(idx, car);
    return;
  }
  // Lap boundary crossed: flush the previous lap, start a new buffer.
  flushLap(idx, car.currentLapNum - 1, car.lastLapTimeInMS);
  seenLapNums.set(idx, car.currentLapNum);
}

function pushSample(idx, car) {
  if (!lapBuffers.has(idx)) lapBuffers.set(idx, { lapNum: car.currentLapNum, samples: [] });
  const buf = lapBuffers.get(idx);
  const t = state.telemetry?.carTelemetryData?.[idx];
  const s = state.status?.carStatusData?.[idx];
  const d = state.damage?.carDamageData?.[idx];
  if (!t) return;
  buf.samples.push({
    t: car.currentLapTimeInMS / 1000,
    dist: car.lapDistance,
    speed: t.speed, rpm: t.engineRPM, gear: t.gear,
    throttle: t.throttle, brake: t.brake, steer: t.steer, drs: t.drs,
    brakeTemp: t.brakesTemperature, tyreSurfaceTemp: t.tyresSurfaceTemperature,
    tyrePressure: t.tyresPressure,
    fuel: s?.fuelInTank, ersStore: s?.ersStoreEnergy, ersDeploy: s?.ersDeployedThisLap,
    tyreWear: d?.tyresWear,
  });
}

async function flushLap(idx, lapNum, lapTimeMs) {
  const buf = lapBuffers.get(idx);
  lapBuffers.set(idx, { lapNum: lapNum + 1, samples: [] });
  if (!buf || buf.samples.length < 10) return;
  // Only persist the player car's laps.
  if (idx !== state.playerCarIndex) return;
  if (!lapTimeMs || lapTimeMs <= 0) return;

  const session = state.session ?? {};
  const part = state.participants?.participants?.[idx] ?? {};
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
    await mkdir(LAPS_DIR, { recursive: true });
    const fname = `${meta.recordedAt.replace(/[:.]/g, '-')}_lap${lapNum}.json`;
    await writeFile(join(LAPS_DIR, fname), JSON.stringify(meta));
    broadcast({ type: 'lap-saved', data: { file: fname, lapTimeMs, lapNumber: lapNum } });
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
