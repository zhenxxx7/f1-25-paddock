// Offline verification: synthesize valid F1 25 packets and confirm the parser
// consumes exactly the documented number of bytes and reads sane values.
// Run:  node test-parser.mjs

import { parsePacket } from './server/parser.js';

let pass = 0, fail = 0;
function ok(name, cond) { cond ? pass++ : (fail++, console.log('  FAIL', name)); }

// ---- build a little-endian buffer writer --------------------------------
function Writer() {
  const parts = [];
  return {
    u8(v)  { const b = Buffer.alloc(1); b.writeUInt8(v, 0); parts.push(b); },
    i8(v)  { const b = Buffer.alloc(1); b.writeInt8(v, 0); parts.push(b); },
    u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v, 0); parts.push(b); },
    i16(v) { const b = Buffer.alloc(2); b.writeInt16LE(v, 0); parts.push(b); },
    u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v, 0); parts.push(b); },
    f32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); parts.push(b); },
    f64(v) { const b = Buffer.alloc(8); b.writeDoubleLE(v, 0); parts.push(b); },
    raw(b) { parts.push(Buffer.from(b)); },
    buf()  { return Buffer.concat(parts); },
    len()  { return parts.reduce((n, p) => n + p.length, 0); },
  };
}

function header(w, packetId, playerCarIndex = 0) {
  w.u16(2025); // packetFormat
  w.u8(25);    // gameYear
  w.u8(1); w.u8(0); // major/minor
  w.u8(1);     // packetVersion
  w.u8(packetId);
  w.u32(1234); w.u32(5678); // sessionUID as two u32
  w.f32(1.5); // sessionTime
  w.u32(100); // frameIdentifier
  w.u32(100); // overallFrameIdentifier
  w.u8(playerCarIndex);
  w.u8(255);  // secondaryPlayerCarIndex
}

// ===== Session packet: header + 724-byte body = 753 bytes ==================
{
  const w = Writer();
  header(w, 1, 5);
  // body
  w.u8(0);            // weather
  w.i8(31);           // trackTemp
  w.i8(25);           // airTemp
  w.u8(58);           // totalLaps
  w.u16(5303);        // trackLength (Melbourne-ish)
  w.u8(15);           // sessionType (race)
  w.i8(0);            // trackId (Melbourne)
  w.u8(0);            // formula
  w.u16(0); w.u16(0); // sessionTimeLeft / duration
  w.u8(80);           // pitSpeedLimit
  w.u8(0); w.u8(0); w.u8(0); w.u8(0); // paused/spectating/specCar/sli
  w.u8(3);            // numMarshalZones
  for (let i = 0; i < 21; i++) { w.f32(i / 21); w.i8(0); } // marshal zones
  w.u8(0);            // safetyCarStatus
  w.u8(0);            // networkGame
  w.u8(2);            // numWeatherForecastSamples
  for (let i = 0; i < 64; i++) { // forecast samples (8 bytes each)
    w.u8(0); w.u8(Math.min(255, i * 5)); w.u8(0); w.i8(30); w.i8(0); w.i8(25); w.i8(0); w.u8(10);
  }
  w.u8(0);            // forecastAccuracy
  w.u8(95);           // aiDifficulty
  w.u32(1); w.u32(2); w.u32(3); // link identifiers
  w.u8(0); w.u8(0); w.u8(0); // pit window ideal/latest/rejoin
  w.u8(0); w.u8(0); w.u8(0); w.u8(0); w.u8(0); w.u8(0); w.u8(0); // 7 assists (steer/brake/gearbox/pit/pitRelease/ers/drs)
  w.u8(0); w.u8(0); // racing line + type
  w.u8(15);           // gameMode (race)
  w.u8(1);            // ruleSet
  w.u32(720);         // timeOfDay
  w.u8(6);            // sessionLength
  w.u8(1); w.u8(0); w.u8(1); w.u8(0); // units
  w.u8(0); w.u8(0); w.u8(0); // safety car counts
  w.u8(0); w.u8(0); w.u8(0); w.u8(0); // equal/recovery/flashback/surface
  w.u8(0); w.u8(0); w.u8(0); // lowfuel/racestarts/tyretemp
  w.u8(0); w.u8(2); w.u8(1); w.u8(0); // pitlanetyre/damage/damagerate/collisions
  w.u8(0); w.u8(0); w.u8(0); w.u8(0); // mp flags
  w.u8(0); w.u8(0); w.u8(0); // parcferme/pitexp/safetycar
  w.u8(0); w.u8(0); w.u8(0); w.u8(0); // safetycarexp/formation/formationexp/redflags
  w.u8(0); w.u8(0); // licence levels
  w.u8(4);            // numSessionsInWeekend
  for (let i = 0; i < 12; i++) w.u8(i); // weekendStructure
  w.f32(1800);        // sector2LapDistanceStart
  w.f32(3600);        // sector3LapDistanceStart

  const buf = w.buf();
  ok('session packet size = 753', buf.length === 753);
  const pkt = parsePacket(buf);
  ok('session parsed', pkt && !pkt.__error);
  ok('session trackId = 0', pkt.trackId === 0);
  ok('session totalLaps = 58', pkt.totalLaps === 58);
  ok('session trackLength = 5303', pkt.trackLength === 5303);
  ok('session playerCarIndex = 5', pkt.header.playerCarIndex === 5);
  ok('session 3 marshal zones', pkt.marshalZones.length === 21 && pkt.numMarshalZones === 3);
  ok('session 64 forecasts', pkt.weatherForecastSamples.length === 64);
  ok('session sector2Start = 1800', pkt.sector2LapDistanceStart === 1800);
  if (buf.length !== 753) console.log('  session buf len', buf.length);
  if (pkt?.__error) console.log('  session parse error', pkt.__error);
}

// ===== LapData packet: 29 + 22*57 + 2 = 1285 ==============================
{
  const w = Writer();
  header(w, 2, 0);
  for (let i = 0; i < 22; i++) {
    w.u32(79000 + i);  // lastLapTimeInMS
    w.u32(30000);      // currentLapTimeInMS
    w.u16(25000); w.u8(1); // s1 ms + min
    w.u16(26000); w.u8(1); // s2
    w.u16(1500); w.u8(0);  // deltaToFront
    w.u16(3000); w.u8(0);  // deltaToLeader
    w.f32(1500.5); w.f32(30000); w.f32(0); // lapDist/totalDist/scDelta
    w.u8(i + 1);      // carPosition
    w.u8(5);          // currentLapNum
    w.u8(0); w.u8(0); // pitStatus/numPitStops
    w.u8(1); w.u8(0); // sector/currentLapInvalid
    w.u8(0); w.u8(0); w.u8(0); w.u8(0); // penalties/warnings/cornercut/driveThrough
    w.u8(0); w.u8(i); w.u8(1); // stopGo/gridPos/driverStatus
    w.u8(2);          // resultStatus (active)
    w.u8(0);          // pitLaneTimerActive
    w.u16(0); w.u16(0); w.u8(0); // pit timers
    w.f32(310.5);     // speedTrapFastestSpeed
    w.u8(4);          // speedTrapFastestLap
  }
  w.u8(0); w.u8(255); // timeTrial indices

  const buf = w.buf();
  ok('lapdata packet size = 1285', buf.length === 1285);
  const pkt = parsePacket(buf);
  ok('lapdata parsed', pkt && !pkt.__error);
  ok('lapdata 22 cars', pkt.lapData.length === 22);
  ok('lapdata P1 last lap', pkt.lapData[0].lastLapTimeInMS === 79000);
  ok('lapdata P1 position', pkt.lapData[0].carPosition === 1);
  ok('lapdata P5 speedtrap', pkt.lapData[0].speedTrapFastestSpeed === 310.5);
  if (buf.length !== 1285) console.log('  lapdata buf len', buf.length);
}

// ===== CarTelemetry packet: 29 + 22*60 + 3 = 1352 =========================
{
  const w = Writer();
  header(w, 6, 0);
  for (let i = 0; i < 22; i++) {
    w.u16(320 + i);   // speed
    w.f32(0.9);       // throttle
    w.f32(0.1);       // steer
    w.f32(0.2);       // brake
    w.u8(50);         // clutch
    w.i8(7);          // gear
    w.u16(11500);     // engineRPM
    w.u8(1);          // drs
    w.u8(85);         // revLightsPercent
    w.u16(0b111111111110000); // revLightsBitValue
    for (let j = 0; j < 4; j++) w.u16(900 + j);   // brakesTemperature
    for (let j = 0; j < 4; j++) w.u8(100 + j);    // tyresSurfaceTemperature
    for (let j = 0; j < 4; j++) w.u8(110 + j);    // tyresInnerTemperature
    w.u16(110);       // engineTemperature
    for (let j = 0; j < 4; j++) w.f32(21.5 + j);  // tyresPressure
    for (let j = 0; j < 4; j++) w.u8(0);          // surfaceType
  }
  w.u8(255); w.u8(255); w.i8(0); // mfd + suggestedGear

  const buf = w.buf();
  ok('telemetry packet size = 1352', buf.length === 1352);
  const pkt = parsePacket(buf);
  ok('telemetry parsed', pkt && !pkt.__error);
  ok('telemetry 22 cars', pkt.carTelemetryData.length === 22);
  ok('telemetry P1 speed = 320', pkt.carTelemetryData[0].speed === 320);
  ok('telemetry P1 rpm = 11500', pkt.carTelemetryData[0].engineRPM === 11500);
  ok('telemetry P1 gear = 7', pkt.carTelemetryData[0].gear === 7);
  ok('telemetry P1 drs = 1', pkt.carTelemetryData[0].drs === 1);
  ok('telemetry P1 tyre pressure 0', pkt.carTelemetryData[0].tyresPressure[0] === 21.5);
  if (buf.length !== 1352) console.log('  telemetry buf len', buf.length);
}

// ===== CarDamage packet: 29 + 22*46 = 1041 ================================
{
  const w = Writer();
  header(w, 10, 0);
  for (let i = 0; i < 22; i++) {
    for (let j = 0; j < 4; j++) w.f32(10.5 + j);  // tyresWear
    for (let j = 0; j < 4; j++) w.u8(5 + j);      // tyresDamage
    for (let j = 0; j < 4; j++) w.u8(8 + j);      // brakesDamage
    for (let j = 0; j < 4; j++) w.u8(0);          // tyreBlisters
    w.u8(10); w.u8(20); w.u8(5);  // wings
    w.u8(0); w.u8(0); w.u8(0);    // floor/diff/sidepod
    w.u8(0); w.u8(0);             // drs/ers fault
    w.u8(15); w.u8(25);           // gearbox/engine damage
    for (let j = 0; j < 6; j++) w.u8(j); // engine wear x6
    w.u8(0); w.u8(0);             // blown/seized
  }
  const buf = w.buf();
  ok('damage packet size = 1041', buf.length === 1041);
  const pkt = parsePacket(buf);
  ok('damage parsed', pkt && !pkt.__error);
  ok('damage 22 cars', pkt.carDamageData.length === 22);
  ok('damage P1 tyre wear[0]', pkt.carDamageData[0].tyresWear[0] === 10.5);
  ok('damage P1 engine dmg', pkt.carDamageData[0].engineDamage === 25);
  if (buf.length !== 1041) console.log('  damage buf len', buf.length);
}

// ===== SessionHistory: 29 + 7 + 100*10 + 8*3 = 1064 =======================
{
  const w = Writer();
  header(w, 11, 0);
  w.u8(3);            // carIdx
  w.u8(20);           // numLaps
  w.u8(2);            // numTyreStints
  w.u8(5); w.u8(5); w.u8(6); w.u8(7); // best lap/sector nums
  for (let i = 0; i < 100; i++) {
    w.u32(80000 + i);
    w.u16(26000); w.u8(1);
    w.u16(27000); w.u8(1);
    w.u16(28000); w.u8(1);
    w.u8(0x0f); // all valid
  }
  for (let i = 0; i < 8; i++) { w.u8(i); w.u8(18); w.u8(18); }

  const buf = w.buf();
  const pkt = parsePacket(buf);
  ok('history parsed', pkt && !pkt.__error);
  ok('history carIdx = 3', pkt.carIdx === 3);
  ok('history 100 laps', pkt.lapHistoryData.length === 100);
  ok('history 8 stints', pkt.tyreStintsHistoryData.length === 8);
}

// ===== TyreSets: 29 + 1 + 20*9 + 1 = 211 ===================================
{
  const w = Writer();
  header(w, 12, 0);
  w.u8(0); // carIdx
  for (let i = 0; i < 20; i++) {
    w.u8(18); w.u8(18); w.u8(50); w.u8(1); w.u8(0);
    w.u8(10); w.u8(20); w.i16(-5); w.u8(i === 3 ? 1 : 0);
  }
  w.u8(3); // fittedIdx
  const pkt = parsePacket(w.buf());
  ok('tyresets parsed', pkt && !pkt.__error);
  ok('tyresets 20 sets', pkt.tyreSetData.length === 20);
  ok('tyresets fittedIdx = 3', pkt.fittedIdx === 3);
  ok('tyresets fitted set flagged', pkt.tyreSetData[3].fitted === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
