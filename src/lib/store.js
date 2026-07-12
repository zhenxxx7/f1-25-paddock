// Tiny reactive store. Components register render callbacks; the store
// merges incoming telemetry packets into one snapshot, then re-renders.
import {
  TRACKS, WEATHER, SESSION_TYPES, FORMULA, GAME_MODES, RULESETS,
  TEAMS, TEAM_COLOURS, DRIVERS, TYRE_ACTUAL, TYRE_VISUAL_COLOUR,
  PIT_STATUS, DRIVER_STATUS, RESULT_STATUS, SAFETY_CAR, ERS_MODE, FUEL_MIX,
  SURFACES, NATIONALITIES, PLATFORMS, PACKET_TYPES,
  teamName, teamColour, driverName, trackName, tyreName,
} from '../../shared/enums.js';

// Re-export lookup helpers for panels.
export {
  TRACKS, WEATHER, SESSION_TYPES, FORMULA, GAME_MODES, RULESETS,
  TEAMS, TEAM_COLOURS, DRIVERS, TYRE_ACTUAL, TYRE_VISUAL_COLOUR,
  PIT_STATUS, DRIVER_STATUS, RESULT_STATUS, SAFETY_CAR, ERS_MODE, FUEL_MIX,
  SURFACES, NATIONALITIES, PLATFORMS, PACKET_TYPES,
  teamName, teamColour, driverName, trackName, tyreName,
};

const state = {
  connected: false,
  badFormat: null,        // non-2025 UDP format detected by the backend
  packetCount: 0,
  lastPacketAt: 0,
  playerCarIndex: 0,
  watchingCarIndex: 0,    // which car the dashboard focuses on (defaults to player)
  session: null,
  participants: null,
  laps: null,
  telemetry: null,
  status: null,
  damage: null,
  setups: null,
  motionEx: null,
  histories: {},
  tyreSets: {},
  finalClassification: null,
  events: [],             // rolling log of decoded events
};

const subscribers = new Set();
let notifyPending = false;
let lastNotify = 0;
const MIN_FRAME_MS = 50; // cap full re-renders at ~20 fps; panels rebuild their whole DOM

// Timer-driven (not requestAnimationFrame) so the wall keeps updating while
// the game has focus and the browser tab is backgrounded / on another monitor.
function scheduleNotify() {
  if (notifyPending) return;
  notifyPending = true;
  const wait = Math.max(0, MIN_FRAME_MS - (performance.now() - lastNotify));
  setTimeout(() => {
    notifyPending = false;
    lastNotify = performance.now();
    for (const fn of subscribers) {
      try { fn(state); } catch (e) { console.error(e); }
    }
  }, wait);
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getState() { return state; }

export function setWatch(idx) {
  state.watchingCarIndex = idx;
  scheduleNotify();
}

// ---- packet ingestion -----------------------------------------------------
function applyPacket(packetId, packet) {
  state.packetCount++;
  state.lastPacketAt = Date.now();

  if (packet.header?.playerCarIndex != null && packet.header.playerCarIndex < 22) {
    state.playerCarIndex = packet.header.playerCarIndex;
    if (state.watchingCarIndex == null) state.watchingCarIndex = packet.header.playerCarIndex;
  }

  switch (packetId) {
    case 0: state.motion = packet; break;
    case 1: state.session = packet; break;
    case 2: state.laps = packet; break;
    case 4: state.participants = packet; break;
    case 5: state.setups = packet; break;
    case 6: state.telemetry = packet; break;
    case 7: state.status = packet; break;
    case 8: state.finalClassification = packet; break;
    case 10: state.damage = packet; break;
    case 11: state.histories[packet.carIdx] = packet; break;
    case 12: state.tyreSets[packet.carIdx] = packet; break;
    case 13: state.motionEx = packet; break;
    case 3: pushEvent(packet); break;   // events are append-only
    default: break;
  }
  scheduleNotify();
}

function pushEvent(packet) {
  const codes = {
    SSTA: 'Session Started', SEND: 'Session Ended', FTLP: 'Fastest Lap',
    RTMT: 'Retirement', DRSE: 'DRS Enabled', DRSD: 'DRS Disabled',
    TMPT: 'Team-mate in Pits', CHQF: 'Chequered Flag', RCWN: 'Race Winner',
    PENA: 'Penalty', SPTP: 'Speed Trap', STLG: 'Start Lights', LGOT: 'Lights Out',
    DTSV: 'Drive-Through Served', SGSV: 'Stop/Go Served', FLBK: 'Flashback',
    BUTN: 'Button', RDFL: 'Red Flag', OVTK: 'Overtake', SCAR: 'Safety Car', COLL: 'Collision',
  };
  const label = codes[packet.code] || packet.code;
  let detail = '';
  if (packet.code === 'FTLP') detail = `car ${packet.vehicleIdx} - ${formatLapTime(packet.lapTime * 1000)}`;
  else if (packet.code === 'RCWN') detail = `car ${packet.vehicleIdx}`;
  else if (packet.code === 'PENA') detail = `car ${packet.vehicleIdx}`;
  else if (packet.code === 'STLG') detail = `${packet.numLights} lights`;
  else if (packet.code === 'SPTP') detail = `car ${packet.vehicleIdx} - ${packet.speed.toFixed(0)} km/h`;
  else if (packet.vehicleIdx != null) detail = `car ${packet.vehicleIdx}`;
  state.events.unshift({ code: packet.code, label, detail, at: Date.now() });
  if (state.events.length > 60) state.events.length = 60;
}

// ---- WebSocket client -----------------------------------------------------
let ws = null;
let reconnectTimer = null;

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { state.connected = true; scheduleNotify(); };
  ws.onclose = () => {
    state.connected = false;
    scheduleNotify();
    reconnectTimer = setTimeout(connect, 1500);
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'snapshot') {
      Object.assign(state, msg.data);
      if (state.playerCarIndex != null && state.watchingCarIndex == null) {
        state.watchingCarIndex = state.playerCarIndex;
      }
      scheduleNotify();
    } else if (msg.type === 'packet') {
      applyPacket(msg.packetId, msg.packet);
    } else if (msg.type === 'format') {
      // Game is sending a UDP format we can't parse (wrong in-game setting).
      state.badFormat = msg.format;
      scheduleNotify();
    } else if (msg.type === 'lap-saved' || msg.type === 'replay') {
      // Panels subscribe to these via the event bus below.
      bus.emit(msg.type, msg.data);
    }
  };
}

// Minimal event bus for one-off messages (lap saved, replay loaded).
const bus = { handlers: new Map() };
bus.on = (type, fn) => {
  if (!bus.handlers.has(type)) bus.handlers.set(type, new Set());
  bus.handlers.get(type).add(fn);
  return () => bus.handlers.get(type).delete(fn);
};
bus.emit = (type, data) => {
  bus.handlers.get(type)?.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
};
export const events = bus;

// ---- formatting helpers ---------------------------------------------------
export function formatLapTime(ms) {
  if (ms == null || ms <= 0) return '--:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function formatSector(ms) {
  if (ms == null || ms <= 0) return '--.---';
  return (ms / 1000).toFixed(3);
}

export function formatGap(minPart, msPart) {
  if (msPart == null) return '';
  const totalMs = (minPart || 0) * 60000 + msPart;
  const s = totalMs / 1000;
  if (s >= 60) return `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
  return `+${s.toFixed(3)}`;
}

export function kph(speed) { return speed != null ? Math.round(speed) : '--'; }

export function rpm(r) { return r != null ? Math.round(r) : '--'; }

export function tyreLabel(visual, actual) {
  const v = TYRE_VISUAL_COLOUR[visual] ? TYRE_ACTUAL[actual] || TYRE_ACTUAL[visual] : TYRE_ACTUAL[actual];
  return v || '--';
}
export function tyreColour(visual) { return TYRE_VISUAL_COLOUR[visual] || '#555'; }
