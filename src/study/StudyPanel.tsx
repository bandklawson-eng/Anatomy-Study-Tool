import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Atlas } from '../data/meta';
import { muscleAttachments } from '../data/facts';
import { mode, pickHandler, sceneOverride, select, viewerSig } from '../state';
import { Icon } from '../ui/icons';
import {
  FIELD_LABEL, buildQueue, contextBounds, contextWant, deckStats, getDecks, nearbyCards, preview, questionFor, quizHistory, rate, recordQuiz, resetProgress, shuffle, streak,
  type Card, type Deck, type Rating,
} from './decks';

type Tab = 'cards' | 'quiz' | 'progress';

function loadPref<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
}
function savePref(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
}

/** Show a card's structures in 3D with context and frame them. */
function showCard(atlas: Atlas, c: Card, opts: { extra?: number[]; highlight?: boolean; frame?: boolean; wrong?: number | null } = {}) {
  const sel = new Set<number>(opts.highlight === false ? [] : c.ids);
  if (opts.wrong != null) sel.add(opts.wrong);
  sceneOverride.value = { want: contextWant(atlas, c.ids, opts.extra), selected: sel };
  if (opts.frame !== false) {
    const v = viewerSig.value;
    const b = contextBounds(atlas, c.ids);
    if (v && b) v.focusBounds(b[0], b[1], { pad: 1.9 });
  }
}

function openInExplore(id: number) {
  sceneOverride.value = null;
  pickHandler.value = null;
  mode.value = 'explore';
  select(id, { focus: true, reveal: true });
}

const days = (d: number) => (d < 1 ? (d === 0 ? '1 min' : '12 h') : d < 30 ? `${Math.round(d)} d` : d < 365 ? `${Math.round(d / 30)} mo` : `${(d / 365).toFixed(1)} y`);

// ------------------------------------------------------------------ deck picker
function DeckPicker({ decks, value, onChange, allowFact = true }: { decks: Deck[]; value: string; onChange: (k: string) => void; allowFact?: boolean }) {
  return (
    <div class="field">
      <label for="deck">Deck</label>
      <select id="deck" value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
        {decks.filter((d) => allowFact || d.kind === 'id').map((d) => (
          <option key={d.key} value={d.key}>{d.title} ({d.cards.length})</option>
        ))}
      </select>
    </div>
  );
}

// ------------------------------------------------------------------ flashcards
function Flashcards({ atlas, decks }: { atlas: Atlas; decks: Deck[] }) {
  const [deckKey, setDeckKey] = useState(() => loadPref('study.deck', 'muscle-facts'));
  const deck = decks.find((d) => d.key === deckKey) || decks[0];
  const [newCount, setNewCount] = useState(() => loadPref('study.new', 15));
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const [, force] = useState(0);
  const stats = deckStats(deck);
  const card = queue && queue[0];

  useEffect(() => {
    if (!card) return;
    const extra = shown && card.kind === 'fact' && (card.field === 'o' || card.field === 'i')
      ? card.ids.flatMap((id) => muscleAttachments(atlas, id).filter((a) => a.kind === (card.field === 'o' ? 'o' : 'e')).map((a) => a.att))
      : [];
    showCard(atlas, card, { extra, frame: !shown });
  }, [card, shown]);

  useEffect(() => {
    if (!queue) {
      sceneOverride.value = null;
      return;
    }
    pickHandler.value = () => {};
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === ' ' && !shown) { e.preventDefault(); setShown(true); }
      else if (shown && ['1', '2', '3', '4'].includes(e.key)) doRate((+e.key - 1) as Rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queue, shown]);

  useEffect(() => () => { pickHandler.value = null; sceneOverride.value = null; }, []);

  const start = () => {
    const q = buildQueue(deck, newCount);
    setDone(0);
    setShown(false);
    setQueue(q);
  };
  const doRate = (r: Rating) => {
    if (!queue || !card) return;
    rate(card.id, r);
    const rest = queue.slice(1);
    if (r === 0) rest.splice(Math.min(rest.length, 3), 0, card);
    else setDone((d) => d + 1);
    setShown(false);
    setQueue(rest);
  };

  if (!queue) {
    return (
      <>
        <DeckPicker decks={decks} value={deck.key} onChange={(k) => { setDeckKey(k); savePref('study.deck', k); force((x) => x + 1); }} />
        <p class="small muted" style="margin-top:6px">{deck.blurb}</p>
        <div class="stat-grid" style="margin-top:12px">
          <div class="stat"><b>{stats.due}</b><small>due now</small></div>
          <div class="stat"><b>{stats.fresh}</b><small>not seen yet</small></div>
          <div class="stat"><b>{stats.mastered}</b><small>mastered</small></div>
        </div>
        <div class="field">
          <label for="newc">New cards per session: {newCount}</label>
          <input id="newc" type="range" min={0} max={50} step={5} value={newCount} onInput={(e) => { const v = +(e.target as HTMLInputElement).value; setNewCount(v); savePref('study.new', v); }} />
        </div>
        <button class="btn primary" style="margin-top:12px;width:100%" onClick={start} disabled={stats.due + Math.min(newCount, stats.fresh) === 0}>
          Study {stats.due + Math.min(newCount, stats.fresh)} cards
        </button>
        <p class="small muted" style="margin-top:10px">Cards come back just before you would forget them: rate each one honestly and the app schedules the next review, from a minute to months away. Progress stays on this device.</p>
      </>
    );
  }

  if (!card) {
    return (
      <div class="card" style="text-align:center">
        <h3>Session complete</h3>
        <p class="muted" style="margin:8px 0 14px">You reviewed {done} cards. Come back tomorrow for the next due cards.</p>
        <button class="btn primary" onClick={() => setQueue(null)}>Back to decks</button>
      </div>
    );
  }

  const target = card.ids[0];
  return (
    <>
      <div class="scorebar">
        <button class="btn small" onClick={() => setQueue(null)}><Icon name="back" />Decks</button>
        <span><b>{queue.length}</b> left</span>
        <span><b>{done}</b> done</span>
      </div>
      <div class="card">
        <p class="small muted">{card.kind === 'fact' ? FIELD_LABEL[card.field!] : deck.title}</p>
        <h3 style="margin:4px 0 10px">{questionFor(card)}</h3>
        {!shown ? (
          <button class="btn primary" style="width:100%" onClick={() => setShown(true)}>Show answer <span class="muted small">(space)</span></button>
        ) : (
          <div>
            {card.kind === 'fact' ? (
              <>
                <p style="font-size:15px;font-weight:600">{card.answer}</p>
                {(card.field === 'o' || card.field === 'i') && <p class="small muted" style="margin-top:6px">{card.field === 'o' ? 'Red' : 'Blue'} areas on the skeleton mark where it attaches, when the atlas models them.</p>}
              </>
            ) : (
              <>
                <p style="font-size:17px;font-weight:700;color:var(--gold)">{card.name}</p>
                {card.latin && card.latin !== card.name && <p class="muted"><i>{card.latin}</i></p>}
              </>
            )}
            <button class="btn small" style="margin-top:10px" onClick={() => openInExplore(target)}>Open in Explore</button>
          </div>
        )}
      </div>
      {shown && (
        <div class="rate">
          {(['Again', 'Hard', 'Good', 'Easy'] as const).map((l, i) => (
            <button key={l} class={['again', '', 'good', 'easy'][i]} onClick={() => doRate(i as Rating)}>
              {l}<small>{days(preview(card.id, i as Rating))}</small>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ quiz
interface Q { card: Card; options?: string[] }
const ROUND = 10;

function Quiz({ atlas, decks }: { atlas: Atlas; decks: Deck[] }) {
  const [deckKey, setDeckKey] = useState(() => loadPref('study.quizDeck', 'bones'));
  const [qmode, setQmode] = useState<'name' | 'find'>(() => loadPref('study.quizMode', 'name'));
  const deck = decks.find((d) => d.key === deckKey) || decks[1];
  const canFind = deck.kind === 'id';
  const m = canFind ? qmode : 'name';
  const [round, setRound] = useState<Q[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [tapped, setTapped] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<Card[]>([]);
  const q = round && round[idx];

  const start = () => {
    const cards = shuffle(deck.cards).slice(0, ROUND);
    const qs = cards.map((card) => ({
      card,
      options: m === 'name' ? shuffle([card, ...nearbyCards(atlas, deck, card, 3)].map((c) => (c.kind === 'fact' ? c.answer! : c.name))) : undefined,
    }));
    setRound(qs);
    setIdx(0);
    setScore(0);
    setMissed([]);
    setAnswer(null);
    setTapped(null);
  };

  const correct = q ? (q.card.kind === 'fact' ? q.card.answer! : q.card.name) : '';
  const finished = answer !== null || tapped !== null;

  // scene per question
  useEffect(() => {
    if (!q) { sceneOverride.value = null; pickHandler.value = null; return; }
    if (m === 'find') {
      showCard(atlas, q.card, { highlight: finished, wrong: tapped !== null && tapped >= 0 && !q.card.ids.includes(tapped) ? tapped : null, frame: !finished });
      if (!finished) {
        // frame the whole region rather than the target so it has to be found
        const v = viewerSig.value;
        const b = contextBounds(atlas, q.card.ids, 0.4);
        if (v && b) v.focusBounds(b[0], b[1], { pad: 1.2 });
      }
    } else showCard(atlas, q.card, { frame: answer === null });
  }, [q, finished]);

  useEffect(() => {
    if (!q || m !== 'find' || finished) { if (q) pickHandler.value = () => {}; return; }
    pickHandler.value = (id: number) => {
      if (id < 0) return;
      const ok = q.card.ids.includes(id) || atlas.items[id].n.toLowerCase() === q.card.name.toLowerCase();
      setTapped(id);
      if (ok) setScore((s) => s + 1);
      else setMissed((x) => [...x, q.card]);
    };
  }, [q, finished]);

  useEffect(() => () => { pickHandler.value = null; sceneOverride.value = null; }, []);

  const choose = (opt: string) => {
    if (answer !== null || !q) return;
    setAnswer(opt);
    if (opt === correct) setScore((s) => s + 1);
    else setMissed((x) => [...x, q.card]);
  };
  const nextQ = () => {
    if (!round) return;
    if (idx + 1 >= round.length) {
      recordQuiz(`${deck.key}:${m}`, score);
      setIdx(round.length);
      return;
    }
    setIdx(idx + 1);
    setAnswer(null);
    setTapped(null);
  };

  if (!round) {
    const hist = quizHistory()[`${deck.key}:${m}`];
    return (
      <>
        <DeckPicker decks={decks} value={deck.key} onChange={(k) => { setDeckKey(k); savePref('study.quizDeck', k); }} />
        <div class="field">
          <label>Question type</label>
          <div class="seg">
            <button class={m === 'name' ? 'on' : ''} onClick={() => { setQmode('name'); savePref('study.quizMode', 'name'); }}>Name it (multiple choice)</button>
            <button class={m === 'find' ? 'on' : ''} disabled={!canFind} onClick={() => { setQmode('find'); savePref('study.quizMode', 'find'); }}>Find it on the model</button>
          </div>
        </div>
        <p class="small muted" style="margin-top:8px">
          {m === 'name' ? (deck.kind === 'fact' ? 'Pick the right origin, insertion, action or nerve for the highlighted muscle.' : 'Name the highlighted structure from four choices; the wrong answers are nearby structures.') : 'You get a name; tap that structure on the 3D model. Rotate and zoom to find it.'}
        </p>
        <button class="btn primary" style="margin-top:12px;width:100%" onClick={start}>Start a {ROUND}-question quiz</button>
        {hist && <p class="small muted" style="margin-top:8px">Best score {hist.best}/{ROUND}, last {hist.last}/{ROUND}, played {hist.plays} times.</p>}
      </>
    );
  }

  if (!q) {
    return (
      <div class="card">
        <h3>Score: {score} / {round.length}</h3>
        <p class="muted" style="margin:6px 0 10px">{score === round.length ? 'Perfect round.' : score >= round.length * 0.7 ? 'Good work.' : 'Keep going: the misses below are worth a second look.'}</p>
        {missed.length > 0 && (
          <>
            <h4 style="margin:6px 0">Review</h4>
            <ul class="small" style="padding-left:18px;margin:0 0 10px">
              {missed.map((c, i) => (
                <li key={i}><button class="linklike" onClick={() => showCard(atlas, c)}>{c.kind === 'fact' ? `${c.name}: ${FIELD_LABEL[c.field!].toLowerCase()}` : c.name}</button>{c.kind === 'fact' ? ` – ${c.answer}` : ''}</li>
              ))}
            </ul>
          </>
        )}
        <div class="transport">
          <button class="btn primary" onClick={start}>Play again</button>
          <button class="btn" onClick={() => setRound(null)}>Change quiz</button>
        </div>
      </div>
    );
  }

  const tappedOk = tapped !== null && tapped >= 0 && (q.card.ids.includes(tapped) || atlas.items[tapped].n.toLowerCase() === q.card.name.toLowerCase());
  return (
    <>
      <div class="scorebar">
        <button class="btn small" onClick={() => setRound(null)}><Icon name="back" />Quit</button>
        <span>Question <b>{idx + 1}</b> of {round.length}</span>
        <span>Score <b>{score}</b></span>
      </div>
      {m === 'name' ? (
        <>
          <p class="quiz-q">{questionFor(q.card)}</p>
          <div class="options">
            {q.options!.map((o) => (
              <button key={o} class={`option ${answer !== null && o === correct ? 'right' : ''} ${answer === o && o !== correct ? 'wrong' : ''}`} disabled={answer !== null} onClick={() => choose(o)}>{o}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p class="quiz-q">Tap the <span style="color:var(--gold)">{q.card.name}</span></p>
          <p class="small muted" style="margin-top:6px">{tapped === null ? 'Rotate, zoom and tap the structure on the model.' : tappedOk ? 'Correct.' : tapped < 0 ? `The ${q.card.name} is highlighted in gold.` : `That was the ${atlas.displayName(tapped)}. The ${q.card.name} is highlighted in gold.`}</p>
          {tapped === null && <button class="btn small" style="margin-top:8px" onClick={() => { setTapped(-1); setMissed((x) => [...x, q.card]); }}>Show me</button>}
        </>
      )}
      {finished && (
        <div class="transport" style="margin-top:12px">
          <button class="btn primary" onClick={nextQ}>{idx + 1 >= round.length ? 'See score' : 'Next question'}</button>
          <button class="btn small" onClick={() => openInExplore(q.card.ids[0])}>Open in Explore</button>
        </div>
      )}
      {answer !== null && q.card.kind === 'fact' && <p class="small muted" style="margin-top:8px">{q.card.name}: {FIELD_LABEL[q.card.field!].toLowerCase()} – {correct}</p>}
    </>
  );
}

// ------------------------------------------------------------------ progress
function Progress({ decks }: { decks: Deck[] }) {
  const [, force] = useState(0);
  const hist = quizHistory();
  const s = streak();
  return (
    <>
      <div class="stat-grid">
        <div class="stat"><b>{s}</b><small>day streak</small></div>
        <div class="stat"><b>{decks.reduce((a, d) => a + deckStats(d).seen, 0)}</b><small>cards learned</small></div>
        <div class="stat"><b>{decks.reduce((a, d) => a + deckStats(d).due, 0)}</b><small>due now</small></div>
      </div>
      <h4 style="margin:14px 0 6px">Flashcard decks</h4>
      <table class="progress-table">
        <thead><tr><th>Deck</th><th>Learned</th><th>Mastered</th><th>Due</th></tr></thead>
        <tbody>
          {decks.map((d) => {
            const st = deckStats(d);
            return (
              <tr key={d.key}>
                <td>{d.title}<div class="bar"><i style={`width:${(st.seen / Math.max(1, st.total)) * 100}%`} /></div></td>
                <td>{st.seen}/{st.total}</td>
                <td>{st.mastered}</td>
                <td>{st.due}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {Object.keys(hist).length > 0 && (
        <>
          <h4 style="margin:14px 0 6px">Quizzes</h4>
          <dl class="kv">
            {Object.entries(hist).map(([k, v]) => {
              const [dk, md] = k.split(':');
              const d = decks.find((x) => x.key === dk);
              return [<dt key={k + 't'}>{d?.title || dk} ({md === 'find' ? 'find it' : 'name it'})</dt>, <dd key={k + 'v'}>best {v.best}/{ROUND}, played {v.plays}×</dd>];
            })}
          </dl>
        </>
      )}
      <button class="btn small" style="margin-top:16px" onClick={() => { if (confirmReset()) { resetProgress(); force((x) => x + 1); } }}>Reset all flashcard progress</button>
    </>
  );
}

let resetArmed = 0;
function confirmReset(): boolean {
  // two taps within 3 seconds, avoiding a blocking browser dialog
  const now = Date.now();
  if (now - resetArmed < 3000) { resetArmed = 0; return true; }
  resetArmed = now;
  import('../state').then((s) => s.showToast('Tap again to reset all flashcard progress'));
  return false;
}

// ------------------------------------------------------------------ panel
export function StudyPanel({ atlas }: { atlas: Atlas }) {
  const decks = useMemo(() => getDecks(atlas), [atlas]);
  const [tab, setTab] = useState<Tab>(() => loadPref('study.tab', 'cards'));
  const go = (t: Tab) => { setTab(t); savePref('study.tab', t); sceneOverride.value = null; pickHandler.value = null; viewerSig.value?.resetView(); };
  return (
    <aside class="workpanel" aria-label="Study">
      <div class="panel-head">
        <div class="seg">
          <button class={tab === 'cards' ? 'on' : ''} onClick={() => go('cards')}>Flashcards</button>
          <button class={tab === 'quiz' ? 'on' : ''} onClick={() => go('quiz')}>Quiz</button>
          <button class={tab === 'progress' ? 'on' : ''} onClick={() => go('progress')}>Progress</button>
        </div>
      </div>
      <div class="panel-body">
        {tab === 'cards' && <Flashcards key="c" atlas={atlas} decks={decks} />}
        {tab === 'quiz' && <Quiz key="q" atlas={atlas} decks={decks} />}
        {tab === 'progress' && <Progress decks={decks} />}
      </div>
    </aside>
  );
}
