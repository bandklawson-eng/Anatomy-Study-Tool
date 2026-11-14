import { useMemo, useRef, useState } from 'preact/hooks';
import type { Atlas } from '../data/meta';
import { kindLabel } from '../data/facts';
import { fadeOthers, selLandmark, select, viewerSig } from '../state';
import { Icon } from './icons';

interface Entry {
  id: number; // item id, or the landmark's parent item
  lm: number; // landmark index or -1
  text: string;
  name: string;
}

function buildIndex(atlas: Atlas): Entry[] {
  const out: Entry[] = [];
  atlas.items.forEach((it, id) => {
    if (it.y !== 's' && it.y !== 'g') return;
    const text = [it.n, it.la || '', ...(it.syn || [])].join(' | ').toLowerCase();
    out.push({ id, lm: -1, text, name: it.n });
  });
  atlas.landmarks.forEach((l, i) => {
    out.push({ id: l.p, lm: i, text: (l.n + ' | ' + (l.la || '')).toLowerCase(), name: l.n });
  });
  return out;
}

export function runSearch(index: Entry[], q: string, limit = 40): Entry[] {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored: [number, Entry][] = [];
  for (const e of index) {
    let ok = true;
    for (const t of tokens) if (!e.text.includes(t)) { ok = false; break; }
    if (!ok) continue;
    const n = e.name.toLowerCase();
    const ql = tokens.join(' ');
    let score = 0;
    if (n === ql) score += 100;
    else if (n.startsWith(ql)) score += 60;
    else if (n.includes(ql)) score += 30;
    if (new RegExp('\\b' + tokens[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(n)) score += 10;
    score -= n.length * 0.15;
    if (e.lm >= 0) score -= 4;
    scored.push([score, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, limit).map((s) => s[1]);
}

export function goTo(atlas: Atlas, e: { id: number; lm: number }) {
  const viewer = viewerSig.value;
  fadeOthers.value = true;
  select(e.id, { focus: e.lm < 0, reveal: true });
  if (e.lm >= 0) {
    selLandmark.value = e.lm;
    const a = atlas.landmarks[e.lm].a;
    const r = 0.07;
    viewer?.focusBounds([a[0] - r, a[1] - r, a[2] - r], [a[0] + r, a[1] + r, a[2] + r], { pad: 1.6 });
  }
}

export function Search({ atlas }: { atlas: Atlas }) {
  const index = useMemo(() => buildIndex(atlas), [atlas]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => (open ? runSearch(index, q) : []), [q, open, index]);

  const choose = (e: Entry) => {
    setOpen(false);
    input.current?.blur();
    goTo(atlas, e);
  };

  return (
    <div class="search">
      <Icon name="search" />
      <input
        ref={input}
        type="search"
        placeholder="Search 5,000+ structures and landmarks"
        aria-label="Search structures"
        value={q}
        autocomplete="off"
        autocorrect="off"
        spellcheck={false}
        onInput={(e) => { setQ((e.target as HTMLInputElement).value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setActive((a) => Math.min(results.length - 1, a + 1)); e.preventDefault(); }
          else if (e.key === 'ArrowUp') { setActive((a) => Math.max(0, a - 1)); e.preventDefault(); }
          else if (e.key === 'Enter' && results[active]) choose(results[active]);
          else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
        }}
      />
      {open && q.trim() && (
        <div class="results" role="listbox">
          {results.length === 0 && <div class="empty small">No structure matches “{q}”.</div>}
          {results.map((e, i) => {
            const it = atlas.items[e.id];
            return (
              <button key={e.lm >= 0 ? 'l' + e.lm : e.id} class={'result' + (i === active ? ' active' : '')} role="option" onMouseDown={(ev) => ev.preventDefault()} onClick={() => choose(e)}>
                <span>
                  {e.name}
                  {e.lm < 0 && it.sd && <span class="side"> · {it.sd === 'l' ? 'left' : 'right'}</span>}
                </span>
                <small>
                  {e.lm >= 0 ? `Landmark of ${atlas.displayName(e.id)}` : kindLabel(atlas, e.id)}
                  {e.lm < 0 && it.la ? ` · ${it.la}` : ''}
                </small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
