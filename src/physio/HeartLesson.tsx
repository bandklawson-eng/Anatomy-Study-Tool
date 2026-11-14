import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import type { Atlas } from '../data/meta';
import { clip, mode, pickHandler, sceneOverride, select, viewerSig } from '../state';
import { Icon } from '../ui/icons';
import { PHASES, atrialContraction, atrialFilling, phaseAt, ventricularContraction, EDV, ESV } from './cardiac';
import { HeartDiagram, hitDiagram, type HeartKey } from './heartDiagram';
import { drawWiggers } from './wiggers';
import { Squeezer, buildWant, flowMaterial, flowUniforms, glowMaterial, idsByLayer, idsByNames } from './scene';
import { beep } from './sound';

interface PartInfo { title: string; names: string[]; text: string }

const PARTS: Record<HeartKey, PartInfo> = {
  veins: {
    title: 'Venae cavae',
    names: ['Superior vena cava', 'Inferior vena cava (thoracic part)', 'Inferior vena cava (abdominal part)', 'Right brachiocephalic vein', 'Left brachiocephalic vein'],
    text: 'Deoxygenated blood from the whole body returns to the heart through the superior vena cava (head, neck and arms) and the inferior vena cava (trunk and legs). Both empty into the right atrium.',
  },
  RA: {
    title: 'Right atrium',
    names: ['Right atrium'],
    text: 'Receives blood from the two venae cavae and from the heart\'s own veins via the coronary sinus. Its wall holds the sinoatrial (SA) node, the pacemaker that starts every heartbeat.',
  },
  TV: {
    title: 'Tricuspid valve (right atrioventricular valve)',
    names: ['Inferior leaflet of right atrioventricular valve', 'Septal leaflet of right atrioventricular valve'],
    text: 'Leaflets tethered by chordae tendineae to papillary muscles, which stop them flipping back into the atrium. Open while the ventricle fills; it shuts at the start of systole, which is part of the first heart sound (S1). The open atlas models two of its three leaflets.',
  },
  RV: {
    title: 'Right ventricle',
    names: ['Right ventricle', 'Inferior papillary muscle of right ventricle', 'Anterior papillary muscle of right ventricle', 'Septal papillary muscle of right ventricle'],
    text: 'Pumps blood a short distance through the lungs at low pressure (about 25/8 mmHg), so its wall is only 3 to 5 mm thick. It forms most of the front surface of the heart.',
  },
  PV: {
    title: 'Pulmonary valve',
    names: ['Anterior semilunar leaflet of pulmonary valve', 'Left semilunar leaflet of pulmonary valve', 'Right semilunar leaflet of pulmonary valve'],
    text: 'Three semilunar cusps at the outlet of the right ventricle. They open when ventricular pressure exceeds pulmonary artery pressure and close when it falls at the end of systole (part of S2).',
  },
  PA: {
    title: 'Pulmonary trunk and arteries',
    names: ['Pulmonary trunk', 'Bifurcation of pulmonary trunk', 'Left pulmonary artery', 'Right pulmonary artery'],
    text: 'The pulmonary trunk divides under the aortic arch into the right and left pulmonary arteries. They are the only arteries in the adult that carry deoxygenated blood.',
  },
  lungs: {
    title: 'Lungs: gas exchange',
    names: ['Superior lobe of right lung', 'Middle lobe of right lung', 'Inferior lobe of right lung', 'Superior lobe of left lung', 'Inferior lobe of left lung'],
    text: 'In the capillaries around about 300 million alveoli, blood gives up carbon dioxide and takes up oxygen. Haemoglobin saturation rises from about 75% to 98% in well under a second.',
  },
  PVn: {
    title: 'Pulmonary veins',
    names: ['Right superior pulmonary vein', 'Right inferior pulmonary vein', 'Left superior pulmonary vein', 'Left inferior pulmonary vein'],
    text: 'Usually four pulmonary veins, two from each lung, return oxygen-rich blood to the left atrium. They are the only veins in the adult that carry oxygenated blood.',
  },
  LA: {
    title: 'Left atrium',
    names: ['Left atrium'],
    text: 'Receives the pulmonary veins. It is the most posterior chamber, lying directly in front of the oesophagus, which is why an enlarged left atrium can be seen on a swallow study.',
  },
  MV: {
    title: 'Mitral valve (left atrioventricular, bicuspid)',
    names: ['Posterior leaflet of left atrioventricular valve'],
    text: 'Two leaflets anchored by chordae tendineae to the papillary muscles of the left ventricle. Its closure is the loudest part of S1, best heard at the apex. The open atlas models its posterior leaflet.',
  },
  LV: {
    title: 'Left ventricle',
    names: ['Left ventricle', 'Inferior papillary muscle of left ventricle'],
    text: 'Generates the pressure that drives blood round the whole body (about 120/80 mmHg), so its wall (8 to 12 mm) is about three times thicker than the right ventricle\'s. It forms the apex of the heart.',
  },
  AV: {
    title: 'Aortic valve',
    names: ['Left coronary leaflet', 'Non-coronary leaflet', 'Right coronary leaflet'],
    text: 'Three semilunar cusps named after the coronary arteries that open from the sinuses just above them: right coronary, left coronary and non-coronary. Their closure is the main part of S2.',
  },
  Ao: {
    title: 'Aorta',
    names: ['Ascending aorta', 'Aortic arch', 'Thoracic aorta', 'Abdominal aorta', 'Brachiocephalic trunk', 'Left common carotid artery', 'Right common carotid artery', 'Left subclavian artery', 'Right subclavian artery'],
    text: 'The ascending aorta gives off the coronary arteries; the arch gives off the brachiocephalic trunk, left common carotid and left subclavian arteries; the descending aorta runs through the thorax and abdomen to supply the trunk and legs.',
  },
  body: {
    title: 'Body tissues and the heart\'s own supply',
    names: ['Right coronary artery', 'Left coronary artery', 'Coronary sinus', 'Great cardiac vein', 'Middle cardiac vein'],
    text: 'Systemic capillaries hand oxygen and nutrients to every tissue and collect carbon dioxide and waste. The heart muscle itself is fed by the right and left coronary arteries and drained by the cardiac veins into the coronary sinus.',
  },
};

const ROUTE: HeartKey[] = ['veins', 'RA', 'TV', 'RV', 'PV', 'PA', 'lungs', 'PVn', 'LA', 'MV', 'LV', 'AV', 'Ao', 'body'];

const SPEEDS = [0.25, 0.5, 1];

export function HeartLesson({ atlas, onBack }: { atlas: Atlas; onBack: () => void }) {
  const viewer = viewerSig.value!;
  const [tab, setTab] = useState<'cycle' | 'route'>('cycle');
  const [view, setView] = useState<'heart' | 'body'>('heart');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.5);
  const [bpm, setBpm] = useState(72);
  const [cut, setCut] = useState(false);
  const [oxColors, setOxColors] = useState(true);
  const [sound, setSound] = useState(false);
  const [phaseKey, setPhaseKey] = useState(PHASES[0].key);
  const [hl, setHl] = useState<HeartKey | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const diagRef = useRef<HTMLCanvasElement>(null);
  const wigRef = useRef<HTMLCanvasElement>(null);
  const readRef = useRef<HTMLSpanElement>(null);
  const live = useRef({ p: 0.62, playing, speed, bpm, sound, hl, lastPhase: '' });
  live.current.playing = playing;
  live.current.speed = speed;
  live.current.bpm = bpm;
  live.current.sound = sound;
  live.current.hl = hl;

  // ids used by the lesson
  const ids = useMemo(() => {
    const heart = idsByLayer(atlas, ['heart']);
    const byKey = {} as Record<HeartKey, number[]>;
    (Object.keys(PARTS) as HeartKey[]).forEach((k) => (byKey[k] = idsByNames(atlas, PARTS[k].names)));
    const vessels = [...new Set([...byKey.veins, ...byKey.PA, ...byKey.PVn, ...byKey.Ao, ...byKey.body])];
    const lungs = idsByNames(atlas, [...PARTS.lungs.names, 'Trachea', 'Left main bronchus', 'Right main bronchus']);
    const isPulm = (id: number) => /pulmonary|lobar|segmental artery|segmental vein/i.test(atlas.items[id].n) || atlas.path(id).some((a) => /pulmonary/i.test(atlas.items[a].n));
    const arteries = idsByLayer(atlas, ['arteries']);
    const veins = idsByLayer(atlas, ['veins']);
    return { heart, byKey, vessels, lungs, arteries, veins, isPulm, skin: idsByLayer(atlas, ['skin']) };
  }, [atlas]);

  // ------------------------------------------------------------ scene
  useEffect(() => {
    const normal = view === 'heart' ? [...ids.heart, ...ids.vessels] : [...ids.heart, ...ids.arteries, ...ids.veins];
    const ghost = view === 'heart' ? ids.lungs : [...ids.skin, ...ids.lungs];
    const selected = new Set<number>();
    if (hl) ids.byKey[hl].forEach((x) => selected.add(x));
    if (picked !== null) selected.add(picked);
    const extra = [...selected];
    sceneOverride.value = { want: buildWant(atlas, [...normal, ...extra], ghost), selected };
  }, [view, hl, picked, ids]);

  useEffect(() => {
    const b = atlas.bounds(view === 'heart' ? [...ids.heart, ...ids.byKey.Ao.slice(0, 2), ...ids.byKey.veins.slice(0, 1)] : ids.skin);
    if (view === 'heart' && b) viewer.focusBounds(b[0], b[1], { pad: 1.15 });
    else viewer.resetView();
  }, [view]);

  useEffect(() => {
    if (cut && view === 'heart') viewer.setClip(2, 0.036, false);
    else viewer.setClip(null);
    return () => {
      const c = clip.value;
      if (c) viewer.setClip(c.axis, c.pos, c.flip);
      else viewer.setClip(null);
    };
  }, [cut, view]);

  // ------------------------------------------------------------ materials and animation
  useEffect(() => {
    const levelA = { value: 0 }, levelV = { value: 0 };
    const red = 0xb8453d, blue = 0x5a6db8;
    const mats = {
      RA: glowMaterial(oxColors ? blue : red, oxColors ? 0x6f8cff : 0xff7a45, levelA),
      LA: glowMaterial(red, 0xff6a50, levelA),
      RV: glowMaterial(oxColors ? blue : red, oxColors ? 0x6f8cff : 0xff7a45, levelV),
      LV: glowMaterial(red, 0xff6a50, levelV),
    };
    const open = new THREE.MeshStandardMaterial({ color: 0x7be39a, emissive: 0x2f9e55, roughness: 0.5, side: THREE.DoubleSide });
    const closed = new THREE.MeshStandardMaterial({ color: 0xf1e6d6, roughness: 0.6, side: THREE.DoubleSide });
    const beat = { value: 0 };
    const vbeat = { value: 0 };
    const c = (n: string) => new THREE.Vector3(...atlas.center(atlas.resolveName(n)[0]));
    const waves = view === 'heart' ? 7 : 1.4;
    const uA = flowUniforms(c('Ascending aorta'), waves, 1, 1, beat);
    const uP = flowUniforms(c('Pulmonary trunk'), waves, 1, 0.55, beat);
    const uV = flowUniforms(c('Right atrium'), waves, -1, 0.6, vbeat);
    const uPV = flowUniforms(c('Left atrium'), waves, -1, 0.6, vbeat);
    const artM = flowMaterial({ color: 0xc43d36, glow: 0xff8a70, uniforms: uA });
    const pulM = flowMaterial({ color: oxColors ? 0x3f63c8 : 0xc43d36, glow: 0x9db7ff, uniforms: uP });
    const venM = flowMaterial({ color: 0x3f63c8, glow: 0x9db7ff, uniforms: uV });
    const pvM = flowMaterial({ color: oxColors ? 0xc43d36 : 0x3f63c8, glow: 0xff8a70, uniforms: uPV });

    const set = new Map<number, THREE.Material>();
    const assign = (list: number[], m: THREE.Material) => list.forEach((i) => set.set(i, m));
    assign(ids.byKey.RA, mats.RA);
    assign(ids.byKey.LA, mats.LA);
    assign(ids.byKey.RV, mats.RV);
    assign(ids.byKey.LV, mats.LV);
    const valveAV = [...ids.byKey.TV, ...ids.byKey.MV];
    const valveSL = [...ids.byKey.PV, ...ids.byKey.AV];
    assign(valveAV, closed);
    assign(valveSL, closed);
    const vesselIds = view === 'heart' ? ids.vessels : [...ids.arteries, ...ids.veins];
    const artSet = new Set(ids.arteries);
    for (const id of vesselIds) {
      const pul = ids.isPulm(id);
      if (artSet.has(id)) set.set(id, pul ? pulM : artM);
      else set.set(id, pul ? pvM : venM);
    }
    for (const [id, m] of set) viewer.overrides.set(id, m);
    viewer.refreshItems(set.keys());

    const sq = new Squeezer(viewer);
    const piv = (list: number[]) => {
      const b = atlas.bounds(list)!;
      return new THREE.Vector3((b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2);
    };
    const atria = [...ids.byKey.RA, ...ids.byKey.LA];
    const ventricles = [...ids.byKey.RV, ...ids.byKey.LV];
    const pA = piv(atria);
    const pV = piv(ventricles);
    // ventricles shorten toward the apex less than they narrow
    pV.y += 0.02;

    const diagram = diagRef.current ? new HeartDiagram(diagRef.current) : null;
    const onResize = () => diagram?.resize();
    window.addEventListener('resize', onResize);
    let avState = -1, slState = -1;
    let vtime = 0;
    const L = live.current;
    const remove = viewer.addFrame((_t, dt) => {
      const prev = L.p;
      if (L.playing) L.p = (L.p + dt * L.speed * (L.bpm / 60)) % 1;
      const p = L.p;
      const ph = phaseAt(p);
      if (L.playing && L.sound) {
        const crossed = (x: number) => (prev < x && p >= x) || (prev > p && (x > prev || x <= p));
        if (crossed(0.14)) beep(55, 0.11, 0.5);
        if (crossed(0.52)) beep(72, 0.08, 0.35);
      }
      const ac = atrialContraction(p), af = atrialFilling(p), vc = ventricularContraction(p);
      const sa = 1 - 0.055 * ac + 0.02 * af;
      const sv = 1 - 0.065 * vc;
      for (const id of atria) sq.set(id, pA, sa, sa, sa);
      for (const id of ventricles) sq.set(id, pV, sv, 1 - 0.035 * vc, sv);
      levelA.value = 0.4 * ac;
      levelV.value = ph.sl || ph.key === 'ivc' ? 0.32 * Math.max(0.35, vc) : 0.15 * vc;
      const av = ph.av ? 1 : 0, sl = ph.sl ? 1 : 0;
      if (av !== avState) {
        avState = av;
        valveAV.forEach((i) => viewer.overrides.set(i, av ? open : closed));
        viewer.refreshItems(valveAV);
      }
      if (sl !== slState) {
        slState = sl;
        valveSL.forEach((i) => viewer.overrides.set(i, sl ? open : closed));
        viewer.refreshItems(valveSL);
      }
      // arterial pulse wave leaves the heart at the start of ejection
      beat.value = p - 0.2;
      if (L.playing) vtime += dt * L.speed * (L.bpm / 60) * 0.5;
      vbeat.value = vtime;
      if (diagram) diagram.draw(p, { highlight: L.hl, playing: L.playing });
      if (wigRef.current) drawWiggers(wigRef.current, p);
      if (ph.key !== L.lastPhase) {
        L.lastPhase = ph.key;
        setPhaseKey(ph.key);
      }
      if (readRef.current) readRef.current.textContent = `${Math.round(EDV - (EDV - ESV) * vc)} mL in the left ventricle`;
    });
    return () => {
      remove();
      window.removeEventListener('resize', onResize);
      sq.restore();
      for (const id of set.keys()) viewer.overrides.delete(id);
      viewer.refreshItems(set.keys());
      [open, closed, artM, pulM, venM, pvM, ...Object.values(mats)].forEach((m) => m.dispose());
    };
  }, [view, oxColors, ids]);

  // taps in 3D show what was touched
  useEffect(() => {
    pickHandler.value = (id: number) => setPicked(id >= 0 ? id : null);
    return () => {
      pickHandler.value = null;
      sceneOverride.value = null;
    };
  }, []);

  const phase = PHASES.find((x) => x.key === phaseKey)!;
  const jump = (i: number) => {
    const ph = PHASES[i];
    live.current.p = (ph.start + ph.end) / 2;
    setPlaying(false);
  };
  const pickKey = (k: HeartKey | null) => {
    setHl(k);
    setPicked(null);
    if (k) {
      const b = atlas.bounds(ids.byKey[k]);
      if (b && view === 'heart' && !['lungs', 'Ao', 'veins'].includes(k)) viewer.focusBounds(b[0], b[1], { pad: 2.6 });
      else if (b && view === 'heart') viewer.focusBounds(b[0], b[1], { pad: 1.3 });
    }
  };
  const onDiagramTap = (e: MouseEvent) => {
    const canvas = diagRef.current;
    if (!canvas) return;
    const k = hitDiagram(canvas, e.clientX, e.clientY);
    pickKey(k === hl ? null : k);
  };
  const routeIndex = hl ? ROUTE.indexOf(hl) : -1;
  const hr = bpm;
  const sv = EDV - ESV;
  const info = hl ? PARTS[hl] : null;

  return (
    <>
      <div class="panel-head">
        <button class="iconbtn" aria-label="Back to lessons" onClick={onBack}><Icon name="back" /></button>
        <h2>The heart and circulation</h2>
      </div>
      <div class="panel-body">
        <div class="seg" style="margin-bottom:8px">
          <button class={tab === 'cycle' ? 'on' : ''} onClick={() => setTab('cycle')}>Cardiac cycle</button>
          <button class={tab === 'route' ? 'on' : ''} onClick={() => { setTab('route'); if (!hl) pickKey('veins'); }}>Follow the blood</button>
        </div>
        <div class="chips" style="margin-bottom:8px">
          <button class={`chip ${view === 'heart' ? 'on' : ''}`} onClick={() => setView('heart')}>Heart close-up</button>
          <button class={`chip ${view === 'body' ? 'on' : ''}`} onClick={() => setView('body')}>Whole-body circulation</button>
          {view === 'heart' && <button class={`chip ${cut ? 'on' : ''}`} onClick={() => setCut(!cut)}>Cut open</button>}
          <button class={`chip ${oxColors ? 'on' : ''}`} onClick={() => setOxColors(!oxColors)}>Oxygen colours</button>
          <button class={`chip ${sound ? 'on' : ''}`} onClick={() => setSound(!sound)}>Heart sounds</button>
        </div>
        <canvas ref={diagRef} class="diagram" style="aspect-ratio: 440 / 340" onClick={onDiagramTap} aria-label="Diagram of the heart and circulation. Tap a part to highlight it in 3D." />
        <div class="transport">
          <button class="btn small" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} />{playing ? 'Pause' : 'Play'}
          </button>
          <div class="seg" style="flex:none">
            {SPEEDS.map((s) => <button key={s} class={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s === 1 ? '1×' : s === 0.5 ? '½×' : '¼×'}</button>)}
          </div>
          <label class="grow small muted" style="display:flex;align-items:center;gap:8px">
            <span style="white-space:nowrap">{bpm} bpm</span>
            <input type="range" min={40} max={180} value={bpm} onInput={(e) => setBpm(+(e.target as HTMLInputElement).value)} aria-label="Heart rate" style="flex:1" />
          </label>
        </div>

        {info && (
          <div class="phase" style="background:rgba(255,201,60,0.08);border-color:rgba(255,201,60,0.35)">
            <b style="color:var(--gold)">{info.title}</b>
            <p class="small" style="margin-top:4px">{info.text}</p>
          </div>
        )}
        {picked !== null && (
          <div class="phase" style="background:rgba(255,201,60,0.08);border-color:rgba(255,201,60,0.35);display:flex;gap:8px;align-items:center">
            <span style="flex:1">Tapped: <b style="color:var(--gold)">{atlas.displayName(picked)}</b></span>
            <button class="btn small" onClick={() => { const id = picked; mode.value = 'explore'; sceneOverride.value = null; pickHandler.value = null; select(id, { focus: true, reveal: true }); }}>Open in Explore</button>
          </div>
        )}

        {tab === 'cycle' ? (
          <>
            <div class="phase-steps" role="tablist" aria-label="Phases of the cardiac cycle">
              {PHASES.map((ph, i) => (
                <button key={ph.key} class={ph.key === phaseKey ? 'on' : ''} onClick={() => jump(i)}>{ph.short}</button>
              ))}
            </div>
            <div class="phase">
              <b>{phase.name}</b>
              <p class="small" style="margin-top:4px">{phase.text}</p>
              <div class="legend">
                <span><i style={`background:${phase.av ? 'var(--green)' : '#eee'}`} />Tricuspid and mitral {phase.av ? 'open' : 'closed'}</span>
                <span><i style={`background:${phase.sl ? 'var(--green)' : '#eee'}`} />Pulmonary and aortic {phase.sl ? 'open' : 'closed'}</span>
                <span><i style="background:#69f0ae" />ECG: {phase.ecg}</span>
              </div>
              <p class="small muted" style="margin-top:6px"><span ref={readRef} /></p>
            </div>
            <h4 style="margin:14px 0 6px">Pressure, volume and ECG over one beat</h4>
            <canvas ref={wigRef} class="diagram" style="aspect-ratio: 440 / 210" aria-label="Wiggers diagram" />
            <dl class="kv" style="margin-top:10px">
              <dt>Heart rate</dt><dd>{hr} beats per minute</dd>
              <dt>Stroke volume</dt><dd>{sv} mL (end-diastolic {EDV} mL minus end-systolic {ESV} mL)</dd>
              <dt>Ejection fraction</dt><dd>{Math.round((sv / EDV) * 100)}%</dd>
              <dt>Cardiac output</dt><dd>{((hr * sv) / 1000).toFixed(1)} L per minute (heart rate × stroke volume)</dd>
              <dt>Blood pressure</dt><dd>about 120/80 mmHg in the aorta, 25/8 mmHg in the pulmonary trunk</dd>
            </dl>
            <p class="small muted" style="margin-top:8px">The model keeps stroke volume fixed so you can see how heart rate alone changes cardiac output. In a real heart a faster rate mostly shortens diastole (filling).</p>
          </>
        ) : (
          <>
            <p class="small muted" style="margin:10px 0 6px">Tap a step, or tap the diagram or the 3D heart.</p>
            <ol class="route">
              {ROUTE.map((k, i) => (
                <li key={k}>
                  <button class={routeIndex === i ? 'on' : ''} onClick={() => pickKey(k)}>
                    <span class="num">{i + 1}</span>{PARTS[k].title}
                  </button>
                </li>
              ))}
            </ol>
            <div class="transport">
              <button class="btn small" disabled={routeIndex <= 0} onClick={() => pickKey(ROUTE[routeIndex - 1])}>Previous</button>
              <button class="btn small primary" onClick={() => pickKey(ROUTE[(routeIndex + 1) % ROUTE.length])}>Next step</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

