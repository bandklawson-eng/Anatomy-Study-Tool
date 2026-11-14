import type { Atlas } from './meta';
import { muscleFacts, type MuscleFacts } from './muscles';

const KIND_BY_LG: Record<string, string> = {
  skin: 'Surface region',
  fasciae: 'Fascia',
  muscles: 'Muscle',
  bursae: 'Bursa / tendon sheath',
  bones: 'Bone',
  attach: 'Muscle attachment',
  joints: 'Ligament / joint structure',
  heart: 'Heart',
  arteries: 'Artery',
  veins: 'Vein',
  lymph: 'Lymphatic structure',
  cns: 'Central nervous system',
  nerves: 'Nerve',
  senses: 'Sense organ',
  respiratory: 'Respiratory organ',
  digestive: 'Digestive organ',
  urinary: 'Urinary organ',
  genital: 'Reproductive organ',
  endocrine: 'Endocrine gland',
  cavities: 'Body cavity / membrane',
};

export function lgKey(atlas: Atlas, id: number): string | null {
  const it = atlas.items[id];
  if (it.g !== undefined) return atlas.meta.layerGroups[it.g].key;
  // group: use the layer group when all descendants agree
  const mask = atlas.mask[id];
  if (mask && (mask & (mask - 1)) === 0) return atlas.meta.layerGroups[Math.log2(mask)].key;
  return null;
}

export function kindLabel(atlas: Atlas, id: number): string {
  const it = atlas.items[id];
  const key = lgKey(atlas, id);
  const n = it.n.toLowerCase();
  if (it.y === 'g') {
    if (key === 'muscles') return 'Muscle group';
    if (key === 'bones') return 'Skeletal region';
    return 'Group';
  }
  if (it.y === 'a') return it.ak === 'o' ? 'Muscle origin' : 'Muscle insertion';
  if (key === 'bones') {
    if (/cartilage/.test(n)) return 'Cartilage';
    if (/tooth|incisor|canine|molar|premolar/.test(n)) return 'Tooth';
    if (/sinus|cells of/.test(n)) return 'Air sinus';
    if (/suture|synchondrosis/.test(n)) return 'Suture';
    return 'Bone';
  }
  if (key === 'muscles') {
    if (/tendon|aponeurosis|retinaculum|tract|linea alba|ligament|tarsus|trochlea|ring|arch/.test(n)) return 'Tendon / connective tissue';
    return 'Muscle';
  }
  if (key === 'joints') {
    if (/ligament/.test(n)) return 'Ligament';
    if (/capsule/.test(n)) return 'Joint capsule';
    if (/disc|disk|menisc|labrum/.test(n)) return 'Fibrocartilage';
    if (/membrane/.test(n)) return 'Membrane';
    return 'Joint structure';
  }
  if (key === 'lymph') return /node/.test(n) ? 'Lymph nodes' : /duct|trunk|vessel/.test(n) ? 'Lymph vessel' : 'Lymphoid organ';
  if (key === 'heart') return /valve|leaflet|cusp/.test(n) ? 'Heart valve' : /papillary/.test(n) ? 'Papillary muscle' : 'Heart chamber';
  return (key && KIND_BY_LG[key]) || 'Structure';
}

export function systemLabel(atlas: Atlas, id: number): string {
  const key = lgKey(atlas, id);
  if (key) return atlas.meta.layerGroups[atlas.lg(key)].system + ' system';
  const sys = atlas.meta.systems[atlas.items[id].s];
  return (
    { regions: 'Integumentary', skeletal: 'Skeletal', joints: 'Articular', muscular: 'Muscular', cardio: 'Cardiovascular', nervous: 'Nervous', lymph: 'Lymphatic', visceral: 'Visceral' }[sys] + ' system'
  );
}

/** Names to try when looking up muscle data: the item, then enclosing groups, then composites. */
function muscleNames(atlas: Atlas, id: number): string[] {
  const it = atlas.items[id];
  const names = [it.n];
  let p = it.p, depth = 0;
  while (p >= 0 && depth < 2) {
    const g = atlas.items[p];
    if (/^(Muscles|Muscular|.* part of muscular|.*compartment|Hypaxial|Epaxial|Superficial|Deep |Pelvic diaphragm|.* muscles$)/i.test(g.n) && !/(Triceps|Biceps|Quadriceps)/i.test(g.n)) break;
    names.push(g.n);
    p = g.p;
    depth++;
  }
  for (const [comp, members] of Object.entries(atlas.meta.composites)) {
    if (members.includes(it.n) && !names.includes(comp)) names.push(comp);
  }
  return names;
}

export function isMuscular(atlas: Atlas, id: number): boolean {
  const key = lgKey(atlas, id);
  return key === 'muscles';
}

export function getMuscleFacts(atlas: Atlas, id: number): MuscleFacts | null {
  if (!isMuscular(atlas, id)) return null;
  const r = muscleFacts(muscleNames(atlas, id));
  return r ? r.facts : null;
}

export interface AttachRef {
  att: number; // attachment item id
  bone: number; // bone item id
  kind: 'o' | 'e';
}

/** Origin / insertion areas modelled on the skeleton for a muscle (or muscle group). */
export function muscleAttachments(atlas: Atlas, id: number): AttachRef[] {
  if (!isMuscular(atlas, id)) return [];
  const it = atlas.items[id];
  const names = new Set<string>();
  const sides = new Set<string>();
  const collect = (x: number) => {
    const s = atlas.items[x];
    muscleNames(atlas, x).forEach((n) => names.add(n.toLowerCase()));
    sides.add(s.sd || '');
  };
  if (it.y === 'g') {
    names.add(it.n.toLowerCase());
    for (const s of atlas.structuresUnder(id)) collect(s);
  } else collect(id);
  const out: AttachRef[] = [];
  const seen = new Set<number>();
  const sideList = sides.has('') ? ['', 'l', 'r'] : [...sides];
  for (const n of names) {
    for (const sd of sideList) {
      for (const a of atlas.attachByMuscle.get(n + '|' + sd) || []) {
        if (seen.has(a)) continue;
        seen.add(a);
        out.push({ att: a, bone: atlas.items[a].p, kind: atlas.items[a].ak! });
      }
    }
  }
  return out;
}

export interface BoneAttach {
  name: string;
  kind: 'o' | 'e';
  atts: number[];
  side: string;
}

/** Muscles that originate from or insert on a bone, from the attachment maps. */
export function boneAttachments(atlas: Atlas, boneId: number): BoneAttach[] {
  const list = atlas.attachByBone.get(boneId) || [];
  const map = new Map<string, BoneAttach>();
  for (const a of list) {
    const it = atlas.items[a];
    const key = it.n + '|' + it.ak;
    const e = map.get(key);
    if (e) e.atts.push(a);
    else map.set(key, { name: it.n, kind: it.ak!, atts: [a], side: it.sd || '' });
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
}

const refCache = new WeakMap<Atlas, Record<string, number>>();
function refs(atlas: Atlas): Record<string, number> {
  let r = refCache.get(atlas);
  if (r) return r;
  const bone = (name: string) => {
    const id = (atlas.byName.get(name) || []).find((i) => atlas.items[i].y === 's' && atlas.items[i].b);
    return id !== undefined ? atlas.items[id].b! : null;
  };
  const hum = bone('humerus'), rad = bone('radius'), fem = bone('femur'), tib = bone('tibia'), c7 = bone('vertebra c7'), man = bone('mandible'), xi = bone('xiphoid process');
  r = {
    elbow: hum ? hum[1] : 1.1,
    wrist: rad ? rad[1] : 0.85,
    armX: hum ? Math.min(Math.abs(hum[0]), Math.abs(hum[3])) : 0.15,
    knee: fem ? fem[1] : 0.5,
    ankle: tib ? tib[1] : 0.08,
    hip: fem ? fem[4] : 0.92,
    neckBase: c7 ? c7[1] : 1.42,
    chin: man ? man[1] : 1.5,
    shoulder: hum ? hum[4] - 0.05 : 1.38,
    xiphoid: xi ? xi[1] : 1.12,
  };
  refCache.set(atlas, r);
  return r;
}

function segments(lo: number, hi: number, cuts: [number, string][], top: string): string[] {
  // cuts are descending boundaries: above cuts[0] is `top`, between cuts[i] and cuts[i+1] is cuts[i][1]
  const names = [top, ...cuts.map((c) => c[1])];
  const edges = [Infinity, ...cuts.map((c) => c[0]), -Infinity];
  const span = Math.max(hi - lo, 1e-4);
  const out: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const overlap = Math.min(hi, edges[i]) - Math.max(lo, edges[i + 1]);
    if (overlap > span * 0.22) out.push(names[i]);
  }
  return out;
}

/** Short description of where a structure sits, from its place in the atlas and its bounds. */
export function regionOf(atlas: Atlas, id: number): string {
  const ids = atlas.structuresUnder(id);
  const b = atlas.bounds(ids);
  if (!b) return '';
  const lo = b[0][1], hi = b[1][1];
  const y = (lo + hi) / 2;
  const xFar = Math.max(Math.abs(b[0][0]), Math.abs(b[1][0]));
  const xNear = b[0][0] * b[1][0] < 0 ? 0 : Math.min(Math.abs(b[0][0]), Math.abs(b[1][0]));
  const span = hi - lo;
  if (span > 1.2) return 'Whole body';
  const R = refs(atlas);
  const names = [atlas.items[id].n, ...atlas.path(id).map((p) => atlas.items[p].n)].join(' | ').toLowerCase();
  const join = (list: string[], whole: string) => (list.length === 0 ? whole : list.length <= 2 ? list.map((x, i) => (i ? x.toLowerCase() : x)).join(' and ') : whole);
  const upperName = /upper limb|shoulder|scapul|deltoid|clavic|of arm\b|forearm|of hand|\bbrachial\b|brachii|brachialis|brachioradialis|\bradial\b|\bulnar\b|palmar|axillary|pectoral girdle|humer|carpal|metacarp/.test(names);
  const lowerName = /lower limb|gluteal|gluteus|of thigh|of leg\b|of foot|femoral|femoris|tibial|fibular|plantar|popliteal|pelvic girdle|tarsal|metatars/.test(names);
  const lateral = xNear > R.armX * 0.9 && lo > R.wrist - 0.25 && hi < R.shoulder + 0.12;
  if ((upperName && !lowerName && hi > R.wrist - 0.25) || (!lowerName && lateral)) {
    return join(segments(lo, hi, [[R.shoulder, 'Arm'], [R.elbow, 'Forearm'], [R.wrist, 'Hand']], 'Shoulder'), 'Upper limb');
  }
  if (lowerName && lo < R.hip + 0.2 && xFar > 0.03) {
    return join(segments(lo, hi, [[R.hip, 'Thigh'], [R.knee, 'Leg'], [R.ankle + 0.03, 'Foot']], 'Hip and gluteal region'), 'Lower limb');
  }
  const back = /back|dorsal|epaxial|hypaxial|vertebr|spin|lumb/.test(names);
  if (y > R.chin) return 'Head';
  if (y > R.neckBase) return 'Neck';
  if (y > R.xiphoid - 0.02) return back ? 'Back (thoracic region)' : 'Thorax';
  if (y > R.hip + 0.08) return back ? 'Back (lumbar region)' : 'Abdomen';
  if (y > R.hip - 0.12) return 'Pelvis';
  return join(segments(lo, hi, [[R.hip, 'Thigh'], [R.knee, 'Leg'], [R.ankle + 0.03, 'Foot']], 'Pelvis'), 'Lower limb');
}

export { type MuscleFacts };
