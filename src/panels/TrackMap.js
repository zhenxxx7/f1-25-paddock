import { el } from '../lib/dom.js';
import { teamColour } from '../lib/store.js';

// Track map: learns the lap outline from the player car's world positions
// over the first lap, then plots every car's live position on it. Sectors
// and marshal zones (yellow flags) are drawn as coloured track segments.
export function TrackMap(state) {
  const motion = state.motion;
  const laps = state.laps;
  const session = state.session;

  if (!motion || !laps) {
    return el('div.panel')(
      el('div.panel-header')(el('span.panel-title')('TRACK ', el('b', 'MAP'))),
      el('div.empty')('Drive a lap to trace the circuit…'),
    );
  }

  // Project world coordinates into the SVG viewBox via stored bounds.
  const bounds = getBounds();
  if (!bounds) {
    // Seed bounds from the first packet we see.
    seedBounds(motion);
    return el('div.panel')(
      el('div.panel-header')(el('span.panel-title')('TRACK ', el('b', 'MAP'))),
      el('div.empty')('Calibrating track bounds…'),
    );
  }

  const W = 360, H = 300, pad = 18;
  const scale = Math.min((W - pad * 2) / (bounds.maxX - bounds.minX), (H - pad * 2) / (bounds.maxY - bounds.minY));
  const project = (x, y) => [
    pad + (x - bounds.minX) * scale,
    H - pad - (y - bounds.minY) * scale, // flip Y (game Y is "north")
  ];

  // Sampled track points (learned over time, appended below).
  const trace = getTrace();
  const trackPath = trace.length > 1
    ? 'M ' + trace.map(([x, y]) => project(x, y).map(n => n.toFixed(1)).join(' ')).join(' L ')
    : '';

  // Marshal zone colours along the trace (yellow/blue flags).
  const zoneSegs = marshalSegments(session, trace, project);

  // Each car as a dot; player + watched car are emphasised.
  const cars = [];
  for (let i = 0; i < 22; i++) {
    const m = motion.carMotionData[i];
    if (!m || !laps.lapData[i] || laps.lapData[i].resultStatus === 0) continue;
    const [px, py] = project(m.worldPositionX, m.worldPositionZ);
    const part = state.participants?.participants?.[i];
    const fill = i === state.playerCarIndex ? '#2ee06b' : (i === state.watchingCarIndex ? '#00e0ff' : (part ? teamColour(part.teamId) : '#888'));
    const r = (i === state.playerCarIndex || i === state.watchingCarIndex) ? 5 : 3;
    cars.push(el('circle', { cx: px, cy: py, r, fill, stroke: '#000', 'stroke-width': 1 }));
  }

  const svg = elNS('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: 'auto' })([
    trackPath && elNS('path', { d: trackPath, fill: 'none', stroke: '#2a3445', 'stroke-width': 6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })(),
    ...zoneSegs.map(s => elNS('path', { d: s.d, fill: 'none', stroke: s.color, 'stroke-width': 6, opacity: 0.6 })()),
    ...cars,
  ]);

  return el('div.panel')(
    el('div.panel-header')(
      el('span.panel-title')('TRACK ', el('b', 'MAP')),
      marshalLegend(session),
    ),
    el('div.panel-body.center')(svg),
  );
}

// ---- track trace learning (module-scoped) --------------------------------
let trace = [];
let bounds = null;
let lastTraceFrame = -1;

function getTrace() { return trace; }
function getBounds() { return bounds; }

function seedBounds(motion) {
  const m = motion.carMotionData[motion.header?.playerCarIndex || 0];
  if (!m) return;
  bounds = { minX: m.worldPositionX - 200, maxX: m.worldPositionX + 200, minZ: m.worldPositionZ - 200, maxZ: m.worldPositionZ + 200 };
}

// Called externally each tick to accumulate outline points + grow bounds.
export function learnTrack(state) {
  const motion = state.motion;
  if (!motion) return;
  const frame = motion.header?.frameIdentifier;
  if (frame === lastTraceFrame) return;
  lastTraceFrame = frame;
  const idx = state.playerCarIndex ?? 0;
  const m = motion.carMotionData[idx];
  if (!m) return;
  const x = m.worldPositionX, z = m.worldPositionZ;
  if (!bounds) bounds = { minX: x, maxX: x, minZ: z, maxZ: z };
  // Grow bounds to fit the whole circuit.
  bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
  // Subsample: only keep a point if it moved >8m from the last kept one.
  const last = trace[trace.length - 1];
  if (!last || Math.hypot(last[0] - x, last[1] - z) > 8) {
    trace.push([x, z]);
    if (trace.length > 2000) trace.shift();
  }
}

function marshalSegments(session, trace, project) {
  if (!session || !trace.length) return [];
  const zones = session.marshalZones?.filter(z => z.zoneFlag > 0) ?? [];
  const out = [];
  for (const z of zones) {
    const start = Math.floor(z.zoneStart * trace.length);
    const end = Math.min(trace.length, start + 20);
    const slice = trace.slice(start, end);
    if (slice.length < 2) continue;
    const color = z.zoneFlag === 3 ? '#ffcc1f' : (z.zoneFlag === 2 ? '#4a90ff' : '#2ee06b');
    out.push({
      color,
      d: 'M ' + slice.map(([x, y]) => project(x, y).map(n => n.toFixed(1)).join(' ')).join(' L '),
    });
  }
  return out;
}

function marshalLegend(session) {
  const sc = session?.safetyCarStatus;
  if (sc === 1) return el('span.tag.yellow', 'SAFETY CAR');
  if (sc === 2) return el('span.tag.yellow', 'VSC');
  return '';
}

// SVG element helper (namespaced).
function elNS(tag, attrs) {
  return (children = []) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) node.setAttribute(k, v);
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };
}
