import { useMemo, useState } from 'preact/hooks';
import { batch, signal } from '@preact/signals';
import type { Atlas } from '../data/meta';
import { DEFAULT_ON, hidden, hideItems, isolated, lgDepth, lgOn, panel, select, selection, setDepth, toggleLg } from '../state';
import { Icon } from './icons';

const dissect = signal(-1);

const DISSECT_STEPS: { label: string; hint: string }[] = [
  { label: 'Skin', hint: 'Surface anatomy and body regions' },
  { label: 'Fasciae', hint: 'Skin removed: the fascial envelopes' },
  { label: 'Superficial muscles', hint: 'Fasciae removed: every muscle layer' },
  ...[9, 8, 7, 6, 5, 4, 3, 2, 1].map((d) => ({ label: `Muscle depth ${d} of 10`, hint: d > 5 ? 'Peeling the superficial muscle layers' : 'Down to the deep muscle layers' })),
  { label: 'Ligaments & joints', hint: 'Muscles removed' },
  { label: 'Skeleton', hint: 'Bones, cartilages and teeth only' },
];

function applyDissect(atlas: Atlas, v: number) {
  const on = lgOn.value.slice();
  const depth = lgDepth.value.slice();
  const set = (k: string, val: boolean) => (on[atlas.lg(k)] = val);
  set('skin', v === 0);
  set('fasciae', v <= 1);
  set('muscles', v <= 11);
  set('bursae', false);
  set('joints', v <= 12);
  set('bones', true);
  depth[atlas.lg('muscles')] = v <= 2 ? 10 : Math.max(1, 12 - v);
  batch(() => {
    dissect.value = v;
    lgOn.value = on;
    lgDepth.value = depth;
    hidden.value = new Set();
    isolated.value = null;
  });
}

const PRESETS: { label: string; keys: string[] }[] = [
  { label: 'Muscles', keys: ['muscles', 'bones', 'joints'] },
  { label: 'Skeleton', keys: ['bones'] },
  { label: 'Organs', keys: ['bones', 'heart', 'respiratory', 'digestive', 'urinary', 'genital', 'endocrine'] },
  { label: 'Vessels', keys: ['bones', 'heart', 'arteries', 'veins'] },
  { label: 'Nerves', keys: ['bones', 'cns', 'nerves', 'senses'] },
  { label: 'Lymphatics', keys: ['bones', 'lymph'] },
  { label: 'Skin', keys: ['skin'] },
  { label: 'Everything', keys: ['*'] },
];

function Layers({ atlas }: { atlas: Atlas }) {
  const groups = atlas.meta.layerGroups;
  const counts = useMemo(() => {
    const c = groups.map(() => ({ n: 0, layered: 0 }));
    for (const it of atlas.items) {
      if ((it.y === 's' || it.y === 'a') && it.g !== undefined) {
        c[it.g].n++;
        if (it.L) c[it.g].layered++;
      }
    }
    return c;
  }, [atlas]);
  const on = lgOn.value, depth = lgDepth.value;
  const bySystem = new Map<string, number[]>();
  groups.forEach((g, i) => {
    const a = bySystem.get(g.system);
    if (a) a.push(i);
    else bySystem.set(g.system, [i]);
  });
  const d = dissect.value;
  return (
    <div>
      <div class="dissect">
        <b>Dissect</b>
        <div class="small muted">{d >= 0 ? `${DISSECT_STEPS[d].label}: ${DISSECT_STEPS[d].hint}` : 'Drag to peel the body back layer by layer, from skin to skeleton.'}</div>
        <input type="range" min={0} max={DISSECT_STEPS.length - 1} step={1} value={d < 0 ? 2 : d} aria-label="Dissection depth" onInput={(e) => applyDissect(atlas, +(e.target as HTMLInputElement).value)} />
        <div class="small muted" style="display:flex;justify-content:space-between"><span>Skin</span><span>Skeleton</span></div>
      </div>
      <div class="sect">
        <h3>Quick views</h3>
        <div class="chips">
          {PRESETS.map((p) => (
            <button class="chip" onClick={() => {
              batch(() => {
                lgOn.value = groups.map((g) => (p.keys[0] === '*' ? g.key !== 'attach' && g.key !== 'skin' && g.key !== 'fasciae' : p.keys.includes(g.key)));
                lgDepth.value = groups.map(() => 10);
                hidden.value = new Set();
                isolated.value = null;
                dissect.value = -1;
              });
            }}>{p.label}</button>
          ))}
        </div>
      </div>
      {[...bySystem.entries()].map(([system, idx]) => (
        <div class="sect" key={system}>
          <h3>{system}</h3>
          {idx.map((i) => (
            <div key={i}>
              <div class="lg-row">
                <button class={'switch' + (on[i] ? ' on' : '')} role="switch" aria-checked={on[i]} aria-label={groups[i].label} onClick={() => { dissect.value = -1; toggleLg(i); }} />
                <button class="name" style="text-align:left" onClick={() => { dissect.value = -1; toggleLg(i); }}>{groups[i].label}</button>
                <span class="count">{counts[i].n}</span>
              </div>
              {on[i] && counts[i].layered > 0 && groups[i].key !== 'attach' && (
                <div class="depth">
                  <input type="range" min={1} max={10} step={1} value={depth[i]} aria-label={`${groups[i].label} depth`} onInput={(e) => { dissect.value = -1; setDepth(i, +(e.target as HTMLInputElement).value); }} />
                  <span>{depth[i] === 10 ? 'all layers' : `deep ${depth[i]}/10`}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <div class="sect">
        <button class="btn small" onClick={() => batch(() => { lgOn.value = groups.map((g) => DEFAULT_ON.includes(g.key)); lgDepth.value = groups.map(() => 10); dissect.value = -1; })}>Reset layers</button>
      </div>
    </div>
  );
}

const SYSTEM_TITLES: Record<string, string> = {
  regions: 'Surface regions', skeletal: 'Skeletal system', joints: 'Joints & ligaments', muscular: 'Muscular system',
  cardio: 'Cardiovascular system', nervous: 'Nervous system', lymph: 'Lymphatic system', visceral: 'Organs & viscera',
};

const expanded = signal<Set<number>>(new Set());

function TreeNode({ atlas, id }: { atlas: Atlas; id: number }) {
  const it = atlas.items[id];
  const kids = atlas.children[id];
  const open = expanded.value.has(id);
  const sel = selection.value === id;
  const hid = it.y === 's' && hidden.value.has(id);
  return (
    <div>
      <div class={'tree-row' + (sel ? ' sel' : '')}>
        {kids.length ? (
          <button class={'tw' + (open ? ' open' : '')} aria-label={open ? 'Collapse' : 'Expand'} onClick={() => {
            const s = new Set(expanded.value);
            if (open) s.delete(id); else s.add(id);
            expanded.value = s;
          }}><Icon name="chevron" /></button>
        ) : <span class="tw" />}
        <button class="label" style={hid ? 'opacity:.45' : ''} onClick={() => { select(id, { focus: true, reveal: true }); if (window.innerWidth < 861) panel.value = null; }}>
          {it.n}
          {it.sd && <span class="sd">{it.sd === 'l' ? 'L' : 'R'}</span>}
        </button>
        {it.y === 'g' && <span class="n">{atlas.count[id]}</span>}
        {it.y === 's' && (
          <button class="tw" aria-label={hid ? 'Show' : 'Hide'} onClick={() => {
            if (hid) { const h = new Set(hidden.value); h.delete(id); hidden.value = h; } else hideItems([id]);
          }}><Icon name={hid ? 'eyeOff' : 'eye'} style="width:14px;height:14px" /></button>
        )}
      </div>
      {open && kids.length > 0 && (
        <div class="tree-kids">
          {kids.map((k) => <TreeNode key={k} atlas={atlas} id={k} />)}
        </div>
      )}
    </div>
  );
}

function Tree({ atlas }: { atlas: Atlas }) {
  const bySys = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const r of atlas.roots) {
      const s = atlas.items[r].s;
      const a = m.get(s);
      if (a) a.push(r);
      else m.set(s, [r]);
    }
    return m;
  }, [atlas]);
  return (
    <div>
      <p class="small muted">Browse every structure by system and region. Tap a name to select it in 3D.</p>
      {[...bySys.entries()].map(([s, roots]) => (
        <div key={s}>
          <div class="tree-sys">{SYSTEM_TITLES[atlas.meta.systems[s]]}</div>
          {roots.map((r) => <TreeNode key={r} atlas={atlas} id={r} />)}
        </div>
      ))}
    </div>
  );
}

/** Expand the tree down to an item so it is visible in the browser. */
export function revealInTree(atlas: Atlas, id: number) {
  const s = new Set(expanded.value);
  for (const p of atlas.path(id)) s.add(p);
  expanded.value = s;
  panel.value = 'browse';
}

export function Sidebar({ atlas }: { atlas: Atlas }) {
  const tab = panel.value;
  if (!tab) return null;
  return (
    <aside class="sidebar" aria-label="Layers and structure browser">
      <div class="panel-head">
        <div class="seg">
          <button class={tab === 'layers' ? 'on' : ''} onClick={() => (panel.value = 'layers')}>Layers</button>
          <button class={tab === 'browse' ? 'on' : ''} onClick={() => (panel.value = 'browse')}>Browse</button>
        </div>
        <button class="iconbtn" aria-label="Close panel" onClick={() => (panel.value = null)}><Icon name="close" /></button>
      </div>
      <div class="panel-body">{tab === 'layers' ? <Layers atlas={atlas} /> : <Tree atlas={atlas} />}</div>
    </aside>
  );
}
