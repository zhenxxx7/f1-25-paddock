import { el } from '../lib/dom.js';
import {
  WEATHER, SESSION_TYPES, FORMULA, GAME_MODES, RULESETS, SAFETY_CAR,
  trackName, teamName, driverName, NATIONALITIES, PLATFORMS,
  formatLapTime,
} from '../lib/store.js';

// Three stacked info sections: session/weather forecast, full car setup,
// and the participants roster. Selectable via small tabs.
let tab = 'session';

export function InfoPanels(state) {
  return el('div.panel')(
    el('div.panel-header')(
      el('span.panel-title')('DATA ', el('b', 'BANK')),
      el('div.tabs')(
        tabBtn('session', 'SESSION'),
        tabBtn('setup', 'SETUP'),
        tabBtn('grid', 'GRID'),
        tabBtn('fc', 'RESULTS'),
      ),
    ),
    el('div.panel-body')(
      tab === 'session' ? sessionTab(state)
      : tab === 'setup' ? setupTab(state)
      : tab === 'grid' ? gridTab(state)
      : resultsTab(state),
    ),
  );
}

function tabBtn(id, label) {
  return el('span.tab' + (tab === id ? '.active' : ''), {
    onclick: () => { tab = id; rerender(); },
  }, label);
}

let rerenderFn = () => {};
export function setRender(fn) { rerenderFn = fn; }
function rerender() { rerenderFn(); }

// ---- session & weather forecast ------------------------------------------
function sessionTab(state) {
  const s = state.session;
  if (!s) return el('div.empty')('No session yet');

  const forecast = (s.weatherForecastSamples || []).slice(0, 12);
  return el('div')(
    kvGrid([
      ['Track', trackName(s.trackId)],
      ['Session', SESSION_TYPES[s.sessionType] ?? '--'],
      ['Formula', FORMULA[s.formula] ?? '--'],
      ['Game Mode', GAME_MODES[s.gameMode] ?? '--'],
      ['Ruleset', RULESETS[s.ruleSet] ?? '--'],
      ['Laps', s.totalLaps ?? '--'],
      ['Track Len', s.trackLength ? `${s.trackLength}m` : '--'],
      ['Pit Limit', `${s.pitSpeedLimit} km/h`],
      ['Weather', WEATHER[s.weather] ?? '--'],
      ['Track Temp', `${s.trackTemperature}°C`],
      ['Air Temp', `${s.airTemperature}°C`],
      ['Safety Car', SAFETY_CAR[s.safetyCarStatus] ?? '--'],
      ['AI Diff', s.aiDifficulty ?? '--'],
      ['Network', s.networkGame ? 'Online' : 'Offline'],
      ['Time of Day', minsToClock(s.timeOfDay)],
      ['S2 Start', s.sector2LapDistanceStart ? `${s.sector2LapDistanceStart.toFixed(0)}m` : '--'],
    ]),
    el('div.section-title', { style: { margin: '14px 0 6px' } }, 'Weather Forecast'),
    forecast.length
      ? el('div.kv-grid')(
          forecast.map(f => el('div.kv')(
            el('span.k', `+${f.timeOffset}m`),
            el('span.v', `${WEATHER[f.weather]?.slice(0, 4) ?? '?'} ${f.rainPercentage}%`),
          )),
        )
      : el('div.faint', 'no forecast data'),
  );
}

// ---- full car setup -------------------------------------------------------
function setupTab(state) {
  const idx = state.watchingCarIndex ?? state.playerCarIndex ?? 0;
  const cs = state.setups?.carSetups?.[idx];
  if (!cs) return el('div.empty')('No setup data');
  return el('div')(
    kvGrid([
      ['Front Wing', cs.frontWing], ['Rear Wing', cs.rearWing],
      ['Diff On', `${cs.onThrottle}%`], ['Diff Off', `${cs.offThrottle}%`],
      ['F Camber', cs.frontCamber.toFixed(3)], ['R Camber', cs.rearCamber.toFixed(3)],
      ['F Toe', cs.frontToe.toFixed(3)], ['Rtoe', cs.rearToe.toFixed(3)],
      ['F Susp', cs.frontSuspension], ['R Susp', cs.rearSuspension],
      ['F ARB', cs.frontAntiRollBar], ['R ARB', cs.rearAntiRollBar],
      ['F Height', cs.frontSuspensionHeight], ['R Height', cs.rearSuspensionHeight],
      ['Brake Press', `${cs.brakePressure}%`], ['Brake Bias', `${cs.brakeBias}%`],
      ['Eng Brake', `${cs.engineBraking}%`], ['Ballast', cs.ballast],
      ['RL PSI', cs.rearLeftTyrePressure.toFixed(1)], ['RR PSI', cs.rearRightTyrePressure.toFixed(1)],
      ['FL PSI', cs.frontLeftTyrePressure.toFixed(1)], ['FR PSI', cs.frontRightTyrePressure.toFixed(1)],
      ['Fuel', `${cs.fuelLoad.toFixed(2)}kg`], ['Next Wing', state.setups?.nextFrontWingValue?.toFixed(0) ?? '--'],
    ]),
  );
}

// ---- participants grid ----------------------------------------------------
function gridTab(state) {
  const p = state.participants;
  if (!p) return el('div.empty')('No participants');
  const rows = [];
  for (let i = 0; i < p.numActiveCars; i++) {
    const d = p.participants[i];
    if (!d) continue;
    rows.push(el('div.kv')(
      el('span.k', `P${i + 1} ${d.aiControlled ? 'AI' : 'HU'}`),
      el('span.v', { style: { color: 'var(--text)' } }, driverName(d.driverId) !== `Driver ${d.driverId}` ? driverName(d.driverId) : d.name),
      el('span.faint', teamName(d.teamId)),
    ));
  }
  return el('div.kv-grid')(rows);
}

// ---- final classification -------------------------------------------------
function resultsTab(state) {
  const fc = state.finalClassification;
  if (!fc) return el('div.empty')(el('b', 'No results yet'), 'Appears when a race finishes.');
  const rows = [];
  for (let i = 0; i < fc.numCars; i++) {
    const c = fc.classificationData[i];
    const part = state.participants?.participants?.[i];
    rows.push(el('div.kv')(
      el('span.k', `P${c.position}`),
      el('span.v', part ? (part.name || driverName(part.driverId)) : `Car ${i}`),
      el('span.faint', formatLapTime(c.bestLapTimeInMS)),
      el('span.faint', `${c.points}pts`),
    ));
  }
  return el('div.kv-grid')(rows);
}

function kvGrid(items) {
  return el('div.kv-grid')(items.map(([k, v]) => el('div.kv')(el('span.k', k), el('span.v', String(v)))));
}

function minsToClock(m) {
  if (m == null) return '--';
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
