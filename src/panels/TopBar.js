import { el } from '../lib/dom.js';

// Top status bar: logo, session breadcrumb, connection indicator.
export function TopBar(state) {
  const s = state.session;
  const watching = state.watchingCarIndex;
  const part = state.participants?.participants?.[watching];
  const conn = state.connected;
  const stale = state.lastPacketAt && (Date.now() - state.lastPacketAt > 3000);

  return el('div.topbar')(
    el('div.logo')('F1·25 ', el('span', 'PADDOCK')),
    el('div.crumb')(
      s ? [
        el('b', trackNameOf(s)),
        '·',
        el('span', sessionTypeOf(s)),
        el('span', `L${s.totalLaps ?? '--'}`),
        weatherOf(s),
      ] : el('span.faint', 'awaiting telemetry…'),
    ),
    part ? el('span.tag', { style: `color:${teamColour(part.teamId)}` }, driverOf(part)) : '',
    el('div.spacer')(),
    el('div.conn')(
      el('span.dot' + (conn && !stale ? '.live' : '')),
      conn && !stale ? `LIVE · ${state.packetCount} pkt` : (conn ? 'STALLED' : 'OFFLINE'),
    ),
  );
}

import { trackName, SESSION_TYPES, WEATHER, teamColour } from '../lib/store.js';
function trackNameOf(s) { return s.trackId != null ? trackName(s.trackId) : 'Unknown'; }
function sessionTypeOf(s) { return SESSION_TYPES[s.sessionType] ?? 'Session'; }
function weatherOf(s) {
  const w = WEATHER[s.weather] ?? '';
  const t = s.trackTemperature ?? '--';
  return el('span', `${w} ${t}°C`);
}
function driverOf(p) {
  return p.name || (p.driverId != null ? `Driver ${p.driverId}` : 'Player');
}
