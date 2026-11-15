// Adds female anatomy to the atlas built by build-data.mjs.
//
//   node pipeline/add-female.mjs        (run after build-data; safe to run again)
//
// Source: HuBMAP Human Reference Atlas, 3D Reference Object Library, Visible Human Female
// (https://github.com/hubmapconsortium/ccf-3d-reference-object-library), CC BY 4.0.
// The female organs are fitted into this (male, BodyParts3D) body:
//   pelvis  an affine transform found by matching the female pelvic bones to this body's hip bones,
//           sacrum and coccyx (ICP), then a shift that puts the female bladder where this body's
//           bladder is, faded out towards the perineum so the vagina still meets the vulva.
//   breasts the breast's height above a smooth chest-wall baseline is transplanted onto this
//           body's chest skin; tissue below the baseline is compressed to fit the thinner chest wall.
// Male-only structures get sx: 'm' and the female ones sx: 'f'; the app shows one set at a time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document } from '@gltf-transform/core';
import { weldPrimitive, simplifyPrimitive, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { io, readNodes } from './lib-glb.mjs';
import { icpAffine, apply } from './lib-fit.mjs';
import { TEXT } from './female-text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data');
const HRA = process.env.HRA_SRC || path.join(ROOT, '.sources', 'hra');
const V12 = path.join(HRA, 'VH_Female/v1.2'), V13 = path.join(HRA, 'VH_Female/v1.3');
const CHUNK = 'female-0.glb';
await MeshoptSimplifier.ready;

const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'meta.json'), 'utf8'));
// ---------------------------------------------------------------- undo a previous run
if (meta.female) {
  meta.items.length = meta.female.start;
  meta.chunks = meta.chunks.filter((c) => c.f !== CHUNK);
  meta.descBuckets = meta.female.descBucket;
  delete meta.female;
}
for (const it of meta.items) delete it.sx;

const items = meta.items;
const byName = (n, sd) => {
  const i = items.findIndex((x) => x.n === n && (sd === undefined || x.sd === sd));
  if (i < 0) throw new Error('missing item ' + n + ' ' + (sd || ''));
  return i;
};
const matIdx = (m) => {
  let i = meta.materials.indexOf(m);
  if (i < 0) { i = meta.materials.length; meta.materials.push(m); }
  return i;
};
const LG = new Map(meta.layerGroups.map((g, i) => [g.key, i]));
const SYS = (s) => meta.systems.indexOf(s);

// ---------------------------------------------------------------- read sources
const read = async (dir, f) => {
  const file = path.join(dir, f);
  if (!fs.existsSync(file)) throw new Error(`${file} not found: run pipeline/fetch-sources.sh`);
  const m = new Map();
  for (const n of await readNodes(file)) m.set(n.name, n);
  return m;
};
const src = {
  uterus: await read(V12, 'VH_F_Uterus.glb'),
  ovL: await read(V12, 'VH_F_Ovary_L.glb'),
  ovR: await read(V12, 'VH_F_Ovary_R.glb'),
  tubeL: await read(V12, 'VH_F_Fallopian_Tube_L.glb'),
  tubeR: await read(V12, 'VH_F_Fallopian_Tube_R.glb'),
  vagina: await read(V12, 'VH_F_Vagina.glb'),
  lig: await read(V12, 'VH_F_Ligaments_Uterus_Ovaries.glb'),
  vess: await read(V12, 'VH_F_Blood_Vasculature_Uterus.glb'),
  pelvis: await read(V12, 'VH_F_Pelvis.glb'),
  bladder: await read(V12, 'VH_F_Urinary_Bladder.glb'),
  skin: await read(V12, 'VH_F_Skin.glb'),
  breastL: await read(V13, 'VH_F_mammary_gland_L.glb'),
  breastR: await read(V13, 'VH_F_mammary_gland_R.glb'),
};
const node = (set, name) => {
  const n = src[set].get(name);
  if (!n) throw new Error(`node ${name} not in ${set}`);
  return n;
};
const male = new Map();
for (const f of ['bones-0', 'skin-0', 'urinary-0', 'arteries-0', 'arteries-1', 'veins-0']) {
  for (const n of await readNodes(path.join(OUT, 'geo', f + '.glb'))) male.set(+n.name, n);
}
const maleGeo = (id) => {
  const it = items[id];
  if (male.has(id)) return male.get(id);
  if (it.mi !== undefined && male.has(it.mi)) {
    const s = male.get(it.mi), pos = new Float32Array(s.pos);
    for (let i = 0; i < pos.length; i += 3) pos[i] = -pos[i];
    return { pos, idx: s.idx };
  }
  throw new Error('no geometry for ' + id);
};
const concat = (arrs) => {
  const n = arrs.reduce((a, b) => a + b.length, 0), out = new Float32Array(n);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
const centroid = (pos, filter = () => true) => {
  const c = [0, 0, 0];
  let k = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const p = [pos[i], pos[i + 1], pos[i + 2]];
    if (!filter(p)) continue;
    c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; k++;
  }
  return k ? c.map((v) => v / k) : null;
};
const bbox = (pos) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
  return [mn, mx];
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- pelvic fit
const femPelvis = concat([...src.pelvis.values()].filter((n) => /compact|sacrum|coccyx/.test(n.name)).map((n) => n.pos));
const hipR = byName('Hip bone', 'r'), hipL = byName('Hip bone', 'l');
const malePelvis = concat([maleGeo(hipR).pos, maleGeo(hipL).pos, maleGeo(byName('Sacrum')).pos, maleGeo(byName('Coccyx')).pos]);
const [fmn, fmx] = bbox(femPelvis), [mmn, mmx] = bbox(malePelvis);
const A0 = [];
for (let k = 0; k < 3; k++) {
  const s = (mmx[k] - mmn[k]) / (fmx[k] - fmn[k]);
  const row = [0, 0, 0, mmn[k] - fmn[k] * s];
  row[k] = s;
  A0.push(...row);
}
const { A, rms } = icpAffine(femPelvis, malePelvis, A0, { iters: 25 });
console.log(`pelvis fit: ${(rms * 1000).toFixed(1)} mm rms`);
const bladderF = bbox(concat([node('bladder', 'VH_F_fundus_of_urinary_bladder_dome').pos, node('bladder', 'VH_F_fundus_of_urinary_bladder_base').pos]));
const bladderM = items[byName('Urinary bladder')].b;
const fc = apply(A, [0, 1, 2].map((k) => (bladderF[0][k] + bladderF[1][k]) / 2));
const shift = [0, (bladderM[1] + bladderM[4]) / 2 - fc[1], (bladderM[2] + bladderM[5]) / 2 - fc[2]];
console.log(`organ shift to meet the bladder: y ${(shift[1] * 1000).toFixed(0)} mm, z ${(shift[2] * 1000).toFixed(0)} mm`);
const organ = (p) => {
  const q = apply(A, p);
  const s = smooth(-0.045, 0.0, p[1]);
  return [q[0] + shift[0] * s, q[1] + shift[1] * s, q[2] + shift[2] * s];
};
const pelvic = (p) => apply(A, p);

// ---------------------------------------------------------------- breast fit
const XM = -0.009; // female midline (pubic symphysis, sternum)
class HField {
  constructor(x0, x1, y0, y1, cell) {
    Object.assign(this, { x0, y0, cell, nx: Math.ceil((x1 - x0) / cell) + 1, ny: Math.ceil((y1 - y0) / cell) + 1 });
    this.z = new Float32Array(this.nx * this.ny).fill(-Infinity);
  }
  add(pos) {
    for (let i = 0; i < pos.length; i += 3) {
      const ix = Math.round((pos[i] - this.x0) / this.cell), iy = Math.round((pos[i + 1] - this.y0) / this.cell);
      if (ix < 0 || iy < 0 || ix >= this.nx || iy >= this.ny) continue;
      const k = iy * this.nx + ix;
      if (pos[i + 2] > this.z[k]) this.z[k] = pos[i + 2];
    }
    return this;
  }
  /** rasterises triangles (front-most z wins), so sparse meshes give a continuous surface */
  addTris(pos, idx) {
    const pts = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const size = Math.max(Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1]), Math.hypot(pos[a] - pos[c], pos[a + 1] - pos[c + 1]), Math.hypot(pos[b] - pos[c], pos[b + 1] - pos[c + 1]));
      const n = Math.max(1, Math.ceil(size / (this.cell * 0.5)));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        pts.push(pos[a] * w + pos[b] * u + pos[c] * v, pos[a + 1] * w + pos[b + 1] * u + pos[c + 1] * v, pos[a + 2] * w + pos[b + 2] * u + pos[c + 2] * v);
      }
      if (pts.length > 3e6) { this.add(pts); pts.length = 0; }
    }
    return this.add(pts);
  }
  fill() {
    for (let pass = 0; pass < 400; pass++) {
      let left = 0;
      const z = this.z.slice();
      for (let iy = 0; iy < this.ny; iy++) for (let ix = 0; ix < this.nx; ix++) {
        const k = iy * this.nx + ix;
        if (z[k] > -Infinity) continue;
        let s = 0, c = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const jx = ix + dx, jy = iy + dy;
          if (jx < 0 || jy < 0 || jx >= this.nx || jy >= this.ny) continue;
          const v = z[jy * this.nx + jx];
          if (v > -Infinity) { s += v; c++; }
        }
        if (c) this.z[k] = s / c;
        else left++;
      }
      if (!left) break;
    }
    return this;
  }
  at(x, y) {
    const fx = (x - this.x0) / this.cell, fy = (y - this.y0) / this.cell;
    const ix = Math.max(0, Math.min(this.nx - 2, Math.floor(fx))), iy = Math.max(0, Math.min(this.ny - 2, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - ix)), ty = Math.min(1, Math.max(0, fy - iy));
    const z = this.z, n = this.nx;
    const a = z[iy * n + ix], b = z[iy * n + ix + 1], c = z[(iy + 1) * n + ix], d = z[(iy + 1) * n + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
}
// female skin over the chest (front-most surface)
const skinF = node('skin', 'VH_F_skin');
const HF = new HField(-0.2, 0.2, 0.28, 0.6, 0.003).addTris(skinF.pos, skinF.idx).fill();
// this body's chest skin, right half (mirrored for the left), without the arm
const trunkSkin = [];
for (const [id, n] of male) {
  const it = items[id];
  if (it.g !== LG.get('skin') || /arm|axill|brachi|deltoid|scapul|cubit|hand|forearm|shoulder/i.test(it.n)) continue;
  const b = it.b;
  if (b[3] > 0.01 || b[4] < 1.1 || b[1] > 1.45) continue;
  trunkSkin.push(n);
}
const HM = new HField(-0.2, 0.01, 1.1, 1.45, 0.003);
for (const n of trunkSkin) HM.addTris(n.pos, n.idx);
HM.fill();
const maleChest = (x, y) => HM.at(-Math.abs(x), y);

const BREAST = { u0: 0.015, u1: 0.152, y0: 0.335, y1: 0.53, dy: 1.25 - 0.391, k: 0.22, taper: 0.022 };
function fitBaseline(sign) {
  // least-squares quadratic z(u, y) on a ring just inside the breast rectangle
  const rows = [];
  for (let y = BREAST.y0; y <= BREAST.y1; y += 0.004) for (let u = BREAST.u0; u <= BREAST.u1; u += 0.004) {
    const edge = Math.min(u - BREAST.u0, BREAST.u1 - u, y - BREAST.y0, BREAST.y1 - y);
    if (edge > 0.01) continue;
    rows.push([[1, u, y, u * u, y * y, u * y], HF.at(XM + sign * u, y)]);
  }
  const M = Array.from({ length: 6 }, () => new Array(6).fill(0)), b = new Array(6).fill(0);
  for (const [x, z] of rows) for (let i = 0; i < 6; i++) { b[i] += x[i] * z; for (let j = 0; j < 6; j++) M[i][j] += x[i] * x[j]; }
  for (let i = 0; i < 6; i++) M[i][i] += 1e-9;
  const a = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 6; c++) {
    let p = c;
    for (let r = c + 1; r < 6; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < 6; r++) if (r !== c) { const f = a[r][c] / a[c][c]; for (let k = c; k <= 6; k++) a[r][k] -= f * a[c][k]; }
  }
  const co = a.map((r, i) => r[6] / r[i]);
  return (u, y) => co[0] + co[1] * u + co[2] * y + co[3] * u * u + co[4] * y * y + co[5] * u * y;
}
const baseL = fitBaseline(1), baseR = fitBaseline(-1);
const breastMap = (sign) => {
  const base = sign > 0 ? baseL : baseR;
  return (p) => {
    const u = (p[0] - XM) * sign;
    const x = p[0] - XM, y = p[1] + BREAST.dy;
    const edge = Math.min(u - BREAST.u0, BREAST.u1 - u, p[1] - BREAST.y0, BREAST.y1 - p[1]);
    const w = smooth(0, BREAST.taper, edge);
    const e = p[2] - base(u, p[1]);
    return [x, y, maleChest(x, y) + 0.002 + (e >= 0 ? e * w : e * BREAST.k)];
  };
};

// ---------------------------------------------------------------- geometry helpers
function transform(n, fn) {
  const pos = new Float32Array(n.pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const q = fn([n.pos[i], n.pos[i + 1], n.pos[i + 2]]);
    pos[i] = q[0]; pos[i + 1] = q[1]; pos[i + 2] = q[2];
  }
  return { pos, idx: n.idx };
}
function merge(...geos) {
  const pos = concat(geos.map((g) => g.pos));
  const idx = new Uint32Array(geos.reduce((a, g) => a + g.idx.length, 0));
  let o = 0, base = 0;
  for (const g of geos) { for (let i = 0; i < g.idx.length; i++) idx[o++] = g.idx[i] + base; base += g.pos.length / 3; }
  return { pos, idx };
}
/** keeps triangles whose three vertices pass `keep(p)`; compacts vertices */
function crop(g, keepTri) {
  const P = g.pos, I = g.idx, map = new Int32Array(P.length / 3).fill(-1), pos = [], idx = [];
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]].map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    if (!keepTri(v[0], v[1], v[2])) continue;
    for (let k = 0; k < 3; k++) {
      const i = I[t + k];
      if (map[i] < 0) { map[i] = pos.length / 3; pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); }
      idx.push(map[i]);
    }
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}
const triNormal = (a, b, c) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  return n.map((x) => x / l);
};
/** tube along a Catmull-Rom curve through pts */
function tube(pts, r0, r1 = r0, seg = 12) {
  const curve = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const steps = Math.max(4, Math.ceil(Math.hypot(...[0, 1, 2].map((k) => P[i + 1][k] - P[i][k])) / 0.003));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      curve.push([0, 1, 2].map((k) => 0.5 * (2 * P[i][k] + (-P[i - 1][k] + P[i + 1][k]) * t + (2 * P[i - 1][k] - 5 * P[i][k] + 4 * P[i + 1][k] - P[i + 2][k]) * t2 + (-P[i - 1][k] + 3 * P[i][k] - 3 * P[i + 1][k] + P[i + 2][k]) * t3)));
    }
  }
  curve.push(pts[pts.length - 1]);
  const pos = [], idx = [];
  let nPrev = null;
  for (let i = 0; i < curve.length; i++) {
    const a = curve[Math.max(0, i - 1)], b = curve[Math.min(curve.length - 1, i + 1)];
    let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const tl = Math.hypot(...t); t = t.map((x) => x / tl);
    let n = nPrev || (Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
    const d = n[0] * t[0] + n[1] * t[1] + n[2] * t[2];
    n = [n[0] - d * t[0], n[1] - d * t[1], n[2] - d * t[2]];
    const nl = Math.hypot(...n); n = n.map((x) => x / nl);
    nPrev = n;
    const bn = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
    const r = r0 + (r1 - r0) * (i / (curve.length - 1));
    for (let s = 0; s < seg; s++) {
      const ang = (s / seg) * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang);
      pos.push(...[0, 1, 2].map((k) => curve[i][k] + r * (c * n[k] + sn * bn[k])));
    }
  }
  for (let i = 0; i < curve.length - 1; i++) for (let s = 0; s < seg; s++) {
    const a = i * seg + s, b = i * seg + ((s + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, c, b, b, c, d);
  }
  for (const [ring, flip] of [[0, true], [curve.length - 1, false]]) {
    const ci = pos.length / 3;
    pos.push(...curve[ring]);
    for (let s = 0; s < seg; s++) {
      const a = ring * seg + s, b = ring * seg + ((s + 1) % seg);
      if (flip) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

// ---------------------------------------------------------------- items
const START = items.length;
const descTexts = [];
const descOf = (key) => {
  if (!TEXT[key]) throw new Error('no text for ' + key);
  let i = descTexts.findIndex((d) => d.key === key);
  if (i < 0) { i = descTexts.length; descTexts.push({ key, text: TEXT[key] }); }
  return meta.descBuckets * meta.descPerBucket + i;
};
const geoms = new Map(); // id -> { pos, idx, cap }
function group(n, p, la, syn, text = n) {
  const o = { n, p, y: 'g', s: SYS('visceral'), la, d: descOf(text), sx: 'f' };
  if (syn) o.syn = syn;
  items.push(o);
  return items.length - 1;
}
function struct(n, p, { sd, la, syn, text = n, lg = 'genital', sys = 'visceral', mat, L, geo, cap }) {
  const o = { n, p, y: 's', s: SYS(sys), la, d: descOf(text), g: LG.get(lg), m: matIdx(mat), L, sx: 'f' };
  if (sd) o.sd = sd;
  if (syn) o.syn = syn;
  items.push(o);
  const id = items.length - 1;
  geoms.set(id, { ...geo, cap });
  return id;
}
const O = (set, name) => transform(node(set, name), organ);
const sideOf = (s) => (s === 'L' ? 'l' : 'r');

const FEM = group('Female genital system', byName('Genital systems'), 'Systema genitale femininum', ['Female reproductive system']);
const INT = group('Female internal genitalia', FEM, 'Organa genitalia feminina interna', ['Female internal genital organs']);
for (const S of ['R', 'L']) {
  struct('Ovary', INT, { sd: sideOf(S), la: 'Ovarium', mat: 'Female-ovary', L: 5, geo: O(S === 'L' ? 'ovL' : 'ovR', S === 'L' ? 'VH_F_left_ovary' : 'VH_F_right_ovary') });
}
const TUBE = group('Uterine tube', INT, 'Tuba uterina', ['Fallopian tube', 'Salpinx', 'Oviduct']);
for (const S of ['R', 'L']) {
  const set = S === 'L' ? 'tubeL' : 'tubeR', sd = sideOf(S);
  struct('Infundibulum of uterine tube', TUBE, { sd, la: 'Infundibulum tubae uterinae', mat: 'Female-tube', L: 5, geo: O(set, `VH_F_uterine_tube_infundibulum_${S}`) });
  struct('Fimbriae of uterine tube', TUBE, { sd, la: 'Fimbriae tubae uterinae', mat: 'Female-tube-2', L: 5, geo: O(set, `VH_F_fibria_of_uterine_tube_${S}`) });
  struct('Ampulla of uterine tube', TUBE, { sd, la: 'Ampulla tubae uterinae', mat: 'Female-tube', L: 5, geo: O(set, `VH_F_ampulla_of_uterine_tube_${S}`), cap: 5000 });
  struct('Isthmus of uterine tube', TUBE, { sd, la: 'Isthmus tubae uterinae', mat: 'Female-tube-2', L: 5, geo: O(set, `VH_F_isthmus_of_fallopian_tube_${S}`) });
}
// the source calls this the abdominal ostium, but it lies in the uterine horns: it is the intramural part
struct('Uterine part of uterine tube', TUBE, { la: 'Pars uterina tubae uterinae', syn: ['Intramural part of uterine tube'], mat: 'Female-tube-2', L: 5, geo: O('uterus', 'VH_F_abdominal_ostium_of_uterine_tube') });
const UT = group('Uterus', INT, 'Uterus', ['Womb', 'Metra']);
struct('Fundus of uterus', UT, { la: 'Fundus uteri', mat: 'Female-uterus', L: 5, geo: O('uterus', 'VH_F_fundus_of_uterus') });
struct('Body of uterus', UT, { la: 'Corpus uteri', mat: 'Female-uterus-2', L: 5, geo: O('uterus', 'VH_F_body_of_uterus') });
struct('Uterine horns', UT, { la: 'Cornua uteri', syn: ['Cornua of uterus'], mat: 'Female-uterus', L: 5, geo: O('uterus', 'VH_F_cornua') });
struct('Isthmus of uterus', UT, { la: 'Isthmus uteri', syn: ['Lower uterine segment'], mat: 'Female-uterus', L: 5, geo: O('uterus', 'VH_F_lower_uterine_segment') });
struct('Cervix of uterus', UT, { la: 'Cervix uteri', syn: ['Cervix', 'Neck of uterus'], mat: 'Female-uterus-3', L: 5, geo: O('uterus', 'VH_F_cervix') });
struct('Internal os of uterus', UT, { la: 'Ostium anatomicum uteri internum', syn: ['Internal os'], mat: 'Female-tube-2', L: 5, geo: O('uterus', 'VH_F_internal_cervical_os') });
struct('External os of uterus', UT, { la: 'Ostium uteri', syn: ['External os'], mat: 'Female-tube-2', L: 5, geo: O('uterus', 'VH_F_external_cervical_os') });
struct('Vagina', INT, { la: 'Vagina', mat: 'Female-vagina', L: 5, geo: O('vagina', 'VH_F_vagina') });
struct('Vaginal fornix', INT, { la: 'Fornix vaginae', syn: ['Cervicovaginal junction'], mat: 'Female-vagina-2', L: 5, geo: O('vagina', 'VH_F_cervicovaginal_junction') });
const LIGS = group('Ligaments of uterus and ovary', INT, 'Ligamenta uteri et ovarii', null);
struct('Broad ligament of uterus', LIGS, { la: 'Ligamentum latum uteri', mat: 'Peritoneum-female', L: 6, geo: O('lig', 'VH_F_broad_ligament'), cap: 7000 });
for (const S of ['R', 'L']) {
  const sd = sideOf(S), other = S === 'L' ? 'right' : 'left';
  struct('Mesosalpinx', LIGS, { sd, la: 'Mesosalpinx', mat: 'Peritoneum-female', L: 6, geo: O('lig', `VH_F_mesosalpinx_${S}`) });
  struct('Mesovarium', LIGS, { sd, la: 'Mesovarium', mat: 'Peritoneum-female', L: 6, geo: O('lig', `VH_F_mesovarium_${S}`) });
  // the source swaps left and right for the round ligaments
  struct('Round ligament of uterus', LIGS, { sd, la: 'Ligamentum teres uteri', mat: 'Ligament', L: 5, geo: O('lig', `VH_F_${other}_round_ligament_of_uterus`) });
  struct('Ligament of ovary', LIGS, { sd, la: 'Ligamentum ovarii proprium', syn: ['Ovarian ligament', 'Utero-ovarian ligament'], mat: 'Ligament', L: 5, geo: O('lig', `VH_F_ovarian_ligament_${S}`) });
  struct('Suspensory ligament of ovary', LIGS, { sd, la: 'Ligamentum suspensorium ovarii', syn: ['Infundibulopelvic ligament'], mat: 'Ligament', L: 5, geo: O('lig', `VH_F_suspensory_ligament_of_ovary_${S}`) });
  const side = S === 'L' ? 'left' : 'right';
  struct('Cardinal ligament', LIGS, { sd, la: 'Ligamentum cardinale', syn: ['Transverse cervical ligament', "Mackenrodt's ligament"], mat: 'Ligament', L: 5, geo: O('lig', `VH_F_${side}_cardinal_ligament_of_uterus`) });
  struct('Uterosacral ligament', LIGS, { sd, la: 'Ligamentum uterosacrale', syn: ['Rectouterine ligament'], mat: 'Ligament', L: 5, geo: O('lig', `VH_F_${side}_uterosacral_ligament`) });
}

// vessels
for (const S of ['R', 'L']) {
  const sd = sideOf(S), side = S === 'L' ? 'left' : 'right';
  struct('Uterine artery', byName('Anterior division of internal iliac artery', sd), { sd, la: 'Arteria uterina', lg: 'arteries', sys: 'cardio', mat: 'Artery', L: 4, geo: O('vess', `VH_F_${side}_uterine_artery`) });
  struct('Uterine vein', byName('Internal iliac vein', sd), { sd, la: 'Vena uterina', syn: ['Uterine venous plexus'], lg: 'veins', sys: 'cardio', mat: 'Vein', L: 4, geo: O('vess', `VH_F_${side}_uterine_vein`) });
}
// ovarian vessels: this body's testicular vessels above the ovary's suspensory ligament, then a tube down it
const ovarian = [];
for (const S of ['R', 'L']) {
  const sd = sideOf(S);
  const lig = O('lig', `VH_F_suspensory_ligament_of_ovary_${S}`);
  const [lmn, lmx] = bbox(lig.pos);
  const top = centroid(lig.pos, (p) => p[1] > lmx[1] - 0.006);
  const bottom = centroid(lig.pos, (p) => p[1] < lmn[1] + 0.006);
  const ovary = O(S === 'L' ? 'ovL' : 'ovR', S === 'L' ? 'VH_F_left_ovary' : 'VH_F_right_ovary');
  const [omn, omx] = bbox(ovary.pos);
  const hilum = [(omn[0] + omx[0]) / 2, omx[1] - 0.004, (omn[2] + omx[2]) / 2];
  for (const [kind, maleName, mat, lg, parent] of [
    ['artery', S === 'L' ? 'Left testicular artery' : 'Right testicular artery', 'Artery', 'arteries', 'Abdominal aorta'],
    ['vein', S === 'L' ? 'Left testicular vein' : 'Right testicular vein', 'Vein', 'veins', S === 'L' ? 'Left renal vein' : 'Inferior vena cava (abdominal part)'],
  ]) {
    const mid = byName(maleName);
    const mg = maleGeo(mid);
    const cut = top[1] + 0.03;
    const upper = crop(mg, (a, b, c) => a[1] > cut && b[1] > cut && c[1] > cut);
    const end = centroid(upper.pos, (p) => p[1] < cut + 0.004);
    // vessel radius from the spread of the vertices at the cut
    let ss = 0, sk = 0;
    for (let i = 0; i < upper.pos.length; i += 3) if (upper.pos[i + 1] < cut + 0.004) { ss += (upper.pos[i] - end[0]) ** 2 + (upper.pos[i + 2] - end[2]) ** 2; sk++; }
    const r = Math.max(0.0012, Math.sqrt(ss / sk));
    const off = kind === 'vein' ? [0, 0, -0.003] : [0, 0, 0];
    const add = (p) => p.map((v, k) => v + off[k]);
    const path = [[end[0], cut + 0.004, end[2]], add([end[0] * 0.5 + top[0] * 0.5, (cut + top[1]) / 2, end[2] * 0.5 + top[2] * 0.5]), add(top), add(bottom), add(hilum)];
    const geo = merge(upper, tube(path, r, r * 0.8));
    const id = struct(kind === 'artery' ? 'Ovarian artery' : 'Ovarian vein', byName(parent), { sd, la: kind === 'artery' ? 'Arteria ovarica' : 'Vena ovarica', lg, sys: 'cardio', mat, L: 4, geo });
    ovarian.push(id);
  }
}

// female urethra (simplified): from the bladder neck to the vestibule, in front of the vagina
{
  const bl = maleGeo(byName('Urinary bladder'));
  const [bmn] = bbox(bl.pos);
  const neck = centroid(bl.pos, (p) => p[1] < bmn[1] + 0.003);
  const vag = O('vagina', 'VH_F_vagina');
  const [vmn] = bbox(vag.pos);
  const intro = centroid(vag.pos, (p) => p[1] < vmn[1] + 0.004);
  const [, vmx2] = bbox(crop(vag, (a) => a[1] < vmn[1] + 0.006).pos);
  const orifice = [intro[0], intro[1] + 0.004, vmx2[2] + 0.006];
  const mid = [(neck[0] + orifice[0]) / 2, (neck[1] + orifice[1]) / 2, Math.max(neck[2], orifice[2]) + 0.004];
  const len = Math.hypot(...[0, 1, 2].map((k) => neck[k] - orifice[k]));
  console.log(`female urethra ${(len * 100).toFixed(1)} cm`);
  struct('Urethra', byName('Urinary system'), { la: 'Urethra feminina', syn: ['Female urethra'], text: 'Female urethra', lg: 'urinary', mat: 'Ductus', L: 2, geo: tube([[neck[0], neck[1] + 0.004, neck[2]], mid, orifice], 0.0032, 0.0026) });
}

// breasts
const BR = group('Breast', FEM, 'Mamma', ['Mammary gland']);
for (const S of ['R', 'L']) {
  const sd = sideOf(S), set = S === 'L' ? 'breastL' : 'breastR', fn = breastMap(S === 'L' ? 1 : -1);
  const B = (name) => transform(node(set, `VH_F_${name}_${S}`), fn);
  struct('Adipose tissue of breast', BR, { sd, la: 'Corpus adiposum mammae', mat: 'Fat-breast', L: 7, geo: B('fat'), cap: 9000 });
  struct('Suspensory ligaments of breast', BR, { sd, la: 'Ligamenta suspensoria mammaria', syn: ["Cooper's ligaments"], mat: 'Ligament', L: 6, geo: B('suspensory_ligaments'), cap: 7000 });
  struct('Lobes of mammary gland', BR, { sd, la: 'Lobi glandulae mammariae', mat: 'Gland-breast', L: 5, geo: B('mammary_lobes'), cap: 9000 });
  struct('Lactiferous ducts', BR, { sd, la: 'Ductus lactiferi', mat: 'Ductus', L: 5, geo: B('main_lactiferous_ducts'), cap: 6000 });
  struct('Lactiferous sinuses', BR, { sd, la: 'Sinus lactiferi', mat: 'Ductus', L: 5, geo: B('main_lactiferous_sinuses'), cap: 1500 });
  struct('Nipple', BR, { sd, la: 'Papilla mammaria', syn: ['Mammary papilla'], mat: 'Areola', L: 7, geo: B('nipple'), cap: 1500 });
  struct('Areola', BR, { sd, la: 'Areola mammae', mat: 'Areola-2', L: 7, geo: B('areola'), cap: 2500 });
  struct('Areolar tubercles', BR, { sd, la: 'Tubercula areolae', syn: ['Montgomery tubercles'], mat: 'Areola', L: 7, geo: B('areolar_tubercles'), cap: 1200 });
}

// skin: the female breast surface and vulva replace this body's mammary and urogenital regions
const maleOnly = [];
const skinMat = matIdx('Skin-7'); // the outer surface material of this body's skin
for (const S of ['R', 'L']) {
  const sd = sideOf(S), sign = S === 'L' ? 1 : -1;
  const male = byName('Mammary region', sd);
  maleOnly.push(male);
  const inside = (p) => { const u = (p[0] - XM) * sign; return u >= BREAST.u0 && u <= BREAST.u1 && p[1] >= BREAST.y0 && p[1] <= BREAST.y1 && p[2] > HF.at(p[0], p[1]) - 0.012; };
  const patch = crop(skinF, (a, b, c) => inside(a) && inside(b) && inside(c) && triNormal(a, b, c)[2] > 0.15);
  const id = struct('Mammary region', items[male].p, { sd, la: items[male].la, lg: 'skin', sys: 'regions', mat: meta.materials[skinMat], L: items[male].L, geo: transform(patch, breastMap(sign)), cap: 6000 });
  if (items[male].syn) items[id].syn = items[male].syn;
}
{
  const ur = byName('Urogenital region', 'r'), ul = byName('Urogenital region', 'l');
  maleOnly.push(ur, ul);
  const VULVA = { u: 0.055, y0: -0.16, y1: 0.012, z0: -0.15, z1: 0.08 };
  const inside = (p) => Math.abs(p[0] - XM) <= VULVA.u && p[1] >= VULVA.y0 && p[1] <= VULVA.y1 && p[2] >= VULVA.z0 && p[2] <= VULVA.z1;
  const patch = crop(skinF, (a, b, c) => inside(a) && inside(b) && inside(c));
  struct('Urogenital region', items[ur].p, { la: items[ur].la, lg: 'skin', sys: 'regions', mat: meta.materials[skinMat], L: items[ur].L, geo: transform(patch, pelvic), cap: 6000 });
}

// ---------------------------------------------------------------- male-only structures
maleOnly.push(byName('Male genital system'), byName('Urethra'));
for (const n of ['Right testicular artery', 'Left testicular artery', 'Right testicular vein', 'Left testicular vein', 'Deep dorsal vein of penis', 'Superficial dorsal veins of penis']) maleOnly.push(byName(n));
for (const sd of ['l', 'r']) for (const n of ['Dorsal artery of penis', 'Deep artery of penis']) maleOnly.push(byName(n, sd));
for (const id of maleOnly) items[id].sx = 'm';

// ---------------------------------------------------------------- geometry chunk
const chunkIndex = meta.chunks.length;
const doc = new Document();
doc.getLogger().debug = () => {}; doc.getLogger().info = () => {};
const buffer = doc.createBuffer();
const scene = doc.createScene();
const mats = new Map();
let totalTris = 0;
for (const [id, g] of geoms) {
  const it = items[id];
  const [mn, mx] = bbox(g.pos);
  const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  const tris = g.idx.length / 3;
  const target = Math.min(tris, g.cap || Math.max(600, Math.min(4000, 60000 * diag)));
  const mat = meta.materials[it.m];
  if (!mats.has(mat)) mats.set(mat, doc.createMaterial(mat));
  const prim = doc.createPrimitive()
    .setMaterial(mats.get(mat))
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(g.pos).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(g.idx).setBuffer(buffer));
  weldPrimitive(prim, {});
  if (target < tris * 0.98) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: target / tris, error: 0.01 });
  // smooth normals from the final triangles
  const P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray();
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
    const u = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const v = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) N[i * 3 + k] += n[k];
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(buffer));
  const n = I.length / 3;
  totalTris += n;
  const mesh = doc.createMesh(String(id)).addPrimitive(prim);
  scene.addChild(doc.createNode(String(id)).setMesh(mesh));
  const [bmn, bmx] = bbox(P);
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  Object.assign(it, { c: chunkIndex, b: [...bmn.map(r4), ...bmx.map(r4)], t: n });
}
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 14, quantizeNormal: 8 }));
const bin = await io.writeBinary(doc);
fs.writeFileSync(path.join(OUT, 'geo', CHUNK), bin);
meta.chunks.push({ f: CHUNK, g: LG.get('genital'), bytes: bin.byteLength });
console.log(`female chunk: ${geoms.size} meshes, ${Math.round(totalTris / 1000)}k triangles, ${(bin.byteLength / 1e6).toFixed(2)} MB`);

// ---------------------------------------------------------------- descriptions + meta
const descBucket = meta.descBuckets;
for (let b = 0; b * meta.descPerBucket < descTexts.length; b++) {
  const obj = {};
  descTexts.slice(b * meta.descPerBucket, (b + 1) * meta.descPerBucket).forEach((d, i) => (obj[(descBucket + b) * meta.descPerBucket + i] = d.text));
  fs.writeFileSync(path.join(OUT, 'desc', `${descBucket + b}.json`), JSON.stringify(obj));
  meta.descBuckets++;
}
meta.female = {
  start: START,
  descBucket,
  source: 'HuBMAP Human Reference Atlas 3D Reference Object Library, Visible Human Female (CC BY 4.0)',
  fit: { pelvisRmsMm: Math.round(rms * 10000) / 10, shiftMm: shift.map((x) => Math.round(x * 1000)) },
};
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));
console.log(`added ${items.length - START} items (${geoms.size} structures), ${maleOnly.length} male-only roots, ${descTexts.length} descriptions`);
