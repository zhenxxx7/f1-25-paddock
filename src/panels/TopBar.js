import { el } from '../lib/dom.js';

// Top status bar: brand block, session chips, watched driver, connection pill.
export function TopBar(state) {
  const s = state.session;
  const watching = state.watchingCarIndex;
  const part = state.participants?.participants?.[watching];
  const conn = state.connected;
  const stale = state.lastPacketAt && (Date.now() - state.lastPacketAt > 3000);
  const live = conn && !stale;

  return el('div.topbar')(
    el('div.brand')(
      el('span.brand-mark', 'F1·25'),
      el('span.brand-name')('PADDOCK', el('span.brand-sub', 'LIVE TELEMETRY WALL')),
    ),
    el('div.crumb')(
      s ? [
        chip('TRACK', trackNameOf(s)),
        chip('SESSION', sessionTypeOf(s)),
        chip('LAPS', String(s.totalLaps ?? '--')),
        chip('WX', weatherOf(s)),
      ] : el('span.faint.mono', 'awaiting telemetry…'),
    ),
    el('div.spacer')(),
    part ? el('span.chip.driver')(
      el('span.chip-k', { style: `color:${teamColour(part.teamId)}` }, '●'),
      el('span.chip-v', driverOf(part)),
    ) : '',
    el('div.conn' + (live ? '.live' : ''))(
      el('span.dot' + (live ? '.live' : '')),
      live ? `LIVE · ${state.packetCount}` : (conn ? 'STALLED' : 'OFFLINE'),
    ),
  );
}

function chip(k, v) {
  return el('span.chip')(el('span.chip-k', k), el('span.chip-v', v));
}

import { trackName, SESSION_TYPES, WEATHER, teamColour, driverName } from '../lib/store.js';
function trackNameOf(s) { return s.trackId != null ? trackName(s.trackId) : 'Unknown'; }
function sessionTypeOf(s) { return SESSION_TYPES[s.sessionType] ?? 'Session'; }
function weatherOf(s) {
  const w = WEATHER[s.weather] ?? '';
  const t = s.trackTemperature ?? '--';
  return `${w} · ${t}°C`;
}
function driverOf(p) {
  if (p.aiControlled) return driverName(p.driverId);
  return p.name || (p.driverId != null ? driverName(p.driverId) : 'Player');
}
