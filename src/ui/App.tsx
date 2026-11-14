import { useEffect, useRef, useState } from 'preact/hooks';
import { loadAtlas, type Atlas } from '../data/meta';
import { Viewer } from '../viewer/Viewer';
import {
  bindViewer, detailOpen, fadeOthers, hideItems, hoverInfo, initState, isolate, isolated, loading, mode, panel, pickHandler, sceneOverride, select, selectedSet, selection, showToast, toast, viewerSig,
} from '../state';
import { Icon, Logo } from './icons';
import { Search } from './Search';
import { Sidebar } from './Sidebar';
import { Detail } from './Detail';
import { Toolbar } from './Toolbar';
import { About } from './About';
import * as stateModule from '../state';
import { PhysioPanel } from '../physio/PhysioPanel';
import { StudyPanel } from '../study/StudyPanel';

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [about, setAbout] = useState(false);

  useEffect(() => {
    let viewer: Viewer | null = null;
    loadAtlas()
      .then((a) => {
        initState(a);
        viewer = new Viewer(canvas.current!, labels.current!, a);
        bindViewer(viewer, a);
        viewer.resetView();
        viewer.onPick = (id) => {
          const h = pickHandler.value;
          if (h) h(id);
          else if (mode.value === 'explore') select(id >= 0 ? id : null);
        };
        viewer.onError = (msg) => showToast(msg);
        viewer.onHover = (id, x, y) => (hoverInfo.value = id >= 0 ? { id, x, y } : null);
        if (window.innerWidth >= 861) panel.value = 'layers';
        (window as any).viewer = viewer;
        (window as any).atlas = a;
        (window as any).app = stateModule;
        setAtlas(a);
      })
      .catch((e) => setError(String(e?.message || e)));
    return () => viewer?.dispose();
  }, []);

  // centre the model in the part of the screen not covered by panels
  useEffect(() => {
    if (!atlas) return;
    const update = () => {
      const v = viewerSig.value;
      if (!v) return;
      const W = window.innerWidth, H = window.innerHeight;
      let l = 0, r = 0, b = 0;
      for (const el of document.querySelectorAll<HTMLElement>('.sidebar, .detail, .workpanel')) {
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 || rc.height === 0) continue;
        if (W < 861 && el.classList.contains('sidebar')) continue;
        if (rc.width > W * 0.8) b = Math.max(b, H - rc.top);
        else if (rc.left > W / 2) r = Math.max(r, W - rc.left);
        else if (W >= 861) l = Math.max(l, rc.right);
      }
      v.setInsets(l, r, b);
    };
    update();
    const id = window.setInterval(update, 350);
    return () => window.clearInterval(id);
  }, [atlas]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && /INPUT|SELECT|TEXTAREA/.test(t.tagName)) return;
      const a = atlas, v = viewerSig.value;
      if (!a || !v || mode.value !== 'explore') return;
      const ids = [...selectedSet.value];
      if (e.key === 'Escape') select(null);
      else if (e.key === 'f' && ids.length) v.focusItems(ids, { pad: 1.6 });
      else if (e.key === 'h' && ids.length) { hideItems(ids); select(null); }
      else if (e.key === 'i' && ids.length) isolate(isolated.value ? null : ids);
      else if (e.key === 'x') fadeOthers.value = !fadeOthers.value;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [atlas]);

  const m = mode.value;
  const hov = hoverInfo.value;
  const setMode = (next: typeof m) => {
    if (next === m) return;
    sceneOverride.value = null;
    pickHandler.value = null;
    mode.value = next;
    if (next !== 'explore') panel.value = null;
  };

  return (
    <>
      <div class="stage">
        <canvas ref={canvas} tabIndex={0} aria-label="3D anatomy view" />
        <div class="labels" ref={labels} />
      </div>
      {!atlas && (
        <div class="splash">
          <div>
            <div style="width:64px;margin:0 auto"><Logo /></div>
            <h1>Anatomy Atlas</h1>
            {error ? <p style="color:var(--red)">{error}</p> : <><p class="muted">Loading the human body…</p><div class="spinner" /></>}
          </div>
        </div>
      )}
      <header class="topbar">
        <button class="iconbtn only-mobile" aria-label="Layers and browser" onClick={() => (panel.value = panel.value ? null : 'layers')}><Icon name="menu" /></button>
        <div class="brand"><Logo /><span>Anatomy Atlas</span></div>
        {atlas && m === 'explore' && <Search atlas={atlas} />}
        <nav class="tabs" aria-label="Mode">
          <button class={m === 'explore' ? 'on' : ''} onClick={() => setMode('explore')}>Explore</button>
          <button class={m === 'physio' ? 'on' : ''} onClick={() => setMode('physio')}>Physiology</button>
          <button class={m === 'study' ? 'on' : ''} onClick={() => setMode('study')}>Study</button>
        </nav>
        <button class="iconbtn" aria-label="About, offline use and credits" onClick={() => setAbout(true)}><Icon name="info" /></button>
      </header>
      {atlas && m === 'explore' && (
        <>
          <Sidebar atlas={atlas} />
          <Detail atlas={atlas} />
          <Toolbar atlas={atlas} />
          {selection.value === null && !panel.value && window.innerWidth < 861 && detailOpen.value && null}
        </>
      )}
      {atlas && m === 'physio' && <PhysioPanel atlas={atlas} />}
      {atlas && m === 'study' && <StudyPanel atlas={atlas} />}
      {loading.value > 0 && <div class="loading-pill"><div class="spinner" />Loading anatomy…</div>}
      {hov && atlas && m === 'explore' && <div class="tooltip" style={`left:${hov.x}px;top:${hov.y}px`}>{atlas.displayName(hov.id)}</div>}
      {toast.value && <div class="toast" role="status">{toast.value}</div>}
      {about && atlas && <About atlas={atlas} onClose={() => setAbout(false)} />}
    </>
  );
}
