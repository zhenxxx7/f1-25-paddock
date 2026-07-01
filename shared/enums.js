// Shared lookup tables for F1 25 telemetry.
// Used by both the Node backend (server/) and the web frontend (src/).
// Source: official F1 25 UDP specification appendices.

export const PACKET_TYPES = [
  'Motion', 'Session', 'LapData', 'Event', 'Participants', 'CarSetups',
  'CarTelemetry', 'CarStatus', 'FinalClassification', 'LobbyInfo',
  'CarDamage', 'SessionHistory', 'TyreSets', 'MotionEx', 'TimeTrial', 'LapPositions',
];

export const TEAMS = {
  0: 'Mercedes', 1: 'Ferrari', 2: 'Red Bull Racing', 3: 'Williams',
  4: 'Aston Martin', 5: 'Alpine', 6: 'Racing Bulls', 7: 'Haas',
  8: 'McLaren', 9: 'Sauber', 41: 'F1 Generic', 104: 'F1 Custom Team',
  129: 'Konnersport', 142: 'APXGP', 154: 'APXGP GP24/25', 155: 'Konnersport GP24',
  158: 'ART GP', 159: 'Campos', 160: 'Rodin', 161: 'AIX Racing',
  162: 'DAMS', 163: 'Hitech', 164: 'MP Motorsport', 165: 'Prema',
  166: 'Trident', 167: 'VAR', 168: 'Invicta',
};

// Team accent colours for the paddock wall UI.
export const TEAM_COLOURS = {
  0: '#27F4D2', 1: '#E8002D', 2: '#3671C6', 3: '#64C4FF',
  4: '#229971', 5: '#0093CC', 6: '#6692FF', 7: '#B6BABD',
  8: '#FF8000', 9: '#52E252', 41: '#888888', 104: '#888888',
  129: '#FFFFFF', 142: '#D4AF37', 154: '#D4AF37', 155: '#FFFFFF',
};

export const DRIVERS = {
  0: 'Carlos Sainz', 2: 'Daniel Ricciardo', 3: 'Fernando Alonso', 7: 'Lewis Hamilton',
  9: 'Max Verstappen', 10: 'Nico Hulkenberg', 11: 'Kevin Magnussen', 14: 'Sergio Perez',
  15: 'Valtteri Bottas', 17: 'Esteban Ocon', 19: 'Lance Stroll', 50: 'George Russell',
  54: 'Lando Norris', 58: 'Charles Leclerc', 59: 'Pierre Gasly', 62: 'Alexander Albon',
  80: 'Guanyu Zhou', 94: 'Yuki Tsunoda', 109: 'Jenson Button', 110: 'David Coulthard',
  112: 'Oscar Piastri', 113: 'Liam Lawson', 125: 'Mark Webber', 126: 'Jacques Villeneuve',
  136: 'Jack Doohan', 147: 'Oliver Bearman', 149: 'Isack Hadjar', 160: 'Paul Aron',
  161: 'Gabriel Bortoleto', 162: 'Franco Colapinto', 165: 'Andrea Kimi Antonelli',
  170: 'Sonny Hayes', 77: 'Ayrton Senna', 90: 'Michael Schumacher',
  255: 'Player',
};

export const TRACKS = {
  '-1': 'Unknown', 0: 'Melbourne', 2: 'Shanghai', 3: 'Sakhir', 4: 'Catalunya',
  5: 'Monaco', 6: 'Montreal', 7: 'Silverstone', 9: 'Hungaroring', 10: 'Spa',
  11: 'Monza', 12: 'Singapore', 13: 'Suzuka', 14: 'Abu Dhabi', 15: 'Texas',
  16: 'Brazil', 17: 'Austria', 19: 'Mexico', 20: 'Baku', 26: 'Zandvoort',
  27: 'Imola', 29: 'Jeddah', 30: 'Miami', 31: 'Las Vegas', 32: 'Losail',
  39: 'Silverstone (Rev)', 40: 'Austria (Rev)', 41: 'Zandvoort (Rev)',
};

export const WEATHER = {
  0: 'Clear', 1: 'Light Cloud', 2: 'Overcast', 3: 'Light Rain',
  4: 'Heavy Rain', 5: 'Storm',
};

export const SESSION_TYPES = {
  0: 'Unknown', 1: 'Practice 1', 2: 'Practice 2', 3: 'Practice 3',
  4: 'Short Practice', 5: 'Qualifying 1', 6: 'Qualifying 2', 7: 'Qualifying 3',
  8: 'Short Qualifying', 9: 'One-Shot Qualifying', 10: 'Sprint Shootout 1',
  11: 'Sprint Shootout 2', 12: 'Sprint Shootout 3', 13: 'Short Sprint Shootout',
  14: 'One-Shot Sprint Shootout', 15: 'Race', 16: 'Race 2', 17: 'Race 3', 18: 'Time Trial',
};

export const FORMULA = {
  0: 'F1 Modern', 1: 'F1 Classic', 2: 'F2', 3: 'F1 Generic',
  4: 'Beta', 6: 'Esports', 8: 'F1 World', 9: 'F1 Elimination',
};

export const GAME_MODES = {
  4: 'Grand Prix', 5: 'Time Trial', 6: 'Splitscreen', 7: 'Online Custom',
  15: 'Online Weekly Event', 17: 'Story Mode', 27: 'My Team Career', 28: 'Driver Career',
  29: 'Career Online', 30: 'Challenge Career', 75: 'Story Mode (APXGP)', 127: 'Benchmark',
};

export const RULESETS = { 0: 'Practice & Qualifying', 1: 'Race', 2: 'Time Trial', 12: 'Elimination' };

export const SURFACES = {
  0: 'Tarmac', 1: 'Rumble Strip', 2: 'Concrete', 3: 'Rock', 4: 'Gravel',
  5: 'Mud', 6: 'Sand', 7: 'Grass', 8: 'Water', 9: 'Cobblestone', 10: 'Metal', 11: 'Ridged',
};

// Tyre compound decoding. Actual compound id -> short label + colour.
export const TYRE_ACTUAL = {
  16: 'C5', 17: 'C4', 18: 'C3', 19: 'C2', 20: 'C1', 21: 'C0',
  7: 'Inter', 8: 'Wet',
  9: 'Dry (Classic)', 10: 'Wet (Classic)',
  11: 'Super Soft', 12: 'Soft', 13: 'Medium', 14: 'Hard', 15: 'Wet (F2)',
};

// Visual (displayed) compound -> colour the broadcast overlay uses.
export const TYRE_VISUAL_COLOUR = {
  16: '#e30613', 17: '#e30613', 18: '#ffd200', 19: '#f0f0f0', 20: '#0a84ff',
  21: '#e30613', 7: '#43b02a', 8: '#0067b1',
};

export const PIT_STATUS = { 0: 'None', 1: 'Pitting', 2: 'In Pit Area' };
export const DRIVER_STATUS = { 0: 'In Garage', 1: 'Flying Lap', 2: 'In Lap', 3: 'Out Lap', 4: 'On Track' };
export const RESULT_STATUS = { 0: 'Invalid', 1: 'Inactive', 2: 'Active', 3: 'Finished', 4: 'DNF', 5: 'DSQ', 6: 'Not Classified', 7: 'Retired' };

export const SAFETY_CAR = { 0: 'None', 1: 'Full SC', 2: 'Virtual SC', 3: 'Formation Lap' };

export const ERS_MODE = { 0: 'None', 1: 'Medium', 2: 'Hotlap', 3: 'Overtake' };
export const FUEL_MIX = { 0: 'Lean', 1: 'Standard', 2: 'Rich', 3: 'Max' };

// 0..3 sector validity bit masks (from m_lapValidBitFlags)
export const LAP_VALID = { LAP: 0x01, S1: 0x02, S2: 0x04, S3: 0x08 };

export const NATIONALITIES = {
  1: 'American', 2: 'Argentine', 3: 'Australian', 4: 'Austrian', 5: 'Azerbaijani',
  7: 'Belgian', 9: 'Brazilian', 10: 'British', 12: 'Cameroonian', 13: 'Canadian',
  14: 'Chilean', 15: 'Chinese', 21: 'Danish', 22: 'Dutch', 24: 'English',
  27: 'Finnish', 28: 'French', 29: 'German', 36: 'Icelandic', 41: 'Italian',
  43: 'Japanese', 52: 'Mexican', 53: 'Monegasque', 54: 'New Zealander',
  63: 'Polish', 64: 'Portuguese', 67: 'Russian', 69: 'Saudi', 70: 'Scottish',
  77: 'Spanish', 78: 'Swedish', 79: 'Swiss', 80: 'Thai', 84: 'Venezuelan',
};

export const PLATFORMS = { 1: 'Steam', 3: 'PlayStation', 4: 'Xbox', 6: 'Origin', 255: 'Unknown' };

// Human-readable helpers.
export function teamName(id) { return TEAMS[id] ?? `Team ${id}`; }
export function teamColour(id) { return TEAM_COLOURS[id] ?? '#888888'; }
export function driverName(id) { return DRIVERS[id] ?? `Driver ${id}`; }
export function trackName(id) { return TRACKS[String(id)] ?? `Track ${id}`; }
export function tyreName(id) { return TYRE_ACTUAL[id] ?? `Tyre ${id}`; }
