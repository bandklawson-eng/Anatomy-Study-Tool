// A simple quantitative model of one cardiac cycle (left heart values, resting adult).
// p is the position in the cycle from 0 to 1, starting at the P wave (atrial systole).

export interface Phase {
  key: string;
  name: string;
  short: string;
  start: number;
  end: number;
  av: boolean; // atrioventricular (tricuspid, mitral) valves open
  sl: boolean; // semilunar (pulmonary, aortic) valves open
  text: string;
  ecg: string;
}

export const PHASES: Phase[] = [
  {
    key: 'as', name: 'Atrial systole', short: 'Atrial systole', start: 0, end: 0.14, av: true, sl: false,
    text: 'The SA node fires and the atria contract, topping up the ventricles with the last 20% or so of their filling (the “atrial kick”). The AV valves are open; the semilunar valves are closed.',
    ecg: 'P wave: atrial depolarisation',
  },
  {
    key: 'ivc', name: 'Isovolumetric contraction', short: 'Isovolumetric contraction', start: 0.14, end: 0.2, av: false, sl: false,
    text: 'The ventricles begin to contract. Pressure rises above atrial pressure and snaps the tricuspid and mitral valves shut: the first heart sound (S1, “lub”). All four valves are closed, so pressure climbs steeply while the volume stays the same.',
    ecg: 'QRS complex: ventricular depolarisation',
  },
  {
    key: 'ej', name: 'Ventricular ejection', short: 'Ejection', start: 0.2, end: 0.52, av: false, sl: true,
    text: 'Ventricular pressure exceeds the pressure in the aorta and pulmonary trunk, the semilunar valves open, and blood is ejected: the right ventricle to the lungs, the left ventricle to the body. About 70 mL leaves each ventricle (the stroke volume). Meanwhile the atria refill from the veins.',
    ecg: 'ST segment and T wave: ventricular repolarisation',
  },
  {
    key: 'ivr', name: 'Isovolumetric relaxation', short: 'Isovolumetric relaxation', start: 0.52, end: 0.62, av: false, sl: false,
    text: 'The ventricles relax and their pressure falls below arterial pressure, so the aortic and pulmonary valves close: the second heart sound (S2, “dub”). All four valves are closed again and pressure drops quickly with no change in volume.',
    ecg: 'End of the T wave',
  },
  {
    key: 'fill', name: 'Ventricular filling', short: 'Filling', start: 0.62, end: 1, av: true, sl: false,
    text: 'Ventricular pressure drops below atrial pressure, the AV valves open, and blood that collected in the atria pours into the ventricles: fast at first, then slowly (diastasis). Most filling is passive and happens here, before the atria contract.',
    ecg: 'Isoelectric line between T and the next P wave',
  },
];

export function phaseAt(p: number): Phase {
  for (const ph of PHASES) if (p >= ph.start && p < ph.end) return ph;
  return PHASES[PHASES.length - 1];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const within = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const gauss = (p: number, mu: number, sigma: number) => Math.exp(-((p - mu) ** 2) / (2 * sigma * sigma));

export const EDV = 120;
export const ESV = 50;

/** Left ventricular volume, mL. */
export function lvVolume(p: number): number {
  if (p < 0.14) return lerp(104, EDV, smooth(within(p, 0.02, 0.13)));
  if (p < 0.2) return EDV;
  if (p < 0.52) {
    const t = within(p, 0.2, 0.52);
    return lerp(EDV, ESV, 1 - Math.pow(1 - t, 2.2));
  }
  if (p < 0.62) return ESV;
  const t = within(p, 0.62, 1);
  return lerp(ESV, 104, 1 - Math.pow(1 - t, 3));
}

/** Left ventricular pressure, mmHg. */
export function lvPressure(p: number): number {
  if (p < 0.14) return 6 + 4 * Math.sin(Math.PI * within(p, 0.02, 0.14));
  if (p < 0.2) return lerp(8, 80, smooth(within(p, 0.14, 0.2)));
  if (p < 0.52) {
    const t = within(p, 0.2, 0.52);
    return 80 + 40 * Math.sin(Math.PI * Math.pow(t, 0.8) * 0.82) + (t > 0.8 ? -8 * within(t, 0.8, 1) : 0);
  }
  if (p < 0.62) return lerp(lvPressure(0.5199), 4, smooth(within(p, 0.52, 0.62)));
  return lerp(4, 6, within(p, 0.62, 1));
}

/** Aortic pressure, mmHg. */
export function aorticPressure(p: number): number {
  if (p >= 0.2 && p < 0.52) return lvPressure(p) - 2;
  // after the valve closes: dicrotic notch, then a slow run-off until the next ejection
  const since = p >= 0.52 ? p - 0.52 : p + 0.48; // 0 .. 0.68
  const end = lvPressure(0.5199) - 2;
  const notch = -7 * gauss(since, 0.012, 0.01) + 5 * gauss(since, 0.045, 0.02);
  return lerp(end, 80, Math.pow(since / 0.68, 0.75)) + notch;
}

/** Left atrial pressure, mmHg (a, c and v waves). */
export function laPressure(p: number): number {
  return 5 + 5 * gauss(p, 0.08, 0.035) + 3 * gauss(p, 0.17, 0.02) - 2 * gauss(p, 0.3, 0.06) + 6 * gauss(p, 0.58, 0.07) + 5 * gauss(p, -0.42, 0.07) - 1.5 * gauss(p, 0.72, 0.05);
}

/** Lead II style ECG, arbitrary units (R wave = 1). */
export function ecg(p: number): number {
  return (
    0.14 * gauss(p, 0.055, 0.018) - 0.1 * gauss(p, 0.137, 0.005) + 1.0 * gauss(p, 0.15, 0.006) - 0.22 * gauss(p, 0.163, 0.005) + 0.28 * gauss(p, 0.43, 0.04)
  );
}

/** 0..1 contraction of the atria and of the ventricles, for animation. */
export function atrialContraction(p: number): number {
  return Math.sin(Math.PI * within(p, 0.01, 0.15)) ** 1.2;
}
export function ventricularContraction(p: number): number {
  return (EDV - lvVolume(p)) / (EDV - ESV);
}
/** 0..1 atrial filling (the atria swell while the AV valves are closed). */
export function atrialFilling(p: number): number {
  if (p >= 0.14 && p < 0.62) return smooth(within(p, 0.14, 0.62));
  if (p >= 0.62) return 1 - smooth(within(p, 0.62, 0.8));
  return 0;
}
