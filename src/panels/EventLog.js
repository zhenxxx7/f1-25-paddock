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
            el('span.ev-dot' + dotCls(e.code)),
            el('span.time', clock(e.at)),
            el('span.label', e.label),
            e.detail ? el('span.detail', e.detail) : '',
          ))
        : el('div.empty')('No events yet'),
    ),
  );
}

// Colour-code events by what they mean on the pit wall.
const EVENT_COLOUR = {
  FTLP: 'purple', SPTP: 'purple',
  PENA: 'red', RTMT: 'red', RDFL: 'red', COLL: 'red', DTSV: 'red', SGSV: 'red',
  SCAR: 'yellow', CHQF: 'yellow', SEND: 'yellow', DRSD: 'yellow',
  SSTA: 'green', LGOT: 'green', DRSE: 'green', RCWN: 'green',
  OVTK: 'blue', TMPT: 'blue',
};
function dotCls(code) {
  const c = EVENT_COLOUR[code];
  return c ? '.' + c : '';
}

function clock(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
