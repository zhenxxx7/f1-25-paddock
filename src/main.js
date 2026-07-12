import './styles.css';
import { subscribe, connect, getState, events } from './lib/store.js';
import { bindRegion } from './lib/dom.js';
import { learnTrack, resetTrack } from './panels/TrackMap.js';

import { TopBar } from './panels/TopBar.js';
import { TimingTower } from './panels/TimingTower.js';
import { Cockpit } from './panels/Cockpit.js';
import { Tyres } from './panels/Tyres.js';
import { ErsDamage } from './panels/ErsDamage.js';
import { TrackMap } from './panels/TrackMap.js';
import { SpeedChart } from './panels/SpeedChart.js';
import { EventLog } from './panels/EventLog.js';
import { History, setRender as setHistoryRender } from './panels/History.js';
import { InfoPanels, setRender as setInfoRender } from './panels/InfoPanels.js';

// Slots keyed by id, populated once the DOM is ready.
const slots = (id) => document.getElementById(id);

// Wire each region to the store. Each subscriber rebuilds only its panel.
subscribe(bindRegion(() => slots('topbar'), TopBar));
subscribe(bindRegion(() => slots('tower'), TimingTower));
subscribe(bindRegion(() => slots('cockpit'), Cockpit));
subscribe(bindRegion(() => slots('tyres'), Tyres));
subscribe(bindRegion(() => slots('ers'), ErsDamage));
subscribe(bindRegion(() => slots('map'), TrackMap));
subscribe(bindRegion(() => slots('chart'), SpeedChart));
subscribe(bindRegion(() => slots('log'), EventLog));
subscribe(bindRegion(() => slots('history'), History));
subscribe(bindRegion(() => slots('info'), InfoPanels));

// Panels with internal tabs need a way to trigger a re-render themselves.
setHistoryRender(() => bindRegion(() => slots('history'), History)(getState()));
setInfoRender(() => bindRegion(() => slots('info'), InfoPanels)(getState()));

// Track outline is learned incrementally from every motion packet, and
// forgotten when the dashboard switches stream or the session restarts.
subscribe((state) => learnTrack(state));
events.on('stream-reset', resetTrack);

connect();

// Re-render the top bar once a second so the connection/stale indicator and
// clock update even when no packets are arriving.
setInterval(() => {
  bindRegion(() => slots('topbar'), TopBar)(getState());
}, 1000);
