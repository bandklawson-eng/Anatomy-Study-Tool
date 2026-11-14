import { signal, computed, effect, batch } from '@preact/signals';
import type { Atlas } from './data/meta';
import { GHOST, HIDDEN, NORMAL, Viewer } from './viewer/Viewer';

export type Mode = 'explore' | 'physio' | 'study';

export const atlasSig = signal<Atlas | null>(null);
export const viewerSig = signal<Viewer | null>(null);

export const mode = signal<Mode>('explore');
/** layer group on/off */
export const lgOn = signal<boolean[]>([]);
/** layer group depth 1..10 (10 = everything, lower values peel superficial layers away) */
export const lgDepth = signal<number[]>([]);
/** individually hidden items */
export const hidden = signal<Set<number>>(new Set());
/** when set, only these items are shown */
export const isolated = signal<Set<number> | null>(null);
export const fadeOthers = signal(false);
/** selected item id (structure or group) */
export const selection = signal<number | null>(null);
/** selected landmark index */
export const selLandmark = signal<number | null>(null);
export const showPins = signal(true);
/** attachment ids to display for the current selection */
export const shownAttachments = signal<Set<number>>(new Set());
export const colorByAction = signal(false);
export const clip = signal<{ axis: 0 | 1 | 2; pos: number; flip: boolean } | null>(null);
export const loading = signal(0);
export const hoverInfo = signal<{ id: number; x: number; y: number } | null>(null);
export const panel = signal<'layers' | 'browse' | null>(null);
export const detailOpen = signal(true);
export const toast = signal<string | null>(null);
/** Set by study / physiology modes to fully control what is visible. */
export const sceneOverride = signal<{ want: Uint8Array; selected: Set<number> } | null>(null);
/** when true, taps in the 3D view are routed to the active mode (quiz) rather than selection */
export const pickHandler = signal<((id: number) => void) | null>(null);

export const DEFAULT_ON = ['muscles', 'bones', 'joints'];

export function initState(atlas: Atlas) {
  const groups = atlas.meta.layerGroups;
  let on = groups.map((g) => DEFAULT_ON.includes(g.key));
  let depth = groups.map(() => 10);
  try {
    const saved = JSON.parse(localStorage.getItem('atlas.layers') || 'null');
    if (saved && saved.on?.length === groups.length) {
      on = saved.on;
      depth = saved.depth;
    }
  } catch {
    /* ignore */
  }
  batch(() => {
    lgOn.value = on;
    lgDepth.value = depth;
    atlasSig.value = atlas;
  });
}

/** Ids highlighted by the current selection. */
export const selectedSet = computed<Set<number>>(() => {
  const atlas = atlasSig.value;
  const sel = selection.value;
  if (!atlas || sel === null) return new Set();
  return new Set(atlas.structuresUnder(sel));
});

export function computeWant(atlas: Atlas): Uint8Array {
  const items = atlas.items;
  const want = new Uint8Array(items.length);
  const on = lgOn.value, depth = lgDepth.value, hid = hidden.value, iso = isolated.value;
  const sel = selectedSet.value;
  const fade = fadeOthers.value && sel.size > 0;
  const att = shownAttachments.value;
  const attachLg = atlas.lg('attach');
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.g === undefined) continue;
    let vis: boolean;
    if (it.y === 'a') {
      vis = att.has(i) || (on[attachLg] && on[atlas.lg('bones')] && !iso);
    } else if (iso) {
      vis = iso.has(i);
    } else {
      vis = (on[it.g] && (!it.L || it.L <= depth[it.g]) && !hid.has(i)) || sel.has(i);
    }
    if (!vis) continue;
    want[i] = fade && !sel.has(i) && !att.has(i) ? GHOST : NORMAL;
  }
  return want;
}

export function bindViewer(viewer: Viewer, atlas: Atlas) {
  viewerSig.value = viewer;
  viewer.onLoading = (n) => (loading.value = n);
  effect(() => {
    const ov = sceneOverride.value;
    if (ov) viewer.apply(ov.want, ov.selected);
    else {
      // a bone showing its attachment map keeps its natural colour so the map stays readable
      let sel = selectedSet.value;
      const att = shownAttachments.value;
      if (att.size) {
        const bones = new Set<number>();
        att.forEach((a) => bones.add(atlas.items[a].p));
        if ([...sel].some((x) => bones.has(x))) sel = new Set([...sel].filter((x) => !bones.has(x)));
      }
      viewer.apply(computeWant(atlas), sel);
    }
  });
  effect(() => viewer.setColorByAction(colorByAction.value));
  effect(() => {
    const c = clip.value;
    if (c) viewer.setClip(c.axis, c.pos, c.flip);
    else viewer.setClip(null);
  });
  effect(() => {
    try {
      localStorage.setItem('atlas.layers', JSON.stringify({ on: lgOn.value, depth: lgDepth.value }));
    } catch {
      /* ignore */
    }
  });
}

// ---------------------------------------------------------------- actions
export function select(id: number | null, opts: { focus?: boolean; reveal?: boolean } = {}) {
  const atlas = atlasSig.value!;
  const viewer = viewerSig.value;
  batch(() => {
    selection.value = id;
    selLandmark.value = null;
    shownAttachments.value = new Set();
    if (id !== null) detailOpen.value = true;
    if (id !== null && opts.reveal) {
      // make sure the selected structures can be seen
      const ids = atlas.structuresUnder(id);
      if (hidden.value.size) {
        const h = new Set(hidden.value);
        ids.forEach((x) => h.delete(x));
        hidden.value = h;
      }
      if (isolated.value && !ids.every((x) => isolated.value!.has(x))) isolated.value = null;
    }
  });
  if (id !== null && opts.focus && viewer) {
    const ids = atlas.structuresUnder(id);
    viewer.focusItems(ids, { pad: ids.length > 1 ? 1.2 : 1.45 });
  }
}

export function toggleLg(i: number, value?: boolean) {
  const a = lgOn.value.slice();
  a[i] = value ?? !a[i];
  lgOn.value = a;
}

export function setDepth(i: number, d: number) {
  const a = lgDepth.value.slice();
  a[i] = d;
  lgDepth.value = a;
}

export function hideItems(ids: number[]) {
  const h = new Set(hidden.value);
  ids.forEach((i) => h.add(i));
  hidden.value = h;
}

export function showAll() {
  batch(() => {
    hidden.value = new Set();
    isolated.value = null;
    fadeOthers.value = false;
  });
}

export function isolate(ids: number[] | null) {
  isolated.value = ids ? new Set(ids) : null;
}

let toastTimer: number | undefined;
export function showToast(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = null), 2600);
}

export { HIDDEN, NORMAL, GHOST };
