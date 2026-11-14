import { useState } from 'preact/hooks';
import type { Atlas } from '../data/meta';
import { sceneOverride, pickHandler, viewerSig } from '../state';
import { HeartLesson } from './HeartLesson';
import { LESSONS } from './lessons';
import { GenericLesson } from './GenericLesson';

export function PhysioPanel({ atlas }: { atlas: Atlas }) {
  const [active, setActive] = useState<string | null>(() => {
    try { return sessionStorage.getItem('physio.lesson'); } catch { return null; }
  });
  const open = (id: string | null) => {
    try { id ? sessionStorage.setItem('physio.lesson', id) : sessionStorage.removeItem('physio.lesson'); } catch { /* ignore */ }
    sceneOverride.value = null;
    pickHandler.value = null;
    if (!id) viewerSig.value?.resetView();
    setActive(id);
  };
  const lesson = LESSONS.find((l) => l.id === active);
  return (
    <aside class="workpanel" aria-label="Physiology lessons">
      {active === 'heart' ? (
        <HeartLesson key="heart" atlas={atlas} onBack={() => open(null)} />
      ) : lesson ? (
        <GenericLesson key={lesson.id} atlas={atlas} lesson={lesson} onBack={() => open(null)} />
      ) : (
        <>
          <div class="panel-head"><h2>Physiology</h2></div>
          <div class="panel-body">
            <p class="small muted" style="margin-bottom:10px">Watch how the body's systems work, on the 3D model and in animated diagrams. Tap any structure in 3D to see what it is.</p>
            <div class="lesson-list">
              <button class="lesson-card" onClick={() => open('heart')}>
                <span class="ico">❤️</span>
                <span><b>The heart and circulation</b><small>Chambers, valves, the cardiac cycle, pressure curves, and where the blood goes</small></span>
              </button>
              {LESSONS.map((l) => (
                <button key={l.id} class="lesson-card" onClick={() => open(l.id)}>
                  <span class="ico">{l.icon}</span>
                  <span><b>{l.title}</b><small>{l.blurb}</small></span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
