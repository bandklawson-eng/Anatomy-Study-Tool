// Study decks generated from the atlas, and spaced-repetition state kept on the device.
import type { Atlas } from '../data/meta';
import { muscleNames } from '../data/facts';
import { muscleFacts, type MuscleFacts } from '../data/muscles';
import { GHOST, NORMAL } from '../viewer/Viewer';

export type Field = 'o' | 'i' | 'a' | 'n';
export const FIELD_LABEL: Record<Field, string> = { o: 'Origin', i: 'Insertion', a: 'Action', n: 'Innervation' };
const FIELD_Q: Record<Field, (m: string) => string> = {
  o: (m) => `Where does ${m} originate?`,
  i: (m) => `Where does ${m} insert?`,
  a: (m) => `What is the action of ${m}?`,
  n: (m) => `Which nerve supplies ${m}?`,
};

export interface Card {
  id: string;
  deck: string;
  kind: 'id' | 'fact';
  ids: number[];
  name: string;
  latin?: string;
  field?: Field;
  answer?: string;
  facts?: MuscleFacts;
}

export interface Deck {
  key: string;
  title: string;
  blurb: string;
  layers: string[];
  kind: 'id' | 'fact';
  cards: Card[];
}

const DECK_DEFS: { key: string; title: string; blurb: string; layers: string[]; kind: 'id' | 'fact' }[] = [
  { key: 'muscle-facts', title: 'Muscle origins, insertions, actions and nerves', blurb: 'Four cards for each muscle with curated facts', layers: ['muscles'], kind: 'fact' },
  { key: 'muscles', title: 'Identify muscles', blurb: 'Name the highlighted muscle', layers: ['muscles'], kind: 'id' },
  { key: 'bones', title: 'Identify bones', blurb: 'Every bone, cartilage and tooth in the atlas', layers: ['bones'], kind: 'id' },
  { key: 'joints', title: 'Joints and ligaments', blurb: 'Ligaments, capsules and joint structures', layers: ['joints'], kind: 'id' },
  { key: 'organs', title: 'Organs', blurb: 'Heart, lungs, digestive, urinary, endocrine and reproductive organs, and the senses', layers: ['heart', 'respiratory', 'digestive', 'urinary', 'endocrine', 'genital', 'senses', 'cavities'], kind: 'id' },
  { key: 'vessels', title: 'Arteries and veins', blurb: 'Named blood vessels', layers: ['arteries', 'veins'], kind: 'id' },
  { key: 'nerves', title: 'Nerves', blurb: 'Cranial and spinal nerves and their branches', layers: ['nerves'], kind: 'id' },
  { key: 'brain', title: 'Brain and spinal cord', blurb: 'Lobes, gyri, nuclei, ventricles and tracts', layers: ['cns'], kind: 'id' },
  { key: 'lymph', title: 'Lymphatic organs and nodes', blurb: 'Node groups, spleen, thymus and tonsils', layers: ['lymph'], kind: 'id' },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const skipName = (n: string) => /^\(|\*|_|^Lat_|\.\w$/.test(n) || n.length < 3;

let cache: { atlas: Atlas; decks: Deck[] } | null = null;

export function getDecks(atlas: Atlas): Deck[] {
  if (cache && cache.atlas === atlas) return cache.decks;
  const decks: Deck[] = [];
  for (const def of DECK_DEFS) {
    const lgs = new Set(def.layers.map((k) => atlas.lg(k)));
    const cards: Card[] = [];
    if (def.kind === 'fact') {
      const byKey = new Map<string, { ids: number[]; facts: MuscleFacts }>();
      atlas.items.forEach((it, id) => {
        if (it.y !== 's' || it.g === undefined || !lgs.has(it.g)) return;
        const r = muscleFacts(muscleNames(atlas, id));
        if (!r) return;
        const e = byKey.get(r.matched) || { ids: [], facts: r.facts };
        e.ids.push(id);
        byKey.set(r.matched, e);
      });
      for (const [key, e] of byKey) {
        const name = cap(key);
        for (const f of ['o', 'i', 'a', 'n'] as Field[]) {
          cards.push({ id: `mf:${key}:${f}`, deck: def.key, kind: 'fact', ids: e.ids, name, field: f, answer: e.facts[f], facts: e.facts });
        }
      }
    } else {
      const byName = new Map<string, Card>();
      atlas.items.forEach((it, id) => {
        if (it.y !== 's' || it.g === undefined || !lgs.has(it.g) || skipName(it.n)) return;
        const k = it.n.toLowerCase();
        let c = byName.get(k);
        if (!c) {
          c = { id: `${def.key}:${k}`, deck: def.key, kind: 'id', ids: [], name: it.n, latin: it.la };
          byName.set(k, c);
        }
        c.ids.push(id);
      });
      // muscles: also offer whole multi-part muscles (e.g. biceps brachii) by their group
      cards.push(...byName.values());
    }
    decks.push({ ...def, cards });
  }
  cache = { atlas, decks };
  return decks;
}

// ------------------------------------------------------------------ scene helpers
export function cardCentre(atlas: Atlas, c: Card): [number, number, number] {
  const b = atlas.bounds(c.ids);
  if (!b) return [0, 1, 0];
  return [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2];
}

/** What to show around a target: its layer peeled down to it, with context. */
export function contextWant(atlas: Atlas, ids: number[], extra: number[] = []): Uint8Array {
  const want = new Uint8Array(atlas.items.length);
  const first = atlas.items[ids[0]];
  const g = first.g!;
  let depth = 10;
  for (const id of ids) {
    const L = atlas.items[id].L;
    if (L && L < depth) depth = L;
  }
  const key = atlas.meta.layerGroups[g].key;
  // peel superficial layers only for muscles; other systems are shown whole
  if (key !== 'muscles') depth = 10;
  const ctxNormal = new Set<number>();
  const ctxGhost = new Set<number>();
  if (key === 'muscles' || key === 'joints' || key === 'bursae') ctxNormal.add(atlas.lg('bones'));
  else if (key !== 'bones' && key !== 'cns' && key !== 'senses') ctxGhost.add(atlas.lg('bones'));
  if (key === 'cns' || key === 'senses') ctxGhost.add(atlas.lg('bones'));
  atlas.items.forEach((it, id) => {
    if (it.y !== 's' || it.g === undefined) return;
    if (it.g === g) {
      if (!it.L || it.L <= depth) want[id] = NORMAL;
    } else if (ctxNormal.has(it.g)) want[id] = NORMAL;
    else if (ctxGhost.has(it.g)) want[id] = GHOST;
  });
  for (const id of ids) want[id] = NORMAL;
  for (const id of extra) want[id] = NORMAL;
  return want;
}

/** Bounds padded to a minimum size so small targets keep some context. */
export function contextBounds(atlas: Atlas, ids: number[], min = 0.16): [number[], number[]] | null {
  // frame one side of a paired structure
  const side = atlas.items[ids[0]]?.sd;
  const one = side ? ids.filter((i) => !atlas.items[i].sd || atlas.items[i].sd === side) : ids;
  const b = atlas.bounds(one);
  if (!b) return null;
  const out: [number[], number[]] = [b[0].slice(), b[1].slice()];
  for (let k = 0; k < 3; k++) {
    const size = b[1][k] - b[0][k];
    if (size < min) {
      const c = (b[0][k] + b[1][k]) / 2;
      out[0][k] = c - min / 2;
      out[1][k] = c + min / 2;
    }
  }
  return out;
}

/** Up to n other cards near the target (plausible distractors). */
export function nearbyCards(atlas: Atlas, deck: Deck, target: Card, n: number, pool = 14): Card[] {
  const c = cardCentre(atlas, target);
  const others = deck.cards.filter((x) => x.name !== target.name && (target.kind === 'id' || x.field === target.field) && (!target.answer || x.answer !== target.answer));
  const scored = others.map((x) => {
    const d = cardCentre(atlas, x);
    return { x, d: Math.hypot(d[0] - c[0], d[1] - c[1], d[2] - c[2]) };
  });
  scored.sort((a, b) => a.d - b.d);
  const near = shuffle(scored.slice(0, pool).map((s) => s.x));
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const x of near) {
    const key = target.kind === 'fact' ? x.answer! : x.name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
    if (out.length === n) break;
  }
  return out;
}

export function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function questionFor(c: Card): string {
  if (c.kind === 'fact') return FIELD_Q[c.field!](c.name);
  return 'What is the highlighted structure?';
}

// ------------------------------------------------------------------ spaced repetition
export interface SrsState { d: number; iv: number; e: number; r: number; l: number }
export type Rating = 0 | 1 | 2 | 3; // again, hard, good, easy

const SRS_KEY = 'study.srs.v1';
const DAY = 86400000;
let srs: Record<string, SrsState> | null = null;

function load(): Record<string, SrsState> {
  if (srs) return srs;
  try {
    srs = JSON.parse(localStorage.getItem(SRS_KEY) || '{}') || {};
  } catch {
    srs = {};
  }
  return srs!;
}
function save() {
  try {
    localStorage.setItem(SRS_KEY, JSON.stringify(srs || {}));
  } catch {
    /* storage full or blocked */
  }
}

export function stateOf(id: string): SrsState | undefined {
  return load()[id];
}

/** The interval (days) each rating would give, for button labels. */
export function preview(id: string, r: Rating): number {
  return next(load()[id], r).iv;
}

function next(s: SrsState | undefined, r: Rating): SrsState {
  const now = Date.now();
  const cur = s || { d: now, iv: 0, e: 2.5, r: 0, l: 0 };
  let { iv, e, l } = cur;
  if (r === 0) {
    l += cur.r > 0 ? 1 : 0;
    e = Math.max(1.3, e - 0.2);
    return { d: now + 60_000, iv: 0, e, r: cur.r, l };
  }
  if (r === 1) {
    iv = iv ? Math.max(1, iv * 1.2) : 0.5;
    e = Math.max(1.3, e - 0.15);
  } else if (r === 2) {
    iv = iv ? Math.max(iv + 1, iv * e) : 1;
  } else {
    iv = iv ? Math.max(iv + 2, iv * e * 1.3) : 3;
    e = e + 0.15;
  }
  return { d: now + iv * DAY, iv, e, r: cur.r + 1, l };
}

export function rate(id: string, r: Rating) {
  const st = load();
  st[id] = next(st[id], r);
  save();
  bumpDay();
}

export function resetProgress(deck?: Deck) {
  const st = load();
  if (deck) deck.cards.forEach((c) => delete st[c.id]);
  else for (const k of Object.keys(st)) delete st[k];
  save();
}

export function deckStats(deck: Deck) {
  const st = load();
  const now = Date.now();
  let seen = 0, due = 0, mastered = 0;
  for (const c of deck.cards) {
    const s = st[c.id];
    if (!s) continue;
    seen++;
    if (s.d <= now) due++;
    if (s.iv >= 21) mastered++;
  }
  return { total: deck.cards.length, seen, due, mastered, fresh: deck.cards.length - seen };
}

/** Today's queue: cards due now, then up to `newCount` unseen cards. */
export function buildQueue(deck: Deck, newCount: number): Card[] {
  const st = load();
  const now = Date.now();
  const due = deck.cards.filter((c) => st[c.id] && st[c.id].d <= now).sort((a, b) => st[a.id].d - st[b.id].d);
  const fresh = shuffle(deck.cards.filter((c) => !st[c.id])).slice(0, newCount);
  // keep the four facts of one muscle apart
  return [...due, ...fresh];
}

// ------------------------------------------------------------------ streak and quiz history
const META_KEY = 'study.meta.v1';
interface Meta { days: string[]; quiz: Record<string, { best: number; last: number; plays: number }> }
function loadMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || 'null');
    if (m && Array.isArray(m.days)) return m;
  } catch {
    /* ignore */
  }
  return { days: [], quiz: {} };
}
function saveMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function bumpDay() {
  const m = loadMeta();
  const t = today();
  if (!m.days.includes(t)) {
    m.days.push(t);
    m.days = m.days.slice(-400);
    saveMeta(m);
  }
}
export function streak(): number {
  const m = loadMeta();
  const set = new Set(m.days);
  let n = 0;
  const d = new Date();
  if (!set.has(today())) d.setDate(d.getDate() - 1);
  for (;;) {
    const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (!set.has(k)) break;
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
export function recordQuiz(key: string, score: number) {
  const m = loadMeta();
  const q = m.quiz[key] || { best: 0, last: 0, plays: 0 };
  q.best = Math.max(q.best, score);
  q.last = score;
  q.plays++;
  m.quiz[key] = q;
  saveMeta(m);
  bumpDay();
}
export function quizHistory() {
  return loadMeta().quiz;
}
