// Builds the web-ready anatomy dataset from the raw Z-Anatomy glTF conversions.
//
//   node pipeline/build-data.mjs            (expects sources from pipeline/fetch-sources.sh)
//
// Output (public/data):
//   meta.json            every structure, group, landmark and muscle attachment
//   geo/<chunk>.glb      meshopt-compressed geometry, nodes named by item id
//   desc/<n>.json        reference articles (CC-BY-SA, Wikipedia via Z-Anatomy)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weldPrimitive, simplifyPrimitive, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.ANATOMY_SRC || path.join(ROOT, '.sources');
const RAW = process.env.ANATOMY_RAW || path.join(SRC, 'raw');
const ZAN = process.env.ANATOMY_ZAN || path.join(SRC, 'zanat');
const OUT = path.join(ROOT, 'public', 'data');
const STATS_ONLY = process.argv.includes('--stats');

const SYSTEM_FILES = ['regions', 'skeletal', 'joints', 'muscular', 'cardio', 'nervous', 'lymph', 'visceral'];

// ---------------------------------------------------------------- source tables
const layerOf = new Map(); // raw node name -> { cat, depth }
{
  const dir = path.join(ZAN, 'Z-Anatomy PC/Assets/Models/Layers');
  for (const cat of fs.readdirSync(dir)) {
    for (const f of fs.readdirSync(path.join(dir, cat))) {
      const m = /-(\d+)\.txt$/.exec(f);
      if (!m) continue;
      const depth = +m[1];
      const lines = fs.readFileSync(path.join(dir, cat, f), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      for (const line of lines.slice(1)) if (!layerOf.has(line)) layerOf.set(line, { cat, depth });
    }
  }
}

const latinOf = new Map(); // english lower -> { la, syn }
{
  const txt = fs.readFileSync(path.join(ZAN, 'Z-Anatomy PC/Assets/Resources/Translations0.txt'), 'utf8');
  for (const line of txt.split(/\r?\n/).slice(1)) {
    const c = line.split(';');
    if (c.length < 3 || !c[0]) continue;
    const la = (c[2] || '').trim();
    const syn = (c[1] || '').split('%').map((s) => s.trim()).filter(Boolean);
    latinOf.set(c[0].trim().toLowerCase(), { la, syn });
  }
}

const DESC_DIR = path.join(ZAN, 'Resources/Descriptions/OriginalDescriptions');
const descFile = new Map(); // lower name -> filename
for (const f of fs.readdirSync(DESC_DIR)) {
  if (!f.endsWith('.txt') || /^(obj_list|text_list|Translations)\.txt$/.test(f)) continue;
  descFile.set(f.slice(0, -4).toLowerCase(), f);
}
function findDesc(name) {
  const n = name.toLowerCase();
  const cands = [n, n.replace(/^\((.*)\)$/, '$1'), `(${n})`, n.replace(/ muscle$/, ''), n + ' muscle', n.replace(/ \([^)]*\)$/, '')];
  for (const c of cands) if (descFile.has(c)) return c;
  return null;
}

const DROP_SECTIONS = /^(history|references|other animals|external links|society and culture|etymology|notes|additional images|see also|further reading|gallery|in other animals|evolution|research|bibliography|footnotes|citations|sources|in popular culture|culture|terminology|name|nomenclature|animals|veterinary|images)$/i;
const BAD_ARTICLE = /^== (Tactics|Deployment and combat|Weaknesses) ==/m;
function cleanDesc(raw) {
  if (BAD_ARTICLE.test(raw)) return null;
  const lines = raw.replace(/\r/g, '').split('\n');
  const out = [];
  let skip = false;
  let seenTitle = false;
  for (let line of lines) {
    line = line.replace(/\s+$/, '');
    if (!seenTitle) {
      if (!line.trim()) continue;
      seenTitle = true; // first non-empty line is the upper-case title
      if (line === line.toUpperCase()) continue;
    }
    const h = /^(={2,4})\s*(.*?)\s*\1$/.exec(line);
    if (h) {
      if (h[1].length === 2) skip = DROP_SECTIONS.test(h[2]);
      if (skip) continue;
      out.push((h[1].length === 2 ? '## ' : '### ') + h[2]);
      continue;
    }
    if (skip) continue;
    if (!line.trim()) continue;
    out.push(line.trim());
  }
  let text = out.join('\n').replace(/\n(#{2,3} [^\n]*)(?=\n#{2,3} |\n?$)/g, ''); // drop empty headings
  if (text.length > 9000) {
    text = text.slice(0, 9000);
    text = text.slice(0, text.lastIndexOf('\n')) + '\n…';
  }
  return text.trim() || null;
}

// ---------------------------------------------------------------- classification
// Layer groups the app can toggle. Order here is the order in the UI.
const LAYER_GROUPS = [
  ['skin', 'Skin & surface regions', 'Integumentary'],
  ['fasciae', 'Fasciae', 'Muscular'],
  ['muscles', 'Muscles & tendons', 'Muscular'],
  ['bursae', 'Bursae & tendon sheaths', 'Muscular'],
  ['bones', 'Bones, cartilages & teeth', 'Skeletal'],
  ['attach', 'Muscle attachment maps', 'Skeletal'],
  ['joints', 'Joints & ligaments', 'Articular'],
  ['heart', 'Heart', 'Cardiovascular'],
  ['arteries', 'Arteries', 'Cardiovascular'],
  ['veins', 'Veins', 'Cardiovascular'],
  ['lymph', 'Lymphatic & immune', 'Lymphatic'],
  ['cns', 'Brain & spinal cord', 'Nervous'],
  ['nerves', 'Peripheral nerves', 'Nervous'],
  ['senses', 'Sense organs', 'Nervous'],
  ['respiratory', 'Respiratory', 'Respiratory'],
  ['digestive', 'Digestive', 'Digestive'],
  ['urinary', 'Urinary', 'Urinary'],
  ['genital', 'Reproductive', 'Reproductive'],
  ['endocrine', 'Endocrine glands', 'Endocrine'],
  ['cavities', 'Body cavities & membranes', 'Visceral'],
];
const LG_INDEX = new Map(LAYER_GROUPS.map((g, i) => [g[0], i]));

function layerGroupFor(sys, pathNames, isAttach) {
  const has = (re) => pathNames.some((p) => re.test(p));
  switch (sys) {
    case 'regions': return 'skin';
    case 'skeletal': return isAttach ? 'attach' : 'bones';
    case 'joints': return 'joints';
    case 'muscular':
      if (has(/^Fasciae$/)) return 'fasciae';
      return 'muscles';
    case 'cardio':
      if (has(/^Heart$/)) return 'heart';
      if (has(/^Venous system$/)) return 'veins';
      return 'arteries';
    case 'nervous':
      if (has(/^Sense organs$/)) return 'senses';
      if (has(/^Central nervous system$/)) return 'cns';
      return 'nerves';
    case 'lymph': return 'lymph';
    case 'visceral':
      if (has(/^Respiratory system$/)) return 'respiratory';
      if (has(/^Digestive system$/)) return 'digestive';
      if (has(/^Urinary system$/)) return 'urinary';
      if (has(/^Genital systems$/)) return 'genital';
      if (has(/^Endocrine glands$/)) return 'endocrine';
      return 'cavities';
  }
  return 'cavities';
}

const SKIP_ROOT = /^(Cross Section|Take a picture|Medulla-path$|Lymph node$)/;
const NAME_RE = /^(.*?)\.(g|j|t|s|i|r|l|[oe]\d*[rl])$/;

function matKey(name) {
  return (name || 'Default').replace(/\.\d{3}$/, '').trim();
}

// ---------------------------------------------------------------- math helpers
function applyMat4(out, o, m, x, y, z) {
  out[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}
function normalMatrix(m) {
  // inverse transpose of upper 3x3
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C || 1;
  return [A / det, B / det, C / det, (c * h - b * i) / det, (a * i - c * g) / det, (b * g - a * h) / det, (b * f - c * e) / det, (c * d - a * f) / det, (a * e - b * d) / det];
}
function det3(m) {
  return m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
}
const r4 = (v) => Math.round(v * 10000) / 10000;

// ---------------------------------------------------------------- read sources
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const items = []; // tree order
const landmarks = [];
const geo = new Map(); // item id -> [{ mat, pos:Float32Array, nor:Float32Array, idx:Uint32Array }]

function addItem(it) {
  it.id = items.length;
  items.push(it);
  return it;
}

function extractGeometry(node) {
  const mesh = node.getMesh();
  const wm = node.getWorldMatrix();
  const nm = normalMatrix(wm);
  const flip = det3(wm) < 0;
  const prims = [];
  for (const p of mesh.listPrimitives()) {
    if (p.getMode() !== 4) continue;
    const posA = p.getAttribute('POSITION');
    const norA = p.getAttribute('NORMAL');
    if (!posA) continue;
    const n = posA.getCount();
    const src = posA.getArray();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) applyMat4(pos, i * 3, wm, src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
    let nor = null;
    if (norA) {
      const ns = norA.getArray();
      nor = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const x = ns[i * 3], y = ns[i * 3 + 1], z = ns[i * 3 + 2];
        let a = nm[0] * x + nm[1] * y + nm[2] * z, b = nm[3] * x + nm[4] * y + nm[5] * z, c = nm[6] * x + nm[7] * y + nm[8] * z;
        const l = Math.hypot(a, b, c) || 1;
        nor[i * 3] = a / l; nor[i * 3 + 1] = b / l; nor[i * 3 + 2] = c / l;
      }
    }
    const idxA = p.getIndices();
    let idx;
    if (idxA) idx = Uint32Array.from(idxA.getArray());
    else { idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; }
    if (flip) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    prims.push({ mat: matKey(p.getMaterial()?.getName()), pos, nor, idx });
  }
  return prims;
}

function leaderAnchor(node, labelPos) {
  // The label's leader line mesh: the vertex farthest from the label is where it touches the structure.
  for (const c of node.listChildren()) {
    const mesh = c.getMesh();
    if (!mesh || !/\.(j|i)$/.test(c.getName())) continue;
    const wm = c.getWorldMatrix();
    let best = null, bestD = -1;
    const tmp = [0, 0, 0];
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute('POSITION').getArray();
      for (let i = 0; i < a.length; i += 3) {
        applyMat4(tmp, 0, wm, a[i], a[i + 1], a[i + 2]);
        const d = (tmp[0] - labelPos[0]) ** 2 + (tmp[1] - labelPos[1]) ** 2 + (tmp[2] - labelPos[2]) ** 2;
        if (d > bestD) { bestD = d; best = [tmp[0], tmp[1], tmp[2]]; }
      }
    }
    if (best) return best;
  }
  return null;
}

for (const sys of SYSTEM_FILES) {
  const doc = await io.read(path.join(RAW, `${sys}.glb`));
  const scene = doc.getRoot().listScenes()[0];
  const walk = (node, parent, pathNames, depth) => {
    const raw = node.getName();
    if (depth <= 1 && SKIP_ROOT.test(raw)) return;
    const m = NAME_RE.exec(raw);
    const base = (m ? m[1] : raw).trim();
    const suf = m ? m[2] : '';
    const mesh = node.getMesh();
    let self = parent;
    let nextPath = pathNames;
    if (suf === 'j' || suf === 'i') return;
    if (suf === 't' || suf === 's') {
      if (parent) {
        const wm = node.getWorldMatrix();
        const lp = [wm[12], wm[13], wm[14]];
        const anchor = leaderAnchor(node, lp) || lp;
        landmarks.push({ n: base, p: parent.id, a: anchor.map(r4), l: lp.map(r4) });
      }
    } else if (/^[oe]\d*[rl]$/.test(suf)) {
      if (mesh && parent) {
        const it = addItem({ y: 'a', n: base, sd: suf.slice(-1), ak: suf[0], p: parent.id, sys, raw, lg: 'attach' });
        geo.set(it.id, extractGeometry(node));
      }
      return;
    } else if (suf === 'g' || !mesh) {
      if (raw === 'RootNode') {
        self = null;
      } else {
        self = addItem({ y: 'g', n: base, sd: suf === 'r' || suf === 'l' ? suf : '', p: parent ? parent.id : -1, sys, raw });
        nextPath = pathNames.concat(base);
      }
    } else {
      const lay = layerOf.get(raw);
      self = addItem({
        y: 's', n: base, sd: suf === 'r' || suf === 'l' ? suf : '', p: parent ? parent.id : -1, sys, raw,
        lg: layerGroupFor(sys, pathNames, false), L: lay ? lay.depth : 0, lcat: lay ? lay.cat : '',
      });
      if (self.lg === 'muscles' && /\b(bursa|bursae|sheaths?)\b/i.test(base)) self.lg = 'bursae';
      geo.set(self.id, extractGeometry(node));
      nextPath = pathNames.concat(base);
    }
    for (const c of node.listChildren()) walk(c, self, nextPath, depth + 1);
  };
  for (const n of scene.listChildren()) walk(n, null, [], 0);
  console.log(`read ${sys}: items so far ${items.length}, landmarks ${landmarks.length}`);
}

// ---------------------------------------------------------------- prune empty groups
{
  const keep = new Uint8Array(items.length);
  const lmParents = new Set(landmarks.map((l) => l.p));
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.y !== 'g' || lmParents.has(i)) keep[i] = 1;
    if (keep[i] && it.p >= 0) keep[it.p] = 1;
  }
  // groups that only hold landmarks but no structures anywhere: keep only if they have structure descendants
  const hasStruct = new Uint8Array(items.length);
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.y !== 'g') hasStruct[i] = 1;
    if (hasStruct[i] && it.p >= 0) hasStruct[it.p] = 1;
  }
  const remap = new Int32Array(items.length).fill(-1);
  const kept = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].y === 'g' && !hasStruct[i]) continue;
    remap[i] = kept.length;
    kept.push(items[i]);
  }
  const newGeo = new Map();
  for (const it of kept) {
    const old = it.id;
    it.id = remap[old];
    it.p = it.p >= 0 ? remap[it.p] : -1;
    if (geo.has(old)) newGeo.set(it.id, geo.get(old));
  }
  geo.clear();
  for (const [k, v] of newGeo) geo.set(k, v);
  for (let i = landmarks.length - 1; i >= 0; i--) {
    const np = remap[landmarks[i].p];
    if (np < 0) landmarks.splice(i, 1);
    else landmarks[i].p = np;
  }
  items.length = 0;
  items.push(...kept);
}

// Groups inherit the layer group of their descendants (when uniform) for filtering in the tree.
// ---------------------------------------------------------------- bounds, mirror detection
function boundsOf(prims) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, tris = 0;
  for (const p of prims) {
    tris += p.idx.length / 3;
    for (let i = 0; i < p.pos.length; i += 3) {
      const x = p.pos[i], y = p.pos[i + 1], z = p.pos[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], tris };
}
for (const it of items) {
  if (!geo.has(it.id)) continue;
  const b = boundsOf(geo.get(it.id));
  it.bmin = b.min; it.bmax = b.max; it.tris = b.tris;
}

// Same vertex cloud after reflecting across the median plane (vertex order may differ).
function mirrorSetEqual(gl, gr, eps) {
  let nl = 0, nr = 0, tl = 0, tr = 0;
  for (const p of gl) { nl += p.pos.length / 3; tl += p.idx.length; }
  for (const p of gr) { nr += p.pos.length / 3; tr += p.idx.length; }
  if (nl !== nr || tl !== tr) return false;
  const q = 1 / Math.max(eps, 1e-4);
  const cells = new Map();
  const key = (x, y, z) => `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
  for (const p of gr) for (let i = 0; i < p.pos.length; i += 3) {
    const k = key(-p.pos[i], p.pos[i + 1], p.pos[i + 2]);
    cells.set(k, (cells.get(k) || 0) + 1);
  }
  let miss = 0;
  for (const p of gl) for (let i = 0; i < p.pos.length; i += 3) {
    const x = p.pos[i] * q, y = p.pos[i + 1] * q, z = p.pos[i + 2] * q;
    let found = false;
    // look in the rounded cell and its neighbours to tolerate rounding at cell borders
    const rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    for (let dx = -1; dx <= 1 && !found; dx++) for (let dy = -1; dy <= 1 && !found; dy++) for (let dz = -1; dz <= 1 && !found; dz++) {
      if (cells.has(`${rx + dx},${ry + dy},${rz + dz}`)) found = true;
    }
    if (!found && ++miss > nl * 0.002) return false;
  }
  return true;
}

let mirrored = 0, mirrorTris = 0;
{
  const byKey = new Map();
  for (const it of items) {
    if (!geo.has(it.id) || !it.sd) continue;
    const key = `${it.sys}|${it.y}|${it.raw.slice(0, -1)}|${it.y === 'a' ? items[it.p].n : ''}`;
    if (!byKey.has(key)) byKey.set(key, {});
    const slot = byKey.get(key);
    if (!slot[it.sd]) slot[it.sd] = it; // first occurrence only
  }
  for (const { l, r } of byKey.values()) {
    if (!l || !r) continue;
    const gl = geo.get(l.id), gr = geo.get(r.id);
    if (gl.length !== gr.length) continue;
    let ok = true;
    const size = Math.max(r.bmax[0] - r.bmin[0], r.bmax[1] - r.bmin[1], r.bmax[2] - r.bmin[2]);
    const eps = Math.max(2e-4, size * 2e-3);
    for (let k = 0; k < gl.length && ok; k++) {
      const a = gl[k], b = gr[k];
      if (a.pos.length !== b.pos.length || a.idx.length !== b.idx.length || a.mat !== b.mat) { ok = false; break; }
      for (let i = 0; i < a.pos.length; i += 3) {
        if (Math.abs(a.pos[i] + b.pos[i]) > eps || Math.abs(a.pos[i + 1] - b.pos[i + 1]) > eps || Math.abs(a.pos[i + 2] - b.pos[i + 2]) > eps) { ok = false; break; }
      }
    }
    if (!ok) ok = mirrorSetEqual(gl, gr, eps);
    if (ok) { l.mi = r.id; mirrored++; mirrorTris += l.tris; }
    else if (process.env.DEBUG_MIRROR && l.tris > 3000) console.log('  no-mirror', l.raw, l.tris, r.tris);
  }
}
console.log(`mirror pairs: ${mirrored} (saves ${Math.round(mirrorTris / 1000)}k source triangles)`);

// ---------------------------------------------------------------- names, latin, descriptions
const descKeys = [];
const descIndex = new Map();
function descId(name) {
  const k = findDesc(name);
  if (!k) return -1;
  if (!descIndex.has(k)) { descIndex.set(k, descKeys.length); descKeys.push(k); }
  return descIndex.get(k);
}
let withDesc = 0, withLatin = 0, nStruct = 0;
for (const it of items) {
  const la = latinOf.get(it.n.toLowerCase());
  if (la && la.la) it.la = la.la;
  if (la && la.syn.length) it.syn = la.syn;
  it.d = descId(it.n);
  if (it.y === 's') { nStruct++; if (it.d >= 0) withDesc++; if (it.la) withLatin++; }
}
for (const lm of landmarks) {
  lm.d = descId(lm.n);
  const la = latinOf.get(lm.n.toLowerCase());
  if (la && la.la) lm.la = la.la;
}
console.log(`structures ${nStruct}, with description ${withDesc}, with latin ${withLatin}; landmarks ${landmarks.length}; attachments ${items.filter((i) => i.y === 'a').length}; groups ${items.filter((i) => i.y === 'g').length}`);

// ---------------------------------------------------------------- stats
{
  const per = new Map();
  for (const it of items) {
    if (!it.lg) continue;
    const s = per.get(it.lg) || { n: 0, tris: 0, uniq: 0, layered: 0 };
    s.n++; s.tris += it.tris;
    if (it.mi === undefined) s.uniq += it.tris;
    if (it.L) s.layered++;
    per.set(it.lg, s);
  }
  for (const [k, s] of per) console.log(`  ${k.padEnd(12)} n=${String(s.n).padStart(5)} tris=${String(Math.round(s.tris / 1000)).padStart(5)}k unique=${String(Math.round(s.uniq / 1000)).padStart(5)}k layered=${s.layered}`);
}
if (STATS_ONLY) process.exit(0);

// ---------------------------------------------------------------- chunking
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'geo'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'desc'), { recursive: true });

const CHUNK_TRI_BUDGET = 450000;
const chunks = []; // { name, lg, items: [] }
{
  const open = new Map();
  for (const it of items) {
    if (!geo.has(it.id) || it.mi !== undefined) continue;
    let c = open.get(it.lg);
    if (!c || c.tris + it.tris > CHUNK_TRI_BUDGET) {
      const n = chunks.filter((x) => x.lg === it.lg).length;
      c = { name: `${it.lg}-${n}`, lg: it.lg, items: [], tris: 0 };
      chunks.push(c);
      open.set(it.lg, c);
    }
    c.items.push(it);
    c.tris += it.tris;
    it.ch = chunks.indexOf(c);
  }
  for (const it of items) if (it.mi !== undefined) it.ch = items[it.mi].ch;
}

function targetTris(it) {
  const d = Math.hypot(it.bmax[0] - it.bmin[0], it.bmax[1] - it.bmin[1], it.bmax[2] - it.bmin[2]);
  // density cap: tiny structures do not need tens of thousands of triangles
  const cap = Math.max(500, 70000 * d);
  let t = it.tris;
  if (t > 1500) t = Math.max(1500, t * 0.62);
  return Math.min(t, cap);
}

let outTris = 0, outBytes = 0;
for (const chunk of chunks) {
  const doc = new Document();
  doc.getLogger().debug = () => {}; doc.getLogger().info = () => {};
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const mats = new Map();
  for (const it of chunk.items) {
    const prims = geo.get(it.id);
    const mesh = doc.createMesh(String(it.id));
    const ratio = Math.min(1, targetTris(it) / it.tris);
    let tris = 0;
    const matsUsed = [];
    for (const p of prims) {
      if (!mats.has(p.mat)) mats.set(p.mat, doc.createMaterial(p.mat));
      const prim = doc.createPrimitive()
        .setMaterial(mats.get(p.mat))
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(p.pos).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(p.idx).setBuffer(buffer));
      if (p.nor) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(p.nor).setBuffer(buffer));
      weldPrimitive(prim, {});
      if (ratio < 0.98 && prim.getIndices().getCount() / 3 > 300) {
        simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.004 });
      }
      const n = prim.getIndices().getCount() / 3;
      if (n < 1) continue;
      tris += n;
      mesh.addPrimitive(prim);
      matsUsed.push([p.mat, n]);
    }
    if (!mesh.listPrimitives().length) { it.empty = true; continue; }
    matsUsed.sort((a, b) => b[1] - a[1]);
    it.m = matsUsed[0][0];
    it.ot = tris;
    outTris += tris;
    scene.addChild(doc.createNode(String(it.id)).setMesh(mesh));
  }
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 14, quantizeNormal: 8 }));
  const bin = await io.writeBinary(doc);
  fs.writeFileSync(path.join(OUT, 'geo', `${chunk.name}.glb`), bin);
  chunk.bytes = bin.byteLength;
  outBytes += bin.byteLength;
  console.log(`  chunk ${chunk.name.padEnd(16)} ${String(chunk.items.length).padStart(4)} meshes  ${(bin.byteLength / 1e6).toFixed(2)} MB`);
}
console.log(`geometry: ${Math.round(outTris / 1000)}k unique triangles, ${(outBytes / 1e6).toFixed(1)} MB`);
for (const it of items) if (it.mi !== undefined) { it.m = items[it.mi].m; it.ot = items[it.mi].ot; if (items[it.mi].empty) it.empty = true; }

// ---------------------------------------------------------------- descriptions
const DESC_PER_BUCKET = 48;
let descBytes = 0;
const descOk = new Uint8Array(descKeys.length);
for (let b = 0; b * DESC_PER_BUCKET < descKeys.length; b++) {
  const obj = {};
  for (let i = b * DESC_PER_BUCKET; i < Math.min(descKeys.length, (b + 1) * DESC_PER_BUCKET); i++) {
    const text = cleanDesc(fs.readFileSync(path.join(DESC_DIR, descFile.get(descKeys[i])), 'utf8'));
    if (text) { obj[i] = text; descOk[i] = 1; }
  }
  const s = JSON.stringify(obj);
  descBytes += s.length;
  fs.writeFileSync(path.join(OUT, 'desc', `${b}.json`), s);
}
console.log(`descriptions: ${descKeys.length} in ${Math.ceil(descKeys.length / DESC_PER_BUCKET)} buckets, ${(descBytes / 1e6).toFixed(1)} MB`);

// ---------------------------------------------------------------- meta.json
const matNames = [];
const matIdx = (m) => { let i = matNames.indexOf(m); if (i < 0) { i = matNames.length; matNames.push(m); } return i; };
const sysIdx = (s) => SYSTEM_FILES.indexOf(s);
const outItems = items.map((it) => {
  const o = { n: it.n, p: it.p, y: it.y, s: sysIdx(it.sys) };
  if (it.sd) o.sd = it.sd;
  if (it.la) o.la = it.la;
  if (it.syn) o.syn = it.syn;
  if (it.d >= 0 && descOk[it.d]) o.d = it.d;
  if (it.y !== 'g' && !it.empty) {
    o.g = LG_INDEX.get(it.lg);
    o.c = it.ch;
    o.m = matIdx(it.m);
    o.b = [...it.bmin.map(r4), ...it.bmax.map(r4)];
    o.t = it.ot;
    if (it.L) o.L = it.L;
    if (it.mi !== undefined) o.mi = it.mi;
    if (it.ak) o.ak = it.ak;
  } else if (it.y !== 'g') {
    o.y = 'x'; // geometry vanished
  }
  return o;
});
// Composite structures defined by Z-Anatomy (e.g. "Deltoid muscle" = its three parts)
const composites = {};
{
  const dir = path.join(ZAN, 'Z-Anatomy PC/Assets/Models/Collections');
  for (const sub of ['Group-Muscles', 'Group-Nerve']) {
    for (const f of fs.readdirSync(path.join(dir, sub))) {
      const lines = fs.readFileSync(path.join(dir, sub, f), 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const name = f.slice(0, -4).trim();
      if (!name || lines.length < 2) continue;
      const members = [...new Set(lines.filter((l) => l !== name).map((l) => l.replace(/\.(r|l|g)$/, '')))];
      if (members.length) composites[name] = members;
    }
  }
}

const meta = {
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  systems: SYSTEM_FILES,
  layerGroups: LAYER_GROUPS.map(([key, label, system]) => ({ key, label, system })),
  chunks: chunks.map((c) => ({ f: `${c.name}.glb`, g: LG_INDEX.get(c.lg), bytes: c.bytes })),
  materials: matNames,
  composites,
  descPerBucket: DESC_PER_BUCKET,
  descBuckets: Math.ceil(descKeys.length / DESC_PER_BUCKET),
  items: outItems,
  landmarks: landmarks.map((l) => {
    const o = { n: l.n, p: l.p, a: l.a, l: l.l };
    if (l.la) o.la = l.la;
    if (l.d >= 0 && descOk[l.d]) o.d = l.d;
    return o;
  }),
};
const metaStr = JSON.stringify(meta);
fs.writeFileSync(path.join(OUT, 'meta.json'), metaStr);
console.log(`meta.json ${(metaStr.length / 1e6).toFixed(2)} MB, ${outItems.length} items, materials: ${matNames.length}`);
