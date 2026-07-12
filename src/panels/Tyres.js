import { el } from '../lib/dom.js';
import { SURFACES, tyreName } from '../lib/store.js';

// Four-corner tyre overview: surface + inner temp, wear, pressure, brake temp,
// and the surface each wheel is currently on. Tyres turn red when overheating.
export function Tyres(state) {
  const idx = state.watchingCarIndex ?? state.playerCarIndex ?? 0;
  const t = state.telemetry?.carTelemetryData?.[idx];
  const dmg = state.damage?.carDamageData?.[idx];

  if (!t) {
    return emptyPanel('TYRES');
  }

  // Wheel order in all F1 arrays: RL, RR, FL, FR.
  // Display order matches a top-down car view: FL FR / RL RR.
  const order = [2, 3, 0, 1];
  const labels = ['FL', 'FR', 'RL', 'RR'];

  return el('div.panel')(
    el('div.panel-header')(
      el('span.panel-title')('TYRES & ', el('b', 'BRAKES')),
      compoundTag(t, state.status?.carStatusData?.[idx]),
    ),
    el('div.panel-body.tyres')(
      order.map((w, i) => tyreCell(labels[i], w, t, dmg)),
    ),
  );
}

function tyreCell(label, w, t, dmg) {
  const surface = t.tyresSurfaceTemperature[w];
  const inner = t.tyresInnerTemperature[w];
  const wear = dmg?.tyresWear?.[w];
  const psi = t.tyresPressure[w];
  const brake = t.brakesTemperature[w];
  const surfType = t.surfaceType[w];

  const tempColor = surface >= 110 ? 'var(--red)' : surface >= 95 ? 'var(--yellow)' : 'var(--green)';

  return el('div.tyre-cell')(
    el('div.corner', label),
    el('div.temp', { style: { color: tempColor } }, `${surface}°`),
    el('div.tyre-meta', `IN ${inner}° · BRK ${brake}°`),
    el('div.psi', `${psi.toFixed(1)} psi · ${(SURFACES[surfType] ?? '?').toLowerCase()}`),
    wear != null ? wearBar(wear) : '',
  );
}

function wearBar(wear) {
  const pct = Math.min(100, Math.round(wear));
  const color = pct >= 60 ? 'var(--red)' : pct >= 35 ? 'var(--yellow)' : 'var(--green)';
  return el('div.wear-bar', { title: `wear ${pct}%` })(
    el('div.wear-fill', { style: { width: `${pct}%`, background: color } }),
  );
}

function compoundTag(t, status) {
  if (!status) return '';
  const name = tyreName(status.actualTyreCompound);
  const age = status.tyresAgeLaps ? ` · ${status.tyresAgeLaps}L` : '';
  return el('span.tag', name + age);
}

function emptyPanel(title) {
  return el('div.panel')(
    el('div.panel-header')(el('span.panel-title')(title)),
    el('div.empty')('No data yet'),
  );
}
