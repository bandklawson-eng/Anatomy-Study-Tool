// 2D schematic of the heart and both circulations with animated blood cells.
// Drawn in a 440 x 340 logical coordinate space (anterior view: the patient's right is on the left).
import { atrialContraction, phaseAt, ventricularContraction } from './cardiac';

export const DW = 440;
export const DH = 340;

type Pt = [number, number];
interface Rect { x: number; y: number; w: number; h: number }

export type HeartKey =
  | 'veins' | 'RA' | 'TV' | 'RV' | 'PV' | 'PA' | 'lungs' | 'PVn' | 'LA' | 'MV' | 'LV' | 'AV' | 'Ao' | 'body';

const RA: Rect = { x: 100, y: 108, w: 98, h: 64 };
const LA: Rect = { x: 242, y: 108, w: 98, h: 64 };
const RV: Rect = { x: 100, y: 184, w: 112, h: 80 };
const LV: Rect = { x: 228, y: 184, w: 112, h: 80 };
const LUNGS: Rect = { x: 110, y: 6, w: 220, h: 54 };
const BODY: Rect = { x: 24, y: 292, w: 392, h: 42 };

// vessel paths (each ends where the next element begins)
const P_BODYCAP: Pt[] = [[400, 300], [400, 318], [330, 326], [250, 314], [170, 326], [90, 314], [60, 322], [60, 300]];
const P_VEINS: Pt[] = [[60, 300], [60, 140], [100, 140]];
const P_PA: Pt[] = [[204, 186], [204, 62]];
const P_LUNGCAP: Pt[] = [[204, 60], [196, 36], [214, 20], [240, 40], [262, 18], [286, 38], [304, 24], [300, 60]];
const P_PVN: Pt[] = [[300, 60], [300, 108]];
const P_AO: Pt[] = [[236, 186], [236, 96], [244, 82], [262, 78], [396, 78], [404, 90], [404, 270], [400, 300]];

interface Seg {
  key: HeartKey;
  kind: 'vessel' | 'chamber';
  pts?: Pt[];
  rect?: Rect;
  /** cycles needed to traverse a vessel */
  time?: number;
  exit?: Pt;
  gate?: (p: number) => boolean;
  /** oxygen saturation at the start and end of the segment, 0..1 */
  ox: [number, number];
  pulsatile?: boolean;
}

const avOpen = (p: number) => phaseAt(p).av;
const slOpen = (p: number) => phaseAt(p).sl;

const SEGS: Seg[] = [
  { key: 'body', kind: 'vessel', pts: P_BODYCAP, time: 0.9, ox: [1, 0] },
  { key: 'veins', kind: 'vessel', pts: P_VEINS, time: 0.8, ox: [0, 0] },
  { key: 'RA', kind: 'chamber', rect: RA, exit: [150, 176], gate: avOpen, ox: [0, 0] },
  { key: 'RV', kind: 'chamber', rect: RV, exit: [204, 186], gate: slOpen, ox: [0, 0] },
  { key: 'PA', kind: 'vessel', pts: P_PA, time: 0.35, ox: [0, 0], pulsatile: true },
  { key: 'lungs', kind: 'vessel', pts: P_LUNGCAP, time: 0.9, ox: [0, 1] },
  { key: 'PVn', kind: 'vessel', pts: P_PVN, time: 0.4, ox: [1, 1] },
  { key: 'LA', kind: 'chamber', rect: LA, exit: [292, 176], gate: avOpen, ox: [1, 1] },
  { key: 'LV', kind: 'chamber', rect: LV, exit: [236, 186], gate: slOpen, ox: [1, 1] },
  { key: 'Ao', kind: 'vessel', pts: P_AO, time: 0.6, ox: [1, 1], pulsatile: true },
];

function polyLen(pts: Pt[]): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
}
const LENS = SEGS.map((s) => (s.pts ? polyLen(s.pts) : [0]));

function pointAt(si: number, t: number): Pt {
  const pts = SEGS[si].pts!;
  const acc = LENS[si];
  const L = acc[acc.length - 1];
  const d = Math.max(0, Math.min(1, t)) * L;
  let i = 1;
  while (i < acc.length - 1 && acc[i] < d) i++;
  const k = (d - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
}

interface Cell {
  seg: number;
  t: number; // progress in a vessel 0..1
  // chamber state
  stage: 'in' | 'wait' | 'out';
  from: Pt;
  spot: Pt;
  k: number;
  release: number; // phase delay before leaving after the gate opens
  ox: number;
  pos: Pt;
}

function rnd(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function lerpColor(ox: number): string {
  // deoxygenated (blue-purple) -> oxygenated (red)
  const r = Math.round(70 + (226 - 70) * ox);
  const g = Math.round(110 + (52 - 110) * ox);
  const b = Math.round(220 + (60 - 220) * ox);
  return `rgb(${r},${g},${b})`;
}

/** Which part of the diagram is at a client position. */
export function hitDiagram(canvas: HTMLCanvasElement, clientX: number, clientY: number): HeartKey | null {
  const r = canvas.getBoundingClientRect();
  const x = ((clientX - r.left) / r.width) * DW;
  const y = ((clientY - r.top) / r.height) * DH;
  const inR = (q: Rect, pad = 0) => x >= q.x - pad && x <= q.x + q.w + pad && y >= q.y - pad && y <= q.y + q.h + pad;
  const near = (pts: Pt[], d = 9) => {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const vx = bx - ax, vy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
      if (Math.hypot(ax + vx * t - x, ay + vy * t - y) < d) return true;
    }
    return false;
  };
  if (Math.hypot(x - 150, y - 178) < 14) return 'TV';
  if (Math.hypot(x - 292, y - 178) < 14) return 'MV';
  if (Math.hypot(x - 204, y - 186) < 9) return 'PV';
  if (Math.hypot(x - 236, y - 186) < 9) return 'AV';
  if (inR(RA)) return 'RA';
  if (inR(LA)) return 'LA';
  if (inR(RV)) return 'RV';
  if (inR(LV)) return 'LV';
  if (near(P_PA)) return 'PA';
  if (near(P_PVN)) return 'PVn';
  if (near(P_AO)) return 'Ao';
  if (near(P_VEINS)) return 'veins';
  if (inR(LUNGS)) return 'lungs';
  if (inR(BODY)) return 'body';
  return null;
}


export class HeartDiagram {
  private ctx: CanvasRenderingContext2D;
  private cells: Cell[] = [];
  private lastP = 0;
  private scale = 1;
  constructor(private canvas: HTMLCanvasElement, count = 90) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    // spread cells along the circuit
    for (let i = 0; i < count; i++) {
      const si = Math.floor(Math.random() * SEGS.length);
      this.cells.push(this.spawn(si));
    }
  }

  private spawn(si: number): Cell {
    const s = SEGS[si];
    const c: Cell = { seg: si, t: Math.random(), stage: 'wait', from: [0, 0], spot: [0, 0], k: 1, release: Math.random(), ox: s.ox[0], pos: [0, 0] };
    if (s.kind === 'chamber') {
      c.spot = this.randomSpot(s.rect!);
      c.pos = c.spot;
    } else {
      c.ox = s.ox[0] + (s.ox[1] - s.ox[0]) * c.t;
      c.pos = pointAt(si, c.t);
    }
    return c;
  }

  private randomSpot(r: Rect): Pt {
    return [rnd(r.x + 10, r.x + r.w - 10), rnd(r.y + 10, r.y + r.h - 10)];
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || DW;
    this.scale = w / DW;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(w * (DH / DW) * dpr);
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
  }

  /** Advance the blood cells from the previous phase to p (dp in cycles). */
  private step(p: number, dp: number) {
    if (dp <= 0) return;
    const sub = Math.max(1, Math.ceil(dp / 0.01));
    const h = dp / sub;
    for (let s = 1; s <= sub; s++) {
      const q = (this.lastP + h * s) % 1;
      const ejecting = phaseAt(q).sl;
      for (const c of this.cells) this.moveCell(c, q, h, ejecting);
    }
  }

  private moveCell(c: Cell, q: number, h: number, ejecting: boolean) {
    const seg = SEGS[c.seg];
    if (seg.kind === 'vessel') {
      let speed = 1 / seg.time!;
      if (seg.pulsatile) speed *= ejecting ? 2.2 : 0.35;
      c.t += h * speed;
      if (c.t >= 1) {
        this.enter(c, (c.seg + 1) % SEGS.length, pointAt(c.seg, 1));
        return;
      }
      c.ox = seg.ox[0] + (seg.ox[1] - seg.ox[0]) * c.t;
      c.pos = pointAt(c.seg, c.t);
      return;
    }
    // chamber
    const open = seg.gate!(q);
    if (c.stage === 'in') {
      c.k = Math.min(1, c.k + h / 0.05);
      c.pos = [c.from[0] + (c.spot[0] - c.from[0]) * c.k, c.from[1] + (c.spot[1] - c.from[1]) * c.k];
      if (c.k >= 1) c.stage = 'wait';
      // a cell may stream straight through an atrium while the AV valve is open
      if (open && seg.key.endsWith('A') && c.k > 0.6 && Math.random() < h * 6) this.leave(c);
    } else if (c.stage === 'wait') {
      // gentle drift
      c.pos = [c.spot[0] + Math.sin(q * 40 + c.release * 9) * 1.2, c.spot[1] + Math.cos(q * 37 + c.release * 7) * 1.2];
      if (open && Math.random() < h * (seg.key.endsWith('V') ? 9 : 5)) this.leave(c);
    } else {
      c.k = Math.min(1, c.k + h / 0.04);
      const ex = seg.exit!;
      c.pos = [c.from[0] + (ex[0] - c.from[0]) * c.k, c.from[1] + (ex[1] - c.from[1]) * c.k];
      if (c.k >= 1) {
        const next = (c.seg + 1) % SEGS.length;
        if (SEGS[next].kind === 'chamber') this.enter(c, next, ex);
        else {
          c.seg = next;
          c.t = 0;
        }
      }
    }
  }

  private enter(c: Cell, si: number, from: Pt) {
    c.seg = si;
    const s = SEGS[si];
    if (s.kind === 'chamber') {
      c.stage = 'in';
      c.from = from;
      c.spot = this.randomSpot(s.rect!);
      c.k = 0;
      c.ox = s.ox[0];
    } else {
      c.t = 0;
    }
  }

  private leave(c: Cell) {
    c.stage = 'out';
    c.from = c.pos;
    c.k = 0;
  }

  draw(p: number, opts: { highlight?: HeartKey | null; playing: boolean }) {
    if (opts.playing) {
      let dp = p - this.lastP;
      if (dp < 0) dp += 1;
      if (dp < 0.25) this.step(p, dp);
    }
    this.lastP = p;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, DW, DH);
    const ph = phaseAt(p);
    const ac = atrialContraction(p);
    const vc = ventricularContraction(p);
    const hl = opts.highlight;

    // capillary beds
    this.bed(LUNGS, 'Lungs: blood picks up O₂, drops CO₂', '#2b3d5a', '#5a2b33', hl === 'lungs');
    this.bed(BODY, 'Body tissues: blood delivers O₂, picks up CO₂', '#5a2b33', '#2b3d5a', hl === 'body');

    // vessels
    this.vessel(P_VEINS, '#3c6bd0', hl === 'veins');
    this.vessel(P_PA, '#3c6bd0', hl === 'PA');
    this.vessel(P_PVN, '#d6453d', hl === 'PVn');
    // aorta drawn over the pulmonary veins with a small bridge gap
    ctx.save();
    ctx.strokeStyle = '#0b1017';
    ctx.lineWidth = 16;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(290, 78);
    ctx.lineTo(310, 78);
    ctx.stroke();
    ctx.restore();
    this.vessel(P_AO, '#d6453d', hl === 'Ao');

    // chambers
    const atr = 1 - 0.07 * ac;
    const ven = 1 - 0.09 * vc;
    this.chamber(RA, atr, 'Right atrium', '#28406e', ac, hl === 'RA');
    this.chamber(LA, atr, 'Left atrium', '#6e2830', ac, hl === 'LA');
    this.chamber(RV, ven, 'Right ventricle', '#28406e', vc * (ph.sl || ph.key === 'ivc' ? 1 : 0.3), hl === 'RV');
    this.chamber(LV, ven, 'Left ventricle', '#6e2830', vc * (ph.sl || ph.key === 'ivc' ? 1 : 0.3), hl === 'LV');
    // septum
    ctx.fillStyle = '#3a1e22';
    ctx.fillRect(213, 186, 14, 76);

    // valves
    this.avValve(150, 177, ph.av, 'Tricuspid', hl === 'TV');
    this.avValve(292, 177, ph.av, 'Mitral', hl === 'MV');
    this.slValve(204, 186, ph.sl, hl === 'PV');
    this.slValve(236, 186, ph.sl, hl === 'AV');

    // cells
    for (const c of this.cells) {
      ctx.fillStyle = lerpColor(c.ox);
      ctx.beginPath();
      ctx.arc(c.pos[0], c.pos[1], 3.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // labels
    ctx.fillStyle = 'rgba(230,236,245,0.85)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(48, 220);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Venae cavae', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(418, 190);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('Aorta', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillText('Pulmonary', 140, 76);
    ctx.fillText('trunk', 160, 88);
    ctx.fillText('Pulmonary', 308, 96);
    ctx.fillText('veins', 308, 106);
    ctx.textAlign = 'center';
    ctx.font = '9.5px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200,210,225,0.7)';
    ctx.fillText('Pulmonary valve', 178, 282 - 4);
    ctx.fillText('Aortic valve', 262, 282 - 4);
    ctx.strokeStyle = 'rgba(200,210,225,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(190, 270);
    ctx.lineTo(203, 190);
    ctx.moveTo(252, 270);
    ctx.lineTo(237, 190);
    ctx.stroke();
  }

  private bed(r: Rect, label: string, c1: string, c2: string, hl: boolean) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    if (hl) this.outline(r);
    ctx.fillStyle = 'rgba(230,236,245,0.75)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, r.x + r.w / 2, r.y + (r === LUNGS ? 12 : r.h - 6));
  }

  private vessel(pts: Pt[], color: string, hl: boolean) {
    const ctx = this.ctx;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (hl) {
      ctx.strokeStyle = '#ffc93c';
      ctx.lineWidth = 16;
      stroke(ctx, pts);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 11;
    stroke(ctx, pts);
    ctx.globalAlpha = 1;
  }

  private chamber(r: Rect, s: number, label: string, fill: string, active: number, hl: boolean) {
    const ctx = this.ctx;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const w = r.w * s, h = r.h * s;
    ctx.fillStyle = fill;
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 16);
    ctx.fill();
    ctx.lineWidth = 3 + active * 3;
    ctx.strokeStyle = `rgba(255, ${Math.round(170 - active * 60)}, ${Math.round(150 - active * 100)}, ${0.35 + active * 0.6})`;
    ctx.stroke();
    if (hl) this.outline({ x: cx - w / 2, y: cy - h / 2, w, h });
    ctx.fillStyle = 'rgba(235,240,248,0.9)';
    ctx.font = '650 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, r.y + (r.y < 150 ? 16 : r.h - 8));
  }

  private outline(r: Rect) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#ffc93c';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    roundRect(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 14);
    ctx.stroke();
    ctx.restore();
  }

  /** Atrioventricular valve: two leaflets hanging into the ventricle. */
  private avValve(x: number, y: number, open: boolean, label: string, hl: boolean) {
    const ctx = this.ctx;
    const ang = open ? 1.15 : 0.08;
    ctx.lineCap = 'round';
    if (hl) {
      ctx.fillStyle = 'rgba(255,201,60,0.25)';
      ctx.beginPath();
      ctx.arc(x, y + 4, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = open ? '#5fcf80' : '#f0f0f0';
    ctx.lineWidth = 4;
    for (const side of [-1, 1]) {
      const bx = x + side * 26;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.lineTo(bx - side * Math.cos(ang) * 24, y + Math.sin(ang) * 24);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(220,230,240,0.75)';
    ctx.font = '9.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label + (open ? ' (open)' : ' (closed)'), x, y - 4 - (y > 170 ? 0 : 0) + 0);
  }

  /** Semilunar valve: small cusps at a vessel outlet. */
  private slValve(x: number, y: number, open: boolean, hl: boolean) {
    const ctx = this.ctx;
    if (hl) {
      ctx.fillStyle = 'rgba(255,201,60,0.3)';
      ctx.beginPath();
      ctx.arc(x, y - 4, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = open ? '#5fcf80' : '#f0f0f0';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const ang = open ? 1.35 : 0.1;
    for (const side of [-1, 1]) {
      const bx = x + side * 6;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.lineTo(bx - side * Math.cos(ang) * 7, y - Math.sin(ang) * 9);
      ctx.stroke();
    }
  }
}

function stroke(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
