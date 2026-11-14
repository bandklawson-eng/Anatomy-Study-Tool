// Structure database: every selectable structure, group, landmark and muscle attachment.

export interface Item {
  /** name without side */
  n: string;
  /** parent item id, -1 at the root */
  p: number;
  /** g = group, s = structure, a = muscle attachment area, x = removed */
  y: 'g' | 's' | 'a' | 'x';
  /** source system index */
  s: number;
  sd?: 'l' | 'r';
  /** Latin (Terminologia Anatomica) name */
  la?: string;
  syn?: string[];
  /** description id */
  d?: number;
  /** layer group index */
  g?: number;
  /** geometry chunk */
  c?: number;
  /** dominant material index */
  m?: number;
  /** bounds [minx,miny,minz,maxx,maxy,maxz] in metres */
  b?: number[];
  t?: number;
  /** depth layer 1 (deepest) .. 10 (most superficial) */
  L?: number;
  /** mirrored copy of this item id */
  mi?: number;
  /** attachment kind: o = origin, e = insertion */
  ak?: 'o' | 'e';
}

export interface Landmark {
  n: string;
  p: number;
  a: [number, number, number];
  l: [number, number, number];
  la?: string;
  d?: number;
}

export interface LayerGroup {
  key: string;
  label: string;
  system: string;
}

export interface MetaFile {
  version: number;
  generated: string;
  systems: string[];
  layerGroups: LayerGroup[];
  chunks: { f: string; g: number; bytes: number }[];
  materials: string[];
  composites: Record<string, string[]>;
  descPerBucket: number;
  descBuckets: number;
  items: Item[];
  landmarks: Landmark[];
}

export class Atlas {
  meta: MetaFile;
  items: Item[];
  landmarks: Landmark[];
  children: number[][];
  /** bitmask of layer groups present beneath each item */
  mask: Uint32Array;
  /** number of structures (y === 's') beneath each item, itself included */
  count: Uint32Array;
  landmarksOf = new Map<number, number[]>();
  byName = new Map<string, number[]>();
  /** attachments for a muscle: key = lower name + '|' + side */
  attachByMuscle = new Map<string, number[]>();
  attachByBone = new Map<number, number[]>();
  lgIndex = new Map<string, number>();
  roots: number[] = [];

  constructor(meta: MetaFile) {
    this.meta = meta;
    this.items = meta.items;
    this.landmarks = meta.landmarks;
    const n = this.items.length;
    this.children = Array.from({ length: n }, () => []);
    this.mask = new Uint32Array(n);
    this.count = new Uint32Array(n);
    meta.layerGroups.forEach((g, i) => this.lgIndex.set(g.key, i));
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      if (it.y === 'x') continue;
      if (it.y === 'a') {
        const key = it.n.toLowerCase() + '|' + (it.sd || '');
        push(this.attachByMuscle, key, i);
        push(this.attachByBone, it.p, i);
        continue;
      }
      if (it.p >= 0) this.children[it.p].push(i);
      else this.roots.push(i);
      push(this.byName, it.n.toLowerCase(), i);
    }
    for (let i = n - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.y === 's') {
        this.mask[i] |= 1 << it.g!;
        this.count[i] += 1;
      }
      if (it.y !== 'a' && it.y !== 'x' && it.p >= 0) {
        this.mask[it.p] |= this.mask[i];
        this.count[it.p] += this.count[i];
      }
    }
    this.landmarks.forEach((l, i) => push(this.landmarksOf, l.p, i));
  }

  lg(key: string): number {
    return this.lgIndex.get(key)!;
  }

  displayName(id: number): string {
    const it = this.items[id];
    return it.sd ? `${it.n} (${it.sd === 'l' ? 'left' : 'right'})` : it.n;
  }

  /** Structures at or below an item (the item itself when it is a structure). */
  structuresUnder(id: number, out: number[] = []): number[] {
    const it = this.items[id];
    if (it.y === 's') out.push(id);
    for (const c of this.children[id]) this.structuresUnder(c, out);
    return out;
  }

  path(id: number): number[] {
    const p: number[] = [];
    let x = this.items[id].p;
    while (x >= 0) {
      p.unshift(x);
      x = this.items[x].p;
    }
    return p;
  }

  /** Bounds of an item or group as [min, max]. */
  bounds(ids: number[]): [number[], number[]] | null {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const id of ids) {
      const b = this.items[id].b;
      if (!b) continue;
      any = true;
      for (let k = 0; k < 3; k++) {
        if (b[k] < min[k]) min[k] = b[k];
        if (b[k + 3] > max[k]) max[k] = b[k + 3];
      }
    }
    return any ? [min, max] : null;
  }

  center(id: number): [number, number, number] {
    const b = this.items[id].b!;
    return [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  }

  /** The matching structure on the other side of the body, if any. */
  contralateral(id: number): number | null {
    const it = this.items[id];
    if (!it.sd) return null;
    const cands = this.byName.get(it.n.toLowerCase()) || [];
    for (const c of cands) {
      const o = this.items[c];
      if (c !== id && o.sd && o.sd !== it.sd && o.y === it.y && o.s === it.s) return c;
    }
    return null;
  }

  /** Structure ids making up a named muscle (handles composites such as "Deltoid muscle"). */
  resolveName(name: string, side?: string): number[] {
    const out: number[] = [];
    const seen = new Set<string>();
    const visit = (nm: string) => {
      const key = nm.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      for (const id of this.byName.get(key) || []) {
        const it = this.items[id];
        if (it.y === 's') {
          if (!side || !it.sd || it.sd === side) out.push(id);
        } else if (it.y === 'g') {
          for (const s of this.structuresUnder(id)) {
            const st = this.items[s];
            if (!side || !st.sd || st.sd === side) out.push(s);
          }
        }
      }
      const comp = this.meta.composites[nm] || this.meta.composites[capitalise(nm)];
      if (comp) comp.forEach(visit);
    };
    visit(name);
    if (!out.length) {
      // "Masseter" -> "... of masseter"
      const key = name.toLowerCase().replace(/ muscles?$/, '');
      for (const [nm, ids] of this.byName) {
        if (nm.endsWith(' of ' + key) || nm.endsWith(' of ' + key + ' muscle')) {
          for (const id of ids) {
            const it = this.items[id];
            if (it.y === 's' && (!side || !it.sd || it.sd === side)) out.push(id);
          }
        }
      }
    }
    return [...new Set(out)];
  }
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function push<K>(m: Map<K, number[]>, k: K, v: number) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

export const DATA_BASE = './data/';

export async function loadAtlas(): Promise<Atlas> {
  const res = await fetch(DATA_BASE + 'meta.json');
  if (!res.ok) throw new Error('Could not load the anatomy database');
  return new Atlas((await res.json()) as MetaFile);
}

// ---------------------------------------------------------------- descriptions
const bucketCache = new Map<number, Promise<Record<string, string>>>();

export function loadDescription(atlas: Atlas, d: number | undefined): Promise<string | null> {
  if (d === undefined) return Promise.resolve(null);
  const b = Math.floor(d / atlas.meta.descPerBucket);
  let p = bucketCache.get(b);
  if (!p) {
    p = fetch(`${DATA_BASE}desc/${b}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    bucketCache.set(b, p);
  }
  return p.then((o) => o[String(d)] ?? null);
}

export interface Article {
  intro: string[];
  sections: { title: string; level: number; paras: string[] }[];
}

export function parseArticle(text: string): Article {
  const art: Article = { intro: [], sections: [] };
  let cur: { title: string; level: number; paras: string[] } | null = null;
  for (const line of text.split('\n')) {
    const h = /^(#{2,3}) (.*)$/.exec(line);
    if (h) {
      cur = { title: h[2], level: h[1].length, paras: [] };
      art.sections.push(cur);
    } else if (cur) cur.paras.push(line);
    else art.intro.push(line);
  }
  art.sections = art.sections.filter((s, i) => s.paras.length || (s.level === 2 && art.sections[i + 1]?.level === 3));
  return art;
}
