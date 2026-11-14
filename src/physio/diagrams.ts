// Animated schematic diagrams for the physiology lessons.
// Each draws into a 440-wide logical canvas; p is the position in the lesson's cycle (0..1).
import { roundRect } from './heartDiagram';

export type Ctx = CanvasRenderingContext2D;
export interface DiagramDef {
  height: number;
  draw: (ctx: Ctx, p: number, stage: number) => void;
  label: string;
}

const W = 440;
const TXT = 'rgba(228,234,244,0.88)';
const MUTED = 'rgba(190,200,215,0.62)';
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const within = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

function text(ctx: Ctx, s: string, x: number, y: number, opts: { size?: number; color?: string; align?: CanvasTextAlign; weight?: number } = {}) {
  ctx.fillStyle = opts.color ?? TXT;
  ctx.font = `${opts.weight ?? 500} ${opts.size ?? 10}px system-ui, sans-serif`;
  ctx.textAlign = opts.align ?? 'left';
  ctx.fillText(s, x, y);
}

function arrow(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, w = 2) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 7 * Math.cos(a - 0.45), y2 - 7 * Math.sin(a - 0.45));
  ctx.lineTo(x2 - 7 * Math.cos(a + 0.45), y2 - 7 * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}

function dot(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A small cycle graph with a cursor. */
function graph(ctx: Ctx, x0: number, y0: number, w: number, h: number, p: number, series: { f: (q: number) => number; color: string; min: number; max: number; width?: number }[], bands?: [number, number, string][]) {
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(x0, y0, w, h);
  if (bands) for (const [a, b, c] of bands) { ctx.fillStyle = c; ctx.fillRect(x0 + a * w, y0, (b - a) * w, h); }
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width ?? 2;
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const q = i / 160;
      const v = (s.f(Math.min(0.9999, q)) - s.min) / (s.max - s.min);
      const x = x0 + q * w, y = y0 + h - clamp01(v) * h;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = '#ffc93c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0 + p * w, y0);
  ctx.lineTo(x0 + p * w, y0 + h);
  ctx.stroke();
}

// ------------------------------------------------------------------ breathing
export const INSP = 0.4;
export function breathVolume(p: number): number {
  return p < INSP ? 0.5 * (1 - Math.cos((Math.PI * p) / INSP)) : 0.5 * (1 + Math.cos((Math.PI * (p - INSP)) / (1 - INSP)));
}

const gasDots = Array.from({ length: 26 }, (_, i) => ({ o2: i % 2 === 0, phase: Math.random(), y: 25 + Math.random() * 120 }));

export const breathDiagram: DiagramDef = {
  height: 250,
  label: 'Diagram of breathing and gas exchange',
  draw(ctx, p, stage) {
    const v = breathVolume(p);
    const insp = p < INSP;
    // chest
    ctx.save();
    if (stage <= 1) { ctx.strokeStyle = 'rgba(255,201,60,0.6)'; ctx.setLineDash([5, 4]); roundRect(ctx, 4, 4, 210, 172, 12); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = 'rgba(230,220,200,0.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const y = 48 + i * 18 - v * 3 * (6 - i) * 0.3;
      ctx.beginPath();
      ctx.ellipse(108, y + 10, 82 + v * 5, 14, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
    // airway
    ctx.strokeStyle = '#9fc6e8';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(108, 12); ctx.lineTo(108, 52); ctx.lineTo(84, 70);
    ctx.moveTo(108, 52); ctx.lineTo(132, 70);
    ctx.stroke();
    // lungs
    for (const cx of [72, 144]) {
      ctx.fillStyle = 'rgba(230,140,150,0.55)';
      ctx.beginPath();
      ctx.ellipse(cx, 98 + v * 6, 30 + v * 6, 44 + v * 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // diaphragm
    ctx.strokeStyle = '#d0705e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(22, 160);
    ctx.quadraticCurveTo(108, 112 + v * 34, 194, 160);
    ctx.stroke();
    if (insp) arrow(ctx, 120, 6, 120, 34, '#bfe3ff'); else arrow(ctx, 120, 34, 120, 6, '#bfe3ff');
    text(ctx, insp ? 'Air in' : 'Air out', 128, 22, { color: '#bfe3ff', weight: 650 });
    text(ctx, insp ? 'Diaphragm contracts and flattens' : 'Diaphragm relaxes and domes up', 108, 174, { align: 'center', color: MUTED });
    ctx.restore();

    // alveolus
    ctx.save();
    if (stage === 4) { ctx.strokeStyle = 'rgba(255,201,60,0.6)'; ctx.setLineDash([5, 4]); roundRect(ctx, 222, 4, 214, 172, 12); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = 'rgba(160,200,235,0.16)';
    ctx.strokeStyle = 'rgba(190,220,245,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(298, 90, 56 + v * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    text(ctx, 'Alveolus', 298, 86, { align: 'center', weight: 650 });
    text(ctx, 'PO₂ 104  PCO₂ 40', 298, 100, { align: 'center', color: MUTED });
    const g = ctx.createLinearGradient(0, 18, 0, 162);
    g.addColorStop(0, '#4a62c4');
    g.addColorStop(1, '#d4453c');
    ctx.fillStyle = g;
    roundRect(ctx, 372, 18, 26, 144, 12);
    ctx.fill();
    text(ctx, 'Capillary', 385, 14, { align: 'center', color: MUTED, size: 9 });
    text(ctx, 'in: PO₂ 40', 404, 32, { color: '#9db7ff', size: 9 });
    text(ctx, 'out: PO₂ 100', 404, 160, { color: '#ff9a8a', size: 9 });
    const tnow = performance.now() / 1000;
    for (const d of gasDots) {
      const k = (tnow * 0.45 + d.phase) % 1;
      const x = d.o2 ? 330 + k * 52 : 382 - k * 52;
      dot(ctx, x, d.y, 3, d.o2 ? '#ff6b6b' : '#b0b8c4');
    }
    text(ctx, '● O₂ into blood', 228, 168, { color: '#ff8a80', size: 9.5 });
    text(ctx, '● CO₂ out to the air', 310, 168, { color: '#c2cad6', size: 9.5 });
    ctx.restore();

    // volume trace
    text(ctx, 'Lung volume over one breath (tidal volume about 500 mL)', 10, 192, { color: MUTED });
    graph(ctx, 10, 198, 420, 46, p, [{ f: breathVolume, color: '#64b5f6', min: -0.1, max: 1.1 }], [[0, INSP, 'rgba(100,181,246,0.08)']]);
    text(ctx, 'Inspiration (active)', 14, 240, { color: '#9fd0ff', size: 9 });
    text(ctx, 'Expiration (passive recoil)', 426, 240, { color: MUTED, size: 9, align: 'right' });
  },
};

// ------------------------------------------------------------------ nerve impulse
const NODES = [70, 120, 170, 220, 270, 320];
const AP_END = 0.62;
function apX(p: number): number {
  return 50 + within(p, 0.05, AP_END) * 300;
}
const REC_X = 220;
const P_REC = 0.05 + ((REC_X - 50) / 300) * (AP_END - 0.05);
export function membranePotential(p: number): number {
  const s = p - P_REC;
  if (s < -0.03) return -70;
  if (s < 0) return -70 + 15 * smooth((s + 0.03) / 0.03);
  if (s < 0.025) return -55 + 85 * smooth(s / 0.025);
  if (s < 0.075) return 30 - 110 * smooth((s - 0.025) / 0.05);
  if (s < 0.2) return -80 + 10 * smooth((s - 0.075) / 0.125);
  return -70;
}

export const nerveDiagram: DiagramDef = {
  height: 250,
  label: 'Diagram of an action potential travelling along a myelinated axon to a synapse',
  draw(ctx, p, stage) {
    // neuron
    ctx.strokeStyle = '#e8d27a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.6 + i * 0.2);
      ctx.beginPath();
      ctx.moveTo(30, 60);
      ctx.lineTo(30 + Math.cos(a) * 28, 60 + Math.sin(a) * 28);
      ctx.stroke();
    }
    dot(ctx, 30, 60, 16, '#c9a94a');
    text(ctx, 'Cell body', 30, 96, { align: 'center', color: MUTED, size: 9 });
    // axon
    ctx.strokeStyle = '#e8d27a';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(46, 60); ctx.lineTo(372, 60); ctx.stroke();
    // myelin
    for (let i = 0; i < NODES.length; i++) {
      const a = (i === 0 ? 50 : NODES[i - 1]) + 4, b = NODES[i] - 4;
      ctx.fillStyle = 'rgba(235,235,245,0.85)';
      roundRect(ctx, a, 51, b - a, 18, 8);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(235,235,245,0.85)';
    roundRect(ctx, 324, 51, 44, 18, 8);
    ctx.fill();
    text(ctx, 'Myelin sheath', 95, 44, { align: 'center', color: MUTED, size: 9 });
    text(ctx, 'Node of Ranvier', 170, 88, { align: 'center', color: MUTED, size: 9 });
    // action potential at the active node (saltatory conduction)
    const x = apX(p);
    const active = p > 0.05 && p < AP_END + 0.02;
    if (active) {
      let ni = 0;
      for (let i = 0; i < NODES.length; i++) if (NODES[i] <= x + 8) ni = i;
      const nx = NODES[ni];
      const g = ctx.createRadialGradient(nx, 60, 2, nx, 60, 26);
      g.addColorStop(0, 'rgba(255,240,120,0.95)');
      g.addColorStop(1, 'rgba(255,240,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(nx, 60, 26, 0, Math.PI * 2); ctx.fill();
      arrow(ctx, nx - 5, 30, nx - 5, 52, '#7fd3ff');
      text(ctx, 'Na⁺', nx - 7, 26, { color: '#7fd3ff', size: 9, align: 'center', weight: 650 });
      if (ni > 0) {
        const px = NODES[ni - 1];
        arrow(ctx, px + 4, 66, px + 4, 92, '#ffab70');
        text(ctx, 'K⁺', px + 4, 104, { color: '#ffab70', size: 9, align: 'center', weight: 650 });
      }
      // local current spreading ahead
      ctx.strokeStyle = 'rgba(255,240,120,0.45)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(nx, 60); ctx.lineTo(Math.min(372, nx + 50), 60); ctx.stroke();
      ctx.setLineDash([]);
    }
    // synapse
    const sx = 384;
    ctx.save();
    if (stage === 4) { ctx.strokeStyle = 'rgba(255,201,60,0.6)'; ctx.setLineDash([5, 4]); roundRect(ctx, 366, 22, 72, 84, 10); ctx.stroke(); ctx.setLineDash([]); }
    dot(ctx, sx, 60, 14, '#c9a94a');
    ctx.fillStyle = '#8a3b3b';
    roundRect(ctx, 404, 30, 30, 60, 6);
    ctx.fill();
    text(ctx, 'Muscle', 419, 102, { align: 'center', color: MUTED, size: 9 });
    text(ctx, 'Synapse', 395, 20, { align: 'center', color: MUTED, size: 9 });
    const rel = within(p, AP_END - 0.02, AP_END + 0.18);
    for (let i = 0; i < 6; i++) {
      const vy = 50 + (i % 3) * 9, vx0 = sx - 6 + (i >> 1) * 0;
      const vx = rel > 0 ? vx0 + Math.min(1, rel * 2) * 10 : vx0 + (i % 2) * 3;
      dot(ctx, vx, vy + (i > 2 ? 4 : 0), 2.6, '#9fe6a0');
      if (rel > 0.4) dot(ctx, 398 + (rel - 0.4) * 10 + (i % 3) * 1.5, vy + i, 1.8, '#9fe6a0');
    }
    ctx.restore();

    // potential trace at the recording electrode
    ctx.strokeStyle = 'rgba(255,201,60,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(REC_X, 72); ctx.lineTo(REC_X, 122); ctx.stroke();
    text(ctx, 'Recording here', REC_X + 4, 118, { color: 'rgba(255,201,60,0.85)', size: 9 });
    const y0 = 128, h = 104;
    const mv = (v: number) => y0 + h - ((v + 90) / 130) * h;
    graph(ctx, 34, y0, 396, h, p, [{ f: membranePotential, color: '#ffe066', min: -90, max: 40, width: 2.2 }]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(34, mv(-55)); ctx.lineTo(430, mv(-55)); ctx.stroke();
    ctx.setLineDash([]);
    for (const v of [30, 0, -55, -70]) text(ctx, `${v}`, 30, mv(v) + 3, { align: 'right', size: 9, color: MUTED });
    text(ctx, 'threshold', 428, mv(-55) - 3, { align: 'right', size: 9, color: MUTED });
    const xr = 34 + P_REC * 396;
    text(ctx, 'Na⁺ in: depolarisation', xr - 6, mv(-20), { align: 'right', size: 9, color: '#7fd3ff' });
    text(ctx, 'K⁺ out: repolarisation', xr + 40, mv(0), { size: 9, color: '#ffab70' });
    text(ctx, 'hyperpolarisation', xr + 30, mv(-82) + 10, { size: 9, color: MUTED });
    const vm = membranePotential(p);
    text(ctx, `${Math.round(vm)} mV`, 426, y0 + 14, { align: 'right', weight: 650, color: '#ffe066' });
    text(ctx, 'Membrane potential (mV)', 40, y0 + 11, { size: 9, color: MUTED });
    text(ctx, 'Resting potential −70 mV kept by the Na⁺/K⁺ pump', 38, y0 + h + 14, { size: 9, color: MUTED });
  },
};

// ------------------------------------------------------------------ sarcomere
export function contraction(p: number): number {
  if (p < 0.15) return 0;
  if (p < 0.45) return smooth((p - 0.15) / 0.3);
  if (p < 0.65) return 1;
  if (p < 0.85) return 1 - smooth((p - 0.65) / 0.2);
  return 0;
}

const caDots = Array.from({ length: 30 }, () => ({ x: Math.random(), y: Math.random() }));

export const sarcomereDiagram: DiagramDef = {
  height: 230,
  label: 'Diagram of a sarcomere shortening as thin filaments slide over thick filaments',
  draw(ctx, p, stage) {
    const c = contraction(p);
    const mid = 220;
    const L = 190 - 45 * c;
    const zl = mid - L, zr = mid + L;
    const top = 40, bot = 170;
    // Ca2+
    const rising = p > 0.15 && p < 0.65;
    const n = Math.round(c * caDots.length);
    for (let i = 0; i < n; i++) dot(ctx, zl + caDots[i].x * (zr - zl), top + caDots[i].y * (bot - top), 2.2, 'rgba(255,224,102,0.8)');
    // thin filaments (actin)
    const thinLen = 120;
    ctx.lineWidth = 3;
    for (let r = 0; r < 5; r++) {
      const y = top + 8 + r * 29;
      ctx.strokeStyle = '#ef8a5a';
      ctx.beginPath(); ctx.moveTo(zl, y); ctx.lineTo(zl + thinLen, y); ctx.moveTo(zr, y); ctx.lineTo(zr - thinLen, y); ctx.stroke();
    }
    // thick filaments (myosin) with heads
    for (let r = 0; r < 4; r++) {
      const y = top + 22 + r * 29;
      ctx.strokeStyle = '#8f7ad8';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(mid - 95, y); ctx.lineTo(mid + 95, y); ctx.stroke();
      ctx.lineWidth = 2;
      for (let k = 0; k < 8; k++) {
        const side = k < 4 ? -1 : 1;
        const hx = mid + side * (22 + (k % 4) * 18);
        const swing = rising ? Math.sin(performance.now() / 120 + k + r) * 0.5 + 0.5 : 0;
        const ang = side * (0.7 + swing * 0.6);
        for (const dy of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(hx, y + dy * 3);
          ctx.lineTo(hx + Math.sin(ang) * 8, y + dy * (3 + Math.cos(Math.abs(ang)) * 7));
          ctx.stroke();
        }
      }
    }
    // Z lines and M line
    ctx.strokeStyle = '#e8eef6';
    ctx.lineWidth = 3;
    for (const z of [zl, zr]) {
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) ctx.lineTo(z + (i % 2 ? 4 : -4), top - 6 + i * 14);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(mid, top - 4); ctx.lineTo(mid, bot + 4); ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, 'Z line', zl, 26, { align: 'center', size: 9.5 });
    text(ctx, 'Z line', zr, 26, { align: 'center', size: 9.5 });
    text(ctx, 'M line', mid, 26, { align: 'center', size: 9.5, color: MUTED });
    // bands
    const by = bot + 14;
    const band = (a: number, b: number, label: string, color: string) => {
      if (b - a < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a, by); ctx.lineTo(b, by); ctx.moveTo(a, by - 4); ctx.lineTo(a, by + 4); ctx.moveTo(b, by - 4); ctx.lineTo(b, by + 4); ctx.stroke();
      text(ctx, label, (a + b) / 2, by + 13, { align: 'center', size: 9, color });
    };
    band(mid - 95, mid + 95, 'A band (constant)', '#b3a4f0');
    band(zl, mid - 95, 'I band', '#f5a97f');
    band(mid + 95, zr, 'I band', '#f5a97f');
    const hz = Math.max(0, L - thinLen);
    if (hz > 6) {
      ctx.strokeStyle = '#9fe6a0';
      ctx.beginPath(); ctx.moveTo(mid - hz, top - 2); ctx.lineTo(mid + hz, top - 2); ctx.stroke();
      text(ctx, 'H zone', mid, top - 6, { align: 'center', size: 9, color: '#9fe6a0' });
    }
    const state = p < 0.15 ? 'Relaxed: tropomyosin covers the binding sites on actin' : p < 0.65 ? 'Contracting: Ca²⁺ released, cross-bridges pull actin toward the M line' : p < 0.85 ? 'Relaxing: Ca²⁺ pumped back into the sarcoplasmic reticulum' : 'Relaxed';
    text(ctx, state, 220, 12, { align: 'center', weight: 650, color: rising ? '#ffe066' : TXT });
    // cross-bridge cycle strip
    if (stage === 3 || rising) {
      const steps = ['1 Head binds actin', '2 Power stroke', '3 ATP binds, detach', '4 ATP split, re-cock'];
      const k = rising ? Math.floor((performance.now() / 500) % 4) : -1;
      const w = 104;
      steps.forEach((s, i) => {
        ctx.fillStyle = i === k ? 'rgba(255,224,102,0.22)' : 'rgba(255,255,255,0.05)';
        roundRect(ctx, 8 + i * (w + 4), by + 18, w, 20, 6);
        ctx.fill();
        text(ctx, s, 8 + i * (w + 4) + w / 2, by + 31, { align: 'center', size: 8.5, color: i === k ? '#ffe066' : MUTED });
      });
    }
  },
};

// ------------------------------------------------------------------ digestive tract
const GUT = [
  { key: 'Mouth', a: 20, b: 58, t0: 0, t1: 0.06, time: 'Seconds to a minute', color: '#d98c7a' },
  { key: 'Oesophagus', a: 58, b: 128, t0: 0.06, t1: 0.1, time: 'About 8 seconds', color: '#d98c7a' },
  { key: 'Stomach', a: 128, b: 196, t0: 0.1, t1: 0.34, time: '2 to 4 hours', color: '#e09a86' },
  { key: 'Small intestine', a: 196, b: 330, t0: 0.34, t1: 0.6, time: '3 to 5 hours', color: '#e0a88a' },
  { key: 'Large intestine', a: 330, b: 424, t0: 0.6, t1: 1, time: '12 to 36 hours', color: '#c99a76' },
];
function gutY(x: number) {
  if (x > 196 && x < 330) return 96 + Math.sin((x - 196) / 9) * 14;
  return 96;
}

export const gutDiagram: DiagramDef = {
  height: 200,
  label: 'Diagram of food moving through the digestive tract',
  draw(ctx, p, stage) {
    const seg = GUT.find((g) => p >= g.t0 && p < g.t1) || GUT[4];
    const hl = [0, 0, 1, 2, 3, 4, 2][stage] ?? -1;
    // glands
    ctx.fillStyle = 'rgba(240,200,160,0.5)';
    ctx.beginPath(); ctx.ellipse(36, 58, 16, 9, 0, 0, Math.PI * 2); ctx.fill();
    text(ctx, 'Salivary glands', 36, 44, { align: 'center', size: 9, color: MUTED });
    ctx.fillStyle = 'rgba(150,70,60,0.8)';
    roundRect(ctx, 150, 22, 76, 30, 12); ctx.fill();
    text(ctx, 'Liver', 188, 41, { align: 'center', size: 9.5 });
    ctx.fillStyle = 'rgba(110,170,90,0.85)';
    ctx.beginPath(); ctx.ellipse(232, 52, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    text(ctx, 'Gallbladder', 246, 50, { size: 9, color: MUTED });
    ctx.fillStyle = 'rgba(235,200,140,0.75)';
    roundRect(ctx, 214, 134, 64, 16, 7); ctx.fill();
    text(ctx, 'Pancreas', 246, 146, { align: 'center', size: 9, color: '#3a2a10', weight: 650 });
    ctx.strokeStyle = 'rgba(140,200,110,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(228, 56); ctx.lineTo(206, 82); ctx.stroke();
    ctx.strokeStyle = 'rgba(235,200,140,0.8)';
    ctx.beginPath(); ctx.moveTo(220, 136); ctx.lineTo(208, 112); ctx.stroke();
    // tube with peristaltic ripple
    GUT.forEach((g, i) => {
      ctx.strokeStyle = i === hl ? '#ffc93c' : g.color;
      ctx.lineCap = 'round';
      const width = g.key === 'Stomach' ? 30 : g.key === 'Large intestine' ? 20 : 13;
      for (let x = g.a; x < g.b; x += 2) {
        const ripple = 1 + 0.18 * Math.sin((x - p * 900) / 7);
        ctx.lineWidth = width * ripple;
        ctx.beginPath();
        ctx.moveTo(x, gutY(x));
        ctx.lineTo(x + 2.5, gutY(x + 2.5));
        ctx.stroke();
      }
      text(ctx, g.key, (g.a + g.b) / 2, g.key === 'Small intestine' ? 132 : 128, { align: 'center', size: 9.5, color: i === hl ? '#ffc93c' : TXT, weight: 600 });
    });
    // bolus
    const k = within(p, seg.t0, seg.t1);
    const bx = seg.a + (seg.b - seg.a) * k;
    const stageName = seg.key === 'Mouth' ? 'Food bolus' : seg.key === 'Oesophagus' ? 'Bolus' : seg.key === 'Stomach' ? 'Chyme' : seg.key === 'Small intestine' ? 'Chyme (nutrients absorbed)' : 'Faeces forming (water absorbed)';
    dot(ctx, bx, gutY(bx), 6, '#5b3b22');
    ctx.strokeStyle = '#f6e3c0';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(bx, gutY(bx), 6, 0, Math.PI * 2); ctx.stroke();
    text(ctx, `${seg.key}: ${stageName}`, 10, 174, { weight: 650, color: '#ffe0a0', size: 11 });
    text(ctx, `Time spent here: ${seg.time}`, 10, 190, { color: MUTED, size: 10 });
    text(ctx, 'Not to scale in time', 430, 190, { align: 'right', size: 9, color: MUTED });
  },
};

// ------------------------------------------------------------------ nephron
type P2 = [number, number];
const TUBULE: P2[] = [[96, 72], [112, 60], [130, 80], [148, 58], [166, 80], [184, 66], [196, 84], [196, 222], [210, 238], [224, 222], [224, 104], [240, 90], [258, 104], [276, 88], [296, 100], [330, 100], [330, 246]];
const TLEN: number[] = (() => { const a = [0]; for (let i = 1; i < TUBULE.length; i++) a.push(a[i - 1] + Math.hypot(TUBULE[i][0] - TUBULE[i - 1][0], TUBULE[i][1] - TUBULE[i - 1][1])); return a; })();
function tubeAt(s: number): { p: P2; n: P2; i: number } {
  const d = clamp01(s) * TLEN[TLEN.length - 1];
  let i = 1;
  while (i < TLEN.length - 1 && TLEN[i] < d) i++;
  const k = (d - TLEN[i - 1]) / (TLEN[i] - TLEN[i - 1]);
  const a = TUBULE[i - 1], b = TUBULE[i];
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return { p: [a[0] + dx * k, a[1] + dy * k], n: [-dy / l, dx / l], i };
}
/** fraction of filtrate reabsorbed by the time it reaches s */
function removedAt(s: number) {
  const pct = TLEN[6] / TLEN[TLEN.length - 1];
  const loop = TLEN[10] / TLEN[TLEN.length - 1];
  const dct = TLEN[15] / TLEN[TLEN.length - 1];
  if (s < pct) return 0.65 * (s / pct);
  if (s < loop) return 0.65 + 0.2 * ((s - pct) / (loop - pct));
  if (s < dct) return 0.85 + 0.08 * ((s - loop) / (dct - loop));
  return 0.93 + 0.06 * ((s - dct) / (1 - dct));
}
const filt = Array.from({ length: 70 }, () => ({ s: Math.random(), r: Math.random(), kind: Math.floor(Math.random() * 3) }));

export const nephronDiagram: DiagramDef = {
  height: 262,
  label: 'Diagram of a nephron filtering blood and reabsorbing water and solutes',
  draw(ctx, p, stage) {
    // cortex / medulla
    ctx.fillStyle = 'rgba(200,110,90,0.08)';
    ctx.fillRect(0, 0, W, 126);
    const g = ctx.createLinearGradient(0, 126, 0, 262);
    g.addColorStop(0, 'rgba(200,110,90,0.12)');
    g.addColorStop(1, 'rgba(200,110,90,0.32)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 126, W, 136);
    text(ctx, 'Cortex', 434, 16, { align: 'right', size: 9, color: MUTED });
    text(ctx, 'Medulla (saltier deeper down: 300 → 1200 mOsm)', 434, 140, { align: 'right', size: 9, color: MUTED });
    // arterioles and capillary
    ctx.strokeStyle = '#d6453d';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(6, 40); ctx.lineTo(56, 56); ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(84, 50); ctx.lineTo(120, 30); ctx.lineTo(300, 30); ctx.lineTo(300, 56); ctx.stroke();
    text(ctx, 'Afferent arteriole', 8, 30, { size: 9, color: '#ff9a8a' });
    text(ctx, 'Peritubular capillary (takes back what is reabsorbed)', 126, 24, { size: 9, color: '#ff9a8a' });
    // glomerulus and capsule
    ctx.strokeStyle = stage === 2 ? '#ffc93c' : 'rgba(230,220,180,0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(72, 66, 30, 0.35 * Math.PI, 2.15 * Math.PI); ctx.stroke();
    for (let i = 0; i < 7; i++) dot(ctx, 64 + (i % 3) * 8, 58 + Math.floor(i / 3) * 8, 6, '#c8463e');
    text(ctx, 'Glomerulus', 72, 112, { align: 'center', size: 9.5, weight: 650 });
    // tubule
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const segColor = (i: number) => {
      const hl = (stage === 3 && i <= 10) || (stage === 4 && i > 10) || stage === 1;
      return hl ? 'rgba(255,201,60,0.55)' : 'rgba(240,225,170,0.32)';
    };
    for (let i = 1; i < TUBULE.length; i++) {
      ctx.strokeStyle = segColor(i);
      ctx.lineWidth = i >= 15 ? 14 : 10;
      ctx.beginPath(); ctx.moveTo(...TUBULE[i - 1]); ctx.lineTo(...TUBULE[i]); ctx.stroke();
    }
    text(ctx, 'Proximal tubule', 140, 100, { align: 'center', size: 9 });
    text(ctx, 'Loop of Henle', 210, 256, { align: 'center', size: 9 });
    text(ctx, 'Distal tubule', 268, 122, { align: 'center', size: 9 });
    text(ctx, 'Collecting duct', 342, 200, { size: 9 });
    text(ctx, '→ renal pelvis', 342, 214, { size: 9, color: MUTED });
    // filtrate particles
    const colors = ['#f2d14b', '#7fc8ff', '#8ee08e'];
    for (const f of filt) {
      f.s = (f.s + 0.0016) % 1;
      const rem = removedAt(f.s);
      const at = tubeAt(f.s);
      const gone = f.r < rem;
      if (gone) {
        const out = (rem - f.r) * 60;
        if (out > 22) continue;
        dot(ctx, at.p[0] + at.n[0] * (8 + out), at.p[1] + at.n[1] * (8 + out), 2.2, colors[f.kind]);
      } else dot(ctx, at.p[0], at.p[1], 2.4, colors[f.kind]);
    }
    text(ctx, '● water', 350, 64, { size: 9, color: '#7fc8ff' });
    text(ctx, '● salts', 350, 78, { size: 9, color: '#f2d14b' });
    text(ctx, '● glucose', 350, 92, { size: 9, color: '#8ee08e' });
    text(ctx, '180 L filtered a day → about 1.5 L of urine', 10, 140, { size: 9.5, weight: 650, color: '#ffe0a0' });
    void p;
  },
};

// ------------------------------------------------------------------ hormones
function glucose(p: number) {
  const meal = 0.08;
  const rise = p > meal ? 3.2 * Math.exp(-((p - meal - 0.12) ** 2) / 0.006) : 0;
  const dip = -0.6 * Math.exp(-((p - 0.75) ** 2) / 0.01);
  return 5 + rise + dip;
}
function insulin(p: number) {
  return Math.max(0, (glucose(Math.max(0, p - 0.03)) - 5) / 3.2) * 0.9 + 0.1;
}
function glucagon(p: number) {
  return 0.2 + Math.max(0, 5 - glucose(p)) * 0.9 + (p > 0.62 ? 0.25 * smooth((p - 0.62) / 0.1) : 0) - (p > 0.08 && p < 0.5 ? 0.15 : 0);
}

export const hormoneDiagram: DiagramDef = {
  height: 230,
  label: 'Diagram of hormone feedback loops',
  draw(ctx, p, stage) {
    if (stage === 1 || stage === 0) {
      // hypothalamic-pituitary-thyroid axis
      const boxes: [string, number, number, string][] = [
        ['Hypothalamus', 30, 30, '#b48ae8'],
        ['Anterior pituitary', 30, 90, '#e88ab4'],
        ['Thyroid gland', 30, 150, '#e8b48a'],
        ['Body cells: metabolism ↑', 250, 150, '#8ae8b4'],
      ];
      for (const [t, x, y, c] of boxes) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, 160, 34, 9); ctx.fill(); ctx.stroke();
        text(ctx, t, x + 80, y + 21, { align: 'center', weight: 650 });
      }
      const k = (p * 3) % 1;
      const flow = (x1: number, y1: number, x2: number, y2: number, label: string, c: string) => {
        arrow(ctx, x1, y1, x2, y2, c);
        dot(ctx, x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, 3.5, c);
        text(ctx, label, (x1 + x2) / 2 + 8, (y1 + y2) / 2 + 3, { size: 9.5, color: c, weight: 650 });
      };
      flow(110, 64, 110, 88, 'TRH', '#d9b8ff');
      flow(110, 124, 110, 148, 'TSH', '#ffb8d9');
      flow(190, 167, 248, 167, 'T₃, T₄', '#ffd2a8');
      ctx.strokeStyle = 'rgba(255,120,120,0.85)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(330, 148); ctx.lineTo(330, 47); ctx.lineTo(194, 47); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(330, 107); ctx.lineTo(194, 107); ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, '− negative feedback', 338, 80, { size: 9.5, color: '#ff8a8a', weight: 650 });
      text(ctx, 'High T₃/T₄ switches off TRH and TSH,', 250, 202, { size: 9, color: MUTED });
      text(ctx, 'so the level stays in a narrow range.', 250, 214, { size: 9, color: MUTED });
      return;
    }
    // blood glucose, insulin and glucagon
    text(ctx, 'Blood glucose after a meal', 10, 14, { weight: 650 });
    graph(ctx, 34, 22, 396, 110, p, [
      { f: glucose, color: '#ffe066', min: 3, max: 9, width: 2.4 },
    ], [[0.08, 0.12, 'rgba(255,255,255,0.06)']]);
    for (const v of [4, 6, 8]) text(ctx, `${v}`, 30, 22 + 110 - ((v - 3) / 6) * 110 + 3, { align: 'right', size: 9, color: MUTED });
    text(ctx, 'mmol/L', 30, 30, { align: 'right', size: 8.5, color: MUTED });
    text(ctx, 'Meal', 34 + 0.1 * 396, 36, { align: 'center', size: 9, color: MUTED });
    graph(ctx, 34, 142, 396, 46, p, [
      { f: insulin, color: '#64b5f6', min: 0, max: 1.1 },
      { f: glucagon, color: '#ffab70', min: 0, max: 1.1 },
    ]);
    text(ctx, 'Insulin (β cells)', 38, 154, { size: 9, color: '#64b5f6' });
    text(ctx, 'Glucagon (α cells)', 140, 154, { size: 9, color: '#ffab70' });
    const g = glucose(p);
    const msg = g > 6 ? 'Glucose high → insulin: muscle, fat and liver take up glucose; liver stores glycogen' : g < 4.8 ? 'Glucose low → glucagon: liver breaks down glycogen and releases glucose' : 'Glucose in the normal range (about 4 to 6 mmol/L)';
    text(ctx, msg, 10, 206, { size: 10, weight: 650, color: g > 6 ? '#9fd0ff' : g < 4.8 ? '#ffc8a0' : TXT });
    text(ctx, `${g.toFixed(1)} mmol/L`, 426, 36, { align: 'right', weight: 650, color: '#ffe066' });
    void stage;
  },
};

// ------------------------------------------------------------------ lymph formation
const fluid = Array.from({ length: 40 }, (_, i) => ({ k: Math.random(), lane: i % 4, x: 0 }));

export const lymphDiagram: DiagramDef = {
  height: 210,
  label: 'Diagram of tissue fluid leaving blood capillaries and draining into lymph capillaries',
  draw(ctx, p, stage) {
    void stage;
    const g = ctx.createLinearGradient(40, 0, 400, 0);
    g.addColorStop(0, '#d4453c');
    g.addColorStop(1, '#4a62c4');
    ctx.fillStyle = g;
    roundRect(ctx, 30, 50, 380, 26, 13);
    ctx.fill();
    text(ctx, 'Blood capillary', 220, 67, { align: 'center', weight: 650, color: '#fff' });
    text(ctx, 'Arterial end: fluid pushed out', 34, 42, { size: 9, color: '#ff9a8a' });
    text(ctx, 'Venous end: most fluid drawn back in', 406, 42, { size: 9, color: '#9db7ff', align: 'right' });
    // lymph capillary
    ctx.fillStyle = 'rgba(120,210,130,0.35)';
    ctx.strokeStyle = 'rgba(140,230,150,0.9)';
    ctx.lineWidth = 2;
    roundRect(ctx, 90, 140, 290, 22, 11);
    ctx.fill(); ctx.stroke();
    text(ctx, 'Lymph capillary (blind-ended)', 200, 155, { align: 'center', size: 9.5, weight: 650 });
    ctx.fillStyle = '#6ccf7a';
    ctx.beginPath(); ctx.arc(408, 151, 16, 0, Math.PI * 2); ctx.fill();
    text(ctx, 'Node', 408, 154, { align: 'center', size: 8.5, color: '#10301a', weight: 700 });
    text(ctx, 'Tissue fluid around cells', 220, 112, { align: 'center', size: 9, color: MUTED });
    const t = performance.now() / 1000;
    for (const f of fluid) {
      const k = (t * 0.12 + f.k) % 1;
      let x: number, y: number, c: string;
      if (f.lane < 3) {
        // out at the arterial end, back in at the venous end
        const x0 = 70 + f.lane * 30;
        if (k < 0.3) { x = x0; y = 76 + (k / 0.3) * 40; }
        else if (k < 0.7) { x = x0 + ((k - 0.3) / 0.4) * 210; y = 116; }
        else { x = x0 + 210; y = 116 - ((k - 0.7) / 0.3) * 40; }
        c = '#9fd8ff';
      } else {
        // a share drains into the lymph capillary and flows to the node
        const x0 = 110 + (f.k * 90);
        if (k < 0.35) { x = x0; y = 76 + (k / 0.35) * 70; }
        else { x = x0 + ((k - 0.35) / 0.65) * (390 - x0); y = 151; }
        c = '#a8f0b0';
      }
      dot(ctx, x, y, 2.6, c);
    }
    text(ctx, 'About 20 L of fluid leaves the blood capillaries each day; about 17 L returns directly', 10, 186, { size: 9.5, color: TXT });
    text(ctx, 'and about 3 L is returned by the lymphatic system to the veins of the neck.', 10, 200, { size: 9.5, color: TXT });
    void p;
  },
};
