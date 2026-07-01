// F1 25 UDP binary parser.
// All values little-endian, all structs packed (no padding).
// Offsets below were validated against the documented packet sizes
// (Session 753, LapData 1285, Telemetry 1352, Status 1239, Damage 1041, etc.).
// Reference: official F1 25 "Data Output" specification (format = 2025).

const HEADER_SIZE = 29;
const MAX_CARS = 22;

// ---- low level readers over a Buffer with a moving cursor -----------------
class R {
  constructor(buf) { this.b = buf; this.o = 0; }
  u8()  { const v = this.b.readUInt8(this.o);  this.o += 1; return v; }
  i8()  { const v = this.b.readInt8(this.o);   this.o += 1; return v; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  i16() { const v = this.b.readInt16LE(this.o);  this.o += 2; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  i32() { const v = this.b.readInt32LE(this.o);  this.o += 4; return v; }
  f32() { const v = this.b.readFloatLE(this.o);  this.o += 4; return v; }
  f64() { const v = this.b.readDoubleLE(this.o); this.o += 8; return v; }
  // uint64 sessionUID: read as two u32 and combine into a BigInt-safe string.
  u64str() {
    const lo = this.u32();
    const hi = this.u32();
    return (BigInt(hi) << 32n | BigInt(lo)).toString();
  }
  bytes(n) { const v = this.b.subarray(this.o, this.o + n); this.o += n; return v; }
  str(n) {
    const raw = this.bytes(n);
    let end = raw.indexOf(0);
    if (end < 0) end = raw.length;
    return raw.toString('utf8', 0, end);
  }
}

function parseHeader(buf) {
  const r = new R(buf);
  const h = {
    packetFormat: r.u16(),
    gameYear: r.u8(),
    gameMajorVersion: r.u8(),
    gameMinorVersion: r.u8(),
    packetVersion: r.u8(),
    packetId: r.u8(),
    sessionUID: r.u64str(),
    sessionTime: r.f32(),
    frameIdentifier: r.u32(),
    overallFrameIdentifier: r.u32(),
    playerCarIndex: r.u8(),
    secondaryPlayerCarIndex: r.u8(),
  };
  if (r.o !== HEADER_SIZE) throw new Error(`header consumed ${r.o}, expected ${HEADER_SIZE}`);
  return h;
}

// ---- per-packet parsers ---------------------------------------------------

function carMotion(r) {
  return {
    worldPositionX: r.f32(), worldPositionY: r.f32(), worldPositionZ: r.f32(),
    worldVelocityX: r.f32(), worldVelocityY: r.f32(), worldVelocityZ: r.f32(),
    worldForwardDirX: r.i16(), worldForwardDirY: r.i16(), worldForwardDirZ: r.i16(),
    worldRightDirX: r.i16(), worldRightDirY: r.i16(), worldRightDirZ: r.i16(),
    gForceLateral: r.f32(), gForceLongitudinal: r.f32(), gForceVertical: r.f32(),
    yaw: r.f32(), pitch: r.f32(), roll: r.f32(),
  };
}

function motion(buf, header) {
  const r = new R(buf, HEADER_SIZE);
  r.o = HEADER_SIZE;
  const carMotionData = [];
  for (let i = 0; i < MAX_CARS; i++) carMotionData.push(carMotion(r));
  // 6 suspension columns (12 floats) for the player car only.
  const suspensionPosition = [r.f32(), r.f32(), r.f32(), r.f32()];
  const suspensionVelocity = [r.f32(), r.f32(), r.f32(), r.f32()];
  const suspensionAcceleration = [r.f32(), r.f32(), r.f32(), r.f32()];
  const wheelSlipRatio = [r.f32(), r.f32(), r.f32(), r.f32()];
  const wheelSlipAngle = [r.f32(), r.f32(), r.f32(), r.f32()];
  const wheelSlipAngleVec = [r.f32(), r.f32(), r.f32(), r.f32()];
  return { header, carMotionData, suspensionPosition, suspensionVelocity, suspensionAcceleration, wheelSlipRatio, wheelSlipAngle, wheelSlipAngleVec };
}

function marshalZone(r) { return { zoneStart: r.f32(), zoneFlag: r.i8() }; }
function weatherSample(r) {
  return {
    sessionType: r.u8(), timeOffset: r.u8(), weather: r.u8(),
    trackTemperature: r.i8(), trackTemperatureChange: r.i8(),
    airTemperature: r.i8(), airTemperatureChange: r.i8(), rainPercentage: r.u8(),
  };
}

function session(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const marshalZones = [];
  const numMarshalZones = 0; // read after a few fields; see below
  const data = {
    weather: r.u8(), trackTemperature: r.i8(), airTemperature: r.i8(),
    totalLaps: r.u8(), trackLength: r.u16(), sessionType: r.u8(), trackId: r.i8(),
    formula: r.u8(), sessionTimeLeft: r.u16(), sessionDuration: r.u16(),
    pitSpeedLimit: r.u8(), gamePaused: r.u8(), isSpectating: r.u8(),
    spectatorCarIndex: r.u8(), sliProNativeSupport: r.u8(),
    numMarshalZones: r.u8(),
  };
  for (let i = 0; i < 21; i++) marshalZones.push(marshalZone(r));
  data.marshalZones = marshalZones;
  data.safetyCarStatus = r.u8();
  data.networkGame = r.u8();
  data.numWeatherForecastSamples = r.u8();
  const forecasts = [];
  for (let i = 0; i < 64; i++) forecasts.push(weatherSample(r));
  data.weatherForecastSamples = forecasts;
  data.forecastAccuracy = r.u8();
  data.aiDifficulty = r.u8();
  data.seasonLinkIdentifier = r.u32();
  data.weekendLinkIdentifier = r.u32();
  data.sessionLinkIdentifier = r.u32();
  data.pitStopWindowIdealLap = r.u8();
  data.pitStopWindowLatestLap = r.u8();
  data.pitStopRejoinPosition = r.u8();
  data.steeringAssist = r.u8();
  data.brakingAssist = r.u8();
  data.gearboxAssist = r.u8();
  data.pitAssist = r.u8();
  data.pitReleaseAssist = r.u8();
  data.ersAssist = r.u8();
  data.drsAssist = r.u8();
  data.dynamicRacingLine = r.u8();
  data.dynamicRacingLineType = r.u8();
  data.gameMode = r.u8();
  data.ruleSet = r.u8();
  data.timeOfDay = r.u32();
  data.sessionLength = r.u8();
  data.speedUnitsLeadPlayer = r.u8();
  data.temperatureUnitsLeadPlayer = r.u8();
  data.speedUnitsSecondaryPlayer = r.u8();
  data.temperatureUnitsSecondaryPlayer = r.u8();
  data.numSafetyCarPeriods = r.u8();
  data.numVirtualSafetyCarPeriods = r.u8();
  data.numRedFlagPeriods = r.u8();
  data.equalCarPerformance = r.u8();
  data.recoveryMode = r.u8();
  data.flashbackLimit = r.u8();
  data.surfaceType = r.u8();
  data.lowFuelMode = r.u8();
  data.raceStarts = r.u8();
  data.tyreTemperature = r.u8();
  data.pitLaneTyreSim = r.u8();
  data.carDamage = r.u8();
  data.carDamageRate = r.u8();
  data.collisions = r.u8();
  data.collisionsOffForFirstLapOnly = r.u8();
  data.mpUnsafePitRelease = r.u8();
  data.mpOffForGriefing = r.u8();
  data.cornerCuttingStringency = r.u8();
  data.parcFermeRules = r.u8();
  data.pitStopExperience = r.u8();
  data.safetyCar = r.u8();
  data.safetyCarExperience = r.u8();
  data.formationLap = r.u8();
  data.formationLapExperience = r.u8();
  data.redFlags = r.u8();
  data.affectsLicenceLevelSolo = r.u8();
  data.affectsLicenceLevelMP = r.u8();
  data.numSessionsInWeekend = r.u8();
  data.weekendStructure = Array.from(r.bytes(12));
  data.sector2LapDistanceStart = r.f32();
  data.sector3LapDistanceStart = r.f32();
  return { header, ...data };
}

function lapDataCar(r) {
  return {
    lastLapTimeInMS: r.u32(), currentLapTimeInMS: r.u32(),
    sector1TimeMSPart: r.u16(), sector1TimeMinutesPart: r.u8(),
    sector2TimeMSPart: r.u16(), sector2TimeMinutesPart: r.u8(),
    deltaToCarInFrontMSPart: r.u16(), deltaToCarInFrontMinutesPart: r.u8(),
    deltaToRaceLeaderMSPart: r.u16(), deltaToRaceLeaderMinutesPart: r.u8(),
    lapDistance: r.f32(), totalDistance: r.f32(), safetyCarDelta: r.f32(),
    carPosition: r.u8(), currentLapNum: r.u8(), pitStatus: r.u8(), numPitStops: r.u8(),
    sector: r.u8(), currentLapInvalid: r.u8(), penalties: r.u8(), totalWarnings: r.u8(),
    cornerCuttingWarnings: r.u8(), numUnservedDriveThroughPens: r.u8(),
    numUnservedStopGoPens: r.u8(), gridPosition: r.u8(), driverStatus: r.u8(),
    resultStatus: r.u8(), pitLaneTimerActive: r.u8(),
    pitLaneTimeInLaneInMS: r.u16(), pitStopTimerInMS: r.u16(),
    pitStopShouldServePen: r.u8(), speedTrapFastestSpeed: r.f32(),
    speedTrapFastestLap: r.u8(),
  };
}

function lapData(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const lapData = [];
  for (let i = 0; i < MAX_CARS; i++) lapData.push(lapDataCar(r));
  return {
    header, lapData,
    timeTrialPBCarIdx: r.u8(), timeTrialRivalCarIdx: r.u8(),
  };
}

function parseEvent(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const code = r.bytes(4).toString('latin1');
  // The 16-byte EventDataDetails union overlaps; we read the bytes and
  // decode the most useful variants based on the code.
  const detail = r.bytes(16);
  let event = { code, raw: Array.from(detail) };
  const u8 = (off) => detail.readUInt8(off);
  const f32 = (off) => detail.readFloatLE(off);
  const u32 = (off) => detail.readUInt32LE(off);
  switch (code) {
    case 'FTLP': event = { code, vehicleIdx: u8(0), lapTime: f32(4) }; break;
    case 'RTMT': event = { code, vehicleIdx: u8(0), reason: u8(1) }; break;
    case 'DRSE': case 'DRSD': event = { code, reason: u8(0) }; break;
    case 'TMPT': event = { code, vehicleIdx: u8(0) }; break;
    case 'RCWN': event = { code, vehicleIdx: u8(0) }; break;
    case 'PENA': event = { code, penaltyType: u8(0), infringementType: u8(1), vehicleIdx: u8(2), otherVehicleIdx: u8(3), time: u8(4), lapNum: u8(5), placesGained: u8(6) }; break;
    case 'SPTP': event = { code, vehicleIdx: u8(0), speed: f32(4), isOverallFastestInSession: u8(8), isDriverFastestInSession: u8(9), fastestVehicleIdxInSession: u8(10), fastestSpeedInSession: f32(12) }; break;
    case 'STLG': event = { code, numLights: u8(0) }; break;
    case 'DTSV': event = { code, vehicleIdx: u8(0) }; break;
    case 'SGSV': event = { code, vehicleIdx: u8(0), stopTime: f32(4) }; break;
    case 'FLBK': event = { code, flashbackFrameIdentifier: u32(0), flashbackSessionTime: f32(4) }; break;
    case 'BUTN': event = { code, buttonStatus: u32(0) }; break;
    case 'OVTK': event = { code, overtakingVehicleIdx: u8(0), beingOvertakenVehicleIdx: u8(1) }; break;
    case 'SCAR': event = { code, safetyCarType: u8(0), eventType: u8(1) }; break;
    case 'COLL': event = { code, vehicle1Idx: u8(0), vehicle2Idx: u8(1) }; break;
    default: break; // SSTA, SEND, CHQF, LGOT, RDFL have no meaningful payload
  }
  return { header, ...event };
}

function liveryColours(r) {
  const colours = [];
  for (let i = 0; i < 4; i++) colours.push({ red: r.u8(), green: r.u8(), blue: r.u8() });
  return colours;
}

function participant(r) {
  return {
    aiControlled: r.u8(), driverId: r.u8(), networkId: r.u8(), teamId: r.u8(),
    myTeam: r.u8(), raceNumber: r.u8(), nationality: r.u8(), name: r.str(32),
    yourTelemetry: r.u8(), showOnlineNames: r.u8(), techLevel: r.u16(),
    platform: r.u8(), numColours: r.u8(), liveryColours: liveryColours(r),
  };
}

function participants(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const numActiveCars = r.u8();
  const participants = [];
  for (let i = 0; i < MAX_CARS; i++) participants.push(participant(r));
  return { header, numActiveCars, participants };
}

function carSetupCar(r) {
  return {
    frontWing: r.u8(), rearWing: r.u8(), onThrottle: r.u8(), offThrottle: r.u8(),
    frontCamber: r.f32(), rearCamber: r.f32(), frontToe: r.f32(), rearToe: r.f32(),
    frontSuspension: r.u8(), rearSuspension: r.u8(), frontAntiRollBar: r.u8(),
    rearAntiRollBar: r.u8(), frontSuspensionHeight: r.u8(), rearSuspensionHeight: r.u8(),
    brakePressure: r.u8(), brakeBias: r.u8(), engineBraking: r.u8(),
    rearLeftTyrePressure: r.f32(), rearRightTyrePressure: r.f32(),
    frontLeftTyrePressure: r.f32(), frontRightTyrePressure: r.f32(),
    ballast: r.u8(), fuelLoad: r.f32(),
  };
}

function carSetups(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const carSetups = [];
  for (let i = 0; i < MAX_CARS; i++) carSetups.push(carSetupCar(r));
  return { header, carSetups, nextFrontWingValue: r.f32() };
}

function carTelemetryCar(r) {
  const speed = r.u16();
  const throttle = r.f32(); const steer = r.f32(); const brake = r.f32();
  const clutch = r.u8(); const gear = r.i8(); const engineRPM = r.u16();
  const drs = r.u8(); const revLightsPercent = r.u8(); const revLightsBitValue = r.u16();
  const brakesTemperature = [r.u16(), r.u16(), r.u16(), r.u16()];
  const tyresSurfaceTemperature = [r.u8(), r.u8(), r.u8(), r.u8()];
  const tyresInnerTemperature = [r.u8(), r.u8(), r.u8(), r.u8()];
  const engineTemperature = r.u16();
  const tyresPressure = [r.f32(), r.f32(), r.f32(), r.f32()];
  const surfaceType = [r.u8(), r.u8(), r.u8(), r.u8()];
  return { speed, throttle, steer, brake, clutch, gear, engineRPM, drs,
    revLightsPercent, revLightsBitValue, brakesTemperature,
    tyresSurfaceTemperature, tyresInnerTemperature, engineTemperature,
    tyresPressure, surfaceType };
}

function carTelemetry(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const carTelemetryData = [];
  for (let i = 0; i < MAX_CARS; i++) carTelemetryData.push(carTelemetryCar(r));
  return {
    header, carTelemetryData,
    mfdPanelIndex: r.u8(), mfdPanelIndexSecondaryPlayer: r.u8(),
    suggestedGear: r.i8(),
  };
}

function carStatusCar(r) {
  return {
    tractionControl: r.u8(), antiLockBrakes: r.u8(), fuelMix: r.u8(),
    frontBrakeBias: r.u8(), pitLimiterStatus: r.u8(),
    fuelInTank: r.f32(), fuelCapacity: r.f32(), fuelRemainingLaps: r.f32(),
    maxRPM: r.u16(), idleRPM: r.u16(), maxGears: r.u8(), drsAllowed: r.u8(),
    drsActivationDistance: r.u16(), actualTyreCompound: r.u8(),
    visualTyreCompound: r.u8(), tyresAgeLaps: r.u8(), vehicleFiaFlags: r.i8(),
    enginePowerICE: r.f32(), enginePowerMGUK: r.f32(), ersStoreEnergy: r.f32(),
    ersDeployMode: r.u8(), ersHarvestedThisLapMGUK: r.f32(),
    ersHarvestedThisLapMGUH: r.f32(), ersDeployedThisLap: r.f32(),
    networkPaused: r.u8(),
  };
}

function carStatus(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const carStatusData = [];
  for (let i = 0; i < MAX_CARS; i++) carStatusData.push(carStatusCar(r));
  return { header, carStatusData };
}

function finalClassificationCar(r) {
  const data = {
    position: r.u8(), numLaps: r.u8(), gridPosition: r.u8(), points: r.u8(),
    numPitStops: r.u8(), resultStatus: r.u8(), resultReason: r.u8(),
    bestLapTimeInMS: r.u32(), totalRaceTime: r.f64(), penaltiesTime: r.u8(),
    numPenalties: r.u8(), numTyreStints: r.u8(),
  };
  data.tyreStintsActual = Array.from(r.bytes(8));
  data.tyreStintsVisual = Array.from(r.bytes(8));
  data.tyreStintsEndLaps = Array.from(r.bytes(8));
  return data;
}

function finalClassification(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const numCars = r.u8();
  const classificationData = [];
  for (let i = 0; i < MAX_CARS; i++) classificationData.push(finalClassificationCar(r));
  return { header, numCars, classificationData };
}

function lobbyPlayer(r) {
  return {
    aiControlled: r.u8(), teamId: r.u8(), nationality: r.u8(), platform: r.u8(),
    name: r.str(32), carNumber: r.u8(), yourTelemetry: r.u8(),
    showOnlineNames: r.u8(), techLevel: r.u16(), readyStatus: r.u8(),
  };
}

function lobbyInfo(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const numPlayers = r.u8();
  const lobbyPlayers = [];
  for (let i = 0; i < MAX_CARS; i++) lobbyPlayers.push(lobbyPlayer(r));
  return { header, numPlayers, lobbyPlayers };
}

function carDamageCar(r) {
  const tyresWear = [r.f32(), r.f32(), r.f32(), r.f32()];
  const tyresDamage = [r.u8(), r.u8(), r.u8(), r.u8()];
  const brakesDamage = [r.u8(), r.u8(), r.u8(), r.u8()];
  const tyreBlisters = [r.u8(), r.u8(), r.u8(), r.u8()];
  return {
    tyresWear, tyresDamage, brakesDamage, tyreBlisters,
    frontLeftWingDamage: r.u8(), frontRightWingDamage: r.u8(), rearWingDamage: r.u8(),
    floorDamage: r.u8(), diffuserDamage: r.u8(), sidepodDamage: r.u8(),
    drsFault: r.u8(), ersFault: r.u8(), gearBoxDamage: r.u8(), engineDamage: r.u8(),
    engineMGUHWear: r.u8(), engineESWear: r.u8(), engineCEWear: r.u8(),
    engineICEWear: r.u8(), engineMGUKWear: r.u8(), engineTCWear: r.u8(),
    engineBlown: r.u8(), engineSeized: r.u8(),
  };
}

function carDamage(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const carDamageData = [];
  for (let i = 0; i < MAX_CARS; i++) carDamageData.push(carDamageCar(r));
  return { header, carDamageData };
}

function lapHistory(r) {
  return {
    lapTimeInMS: r.u32(), sector1TimeInMS: r.u16(), sector1TimeMinutes: r.u8(),
    sector2TimeInMS: r.u16(), sector2TimeMinutes: r.u8(),
    sector3TimeInMS: r.u16(), sector3TimeMinutes: r.u8(),
    lapValidBitFlags: r.u8(),
  };
}

function tyreStint(r) {
  return { endLap: r.u8(), tyreActualCompound: r.u8(), tyreVisualCompound: r.u8() };
}

function sessionHistory(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const carIdx = r.u8();
  const numLaps = r.u8();
  const numTyreStints = r.u8();
  const best = {
    lap: r.u8(), s1: r.u8(), s2: r.u8(), s3: r.u8(),
  };
  const laps = [];
  for (let i = 0; i < 100; i++) laps.push(lapHistory(r));
  const stints = [];
  for (let i = 0; i < 8; i++) stints.push(tyreStint(r));
  return {
    header, carIdx, numLaps, numTyreStints,
    bestLapTimeLapNum: best.lap, bestSector1LapNum: best.s1,
    bestSector2LapNum: best.s2, bestSector3LapNum: best.s3,
    lapHistoryData: laps, tyreStintsHistoryData: stints,
  };
}

function tyreSet(r) {
  return {
    actualTyreCompound: r.u8(), visualTyreCompound: r.u8(), wear: r.u8(),
    available: r.u8(), recommendedSession: r.u8(), lifeSpan: r.u8(),
    usableLife: r.u8(), lapDeltaTime: r.i16(), fitted: r.u8(),
  };
}

function tyreSets(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const carIdx = r.u8();
  const tyreSetData = [];
  for (let i = 0; i < 20; i++) tyreSetData.push(tyreSet(r));
  const fittedIdx = r.u8();
  return { header, carIdx, tyreSetData, fittedIdx };
}

function motionEx(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const read4 = () => [r.f32(), r.f32(), r.f32(), r.f32()];
  return {
    header,
    suspensionPosition: read4(), suspensionVelocity: read4(),
    suspensionAcceleration: read4(), wheelSpeed: read4(),
    wheelSlipRatio: read4(), wheelSlipAngle: read4(),
    wheelLatForce: read4(), wheelLongForce: read4(),
    heightOfCOGAboveGround: r.f32(),
    localVelocityX: r.f32(), localVelocityY: r.f32(), localVelocityZ: r.f32(),
    angularVelocityX: r.f32(), angularVelocityY: r.f32(), angularVelocityZ: r.f32(),
    angularAccelerationX: r.f32(), angularAccelerationY: r.f32(), angularAccelerationZ: r.f32(),
    frontWheelsAngle: r.f32(),
    wheelVertForce: read4(),
    frontAeroHeight: r.f32(), rearAeroHeight: r.f32(),
    frontRollAngle: r.f32(), rearRollAngle: r.f32(),
    chassisYaw: r.f32(), chassisPitch: r.f32(),
    wheelCamber: read4(), wheelCamberGain: read4(),
  };
}

function timeTrialSet(r) {
  return {
    carIdx: r.u8(), teamId: r.u8(),
    lapTimeInMS: r.u32(), sector1TimeInMS: r.u32(),
    sector2TimeInMS: r.u32(), sector3TimeInMS: r.u32(),
    tractionControl: r.u8(), gearboxAssist: r.u8(), antiLockBrakes: r.u8(),
    equalCarPerformance: r.u8(), customSetup: r.u8(), valid: r.u8(),
  };
}

function timeTrial(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  return {
    header,
    playerSessionBestDataSet: timeTrialSet(r),
    personalBestDataSet: timeTrialSet(r),
    rivalDataSet: timeTrialSet(r),
  };
}

function lapPositions(buf, header) {
  const r = new R(buf); r.o = HEADER_SIZE;
  const numLaps = r.u8();
  const lapStart = r.u8();
  // 50 laps x 22 cars
  const positionForVehicleIdx = [];
  for (let lap = 0; lap < 50; lap++) positionForVehicleIdx.push(Array.from(r.bytes(MAX_CARS)));
  return { header, numLaps, lapStart, positionForVehicleIdx };
}

// ---- dispatcher -----------------------------------------------------------
const PARSERS = [
  motion, session, lapData, parseEvent, participants, carSetups,
  carTelemetry, carStatus, finalClassification, lobbyInfo,
  carDamage, sessionHistory, tyreSets, motionEx, timeTrial, lapPositions,
];

export function parsePacket(buf) {
  if (buf.length < HEADER_SIZE) return null;
  const header = parseHeader(buf);
  const fn = PARSERS[header.packetId];
  if (!fn) return null;
  try {
    return fn(buf, header);
  } catch (e) {
    return { header, __error: e.message, __length: buf.length };
  }
}

export { HEADER_SIZE, MAX_CARS };
