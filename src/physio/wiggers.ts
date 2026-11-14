// Wiggers diagram: pressures, ventricular volume and ECG over one cardiac cycle.
import { PHASES, aorticPressure, ecg, laPressure, lvPressure, lvVolume } from './cardiac';

const W = 440;
const H = 210;
const L = 34; // left margin for axis labels
const R = 8;

export function drawWiggers(canvas: HTMLCanvasElement, p: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth || W;
  const s = cw / W;
  const pw = Math.round(cw * dpr), phh = Math.round(cw * (H / W) * dpr);
  if (canvas.width !== pw || canvas.height !== phh) {
    canvas.width = pw;
    canvas.height = phh;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const x = (q: number) => L + q * (W - L - R);

  // phase bands
  PHASES.forEach((ph, i) => {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.055)';
    ctx.fillRect(x(ph.start), 0, x(ph.end) - x(ph.start), H);
  });

  const bands = { pTop: 8, pBot: 108, vTop: 118, vBot: 160, eTop: 168, eBot: 204 };
  const py = (mm: number) => bands.pBot - (mm / 130) * (bands.pBot - bands.pTop);
  const vy = (ml: number) => bands.vBot - ((ml - 40) / 90) * (bands.vBot - bands.vTop);
  const ey = (u: number) => bands.eBot - 8 - u * (bands.eBot - bands.eTop - 10);

  // axes labels
  ctx.fillStyle = 'rgba(200,210,225,0.65)';
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (const mm of [0, 40, 80, 120]) {
    ctx.fillText(String(mm), L - 4, py(mm) + 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(L, py(mm));
    ctx.lineTo(W - R, py(mm));
    ctx.stroke();
  }
  ctx.fillText('mmHg', L - 4, 9);
  ctx.fillText('mL', L - 4, bands.vTop + 8);
  ctx.fillText('120', L - 4, vy(120) + 3);
  ctx.fillText('50', L - 4, vy(50) + 3);
  ctx.fillText('ECG', L - 4, bands.eTop + 14);

  const trace = (f: (q: number) => number, map: (v: number) => number, color: string, width = 2, dash: number[] = []) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i <= 220; i++) {
      const q = i / 220;
      const yy = map(f(Math.min(0.99999, q)));
      if (i === 0) ctx.moveTo(x(q), yy);
      else ctx.lineTo(x(q), yy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  trace(aorticPressure, py, '#ff8a80', 2, [5, 3]);
  trace(lvPressure, py, '#ef5350', 2.2);
  trace(laPressure, py, '#ffb74d', 1.8);
  trace(lvVolume, vy, '#64b5f6', 2.2);
  trace(ecg, ey, '#69f0ae', 1.6);

  // heart sounds
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '650 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('S1', x(0.14), py(118));
  ctx.fillText('S2', x(0.52), py(118) + 0);

  // legend
  ctx.textAlign = 'left';
  ctx.font = '9.5px system-ui, sans-serif';
  const leg: [string, string][] = [['#ef5350', 'Left ventricle'], ['#ff8a80', 'Aorta'], ['#ffb74d', 'Left atrium']];
  let lx = L + 150;
  for (const [c, t] of leg) {
    ctx.fillStyle = c;
    ctx.fillRect(lx, 12, 10, 3);
    ctx.fillStyle = 'rgba(220,230,240,0.8)';
    ctx.fillText(t, lx + 13, 16);
    lx += ctx.measureText(t).width + 24;
  }
  ctx.fillStyle = '#64b5f6';
  ctx.fillText('Ventricular volume', L + 6, bands.vTop + 8);
  ctx.fillStyle = '#69f0ae';
  ctx.fillText('ECG', L + 6, bands.eTop + 10);

  // cursor
  ctx.strokeStyle = '#ffc93c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x(p), 0);
  ctx.lineTo(x(p), H);
  ctx.stroke();
  ctx.fillStyle = '#ffc93c';
  for (const [v, m] of [[lvPressure(p), py], [aorticPressure(p), py], [lvVolume(p), vy], [ecg(p), ey]] as [number, (v: number) => number][]) {
    ctx.beginPath();
    ctx.arc(x(p), m(v), 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
