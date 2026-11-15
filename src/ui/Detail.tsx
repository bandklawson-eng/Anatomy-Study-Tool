import { useEffect, useMemo, useState } from 'preact/hooks';
import { batch } from '@preact/signals';
import { loadDescription, parseArticle, type Article, type Atlas } from '../data/meta';
import { boneAttachments, getMuscleFacts, kindLabel, lgKey, muscleAttachments, regionOf, systemLabel } from '../data/facts';
import {
  detailOpen, fadeOthers, hideItems, isolate, isolated, lgOn, selLandmark, select, selection, showPins, shownAttachments, showToast, toggleLg, viewerSig,
} from '../state';
import { Icon } from './icons';
import { revealInTree } from './Sidebar';

function useArticle(atlas: Atlas, d: number | undefined): Article | null | undefined {
  const [art, setArt] = useState<Article | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setArt(undefined);
    loadDescription(atlas, d).then((t) => live && setArt(t ? parseArticle(t) : null));
    return () => { live = false; };
  }, [atlas, d]);
  return art;
}

/** Descriptions written for this app (the female structures) rather than taken from Wikipedia. */
function ownText(atlas: Atlas, d: number | undefined) {
  const f = atlas.meta.female;
  return !!f && d !== undefined && d >= f.descBucket * atlas.meta.descPerBucket;
}

function ArticleView({ art, name, own }: { art: Article | null | undefined; name: string; own?: boolean }) {
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [art]);
  if (art === undefined) return <p class="muted small">Loading description…</p>;
  if (art === null) return <p class="muted small">No reference article is available for {name} in the open atlas yet.</p>;
  const intro = more ? art.intro : art.intro.slice(0, 3);
  return (
    <div class="article">
      {intro.map((p, i) => <p key={i}>{p}</p>)}
      {more && art.sections.map((s, i) => (
        <div key={i}>
          {s.level === 2 ? <h4>{s.title}</h4> : <h5>{s.title}</h5>}
          {s.paras.map((p, j) => <p key={j}>{p}</p>)}
        </div>
      ))}
      {(art.sections.length > 0 || art.intro.length > 3) && (
        <button class="btn small" onClick={() => setMore(!more)}>{more ? 'Show less' : 'Read the full article'}</button>
      )}
      <p class="small muted" style="margin-top:10px">{own ? 'Text written for this app from standard anatomy references.' : 'Text adapted from Wikipedia via Z-Anatomy (CC BY-SA).'}</p>
    </div>
  );
}

/** Pull a named section out of the article to surface it as a key fact. */
function sectionText(art: Article | null | undefined, re: RegExp, maxParas = 2): string | null {
  if (!art) return null;
  const s = art.sections.find((x) => re.test(x.title) && x.paras.length);
  return s ? s.paras.slice(0, maxParas).join(' ') : null;
}

function Crumbs({ atlas, id }: { atlas: Atlas; id: number }) {
  const path = atlas.path(id);
  if (!path.length) return null;
  return (
    <div class="crumbs">
      {path.map((p, i) => (
        <span key={p}>
          {i > 0 && <span> › </span>}
          <button onClick={() => select(p, { focus: true })}>{atlas.items[p].n}</button>
        </span>
      ))}
    </div>
  );
}

function NameLinks({ atlas, names, side }: { atlas: Atlas; names: { name: string; kind?: 'o' | 'e'; atts?: number[] }[]; side?: string }) {
  return (
    <div class="linklist">
      {names.map((n) => (
        <button key={n.name + (n.kind || '')} class={'link ' + (n.kind || '')} onClick={() => {
          const ids = atlas.resolveName(n.name, side);
          if (!ids.length) { showToast(`${n.name} is not modelled as a separate structure`); return; }
          // prefer a group that holds exactly these structures
          let target = ids[0];
          if (ids.length > 1) {
            const cands = (atlas.byName.get(n.name.toLowerCase()) || []).filter((c) => atlas.items[c].y === 'g');
            if (cands.length) target = cands[0];
          }
          const boneLg = atlas.lg('bones');
          batch(() => {
            fadeOthers.value = true;
            select(target, { reveal: true });
            if (n.atts) {
              shownAttachments.value = new Set(n.atts);
              if (!lgOn.value[boneLg]) toggleLg(boneLg, true);
            }
          });
          viewerSig.value?.focusItems(ids, { pad: 1.5 });
        }}>{n.name}</button>
      ))}
    </div>
  );
}

function LandmarkCard({ atlas, index }: { atlas: Atlas; index: number }) {
  const lm = atlas.landmarks[index];
  const art = useArticle(atlas, lm.d);
  return (
    <>
      <div class="title" style="position:relative">
        <h1>{lm.n}</h1>
        {lm.la && <div class="latin">{lm.la}</div>}
        <div class="badges">
          <span class="badge kind">Landmark</span>
          <span class="badge">{atlas.displayName(lm.p)}</span>
        </div>
        <div class="actions">
          <button class="btn small" onClick={() => (selLandmark.value = null)}><Icon name="back" /> Back to {atlas.items[lm.p].n}</button>
        </div>
        <button class="iconbtn close" aria-label="Close" onClick={() => select(null)}><Icon name="close" /></button>
      </div>
      <div class="panel-body">
        <div class="fact"><div class="k">Location</div>A named feature of the {atlas.displayName(lm.p).toLowerCase()}, marked by the highlighted pin.</div>
        <div class="sect"><h3>About</h3><ArticleView art={art} name={lm.n} /></div>
      </div>
    </>
  );
}

export function Detail({ atlas }: { atlas: Atlas }) {
  const id = selection.value;
  const lmIndex = selLandmark.value;
  const collapsed = !detailOpen.value;
  const viewer = viewerSig.value;

  // landmark pins follow the selection
  const pins = useMemo(() => (id !== null ? atlas.landmarksOf.get(id) || [] : []), [atlas, id]);
  useEffect(() => {
    if (!viewer) return;
    viewer.setPins(showPins.value ? pins.map((i) => ({ index: i, lm: atlas.landmarks[i] })) : []);
    viewer.onPinClick = (i) => { selLandmark.value = i; detailOpen.value = true; };
  }, [viewer, pins, showPins.value]);
  useEffect(() => {
    viewer?.highlightPin(lmIndex !== null ? pins.indexOf(lmIndex) : null);
  }, [viewer, lmIndex, pins]);

  if (id === null) return null;
  const grip = <button class="sheet-grip" aria-label={collapsed ? 'Expand details' : 'Collapse details'} onClick={() => (detailOpen.value = collapsed)} />;
  if (lmIndex !== null) {
    return <aside class={'detail' + (collapsed ? ' collapsed' : '')}>{grip}<LandmarkCard atlas={atlas} index={lmIndex} /></aside>;
  }
  return <aside class={'detail' + (collapsed ? ' collapsed' : '')} aria-label="Structure details">{grip}<ItemCard atlas={atlas} id={id} pins={pins} /></aside>;
}

function ItemCard({ atlas, id, pins }: { atlas: Atlas; id: number; pins: number[] }) {
  const it = atlas.items[id];
  const viewer = viewerSig.value;
  const art = useArticle(atlas, it.d);
  const ids = useMemo(() => atlas.structuresUnder(id), [atlas, id]);
  const key = lgKey(atlas, id);
  const mf = useMemo(() => getMuscleFacts(atlas, id), [atlas, id]);
  const mAtt = useMemo(() => muscleAttachments(atlas, id), [atlas, id]);
  const bAtt = useMemo(() => (it.y === 's' ? boneAttachments(atlas, id) : []), [atlas, id]);
  const other = atlas.contralateral(id);
  const isIso = isolated.value !== null;
  const shown = shownAttachments.value;
  const region = regionOf(atlas, id);

  const showMuscleAttachments = () => {
    const boneLg = atlas.lg('bones');
    batch(() => {
      shownAttachments.value = new Set(mAtt.map((a) => a.att));
      fadeOthers.value = true;
      if (!lgOn.value[boneLg]) toggleLg(boneLg, true);
    });
    const all = [...ids, ...mAtt.map((a) => a.bone)];
    viewer?.focusItems(all, { pad: 1.2 });
  };
  const origins = [...new Set(mAtt.filter((a) => a.kind === 'o').map((a) => a.bone))];
  const insertions = [...new Set(mAtt.filter((a) => a.kind === 'e').map((a) => a.bone))];

  const funcText = !mf ? sectionText(art, /^(function|functions|actions?)$/i) : null;
  const nerveText = !mf ? sectionText(art, /^(nerve supply|innervation)$/i, 1) : null;
  const bloodText = !mf ? sectionText(art, /^(blood supply|vasculature)$/i, 1) : null;
  const courseText = sectionText(art, /^(course|structure)$/i, 1);
  const branchText = key === 'arteries' || key === 'nerves' || key === 'veins' ? sectionText(art, /^(branches|tributaries)$/i, 2) : null;

  return (
    <>
      <div class="title" style="position:relative">
        <h1>{it.n}</h1>
        {it.la && <div class="latin">{it.la}</div>}
        <div class="badges">
          <span class="badge kind">{kindLabel(atlas, id)}</span>
          {it.sd && <span class="badge side">{it.sd === 'l' ? 'Left side' : 'Right side'}</span>}
          <span class="badge">{systemLabel(atlas, id)}</span>
          {it.y === 'g' && <span class="badge">{ids.length} structures</span>}
        </div>
        <div class="actions">
          <button class="btn small" onClick={() => viewer?.focusItems(ids, { pad: ids.length > 1 ? 1.2 : 1.45 })}><Icon name="focus" /> Focus</button>
          <button class={'btn small' + (isIso ? ' primary' : '')} onClick={() => isolate(isIso ? null : ids)}><Icon name="isolate" /> {isIso ? 'Show rest' : 'Isolate'}</button>
          <button class={'btn small' + (fadeOthers.value ? ' primary' : '')} onClick={() => (fadeOthers.value = !fadeOthers.value)}><Icon name="xray" /> X-ray</button>
          <button class="btn small" onClick={() => { hideItems(ids); select(null); showToast('Hidden. Use Show all to bring it back.'); }}><Icon name="eyeOff" /> Hide</button>
          {other !== null && <button class="btn small" onClick={() => select(other, { focus: true, reveal: true })}><Icon name="swap" /> {it.sd === 'l' ? 'Right' : 'Left'} side</button>}
        </div>
        <button class="iconbtn close" aria-label="Close" onClick={() => select(null)}><Icon name="close" /></button>
      </div>
      <div class="panel-body">
        <div class="facts">
          <div class="fact">
            <div class="k">Location</div>
            {region && <div>{region}{it.sd ? `, ${it.sd === 'l' ? 'left' : 'right'} side` : ''}</div>}
            <Crumbs atlas={atlas} id={id} />
            <button class="chip" style="margin-top:6px" onClick={() => revealInTree(atlas, id)}>Show in browser</button>
          </div>
          {it.syn && it.syn.length > 0 && <div class="fact"><div class="k">Also called</div>{it.syn.join(', ')}</div>}
          {mf && (
            <>
              <div class="fact o"><div class="k">Origin</div>{mf.o}</div>
              <div class="fact i"><div class="k">Insertion</div>{mf.i}</div>
              <div class="fact"><div class="k">Action</div>{mf.a}</div>
              <div class="fact"><div class="k">Innervation</div>{mf.n}</div>
              {mf.b && <div class="fact"><div class="k">Blood supply</div>{mf.b}</div>}
            </>
          )}
          {funcText && <div class="fact"><div class="k">Function</div>{funcText}</div>}
          {nerveText && <div class="fact"><div class="k">Innervation</div>{nerveText}</div>}
          {bloodText && <div class="fact"><div class="k">Blood supply</div>{bloodText}</div>}
          {branchText && <div class="fact"><div class="k">Branches</div>{branchText}</div>}
          {!mf && courseText && key !== 'bones' && <div class="fact"><div class="k">Structure</div>{courseText}</div>}
        </div>

        {mAtt.length > 0 && (
          <div class="sect">
            <h3>Attachments on the skeleton</h3>
            {origins.length > 0 && (
              <div style="margin-bottom:6px">
                <div class="small muted" style="margin-bottom:3px">Origin (red)</div>
                <div class="linklist">{origins.map((b) => <button class="link o" key={b} onClick={() => select(b, { focus: true, reveal: true })}>{atlas.displayName(b)}</button>)}</div>
              </div>
            )}
            {insertions.length > 0 && (
              <div style="margin-bottom:8px">
                <div class="small muted" style="margin-bottom:3px">Insertion (blue)</div>
                <div class="linklist">{insertions.map((b) => <button class="link e" key={b} onClick={() => select(b, { focus: true, reveal: true })}>{atlas.displayName(b)}</button>)}</div>
              </div>
            )}
            <button class={'btn small' + (shown.size ? ' primary' : '')} onClick={() => (shown.size ? (shownAttachments.value = new Set()) : showMuscleAttachments())}>
              {shown.size ? 'Hide attachment areas' : 'Show attachment areas in 3D'}
            </button>
          </div>
        )}

        {bAtt.length > 0 && (
          <div class="sect">
            <h3>Muscles attaching to this bone</h3>
            <div class="small muted" style="margin-bottom:3px">Origins (red)</div>
            <NameLinks atlas={atlas} side={it.sd} names={bAtt.filter((a) => a.kind === 'o')} />
            <div class="small muted" style="margin:8px 0 3px">Insertions (blue)</div>
            <NameLinks atlas={atlas} side={it.sd} names={bAtt.filter((a) => a.kind === 'e')} />
            <div style="margin-top:8px">
              <button class={'btn small' + (shown.size ? ' primary' : '')} onClick={() => {
                if (shown.size) shownAttachments.value = new Set();
                else batch(() => { shownAttachments.value = new Set(bAtt.flatMap((a) => a.atts)); isolate(ids); });
              }}>{shown.size ? 'Hide attachment map' : 'Show attachment map on the bone'}</button>
            </div>
          </div>
        )}

        {pins.length > 0 && (
          <div class="sect">
            <h3>Landmarks ({pins.length})</h3>
            <div class="linklist">
              {pins.map((i) => (
                <button class="link" key={i} onClick={() => {
                  selLandmark.value = i;
                  showPins.value = true;
                  const a = atlas.landmarks[i].a;
                  const r = 0.06;
                  viewer?.focusBounds([a[0] - r, a[1] - r, a[2] - r], [a[0] + r, a[1] + r, a[2] + r], { pad: 1.6 });
                }}>{atlas.landmarks[i].n}</button>
              ))}
            </div>
            <button class="chip" style="margin-top:8px" onClick={() => (showPins.value = !showPins.value)}>{showPins.value ? 'Hide pins' : 'Show pins'}</button>
          </div>
        )}

        {it.y === 'g' && (
          <div class="sect">
            <h3>Contains</h3>
            <div class="linklist">
              {atlas.children[id].slice(0, 60).map((c) => (
                <button class="link" key={c} onClick={() => select(c, { focus: true, reveal: true })}>{atlas.displayName(c)}</button>
              ))}
            </div>
          </div>
        )}

        <div class="sect">
          <h3>About</h3>
          <ArticleView art={art} name={it.n} own={ownText(atlas, it.d)} />
        </div>
      </div>
    </>
  );
}
