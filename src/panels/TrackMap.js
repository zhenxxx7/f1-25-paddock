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
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanZ);
  // centre the circuit in the viewBox and flip Z (game Z is "north")
  const ox = (W - spanX * scale) / 2;
  const oy = (H - spanZ * scale) / 2;
  const project = (x, z) => [
    ox + (x - bounds.minX) * scale,
    H - oy - (z - bounds.minZ) * scale,
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
    const isPlayer = i === state.playerCarIndex;
    const isWatch = i === state.watchingCarIndex;
    const fill = isPlayer ? '#3be081' : (isWatch ? '#2ee5ff' : (part ? teamColour(part.teamId) : '#6b7688'));
    const r = (isPlayer || isWatch) ? 5 : 3.2;
    cars.push(elNS('circle', { cx: px, cy: py, r, fill, stroke: '#04060b', 'stroke-width': 1.5 })());
    if (isWatch) {
      cars.push(elNS('circle', { cx: px, cy: py, r: 8.5, fill: 'none', stroke: '#2ee5ff', 'stroke-width': 1, opacity: 0.55 })());
    }
  }

  const svg = elNS('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' })([
    trackPath && elNS('path', { d: trackPath, fill: 'none', stroke: 'rgba(151, 175, 220, 0.10)', 'stroke-width': 10, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })(),
    trackPath && elNS('path', { d: trackPath, fill: 'none', stroke: '#33415e', 'stroke-width': 4.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })(),
    ...zoneSegs.map(s => elNS('path', { d: s.d, fill: 'none', stroke: s.color, 'stroke-width': 6, opacity: 0.7, 'stroke-linecap': 'round' })()),
    ...cars,
  ]);

  return el('div.panel')(
    el('div.panel-header')(
      el('span.panel-title')('TRACK ', el('b', 'MAP')),
      marshalLegend(session),
    ),
    el('div.panel-body.map-body')(svg),
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
    const color = z.zoneFlag === 3 ? '#ffd21f' : (z.zoneFlag === 2 ? '#5b9dff' : '#3be081');
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
      if (c == null || c === false) return;
      if (typeof c === 'function') c = c();
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };
}
