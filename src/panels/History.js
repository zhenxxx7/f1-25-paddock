import { el } from '../lib/dom.js';
import { events, formatLapTime, trackName, teamName } from '../lib/store.js';

// Saved-lap browser + replay viewer. Fetches /api/laps from the backend,
// lists each recorded lap, and on click fetches the full sample stream and
// draws a speed/throttle/brake trace with a scrubber.
let lapsCache = [];

export function History(state) {
  // Refresh the list whenever a new lap is saved.
  if (!History._wired) {
    events.on('lap-saved', () => load().then(render));
    History._wired = true;
    load().then(render);
  }

  return el('div.panel')(
    el('div.panel-header')(
      el('span.panel-title')('LAP ', el('b', 'REPLAY')),
      el('span.faint.mono', `${lapsCache.length} saved`),
    ),
    el('div.panel-body')(
      el('div.lap-list')(
        lapsCache.length
          ? lapsCache.map(l => el('div.lap-item', {
              onclick: () => openReplay(l.file),
            })(
              el('span', `${trackName(l.track)} · ${teamName(l.team)}`),
              el('span.faint', `L${l.lapNumber}`),
              el('span.lt', formatLapTime(l.lapTimeMs)),
            ))
          : el('div.empty')('Complete laps to record them'),
      ),
    ),
  );
}

async function load() {
  try {
    const r = await fetch('/api/laps');
    if (r.ok) lapsCache = await r.json();
  } catch { /* offline / not built */ }
}

let renderFn = () => {};
export function setRender(fn) { renderFn = fn; }
function render() { renderFn(); }

// ---- replay modal ---------------------------------------------------------
async function openReplay(file) {
  try {
    const r = await fetch(`/api/laps/${file}`);
    if (!r.ok) return;
    const lap = await r.json();
    showReplayModal(lap);
  } catch (e) { console.error(e); }
}

function showReplayModal(lap) {
  const overlay = el('div.modal-overlay', {
    onclick: (e) => { if (e.target === overlay) overlay.remove(); },
  })();

  const box = el('div.panel.modal')(
    el('div.panel-header')(
      el('span.panel-title')('REPLAY · ', el('b', `${trackName(lap.track)}`), ` · Lap ${lap.lapNumber} · ${formatLapTime(lap.lapTimeMs)}`),
      el('span.tag.modal-close', { onclick: () => overlay.remove() }, 'CLOSE ✕'),
    ),
    el('div.panel-body')(replayCanvas(lap)),
  );
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function replayCanvas(lap) {
  const W = 840, H = 280;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.className = 'chart-canvas';
  const ctx = cv.getContext('2d');
  const s = lap.samples;
  if (!s || s.length < 2) {
    ctx.fillStyle = '#5a6577'; ctx.font = '12px monospace';
    ctx.fillText('no samples in this recording', 12, 20);
    return cv;
  }
  const maxT = s[s.length - 1].t;
  const maxSpeed = 360;

  // distance axis labels
  ctx.fillStyle = '#5a6577'; ctx.font = '9px monospace';
  ctx.fillText('speed (km/h)', 6, 12);
  ctx.fillText('throttle / brake', 6, H - 4);

  // speed
  ctx.strokeStyle = '#00e0ff'; ctx.lineWidth = 2;
  ctx.beginPath();
  s.forEach((p, i) => {
    const x = (p.t / maxT) * W;
    const y = H - 40 - (Math.min(p.speed, maxSpeed) / maxSpeed) * (H - 60);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();

  // throttle
  ctx.strokeStyle = '#2ee06b'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
  ctx.beginPath();
  s.forEach((p, i) => {
    const x = (p.t / maxT) * W;
    const y = H - 30 - (p.throttle || 0) * 25;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();

  // brake (downward bars)
  ctx.strokeStyle = '#ff3b3b';
  s.forEach((p) => {
    const x = (p.t / maxT) * W;
    const h = (p.brake || 0) * 25;
    ctx.beginPath(); ctx.moveTo(x, H - 30); ctx.lineTo(x, H - 30 - h); ctx.stroke();
  });
  ctx.globalAlpha = 1;

  return cv;
}
