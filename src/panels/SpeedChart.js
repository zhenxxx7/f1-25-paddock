import { el } from '../lib/dom.js';
import { kph, rpm } from '../lib/store.js';

// Live rolling speed + RPM trace (last ~60s) drawn on a canvas. A second
// smaller canvas shows throttle/brake overlay for the current lap.
const speedSeries = []; // {t, speed, rpm}
const WINDOW_MS = 60_000;

export function SpeedChart(state) {
  const idx = state.watchingCarIndex ?? state.playerCarIndex ?? 0;
  const t = state.telemetry?.carTelemetryData?.[idx];
  const now = Date.now();

  if (t) {
    speedSeries.push({ t: now, speed: t.speed, rpm: t.engineRPM });
  }
  // trim
  while (speedSeries.length && now - speedSeries[0].t > WINDOW_MS) speedSeries.shift();

  return el('div.panel')(
    el('div.panel-header')(
      el('span.panel-title')('SPEED & ', el('b', 'RPM'), ' · 60s'),
      el('span.faint.mono', t ? `${kph(t.speed)} km/h` : ''),
    ),
    el('div.panel-body')(
      canvasDraw(speedSeries),
    ),
  );
}

function canvasDraw(series) {
  const W = 700, H = 180;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.className = 'chart-canvas';
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  if (series.length < 2) {
    ctx.fillStyle = '#5a6577';
    ctx.font = '11px monospace';
    ctx.fillText('collecting…', 12, 20);
    return cv;
  }

  const now = Date.now();
  const maxSpeed = 360;
  const maxRpm = 13000;

  // grid
  ctx.strokeStyle = '#1c2330';
  ctx.lineWidth = 1;
  for (let s = 0; s <= 360; s += 60) {
    const y = H - (s / maxSpeed) * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.fillStyle = '#5a6577';
  ctx.font = '9px monospace';
  for (let s = 0; s <= 360; s += 120) {
    ctx.fillText(`${s}`, 3, H - (s / maxSpeed) * H - 2);
  }

  // speed line
  ctx.strokeStyle = '#00e0ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((p, i) => {
    const x = ((p.t - (now - WINDOW_MS)) / WINDOW_MS) * W;
    const y = H - (Math.min(p.speed, maxSpeed) / maxSpeed) * H;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();

  // rpm line (faint, scaled)
  ctx.strokeStyle = '#ff2d6f';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  series.forEach((p, i) => {
    const x = ((p.t - (now - WINDOW_MS)) / WINDOW_MS) * W;
    const y = H - (Math.min(p.rpm, maxRpm) / maxRpm) * H;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;

  return cv;
}
