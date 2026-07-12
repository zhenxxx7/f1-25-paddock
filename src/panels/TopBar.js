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
    streamPicker(state),
    state.badFormat ? el('span.tag.red', `UDP FORMAT ${state.badFormat} · SET 2025 IN GAME`) : '',
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

// When several games feed this server, viewers pick which stream to watch.
function streamPicker(state) {
  if (!state.streams || state.streams.length < 2) return '';
  return el('select.stream-select', {
    onchange: (e) => e.target.value && setStream(e.target.value),
    title: 'Choose which player to watch',
  })(
    !state.streamId ? el('option', { value: '', selected: true, disabled: true }, 'SELECT STREAM…') : '',
    state.streams.map(s => el('option', {
      value: s.id,
      selected: s.id === state.streamId,
    }, `${s.label}${s.track ? ' · ' + s.track : ''}${s.live ? '' : ' (idle)'}`)),
  );
}

import { trackName, SESSION_TYPES, WEATHER, teamColour, driverName, setStream } from '../lib/store.js';
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
