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
    el('div.panel-body.chart-body')(
      canvasDraw(speedSeries),
    ),
  );
}

function canvasDraw(series) {
  const W = 700, H = 190;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.className = 'chart-canvas';
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  if (series.length < 2) {
    ctx.fillStyle = '#5b6880';
    ctx.font = '11px monospace';
    ctx.fillText('collecting…', 12, 20);
    return cv;
  }

  const now = Date.now();
  const maxSpeed = 360;
  const maxRpm = 13000;
  const xOf = (t) => ((t - (now - WINDOW_MS)) / WINDOW_MS) * W;
  const yOfSpeed = (s) => H - (Math.min(s, maxSpeed) / maxSpeed) * (H - 12) - 6;

  // grid
  ctx.strokeStyle = 'rgba(151, 175, 220, 0.08)';
  ctx.lineWidth = 1;
  for (let s = 0; s <= 360; s += 60) {
    const y = yOfSpeed(s);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.fillStyle = '#5b6880';
  ctx.font = '9px "JetBrains Mono", monospace';
  for (let s = 120; s <= 360; s += 120) {
    ctx.fillText(`${s}`, 4, yOfSpeed(s) - 3);
  }

  // area fill under the speed trace
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(46, 229, 255, 0.22)');
  grad.addColorStop(1, 'rgba(46, 229, 255, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(xOf(series[0].t), H);
  series.forEach((p) => ctx.lineTo(xOf(p.t), yOfSpeed(p.speed)));
  ctx.lineTo(xOf(series[series.length - 1].t), H);
  ctx.closePath();
  ctx.fill();

  // speed line (with soft glow)
  ctx.strokeStyle = '#2ee5ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(46, 229, 255, 0.6)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  series.forEach((p, i) => {
    i ? ctx.lineTo(xOf(p.t), yOfSpeed(p.speed)) : ctx.moveTo(xOf(p.t), yOfSpeed(p.speed));
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  // rpm line (faint, scaled)
  ctx.strokeStyle = '#ff3d71';
  ctx.lineWidth = 1.25;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  series.forEach((p, i) => {
    const y = H - (Math.min(p.rpm, maxRpm) / maxRpm) * (H - 12) - 6;
    i ? ctx.lineTo(xOf(p.t), y) : ctx.moveTo(xOf(p.t), y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;

  return cv;
}
