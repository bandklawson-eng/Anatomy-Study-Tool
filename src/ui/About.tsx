import { useState } from 'preact/hooks';
import { DATA_BASE, type Atlas } from '../data/meta';

async function downloadAll(atlas: Atlas, onProgress: (done: number, total: number) => void) {
  const files = [
    ...atlas.meta.chunks.map((c) => `${DATA_BASE}geo/${c.f}`),
    ...Array.from({ length: atlas.meta.descBuckets }, (_, i) => `${DATA_BASE}desc/${i}.json`),
  ];
  let done = 0;
  const queue = files.slice();
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift()!;
      try { await (await fetch(f)).arrayBuffer(); } catch { /* retry later via normal use */ }
      onProgress(++done, files.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

export function About({ atlas, onClose }: { atlas: Atlas; onClose: () => void }) {
  const [prog, setProg] = useState<[number, number] | null>(null);
  const structures = atlas.items.filter((i) => i.y === 's').length;
  const totalMb = (atlas.meta.chunks.reduce((s, c) => s + c.bytes, 0) / 1e6 + 4.5).toFixed(0);
  const swReady = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
  return (
    <div class="scrim" onClick={onClose}>
      <div class="dialog" role="dialog" aria-label="About Anatomy Atlas" onClick={(e) => e.stopPropagation()}>
        <h2>Anatomy Atlas</h2>
        <p>
          A 3D atlas of the human body with {structures.toLocaleString()} separately selectable structures, {atlas.landmarks.length.toLocaleString()} named
          landmarks and {atlas.items.filter((i) => i.y === 'a').length} muscle attachment areas, plus physiology animations, quizzes and flashcards.
        </p>

        <h3>Install and use offline</h3>
        <ul>
          <li><b>iPad / iPhone (Safari):</b> tap Share, then “Add to Home Screen”.</li>
          <li><b>Android / desktop (Chrome, Edge):</b> use “Install app” in the browser menu or address bar.</li>
        </ul>
        <p>Parts of the body you have opened are kept for offline use automatically. To study without a connection, download everything now (about {totalMb} MB).</p>
        <button class="btn primary" disabled={!!prog && prog[0] < prog[1]} onClick={() => downloadAll(atlas, (d, t) => setProg([d, t]))}>
          {prog ? (prog[0] < prog[1] ? `Downloading… ${Math.round((prog[0] / prog[1]) * 100)}%` : 'Everything is downloaded') : 'Download everything for offline use'}
        </button>
        {prog && <div class="progress" style="margin-top:8px"><div style={`width:${(prog[0] / prog[1]) * 100}%`} /></div>}
        {!swReady && <p class="small muted" style="margin-top:6px">Offline storage starts once the app is opened from its installed or hosted address.</p>}

        <h3>Controls</h3>
        <ul>
          <li>Drag to rotate, pinch or scroll to zoom, two fingers or right-drag to pan.</li>
          <li>Tap a structure to select it. Use Isolate, X-ray and Hide to dissect around it.</li>
          <li>Keyboard: F focus, H hide, I isolate, X x-ray, Esc clear selection.</li>
        </ul>

        <h3>Sources and licences</h3>
        <ul>
          <li>3D models: <b>Z-Anatomy</b>, the open source atlas of anatomy (CC BY-SA 4.0), derived from <b>BodyParts3D</b>, © The Database Center for Life Science (CC BY-SA 2.1 Japan). Models were converted, simplified and compressed for the web; the processed models are shared under the same CC BY-SA 4.0 licence.</li>
          <li>Z-Anatomy also adapts: brain and white matter from the University of Washington; “Cranial Nerves and Foramina” by University of Dundee, CAHID (CC BY 4.0); “Anatomy of the Inner Ear” by University of Dundee School of Medicine (CC BY-NC-SA 4.0); “Kidney” by lissiecowley (CC BY-NC 4.0). Because of the last two, this app is for non-commercial study.</li>
          <li>Reference articles: Wikipedia contributors, via Z-Anatomy (CC BY-SA).</li>
          <li>Muscle origin, insertion, action and innervation tables and the physiology lessons were written for this project.</li>
        </ul>
        <p class="small muted">This is a study aid, not a medical device. Check details against your course textbook. Data build {atlas.meta.generated}.</p>
        <div style="text-align:right;margin-top:12px"><button class="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
