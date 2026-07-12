import { el } from '../lib/dom.js';
import { formatLapTime, formatSector, kph, rpm } from '../lib/store.js';

// The driver cockpit: giant speed, gear, RPM LED bar, throttle/brake bars,
// lap/sector times, deltas, DRS, rev lights.
export function Cockpit(state) {
  const idx = state.watchingCarIndex ?? state.playerCarIndex ?? 0;
  const t = state.telemetry?.carTelemetryData?.[idx];
  const lap = state.laps?.lapData?.[idx];
  const status = state.status?.carStatusData?.[idx];

  if (!t) {
    return el('div.panel')(
      el('div.panel-header')(el('span.panel-title')('COCKPIT')),
      el('div.empty')('Waiting for telemetry…'),
    );
  }

  const maxRpm = status?.maxRPM || 12000;
  const rpmPct = Math.min(1, t.engineRPM / maxRpm);

  return el('div.panel')(
    el('div.panel-header')(
      el('span.panel-title')('DRIVER ', el('b', 'COCKPIT')),
      drsTag(t.drs),
    ),
    el('div.panel-body')(
      el('div.cockpit')(
        // ---- left: speed + gear + rpm ----------------------------------
        el('div.speedo')(
          el('div.speed-val', String(kph(t.speed))),
          el('div.speed-unit', 'KM/H'),
          gearTag(t.gear),
          rpmLedBar(t.revLightsBitValue, t.revLightsPercent),
          el('div.kv-grid', { style: { marginTop: '8px' } })(
            kv('RPM', `${rpm(t.engineRPM)}`),
            kv('MAX', `${rpm(maxRpm)}`),
            kv('CLUTCH', `${t.clutch}%`),
            kv('STEER', `${(t.steer * 100).toFixed(0)}%`),
          ),
        ),
        // ---- right: pedals + lap timing --------------------------------
        el('div')(
          pedals(t),
          el('div.kv-grid', { style: { marginTop: '12px' } })(
            kv('LAP', lap ? `${lap.currentLapNum} / ${state.session?.totalLaps ?? '--'}` : '--'),
            kv('POS', lap ? `P${lap.carPosition}` : '--'),
            kv('LAST', lap ? formatLapTime(lap.lastLapTimeInMS) : '--'),
            kv('CURR', lap ? formatLapTime(lap.currentLapTimeInMS) : '--'),
            sectorRow('S1', lap?.sector1TimeMinutesPart, lap?.sector1TimeMSPart),
            sectorRow('S2', lap?.sector2TimeMinutesPart, lap?.sector2TimeMSPart),
            kv('DRS DIST', status ? `${status.drsActivationDistance}m` : '--'),
            kv('FUEL', status ? `${status.fuelInTank.toFixed(2)}kg` : '--'),
          ),
        ),
      ),
    ),
  );
}

function gearTag(gear) {
  const cls = gear === 0 ? '.n' : (gear === -1 ? '.r' : '');
  const label = gear === 0 ? 'N' : (gear === -1 ? 'R' : String(gear));
  return el('div.gear' + cls, label);
}

function drsTag(drs) {
  if (!drs) return el('span.tag', 'DRS OFF');
  return el('span.tag.green', 'DRS ACTIVE');
}

function rpmLedBar(bitValue, percent) {
  // 15 LEDs from the bit field; fallback to percent if zero.
  const segs = [];
  for (let i = 0; i < 15; i++) {
    let on = false;
    if (bitValue) on = (bitValue >> i) & 1;
    else on = (i / 15) < (percent / 100);
    const color = ledColor(i);
    segs.push(el('div.seg', {
      style: on
        ? { background: color, boxShadow: `0 0 7px ${color}` }
        : { background: 'rgba(151,175,220,0.07)' },
    }));
  }
  return el('div.rpmbar')(segs);
}

function ledColor(i) {
  // left green, middle yellow, right red (mirrors the real wheel).
  if (i < 9) return '#3be081';
  if (i < 13) return '#ffd21f';
  return '#ff5252';
}

function pedals(t) {
  return el('div.pedals')(
    el('div.pedal.throttle')(
      el('div.label', 'THROTTLE'),
      el('div.bar')(el('div.fill', { style: { width: `${(t.throttle * 100).toFixed(0)}%` } })),
      el('div.val', `${(t.throttle * 100).toFixed(0)}%`),
    ),
    el('div.pedal.brake')(
      el('div.label', 'BRAKE'),
      el('div.bar')(el('div.fill', { style: { width: `${(t.brake * 100).toFixed(0)}%` } })),
      el('div.val', `${(t.brake * 100).toFixed(0)}%`),
    ),
  );
}

function sectorRow(label, minPart, msPart) {
  let val = '--.---';
  let color;
  if (msPart != null && msPart > 0) {
    val = formatSector((minPart || 0) * 60000 + msPart);
  }
  return kv(label, val);
}

function kv(k, v) {
  return el('div.kv')(el('span.k', k), el('span.v', v));
}
