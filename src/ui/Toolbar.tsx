import { useState } from 'preact/hooks';
import type { Atlas } from '../data/meta';
import { clip, colorByAction, fadeOthers, hidden, isolated, panel, selectedSet, showAll, viewerSig } from '../state';
import type { ViewName } from '../viewer/Viewer';
import { ACTION_COLORS } from '../viewer/palette';
import { Icon } from './icons';

const VIEWS: [ViewName, string][] = [['front', 'Anterior'], ['back', 'Posterior'], ['right', 'Right lateral'], ['left', 'Left lateral'], ['top', 'Superior'], ['bottom', 'Inferior']];
const AXES: { axis: 0 | 1 | 2; label: string; min: number; max: number }[] = [
  { axis: 2, label: 'Coronal', min: -0.22, max: 0.24 },
  { axis: 0, label: 'Sagittal', min: -0.42, max: 0.42 },
  { axis: 1, label: 'Transverse', min: 0, max: 1.75 },
];

export function Toolbar({ atlas }: { atlas: Atlas }) {
  const [pop, setPop] = useState<'views' | 'cut' | 'colors' | null>(null);
  const viewer = viewerSig.value;
  const c = clip.value;
  const hiddenCount = hidden.value.size + (isolated.value ? 1 : 0);
  const sel = selectedSet.value;
  const toggle = (p: typeof pop) => setPop(pop === p ? null : p);
  const ax = AXES.find((a) => a.axis === (c?.axis ?? 2))!;
  return (
    <>
      <div class="toolbar" role="toolbar" aria-label="View tools">
        <button class={'tb' + (panel.value ? ' on' : '')} title="Layers and browser" onClick={() => (panel.value = panel.value ? null : 'layers')}><Icon name="layers" /><span>Layers</span></button>
        <div class="sep" />
        <button class={'tb' + (pop === 'views' ? ' on' : '')} title="Standard views" onClick={() => toggle('views')}><Icon name="body" /><span>View</span></button>
        <button class="tb" title="Reset the camera" onClick={() => viewer?.resetView()}><Icon name="reset" /></button>
        <div class="sep" />
        <button class={'tb' + (fadeOthers.value ? ' on' : '')} title="X-ray: fade everything except the selection" onClick={() => (fadeOthers.value = !fadeOthers.value)}><Icon name="xray" /><span>X-ray</span></button>
        <button class={'tb' + (c ? ' on' : '')} title="Cross-section" onClick={() => toggle('cut')}><Icon name="cut" /><span>Section</span></button>
        <button class={'tb' + (colorByAction.value ? ' on' : '')} title="Colour muscles by action" onClick={() => toggle('colors')}><Icon name="palette" /></button>
        {hiddenCount > 0 && (
          <>
            <div class="sep" />
            <button class="tb" title="Show everything that was hidden" onClick={showAll}><Icon name="eye" /><span>Show all</span></button>
          </>
        )}
      </div>
      {pop === 'views' && (
        <div class="popover">
          <h3>Standard anatomical views</h3>
          <div class="chips">
            {VIEWS.map(([v, label]) => (
              <button class="chip" key={v} onClick={() => {
                const b = sel.size ? atlas.bounds([...sel]) : null;
                viewer?.setView(v, b || [[-0.45, 0, -0.2], [0.45, 1.75, 0.2]]);
              }}>{label}</button>
            ))}
          </div>
        </div>
      )}
      {pop === 'cut' && (
        <div class="popover">
          <h3>Cross-section</h3>
          <div class="chips">
            {AXES.map((a) => (
              <button class={'chip' + (c?.axis === a.axis ? ' on' : '')} key={a.axis} onClick={() => (clip.value = { axis: a.axis, pos: (a.min + a.max) / 2, flip: false })}>{a.label}</button>
            ))}
            <button class="chip" onClick={() => (clip.value = null)}>Off</button>
          </div>
          {c && (
            <>
              <input style="margin-top:10px" type="range" min={ax.min} max={ax.max} step={0.002} value={c.pos} aria-label="Section position" onInput={(e) => (clip.value = { ...c, pos: +(e.target as HTMLInputElement).value })} />
              <button class="chip" onClick={() => (clip.value = { ...c, flip: !c.flip })}>Flip side</button>
            </>
          )}
        </div>
      )}
      {pop === 'colors' && (
        <div class="popover">
          <h3>Muscle colours</h3>
          <div class="chips">
            <button class={'chip' + (!colorByAction.value ? ' on' : '')} onClick={() => (colorByAction.value = false)}>Natural</button>
            <button class={'chip' + (colorByAction.value ? ' on' : '')} onClick={() => (colorByAction.value = true)}>By primary action</button>
          </div>
          {colorByAction.value && (
            <div class="legend">
              {Object.values(ACTION_COLORS).map((a) => (
                <span key={a.label}><i style={`background:#${a.color.toString(16).padStart(6, '0')}`} />{a.label}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
