// Colours for the material names used by the Z-Anatomy models.

export interface Look {
  color: number;
  rough: number;
  opacity?: number;
}

const BONE_TINTS = [0xe9dfc8, 0xe6d8bb, 0xded4c0, 0xeadbc3, 0xd9cdb4, 0xe3d6c4, 0xe8dccb, 0xdcd2ba, 0xe5d9bd];
const NERVE_TINTS = [0xf2d24b, 0xf0c53a, 0xf5dc6a, 0xe9c94f, 0xf7d95c, 0xeccb45, 0xf3d66b, 0xe6c13c, 0xf0cf58];
const LYMPH_TINTS = [0x8fc97a, 0x7fbf6d, 0x9bd184, 0x86c574, 0xa4d68d, 0x78b866, 0x93cc7f, 0x89c677, 0x9ed388];
const ORGAN_TINTS = [0xb5644e, 0xc27a5b, 0xa9584c, 0xcc8a6a, 0xb86f57, 0xbd6a5c, 0xa8604a, 0xc98466, 0xb0705f];
const LUNG_TINTS = [0xe3a3a0, 0xdc9794, 0xe8adaa, 0xd98f8e, 0xe5a7a1, 0xdf9c9a, 0xeab3ae, 0xd68b8b, 0xe1a09c, 0xdb9592];
const BRONCHI_TINTS = [0xcfd9e0, 0xc4d0d8, 0xd6dfe5, 0xbfccd5, 0xd1dae1, 0xc8d3db, 0xd9e1e6, 0xbac8d2, 0xccd6dd];
const SKIN_TINTS = [0xe0b192, 0xdcab8b, 0xe3b698, 0xd8a685, 0xe5ba9d, 0xdfae8f, 0xdaa888, 0xe2b394, 0xddac8d];
const SUTURE_TINTS = [0x9c8f78, 0xa39680, 0x968a73, 0xa89b84, 0x91856f, 0x9f927b, 0xab9e88, 0x8d816b, 0xa49781];

/** Muscle colour by primary action (Z-Anatomy convention), used by the "colour by action" mode. */
export const ACTION_COLORS: Record<string, { color: number; label: string }> = {
  Flexion: { color: 0xd9534f, label: 'Flexion' },
  Extension: { color: 0x3b82c4, label: 'Extension' },
  Abductor: { color: 0xe8a33d, label: 'Abduction' },
  Adductor: { color: 0x7b5bd6, label: 'Adduction' },
  'External rotation': { color: 0x2fa6a0, label: 'External rotation' },
  'Internal rotator': { color: 0xc45ba8, label: 'Internal rotation' },
  Levator: { color: 0x6bbf59, label: 'Elevation' },
  Depressor: { color: 0x8a6d3b, label: 'Depression' },
  'Flexion hand/foot': { color: 0xe07a5f, label: 'Flexion of hand / foot' },
  'Extension hand/foot': { color: 0x5fa8d3, label: 'Extension of hand / foot' },
  'Flexion fingers': { color: 0xf2a65a, label: 'Flexion of digits' },
  'Extensor extremities': { color: 0x86bbd8, label: 'Extension of digits' },
  Biarticular: { color: 0xb5838d, label: 'Two-joint muscle' },
  'Orbicularis/Constrictor': { color: 0xcf6a87, label: 'Sphincter / constrictor' },
  Masticator: { color: 0xa44a3f, label: 'Mastication' },
  Ingestion: { color: 0xd4a373, label: 'Swallowing' },
  Phonation: { color: 0x9d8189, label: 'Phonation' },
  Diaphragm: { color: 0xbc4749, label: 'Respiration' },
  Superficial: { color: 0xd98880, label: 'Facial expression' },
  Trapezius: { color: 0xb5524a, label: 'Scapular movement' },
};

function tint(list: number[], key: string): number {
  const m = /(\d+)/.exec(key);
  return list[m ? +m[1] % list.length : 0];
}

export function lookFor(key: string, colorByAction = false): Look {
  if (/^(Origin|Muscular origin)/.test(key)) return { color: 0xd6453d, rough: 0.6 };
  if (/^End/.test(key)) return { color: 0x3d7bd6, rough: 0.6 };
  if (/^Bone/.test(key)) return { color: tint(BONE_TINTS, key), rough: 0.62 };
  if (/^Suture/.test(key)) return { color: tint(SUTURE_TINTS, key), rough: 0.7 };
  if (/^Teeth-roots|^Dentine/.test(key)) return { color: 0xe6d3a1, rough: 0.5 };
  if (/^Teeth/.test(key)) return { color: 0xf6f3ea, rough: 0.25 };
  if (/^Cartilage/.test(key)) return { color: 0xbfd3dc, rough: 0.45 };
  if (/^Ligament/.test(key)) return { color: 0xd9dde2, rough: 0.5 };
  if (/^Articular capsule/.test(key)) return { color: 0xcfd6c4, rough: 0.55, opacity: 0.92 };
  if (/^Fat-breast/.test(key)) return { color: 0xf2dc8c, rough: 0.6 };
  if (/^Fat/.test(key)) return { color: 0xf0d67a, rough: 0.6 };
  if (/^Female-uterus/.test(key)) return { color: tint([0xc9605a, 0xbf5751, 0xd27069, 0xc96a63], key), rough: 0.5 };
  if (/^Female-ovary/.test(key)) return { color: 0xe6c2a0, rough: 0.55 };
  if (/^Female-tube/.test(key)) return { color: tint([0xe09a8f, 0xd88a80, 0xe6a597], key), rough: 0.45 };
  if (/^Female-vagina/.test(key)) return { color: tint([0xd47f86, 0xcd7078, 0xdb8c92], key), rough: 0.45 };
  if (/^Peritoneum-female/.test(key)) return { color: 0xeedcca, rough: 0.4, opacity: 0.42 };
  if (/^Gland-breast/.test(key)) return { color: 0xe0a77a, rough: 0.5 };
  if (/^Areola/.test(key)) return { color: tint([0xa8695a, 0x9c5e50, 0xb27464], key), rough: 0.55 };
  if (/^Fascia/.test(key)) return { color: 0xe6e0d6, rough: 0.5, opacity: 0.6 };
  if (/^Tendon/.test(key)) return { color: 0xe8e2d2, rough: 0.4 };
  if (/^Bursa/.test(key)) return { color: 0x9cc9e8, rough: 0.35, opacity: 0.85 };
  if (ACTION_COLORS[key]) {
    if (colorByAction) return { color: ACTION_COLORS[key].color, rough: 0.55 };
    // natural muscle: red-brown with slight variation per action group so neighbours stay distinguishable
    const i = Object.keys(ACTION_COLORS).indexOf(key);
    const base = [0xa63f3a, 0xb04a41, 0x9c3a36, 0xb5524a, 0xa8443d, 0x963633][i % 6];
    return { color: base, rough: 0.55 };
  }
  if (/^Pulmonary artery/.test(key)) return { color: 0x4f6fc2, rough: 0.4 };
  if (/^Pulmonary vein/.test(key)) return { color: 0xd9544f, rough: 0.4 };
  if (/^Artery/.test(key)) return { color: 0xd1342f, rough: 0.4 };
  if (/^Vein/.test(key)) return { color: 0x3f62b8, rough: 0.4 };
  if (/^Nerve/.test(key)) return { color: tint(NERVE_TINTS, key), rough: 0.5 };
  if (/^Frontal lobe/.test(key)) return { color: 0xe7a6a1, rough: 0.6 };
  if (/^Parietal lobe/.test(key)) return { color: 0xa9c9e8, rough: 0.6 };
  if (/^Occipital lobe/.test(key)) return { color: 0xb7dba6, rough: 0.6 };
  if (/^Temporal lobe/.test(key)) return { color: 0xf0d48a, rough: 0.6 };
  if (/^Insula/.test(key)) return { color: 0xc9a9e0, rough: 0.6 };
  if (/^Limbic lobe/.test(key)) return { color: 0xe8b98a, rough: 0.6 };
  if (/^Interlobar sulci/.test(key)) return { color: 0xb08a84, rough: 0.7 };
  if (/^Cerebellum/.test(key)) return { color: 0xd9a58f, rough: 0.6 };
  if (/^White matter/.test(key)) return { color: 0xf1ebe1, rough: 0.6 };
  if (/^Brain-Inner/.test(key)) return { color: 0xdcc3b4, rough: 0.6 };
  if (/^Brain/.test(key)) return { color: 0xe3b7a8, rough: 0.6 };
  if (/^Nucleus \(afferent/.test(key)) return { color: 0x6fa8dc, rough: 0.5 };
  if (/^Nucleus \(efferent/.test(key)) return { color: 0xe06666, rough: 0.5 };
  if (/^Nucleus/.test(key)) return { color: 0xc9b29b, rough: 0.5 };
  if (/^LCR/.test(key)) return { color: 0x9fd8e8, rough: 0.3, opacity: 0.75 };
  if (/^Cornea/.test(key)) return { color: 0xdff3fb, rough: 0.1, opacity: 0.35 };
  if (/^Iris/.test(key)) return { color: 0x4f7f9c, rough: 0.4 };
  if (/^Eye/.test(key)) return { color: 0xf3f0ea, rough: 0.3 };
  if (/^Mucosa/.test(key)) return { color: 0xe39a96, rough: 0.45 };
  if (/^Gland/.test(key)) return { color: 0xd9a066, rough: 0.5 };
  if (/^Lymph/.test(key)) return { color: tint(LYMPH_TINTS, key), rough: 0.5 };
  if (/^Lung/.test(key)) return { color: tint(LUNG_TINTS, key), rough: 0.55 };
  if (/^Bronchi/.test(key)) return { color: tint(BRONCHI_TINTS, key), rough: 0.45 };
  if (/^Gallbladder/.test(key)) return { color: 0x5f9e5a, rough: 0.4 };
  if (/^Intestine/.test(key)) return { color: 0xd9a08b, rough: 0.5 };
  if (/^Peritoneum/.test(key)) return { color: 0xe9d8c6, rough: 0.4, opacity: 0.45 };
  if (/^Ductus/.test(key)) return { color: 0x8fb56a, rough: 0.45 };
  if (/^Organ/.test(key)) return { color: tint(ORGAN_TINTS, key), rough: 0.5 };
  if (/^Skin-in/.test(key)) return { color: 0xc98f7a, rough: 0.7 };
  if (/^Skin/.test(key)) return { color: tint(SKIN_TINTS, key), rough: 0.65 };
  if (/^Nail/.test(key)) return { color: 0xf1d9cf, rough: 0.3 };
  if (/^Black/.test(key)) return { color: 0x2b211c, rough: 0.8 };
  return { color: 0xb9b3a8, rough: 0.6 };
}

/** Materials that belong to the heart in the cardiovascular file. */
export function heartLook(key: string): Look | null {
  if (/^Trapezius/.test(key)) return { color: 0xa8433f, rough: 0.5 };
  if (/^Cartilage|^Ligament/.test(key)) return { color: 0xeadfce, rough: 0.4 };
  return null;
}
