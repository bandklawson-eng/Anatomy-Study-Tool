// Declarative physiology lessons: what to show in 3D, how it moves, and the teaching steps.
import type { Atlas } from '../data/meta';
import {
  breathDiagram, breathVolume, contraction, gutDiagram, hormoneDiagram, INSP, lymphDiagram, membranePotential, nephronDiagram, nerveDiagram, sarcomereDiagram, type DiagramDef,
} from './diagrams';

export interface Pick {
  layers?: string[];
  names?: string[];
  side?: 'l' | 'r';
  /** keep only items whose bounds centre passes this test */
  where?: (c: [number, number, number], atlas: Atlas, id: number) => boolean;
}

export interface FlowSpec extends Pick {
  color: number;
  glow: number;
  /** a structure name (its centre) or a point */
  origin: string | [number, number, number];
  originSide?: 'l' | 'r';
  waves: number;
  dir?: 1 | -1;
  strength?: number;
  sharp?: boolean;
  opacity?: number;
  /** pulses per lesson cycle */
  rate?: number;
  /** flow direction over the cycle (breathing reverses) */
  dirAt?: (p: number) => 1 | -1;
}

export interface GlowSpec extends Pick {
  color: number;
  glow: number;
  opacity?: number;
  level: (p: number) => number;
}

export interface MotionSpec extends Pick {
  /** pivot inside the selection's bounds, as fractions (0..1) of each axis */
  pivot: [number, number, number];
  at: (p: number) => [number, number, number, number]; // sx, sy, sz, translate y (m)
}

export interface Step {
  title: string;
  text: string;
  names?: string[];
  side?: 'l' | 'r';
  /** diagram stage to show */
  stage?: number;
}

export interface Lesson {
  id: string;
  title: string;
  icon: string;
  blurb: string;
  /** seconds per cycle at normal speed */
  period: number;
  normal: Pick[];
  ghost?: Pick[];
  focus?: Pick & { pad?: number };
  flows?: FlowSpec[];
  glows?: GlowSpec[];
  motions?: MotionSpec[];
  diagram?: DiagramDef;
  status?: (p: number) => string;
  steps: Step[];
  facts?: [string, string][];
  note?: string;
}

export function pickIds(atlas: Atlas, spec: Pick): number[] {
  const out = new Set<number>();
  if (spec.layers) {
    const lgs = new Set(spec.layers.map((k) => atlas.lg(k)));
    atlas.items.forEach((it, id) => {
      if (it.y === 's' && it.g !== undefined && lgs.has(it.g) && (!spec.side || !it.sd || it.sd === spec.side)) out.add(id);
    });
  }
  if (spec.names) for (const n of spec.names) for (const id of atlas.resolveName(n, spec.side)) out.add(id);
  let ids = [...out];
  if (spec.where) ids = ids.filter((id) => atlas.items[id].b && spec.where!(atlas.center(id), atlas, id));
  return ids;
}

const torso = (c: [number, number, number]) => c[1] > 0.95 && c[1] < 1.62 && Math.abs(c[0]) < 0.24;
const abdomen = (c: [number, number, number]) => c[1] > 0.78 && c[1] < 1.4 && Math.abs(c[0]) < 0.24;

// ------------------------------------------------------------------ breathing
const breathing: Lesson = {
  id: 'breathing',
  title: 'Breathing and gas exchange',
  icon: '🫁',
  blurb: 'How the diaphragm moves air, the airway tree, and how oxygen reaches the blood',
  period: 5,
  normal: [{ layers: ['respiratory'] }, { names: ['Diaphragm'] }],
  ghost: [{ layers: ['bones'], where: torso }],
  focus: { layers: ['respiratory'], where: (c) => c[1] < 1.5, pad: 1.15 },
  glows: [{ names: ['Superior lobe of right lung', 'Middle lobe of right lung', 'Inferior lobe of right lung', 'Superior lobe of left lung', 'Inferior lobe of left lung'], color: 0xe3a1a6, glow: 0x6a2a35, opacity: 0.42, level: (p) => 0.25 + 0.5 * breathVolume(p) }],
  flows: [{
    layers: ['respiratory'], where: (_c, a, id) => !/lobe of|lung|mucosa/i.test(a.items[id].n), color: 0xbfd8ea, glow: 0x7fd3ff, origin: 'Trachea', waves: 9, sharp: true, rate: 2,
    dirAt: (p) => (p < INSP ? 1 : -1),
  }],
  motions: [
    { names: ['Superior lobe of right lung', 'Middle lobe of right lung', 'Inferior lobe of right lung', 'Superior lobe of left lung', 'Inferior lobe of left lung'], pivot: [0.5, 1, 0.5], at: (p) => { const v = breathVolume(p); return [1 + 0.035 * v, 1 + 0.07 * v, 1 + 0.045 * v, 0]; } },
    { names: ['Diaphragm'], pivot: [0.5, 0, 0.5], at: (p) => { const v = breathVolume(p); return [1, 1 - 0.18 * v, 1, -0.018 * v]; } },
  ],
  diagram: breathDiagram,
  status: (p) => (p < INSP ? 'Inspiration' : 'Expiration'),
  steps: [
    { title: 'Inspiration', names: ['Diaphragm', 'External intercostal muscles'], stage: 0, text: 'The diaphragm (supplied by the phrenic nerve, C3 to C5) contracts and flattens, and the external intercostal muscles lift the ribs up and out. The chest cavity gets bigger, pressure in the lungs drops about 1 to 3 mmHg below the air outside (Boyle\'s law), and air flows in. Each quiet breath moves about 500 mL.' },
    { title: 'Expiration', names: ['Internal intercostal muscles'], stage: 1, text: 'Quiet expiration is passive: the diaphragm relaxes and domes upward, and the elastic lungs and chest wall recoil, pushing air out. In forced expiration (coughing, exercise) the internal intercostals and the abdominal muscles actively squeeze the chest.' },
    { title: 'The airway tree', names: ['Trachea', 'Left main bronchus', 'Right main bronchus'], stage: 2, text: 'Air passes the nose, pharynx and larynx into the trachea, which splits into the main bronchi, then lobar and segmental bronchi, and on through about 23 generations of branching to the alveoli. The conducting airways warm, moisten and filter the air; only the deepest branches exchange gas.' },
    { title: 'Lungs and lobes', names: ['Superior lobe of right lung', 'Middle lobe of right lung', 'Inferior lobe of right lung', 'Superior lobe of left lung', 'Inferior lobe of left lung'], stage: 3, text: 'The right lung has three lobes and the left has two, leaving room for the heart (the cardiac notch). Each lobe is divided into bronchopulmonary segments, each with its own segmental bronchus, which is why a surgeon can remove one segment.' },
    { title: 'Gas exchange in the alveoli', stage: 4, text: 'About 300 million alveoli give a surface of about 70 square metres, separated from capillary blood by a membrane about half a micrometre thick. Oxygen diffuses from alveolar air (PO₂ about 104 mmHg) into blood arriving at about 40 mmHg; carbon dioxide diffuses the other way (45 down to 40 mmHg).' },
    { title: 'Control of breathing', names: ['Medulla oblongata', 'Pons'], stage: 4, text: 'Breathing rhythm comes from respiratory centres in the medulla oblongata and pons. The strongest drive is carbon dioxide: central chemoreceptors in the medulla sense the pH of cerebrospinal fluid, and peripheral chemoreceptors in the carotid and aortic bodies also respond to low oxygen.' },
  ],
  facts: [['Breathing rate', '12 to 20 breaths per minute at rest'], ['Tidal volume', 'about 500 mL'], ['Minute ventilation', 'about 6 L per minute'], ['Vital capacity', 'about 4.8 L'], ['Alveolar surface', 'about 70 m²']],
};

// ------------------------------------------------------------------ nerve impulse
const nerve: Lesson = {
  id: 'nerve',
  title: 'Nerve impulses and reflexes',
  icon: '⚡',
  blurb: 'The action potential, conduction along the axon, the synapse, and the knee-jerk reflex',
  period: 2.4,
  normal: [{ layers: ['cns', 'nerves'] }],
  ghost: [{ layers: ['bones'] }],
  flows: [
    { layers: ['nerves'], where: (c) => c[1] > 1.25 && c[1] < 1.52, color: 0xe8c547, glow: 0xfff3a0, origin: 'Vertebra C7', waves: 3.2, sharp: true, rate: 1 },
    { layers: ['nerves'], where: (c) => c[1] <= 1.25, color: 0xe8c547, glow: 0xfff3a0, origin: 'Vertebra L3', waves: 3.2, sharp: true, rate: 1 },
    { layers: ['nerves'], where: (c) => c[1] >= 1.52, color: 0xe8c547, glow: 0xfff3a0, origin: 'Medulla oblongata', waves: 5, sharp: true, rate: 1 },
  ],
  diagram: nerveDiagram,
  status: (p) => `${Math.round(membranePotential(p))} mV at the recording site`,
  steps: [
    { title: 'Brain, spinal cord and nerves', stage: 0, text: 'The central nervous system (brain and spinal cord) integrates information; the peripheral nervous system (12 pairs of cranial nerves and 31 pairs of spinal nerves) carries signals in and out. The pulses on the 3D model show impulses travelling out along the nerves.' },
    { title: 'Resting membrane potential', stage: 1, text: 'A resting neuron is about −70 mV inside. The Na⁺/K⁺ pump moves 3 sodium ions out for every 2 potassium ions in, and potassium leaks out through open channels, leaving the inside negative.' },
    { title: 'The action potential', stage: 2, text: 'A stimulus that reaches threshold (about −55 mV) opens voltage-gated Na⁺ channels; sodium rushes in and the inside swings to about +30 mV. Na⁺ channels then inactivate and K⁺ channels open, so potassium flows out and the membrane repolarises, briefly overshooting (hyperpolarisation). During the refractory period another impulse cannot fire, so impulses travel one way.' },
    { title: 'Saltatory conduction', stage: 3, text: 'Myelin made by Schwann cells (or oligodendrocytes in the CNS) insulates the axon, so the impulse jumps from one node of Ranvier to the next. Large myelinated fibres conduct at up to 120 m/s; thin unmyelinated pain fibres at 0.5 to 2 m/s.' },
    { title: 'The synapse', stage: 4, text: 'At the axon terminal the impulse opens voltage-gated Ca²⁺ channels. Calcium triggers vesicles to release neurotransmitter (acetylcholine at a neuromuscular junction) into the cleft, where it binds receptors on the next cell and starts a new electrical signal.' },
    { title: 'Reflex arc: the knee jerk', names: ['Femoral nerve', 'Rectus femoris muscle', 'Vastus lateralis muscle', 'Vastus medialis muscle'], side: 'r', stage: 2, text: 'Tapping the patellar ligament stretches muscle spindles in the quadriceps. Sensory neurons in the femoral nerve carry the signal to the spinal cord at L2 to L4, where they synapse directly on motor neurons (a monosynaptic reflex). The quadriceps contracts and the leg kicks, while the hamstrings are inhibited.' },
    { title: 'Major nerves of the limbs', names: ['Median nerve', 'Ulnar nerve', 'Radial nerve', 'Musculocutaneous nerve', 'Sciatic nerve', 'Femoral nerve', 'Tibial nerve', 'Common fibular nerve'], side: 'r', stage: 3, text: 'The brachial plexus (C5 to T1) gives the musculocutaneous, median, ulnar, radial and axillary nerves of the arm. The lumbosacral plexus gives the femoral and obturator nerves and the sciatic nerve, the largest in the body, which divides into the tibial and common fibular nerves.' },
  ],
  facts: [['Resting potential', 'about −70 mV'], ['Threshold', 'about −55 mV'], ['Peak', 'about +30 mV'], ['Fastest conduction', 'about 120 m/s'], ['Neurons in the brain', 'about 86 billion']],
};

// ------------------------------------------------------------------ muscle contraction
const muscle: Lesson = {
  id: 'muscle',
  title: 'How a muscle contracts',
  icon: '💪',
  blurb: 'From nerve signal to sliding filaments, using the biceps as the example',
  period: 3,
  normal: [{ layers: ['muscles', 'bones'], side: 'r', where: (c) => c[0] < -0.1 && c[1] > 0.85 }, { names: ['Musculocutaneous nerve'], side: 'r' }],
  ghost: [{ layers: ['bones'], where: (c) => c[0] >= -0.1 || c[1] <= 0.85 }],
  focus: { names: ['Biceps brachii muscle', 'Humerus', 'Radius'], side: 'r', pad: 1.1 },
  glows: [{ names: ['Biceps brachii muscle'], side: 'r', color: 0xc0504a, glow: 0xff7a45, level: (p) => 0.55 * contraction(p) }],
  flows: [{ names: ['Musculocutaneous nerve'], side: 'r', color: 0xe8c547, glow: 0xfff3a0, origin: 'Musculocutaneous nerve', originSide: 'r', waves: 12, sharp: true, rate: 3 }],
  diagram: sarcomereDiagram,
  status: (p) => (contraction(p) > 0.02 ? `Biceps contracting: ${Math.round(contraction(p) * 100)}%` : 'Biceps relaxed'),
  steps: [
    { title: 'From muscle to sarcomere', names: ['Biceps brachii muscle'], side: 'r', stage: 0, text: 'A skeletal muscle is made of bundles (fascicles) of long muscle cells (fibres). Each fibre is packed with myofibrils, which are chains of sarcomeres: the contractile units, about 2.5 µm long, made of thick myosin and thin actin filaments.' },
    { title: 'Motor unit and neuromuscular junction', names: ['Musculocutaneous nerve'], side: 'r', stage: 0, text: 'A motor neuron and all the fibres it supplies form a motor unit. The musculocutaneous nerve (C5 to C7) supplies the biceps. At each neuromuscular junction, acetylcholine crosses the cleft, binds nicotinic receptors and triggers an action potential in the muscle fibre.' },
    { title: 'Excitation–contraction coupling', stage: 1, text: 'The muscle action potential runs down T-tubules into the fibre and causes the sarcoplasmic reticulum to release Ca²⁺ (the yellow dots). Calcium binds troponin, which moves tropomyosin off the myosin-binding sites on actin.' },
    { title: 'The cross-bridge cycle', stage: 3, text: 'Myosin heads bind actin and swing (the power stroke), pulling the thin filament toward the M line. ATP binding releases the head, and splitting ATP re-cocks it for the next stroke. Without ATP the heads stay locked on actin, which is what causes rigor mortis.' },
    { title: 'Sliding filaments', stage: 2, text: 'The filaments themselves do not shorten; they slide past each other. The Z lines are pulled together, so the sarcomere, the I band and the H zone shorten while the A band (the length of the myosin) stays the same.' },
    { title: 'Muscles work in pairs', names: ['Biceps brachii muscle', 'Brachialis muscle', 'Triceps brachii muscle'], side: 'r', stage: 2, text: 'Muscles can only pull. The biceps and brachialis flex the elbow (agonists) while the triceps (antagonist) relaxes, and vice versa. A contraction can shorten the muscle (concentric), lengthen it under load (eccentric, lowering a weight) or hold length (isometric).' },
  ],
  facts: [['Sarcomere length', 'about 2.0 to 3.5 µm'], ['Trigger', 'Ca²⁺ binding troponin'], ['Energy', 'ATP for each cross-bridge cycle'], ['Biceps innervation', 'musculocutaneous nerve (C5 to C7)']],
};

// ------------------------------------------------------------------ digestion
const gutTube = ['Oesophagus', 'Stomach', 'Duodenum', 'Jejunum', 'Ascending colon', 'Transverse colon', 'Descending colon', 'Sigmoid colon'];
const digestion: Lesson = {
  id: 'digestion',
  title: 'Digestion and absorption',
  icon: '🍽️',
  blurb: 'Mouth to colon: peristalsis, enzymes, bile, and where nutrients are absorbed',
  period: 8,
  normal: [{ layers: ['digestive'] }],
  ghost: [{ layers: ['bones'], where: (c) => c[1] > 0.75 }],
  focus: { layers: ['digestive'], pad: 1.05 },
  flows: [{ names: gutTube, color: 0xd88a7a, glow: 0xffc9a0, origin: 'Oesophagus', waves: 7, rate: 2, strength: 0.7 }],
  diagram: gutDiagram,
  steps: [
    { title: 'Mouth and salivary glands', names: ['Tongue', 'Parotid gland', 'Submandibular gland', 'Sublingual gland'], stage: 0, text: 'Chewing breaks food up and mixes it with 1 to 1.5 L of saliva a day from the parotid, submandibular and sublingual glands. Salivary amylase starts digesting starch, and mucus binds the food into a bolus.' },
    { title: 'Swallowing', names: ['Soft palate', 'Epiglottis', 'Oropharynx', 'Laryngopharynx', 'Oesophagus'], stage: 1, text: 'The tongue pushes the bolus back; then a reflex takes over. The soft palate seals the nasopharynx, the larynx lifts and the epiglottis tips over its entrance, and waves of peristalsis carry the bolus down the 25 cm oesophagus in about 8 seconds.' },
    { title: 'Stomach', names: ['Stomach'], stage: 2, text: 'The stomach stores and churns food. Parietal cells secrete hydrochloric acid (pH about 1.5 to 2) and intrinsic factor; chief cells secrete pepsinogen, activated to pepsin to start protein digestion. The resulting chyme passes the pyloric sphincter in small squirts over 2 to 4 hours.' },
    { title: 'Liver, gallbladder and pancreas', names: ['Liver', 'Gallbladder', 'Bile duct', 'Pancreas', 'Pancreatic duct', 'Duodenum'], stage: 3, text: 'In the duodenum, bile (made by the liver, stored in the gallbladder) emulsifies fat, and pancreatic juice neutralises acid with bicarbonate and supplies enzymes for protein (trypsin), fat (lipase) and starch (amylase). Both enter through the major duodenal papilla.' },
    { title: 'Small intestine', names: ['Duodenum', 'Jejunum'], stage: 4, text: 'Most digestion and absorption happens here, across folds, villi and microvilli. Sugars and amino acids enter capillaries and travel to the liver in the hepatic portal vein; fats are packaged into chylomicrons and enter lymphatic lacteals. (The open atlas does not model the ileum.)' },
    { title: 'Large intestine', names: ['Ascending colon', 'Transverse colon', 'Descending colon', 'Sigmoid colon', 'Vermiform appendix'], stage: 5, text: 'The colon absorbs most of the remaining water and salts, and its bacteria ferment fibre and make vitamin K. Slow mass movements push the contents toward the rectum over 12 to 36 hours. (The caecum and rectum are not in the open atlas.)' },
    { title: 'First stop: the liver', names: ['Liver', 'Hepatic portal vein'], stage: 6, text: 'Blood from the gut goes to the liver before the rest of the body. The liver stores glucose as glycogen, makes plasma proteins, processes fats, stores vitamins and iron, and detoxifies drugs and ammonia (as urea).' },
  ],
  facts: [['Length of the tract', 'about 9 m'], ['Saliva', '1 to 1.5 L a day'], ['Gastric acid', 'pH 1.5 to 2'], ['Total transit time', 'about 1 to 3 days']],
};

// ------------------------------------------------------------------ kidneys
const kidneys: Lesson = {
  id: 'kidneys',
  title: 'Kidneys and urine',
  icon: '💧',
  blurb: 'Filtration, reabsorption and secretion in the nephron, and how urine leaves the body',
  period: 5,
  normal: [{ layers: ['urinary'] }, { names: ['Abdominal aorta', 'Inferior vena cava (abdominal part)', 'Suprarenal gland'] }],
  ghost: [{ layers: ['bones'], where: abdomen }],
  focus: { layers: ['urinary'], pad: 1.15 },
  flows: [
    { names: ['Ureter', 'Renal pelvis'], side: 'l', color: 0xe0c552, glow: 0xfff3a0, origin: 'Renal pelvis', originSide: 'l', waves: 6, sharp: true, rate: 1 },
    { names: ['Ureter', 'Renal pelvis'], side: 'r', color: 0xe0c552, glow: 0xfff3a0, origin: 'Renal pelvis', originSide: 'r', waves: 6, sharp: true, rate: 1 },
    { names: ['Abdominal aorta'], color: 0xc43d36, glow: 0xff8a70, origin: 'Abdominal aorta', waves: 4, rate: 1.2 },
    { names: ['Inferior vena cava (abdominal part)'], color: 0x3f63c8, glow: 0x9db7ff, origin: 'Inferior vena cava (abdominal part)', waves: 4, dir: -1, rate: 1, strength: 0.6 },
  ],
  diagram: nephronDiagram,
  steps: [
    { title: 'The kidneys filter the blood', names: ['Kidney'], stage: 0, text: 'The kidneys receive 20 to 25% of the cardiac output, about 1.2 L of blood a minute. They filter about 180 L of plasma a day and return all but 1 to 2 L, which leaves as urine carrying urea, excess salts, acids and drugs.' },
    { title: 'The nephron', names: ['Kidney'], stage: 1, text: 'Each kidney has about a million nephrons. Each one is a renal corpuscle (a capillary tuft, the glomerulus, inside Bowman\'s capsule) followed by a long tubule: proximal convoluted tubule, loop of Henle, distal convoluted tubule, and a collecting duct shared with other nephrons.' },
    { title: 'Filtration', names: ['Kidney'], stage: 2, text: 'Blood pressure in the glomerulus (about 55 mmHg) pushes water and small solutes through the filtration barrier into Bowman\'s capsule, while blood cells and most proteins stay behind. The glomerular filtration rate (GFR) is about 125 mL per minute.' },
    { title: 'Reabsorption', names: ['Kidney'], stage: 3, text: 'The proximal tubule takes back about two-thirds of the water and sodium and normally all of the glucose and amino acids. The loop of Henle pumps salt into the medulla, building the gradient that lets the kidney make concentrated urine.' },
    { title: 'Secretion and fine tuning', names: ['Kidney', 'Suprarenal gland'], stage: 4, text: 'The distal tubule and collecting duct fine-tune the urine under hormonal control: aldosterone (from the adrenal cortex) increases sodium reabsorption, ADH (from the posterior pituitary) inserts water channels so more water is kept, and H⁺ and K⁺ are secreted to balance pH and potassium.' },
    { title: 'Ureters, bladder and urethra', names: ['Renal pelvis', 'Ureter', 'Urinary bladder', 'Urethra'], stage: 4, text: 'Urine collects in the renal pelvis and is pushed down each ureter by peristaltic waves (the pulses on the model) into the bladder, which comfortably holds 400 to 600 mL. In the micturition reflex, parasympathetic nerves (S2 to S4) contract the detrusor muscle, and the external sphincter is relaxed voluntarily.' },
    { title: 'The kidney as a gland', names: ['Kidney'], stage: 0, text: 'The kidneys also make hormones: renin (which starts the renin–angiotensin–aldosterone system to raise blood pressure), erythropoietin (which stimulates red blood cell production) and calcitriol (active vitamin D, for calcium absorption).' },
  ],
  facts: [['Blood flow', 'about 1.2 L per minute'], ['Filtrate', 'about 180 L a day'], ['Urine', '1 to 2 L a day'], ['GFR', 'about 125 mL per minute'], ['Nephrons', 'about 1 million per kidney']],
};

// ------------------------------------------------------------------ hormones
const glands = ['Hypothalamus', 'Adenohypophysis', 'Neurohypophysis', 'Pineal gland', 'Thyroid gland', 'Superior parathyroid gland', 'Inferior parathyroid gland', 'Suprarenal gland', 'Pancreas', 'Testis'];
const pulse = (offset: number) => (p: number) => 0.15 + 0.45 * Math.max(0, Math.sin(2 * Math.PI * (p - offset)));
const endocrine: Lesson = {
  id: 'endocrine',
  title: 'Hormones and feedback',
  icon: '🧪',
  blurb: 'The pituitary, thyroid, adrenals and pancreas, and how negative feedback keeps levels steady',
  period: 8,
  normal: [{ layers: ['endocrine'] }, { names: ['Hypothalamus', 'Pancreas', 'Testis'] }],
  ghost: [{ layers: ['skin'] }],
  glows: [
    { names: ['Hypothalamus', 'Adenohypophysis', 'Neurohypophysis', 'Pineal gland'], color: 0xc7a1e0, glow: 0x9a5cff, level: pulse(0) },
    { names: ['Thyroid gland', 'Superior parathyroid gland', 'Inferior parathyroid gland'], color: 0xd98a7a, glow: 0xff9a5c, level: pulse(0.2) },
    { names: ['Suprarenal gland'], color: 0xe0b060, glow: 0xffc65c, level: pulse(0.4) },
    { names: ['Pancreas'], color: 0xe8c890, glow: 0xffe08a, level: pulse(0.6) },
    { names: ['Testis'], color: 0xd8a0a0, glow: 0xff8aa8, level: pulse(0.8) },
  ],
  diagram: hormoneDiagram,
  steps: [
    { title: 'Hypothalamus and pituitary', names: ['Hypothalamus', 'Adenohypophysis', 'Neurohypophysis'], stage: 0, text: 'The hypothalamus links the nervous and endocrine systems. Its releasing hormones travel in a tiny portal blood system to the anterior pituitary, which then secretes GH, TSH, ACTH, FSH, LH and prolactin. ADH and oxytocin are made in the hypothalamus and released from the posterior pituitary.' },
    { title: 'Thyroid and negative feedback', names: ['Thyroid gland'], stage: 1, text: 'TRH from the hypothalamus causes TSH release, and TSH makes the thyroid secrete T₄ and T₃, which raise the metabolic rate of almost every cell. Rising T₃/T₄ switches off TRH and TSH: negative feedback, the commonest control pattern in the endocrine system.' },
    { title: 'Parathyroid glands and calcium', names: ['Superior parathyroid gland', 'Inferior parathyroid gland'], stage: 1, text: 'Four small parathyroid glands behind the thyroid release parathyroid hormone (PTH) when blood calcium falls. PTH releases calcium from bone, makes the kidneys keep calcium, and activates vitamin D to absorb more from the gut.' },
    { title: 'Adrenal glands', names: ['Suprarenal gland'], stage: 1, text: 'The adrenal cortex makes cortisol (stress response, raises glucose), aldosterone (keeps sodium, loses potassium) and androgens. The adrenal medulla is part of the sympathetic system and releases adrenaline and noradrenaline for fight or flight.' },
    { title: 'Pancreas and blood glucose', names: ['Pancreas'], stage: 2, text: 'The islets of Langerhans hold β cells, which release insulin when glucose rises (cells take up glucose, the liver stores glycogen), and α cells, which release glucagon when glucose falls (the liver releases glucose). Together they keep fasting glucose at about 4 to 6 mmol/L.' },
    { title: 'Pineal gland and gonads', names: ['Pineal gland', 'Testis'], stage: 2, text: 'The pineal gland releases melatonin in darkness, helping set the sleep–wake cycle. The testes make testosterone under LH; the ovaries make oestrogen and progesterone under FSH and LH. (The open atlas currently models only the male reproductive organs.)' },
  ],
  facts: [['Fasting glucose', 'about 4 to 6 mmol/L'], ['Main control pattern', 'negative feedback'], ['Master gland', 'pituitary, under the hypothalamus']],
};

// ------------------------------------------------------------------ lymph
const lymph: Lesson = {
  id: 'lymph',
  title: 'Lymph and immunity',
  icon: '🛡️',
  blurb: 'How tissue fluid returns to the blood, and the lymph nodes, spleen, thymus and tonsils',
  period: 6,
  normal: [{ layers: ['lymph'] }],
  ghost: [{ layers: ['skin'] }],
  flows: [{ layers: ['lymph'], where: (_c, a, id) => !/spleen|thymus|tonsil/i.test(a.items[id].n), color: 0x5fbf6e, glow: 0xc8ffb0, origin: 'Supraclavicular nodes', originSide: 'l', waves: 2.2, dir: -1, rate: 1 }],
  diagram: lymphDiagram,
  steps: [
    { title: 'Why we need lymph', stage: 0, text: 'Blood pressure pushes fluid out of capillaries into the tissues. Most is drawn back in at the venous end, but about 3 L a day is left over. Lymph capillaries collect it, along with proteins and any microbes, and return it to the blood.' },
    { title: 'Lymph nodes', names: ['Central axillary nodes', 'Apical axillary nodes', 'Superficial lateral cervical nodes', 'Superficial inguinal nodes'], stage: 0, text: 'About 600 lymph nodes sit along the lymph vessels, clustered in the neck, armpits, groin and around the gut. Macrophages filter out debris and microbes and lymphocytes mount immune responses, which is why nodes swell during an infection.' },
    { title: 'Back into the veins', names: ['Left brachiocephalic vein', 'Right brachiocephalic vein', 'Supraclavicular nodes'], stage: 0, text: 'Lymph flows slowly, pushed by muscle movement and one-way valves. The thoracic duct drains about three-quarters of the body into the junction of the left internal jugular and subclavian veins; the right lymphatic duct drains the upper right quarter. (The ducts themselves are not in the open atlas.)' },
    { title: 'Spleen', names: ['Spleen'], stage: 0, text: 'The spleen filters blood rather than lymph. Its red pulp removes old red blood cells and recycles iron; its white pulp is lymphoid tissue that responds to blood-borne microbes.' },
    { title: 'Thymus', names: ['Left lobe of thymus', 'Right lobe of thymus'], stage: 0, text: 'T lymphocytes mature in the thymus, learning to recognise foreign antigens but not the body\'s own. It is largest in childhood and is gradually replaced by fat after puberty.' },
    { title: 'Tonsils', names: ['Palatine tonsil'], stage: 0, text: 'The tonsils are lymphoid tissue guarding the entrance to the throat, sampling what is breathed in and swallowed. With the adenoids and lingual tonsil they form a ring (Waldeyer\'s ring).' },
  ],
  facts: [['Lymph returned', 'about 3 L a day'], ['Lymph nodes', 'about 600'], ['Main drain', 'thoracic duct into the left venous angle']],
};

export const LESSONS: Lesson[] = [breathing, nerve, muscle, digestion, kidneys, endocrine, lymph];
