import { el } from '../lib/dom.js';
import {
  setWatch, formatLapTime, formatGap,
  teamName, teamColour, driverName,
  PIT_STATUS, RESULT_STATUS,
} from '../lib/store.js';

// Live timing tower for all cars: position, gap to leader, tyre compound,
// pit/retired status. Clicking a row focuses the dashboard on that car.
export function TimingTower(state) {
  const { laps, participants, status, watchingCarIndex, playerCarIndex } = state;
  if (!laps || !participants) {
    return el('div.panel')(
      el('div.panel-header')(el('span.panel-title')('TIMING TOWER')),
      el('div.empty')(el('b', 'No cars yet'), 'Start a session in F1 25 with UDP enabled.'),
    );
  }

  const numCars = participants.numActiveCars || 22;
  const rows = [];
  for (let i = 0; i < numCars; i++) {
    const lap = laps.lapData[i];
    const part = participants.participants[i];
    const st = status?.carStatusData?.[i];
    if (!lap || !part || lap.resultStatus === 0) continue;

    const isWatch = i === watchingCarIndex;
    const isPlayer = i === playerCarIndex;
    const dnf = lap.resultStatus >= 4;
    const pitting = lap.pitStatus > 0;

    const gap = i === 0
      ? formatLapTime(lap.lastLapTimeInMS || 0)
      : formatGap(lap.deltaToRaceLeaderMinutesPart, lap.deltaToRaceLeaderMSPart);

    const visualTyre = st?.visualTyreCompound;
    const tyreColor = TYRE_COL[visualTyre] || '#556070';
    const tyreLetter = TYRE_LETTER[visualTyre] || '·';

    rows.push(
      el('div.tower-row' + (isWatch ? '.watch' : '') + (isPlayer ? '.player' : '') + (pitting ? '.pitting' : '') + (dnf ? '.dnf' : ''), {
        onclick: () => setWatch(i),
      })(
        el('span.pos', String(lap.carPosition || (i + 1))),
        el('span.team-bar', { style: { background: teamColour(part.teamId) } }),
        el('span.name')(
          el('span.tyre-badge', { style: { color: tyreColor } }, tyreLetter),
          driverDisplay(part),
          pitting ? el('span.tag.blue', 'PIT') : '',
          dnf ? el('span.tag.red', RESULT_STATUS[lap.resultStatus]) : '',
        ),
        el('span.gap', gap),
      ),
    );
  }

  return el('div.panel')(
    el('div.panel-header')(
      el('span.panel-title')('TIMING ', el('b', 'TOWER')),
      el('span.faint.mono', `${numCars} cars`),
    ),
    el('div.panel-body.tower')(rows),
  );
}

function driverDisplay(p) {
  return p.aiControlled
    ? driverName(p.driverId)
    : (p.name || `Player ${p.networkId}`);
}

// Visual tyre compound -> sidewall colour + letter used on TV broadcasts.
const TYRE_COL = {
  16: '#ff4d4d', 17: '#ff4d4d', // soft (C3..C5 actual -> red band)
  18: '#ffd200',                 // medium
  19: '#f0f0f0',                 // hard
  20: '#5b9dff',                 // C0/hard-ish
  21: '#ff4d4d',
  7: '#43d05a',                 // intermediate
  8: '#3a8de0',                 // wet
};
const TYRE_LETTER = {
  16: 'S', 17: 'S', 18: 'M', 19: 'H', 20: 'C', 21: 'S', 7: 'I', 8: 'W',
};
