import { el } from '../lib/dom.js';

// Rolling feed of decoded race events: fastest laps, penalties, safety car,
// overtakes, retirements, start lights, etc.
export function EventLog(state) {
  const evs = state.events || [];
  return el('div.panel')(
    el('div.panel-header')(
      el('span.panel-title')('RACE ', el('b', 'CONTROL')),
      el('span.faint.mono', `${evs.length}`),
    ),
    el('div.panel-body.event-log')(
      evs.length
        ? evs.map(e => el('div.row')(
            el('span.time', clock(e.at)),
            el('span.label', e.label),
            e.detail ? el('span.detail', e.detail) : '',
          ))
        : el('div.empty')('No events yet'),
    ),
  );
}

function clock(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
