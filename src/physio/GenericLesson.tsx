import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import type { Atlas } from '../data/meta';
import { mode, pickHandler, sceneOverride, select, viewerSig } from '../state';
import { Icon } from '../ui/icons';
import { Squeezer, buildWant, flowMaterial, flowUniforms, glowMaterial } from './scene';
import { pickIds, type Lesson } from './lessons';

const SPEEDS = [0.25, 0.5, 1];

function centreOf(atlas: Atlas, ids: number[]): THREE.Vector3 {
  const b = atlas.bounds(ids);
  if (!b) return new THREE.Vector3(0, 1.2, 0);
  return new THREE.Vector3((b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2);
}

export function GenericLesson({ atlas, lesson, onBack }: { atlas: Atlas; lesson: Lesson; onBack: () => void }) {
  const viewer = viewerSig.value!;
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const live = useRef({ p: 0, playing, speed, stage: 0 });
  live.current.playing = playing;
  live.current.speed = speed;
  live.current.stage = lesson.steps[step]?.stage ?? 0;

  const sets = useMemo(() => {
    const normal = new Set<number>();
    lesson.normal.forEach((s) => pickIds(atlas, s).forEach((i) => normal.add(i)));
    const ghost = new Set<number>();
    (lesson.ghost || []).forEach((s) => pickIds(atlas, s).forEach((i) => !normal.has(i) && ghost.add(i)));
    const stepIds = lesson.steps.map((s) => (s.names ? s.names.flatMap((n) => atlas.resolveName(n, s.side)) : []));
    return { normal: [...normal], ghost: [...ghost], stepIds };
  }, [atlas, lesson]);

  // scene
  useEffect(() => {
    const selected = new Set<number>(sets.stepIds[step]);
    if (picked !== null) selected.add(picked);
    sceneOverride.value = { want: buildWant(atlas, [...sets.normal, ...selected], sets.ghost), selected };
  }, [sets, step, picked]);

  // camera
  useEffect(() => {
    const f = lesson.focus;
    const ids = f ? pickIds(atlas, f) : sets.normal;
    const b = atlas.bounds(ids);
    if (b) viewer.focusBounds(b[0], b[1], { pad: f?.pad ?? 1.1 });
  }, [lesson]);

  // materials and animation
  useEffect(() => {
    const overrides = new Map<number, THREE.Material>();
    const mats: THREE.Material[] = [];
    const beats: { u: { value: number }; rate: number; dir?: (p: number) => 1 | -1; dirU: { value: number } }[] = [];
    for (const f of lesson.flows || []) {
      const ids = pickIds(atlas, f);
      if (!ids.length) continue;
      let origin: THREE.Vector3;
      if (typeof f.origin === 'string') {
        const o = atlas.resolveName(f.origin, f.originSide);
        origin = centreOf(atlas, o.length ? o : ids);
        // for a long structure (a nerve), start from its upper end
        const ob = atlas.bounds(o);
        if (ob && ob[1][1] - ob[0][1] > 0.15) origin.y = ob[1][1];
      } else origin = new THREE.Vector3(...f.origin);
      const u = flowUniforms(origin, f.waves, f.dir ?? 1, f.strength ?? 1);
      const m = flowMaterial({ color: f.color, glow: f.glow, uniforms: u, sharp: f.sharp, opacity: f.opacity });
      mats.push(m);
      beats.push({ u: u.uBeat, rate: f.rate ?? 1, dir: f.dirAt, dirU: u.uDir });
      ids.forEach((i) => overrides.set(i, m));
    }
    const glows: { level: { value: number }; fn: (p: number) => number }[] = [];
    for (const g of lesson.glows || []) {
      const ids = pickIds(atlas, g);
      if (!ids.length) continue;
      const level = { value: 0 };
      const m = glowMaterial(g.color, g.glow, level, g.opacity);
      mats.push(m);
      glows.push({ level, fn: g.level });
      ids.forEach((i) => overrides.set(i, m));
    }
    for (const [id, m] of overrides) viewer.overrides.set(id, m);
    viewer.refreshItems(overrides.keys());

    const sq = new Squeezer(viewer);
    const motions = (lesson.motions || []).map((m) => {
      const ids = pickIds(atlas, m);
      const b = atlas.bounds(ids);
      const pivot = b ? new THREE.Vector3(...[0, 1, 2].map((k) => b[0][k] + (b[1][k] - b[0][k]) * m.pivot[k]) as [number, number, number]) : new THREE.Vector3();
      return { ids, pivot, at: m.at };
    });

    let lastStatus = '';
    const L = live.current;
    const remove = viewer.addFrame((_t, dt) => {
      if (L.playing) L.p = (L.p + (dt * L.speed) / lesson.period) % 1;
      const p = L.p;
      for (const b of beats) {
        if (L.playing) b.u.value += (dt * L.speed * b.rate) / lesson.period;
        if (b.dir) b.dirU.value = b.dir(p);
      }
      for (const g of glows) g.level.value = g.fn(p);
      for (const m of motions) {
        const [sx, sy, sz, ty] = m.at(p);
        for (const id of m.ids) sq.set(id, m.pivot, sx, sy, sz, ty);
      }
      const c = canvasRef.current;
      if (c && lesson.diagram) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cw = c.clientWidth || 440;
        const w = Math.round(cw * dpr), h = Math.round(cw * (lesson.diagram.height / 440) * dpr);
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        const ctx = c.getContext('2d')!;
        ctx.setTransform(dpr * (cw / 440), 0, 0, dpr * (cw / 440), 0, 0);
        ctx.clearRect(0, 0, 440, lesson.diagram.height);
        lesson.diagram.draw(ctx, p, L.stage);
      }
      if (lesson.status && statusRef.current) {
        const s = lesson.status(p);
        if (s !== lastStatus) { lastStatus = s; statusRef.current.textContent = s; }
      }
    });
    return () => {
      remove();
      sq.restore();
      for (const id of overrides.keys()) viewer.overrides.delete(id);
      viewer.refreshItems(overrides.keys());
      mats.forEach((m) => m.dispose());
    };
  }, [lesson]);

  useEffect(() => {
    pickHandler.value = (id: number) => setPicked(id >= 0 ? id : null);
    return () => {
      pickHandler.value = null;
      sceneOverride.value = null;
    };
  }, []);

  const goStep = (i: number) => {
    setStep(i);
    setPicked(null);
    const ids = sets.stepIds[i];
    if (ids.length) {
      const b = atlas.bounds(ids);
      if (b) viewer.focusBounds(b[0], b[1], { pad: ids.length > 2 ? 1.3 : 1.8 });
    } else {
      const f = lesson.focus;
      const b = atlas.bounds(f ? pickIds(atlas, f) : sets.normal);
      if (b) viewer.focusBounds(b[0], b[1], { pad: f?.pad ?? 1.1 });
    }
  };
  const s = lesson.steps[step];
  const missing = s.names && sets.stepIds[step].length === 0;

  return (
    <>
      <div class="panel-head">
        <button class="iconbtn" aria-label="Back to lessons" onClick={onBack}><Icon name="back" /></button>
        <h2>{lesson.title}</h2>
      </div>
      <div class="panel-body">
        {lesson.diagram && <canvas ref={canvasRef} class="diagram" style={`aspect-ratio: 440 / ${lesson.diagram.height}`} aria-label={lesson.diagram.label} />}
        <div class="transport">
          <button class="btn small" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} />{playing ? 'Pause' : 'Play'}
          </button>
          <div class="seg" style="flex:none">
            {SPEEDS.map((v) => <button key={v} class={speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>{v === 1 ? '1×' : v === 0.5 ? '½×' : '¼×'}</button>)}
          </div>
          {lesson.status && <span class="small muted grow" ref={statusRef} />}
        </div>
        {picked !== null && (
          <div class="phase" style="background:rgba(255,201,60,0.08);border-color:rgba(255,201,60,0.35);display:flex;gap:8px;align-items:center">
            <span style="flex:1">Tapped: <b style="color:var(--gold)">{atlas.displayName(picked)}</b></span>
            <button class="btn small" onClick={() => { const id = picked; mode.value = 'explore'; sceneOverride.value = null; pickHandler.value = null; select(id, { focus: true, reveal: true }); }}>Open in Explore</button>
          </div>
        )}
        <div class="phase">
          <b>{step + 1}. {s.title}</b>
          <p class="small" style="margin-top:4px">{s.text}</p>
          {missing && <p class="small muted" style="margin-top:4px">This structure is not modelled in the open atlas.</p>}
        </div>
        <div class="transport">
          <button class="btn small" disabled={step === 0} onClick={() => goStep(step - 1)}>Previous</button>
          <button class="btn small primary" disabled={step === lesson.steps.length - 1} onClick={() => goStep(step + 1)}>Next step</button>
        </div>
        <ol class="route" style="margin-top:10px">
          {lesson.steps.map((st, i) => (
            <li key={i}>
              <button class={i === step ? 'on' : ''} onClick={() => goStep(i)}><span class="num">{i + 1}</span>{st.title}</button>
            </li>
          ))}
        </ol>
        {lesson.facts && (
          <dl class="kv" style="margin-top:12px">
            {lesson.facts.map(([k, v]) => [<dt key={k + 'k'}>{k}</dt>, <dd key={k + 'v'}>{v}</dd>])}
          </dl>
        )}
        {lesson.note && <p class="small muted" style="margin-top:8px">{lesson.note}</p>}
      </div>
    </>
  );
}
