import { el } from '../lib/dom.js';
import { ERS_MODE, FUEL_MIX } from '../lib/store.js';

// ERS energy balance + deployment/harvest, fuel, and full damage matrix.
// Battery bar fills with stored energy; deploy/harvest bars show this lap.
export function ErsDamage(state) {
  const idx = state.watchingCarIndex ?? state.playerCarIndex ?? 0;
  const st = state.status?.carStatusData?.[idx];
  const dmg = state.damage?.carDamageData?.[idx];

  if (!st && !dmg) {
    return el('div.panel')(
      el('div.panel-header')(el('span.panel-title')('ERS · FUEL · ', el('b', 'DAMAGE'))),
      el('div.empty')('No data yet'),
    );
  }

  const maxErs = 4_000_000; // 4 MJ store cap
  const ersPct = st ? Math.min(100, (st.ersStoreEnergy / maxErs) * 100) : 0;
  const deployPct = st ? Math.min(100, (st.ersDeployedThisLap / maxErs) * 100) : 0;
  const harvestPct = st ? Math.min(100, ((st.ersHarvestedThisLapMGUK + st.ersHarvestedThisLapMGUH) / maxErs) * 100) : 0;

  return el('div.panel')(
    el('div.panel-header')(el('span.panel-title')('ERS · FUEL · ', el('b', 'DAMAGE'))),
    el('div.panel-body')(
      // ---- ERS -------------------------------------------------------
      st && el('div.section')(
        el('div.section-title', 'Energy'),
        el('div.kv')(el('span.k', 'ERS STORE'), el('span.v', `${(st.ersStoreEnergy / 1e6).toFixed(2)} MJ`)),
        meter(ersPct, 'ers'),
        el('div.row2', { style: { marginTop: '6px' } })(
          cell('DEPLOY', `${(st.ersDeployedThisLap / 1e6).toFixed(2)} MJ`, deployPct, 'deploy'),
          cell('HARVEST', `${((st.ersHarvestedThisLapMGUK + st.ersHarvestedThisLapMGUH) / 1e6).toFixed(2)} MJ`, harvestPct, 'harvest'),
        ),
        el('div.kv', { style: { marginTop: '4px' } })(
          el('span.k', 'MODE'),
          el('span.v', ERS_MODE[st.ersDeployMode] ?? `--`),
        ),
        el('div.kv')(
          el('span.k', 'POWER ICE/MGU-K'),
          el('span.v', `${(st.enginePowerICE / 1000).toFixed(0)}/${(st.enginePowerMGUK / 1000).toFixed(0)} kW`),
        ),
      ),
      // ---- FUEL ------------------------------------------------------
      st && el('div.section')(
        el('div.section-title', 'Fuel'),
        el('div.kv')(el('span.k', 'FUEL'), el('span.v', `${st.fuelInTank.toFixed(2)} / ${st.fuelCapacity.toFixed(1)} kg`)),
        meter(Math.min(100, (st.fuelInTank / Math.max(1, st.fuelCapacity)) * 100), 'fuel'),
        el('div.kv', { style: { marginTop: '4px' } })(
          el('span.k', 'REMAINING'),
          el('span.v', `${st.fuelRemainingLaps.toFixed(2)} laps`),
        ),
        el('div.kv')(
          el('span.k', 'MIX / BIAS'),
          el('span.v', `${FUEL_MIX[st.fuelMix] ?? '--'} · ${st.frontBrakeBias}%`),
        ),
      ),
      // ---- DAMAGE ----------------------------------------------------
      dmg && el('div.section')(
        el('div.section-title', 'Damage'),
        damageGrid(dmg),
      ),
    ),
  );
}

function meter(pct, cls) {
  return el('div.meter')(
    el('div.meter-fill.' + cls, { style: { width: `${pct}%` } }),
  );
}

function cell(label, val, pct, cls) {
  return el('div.pedal')(
    el('div.label', label),
    meter(pct, cls),
    el('div.val', val),
  );
}

function damageGrid(d) {
  const items = [
    ['FL Wing', d.frontLeftWingDamage], ['FR Wing', d.frontRightWingDamage],
    ['Rear Wing', d.rearWingDamage], ['Floor', d.floorDamage],
    ['Diffuser', d.diffuserDamage], ['Sidepod', d.sidepodDamage],
    ['Gearbox', d.gearBoxDamage], ['Engine', d.engineDamage],
    ['DRS', d.drsFault ? 'FAULT' : 'OK'], ['ERS', d.ersFault ? 'FAULT' : 'OK'],
    ['ICE Wear', d.engineICEWear], ['MGU-H', d.engineMGUHWear],
    ['MGU-K', d.engineMGUKWear], ['TC', d.engineTCWear],
    ['Blown', d.engineBlown ? 'YES' : 'no'], ['Seized', d.engineSeized ? 'YES' : 'no'],
  ];
  return el('div.kv-grid')(
    items.map(([k, v]) => {
      const num = typeof v === 'number' ? v : 0;
      const color = num > 75 ? 'var(--red)' : num > 40 ? 'var(--yellow)' : 'var(--text)';
      return el('div.kv')(el('span.k', k), el('span.v', { style: { color } }, String(v)));
    }),
  );
}
