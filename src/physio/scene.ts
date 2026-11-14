import * as THREE from 'three';
import type { Atlas } from '../data/meta';
import { GHOST, NORMAL } from '../viewer/Viewer';
import type { Viewer } from '../viewer/Viewer';

/** All structure ids for a list of names (groups expand to their structures, both sides). */
export function idsByNames(atlas: Atlas, names: string[]): number[] {
  const out = new Set<number>();
  for (const n of names) for (const id of atlas.resolveName(n)) out.add(id);
  return [...out];
}

export function idsByLayer(atlas: Atlas, keys: string[], filter?: (id: number) => boolean): number[] {
  const set = new Set(keys.map((k) => atlas.lg(k)));
  const out: number[] = [];
  atlas.items.forEach((it, id) => {
    if (it.y === 's' && it.g !== undefined && set.has(it.g) && (!filter || filter(id))) out.push(id);
  });
  return out;
}

export function buildWant(atlas: Atlas, normal: Iterable<number>, ghost: Iterable<number> = []): Uint8Array {
  const want = new Uint8Array(atlas.items.length);
  for (const id of ghost) want[id] = GHOST;
  for (const id of normal) want[id] = NORMAL;
  return want;
}

export interface FlowUniforms {
  uBeat: { value: number };
  uHeart: { value: THREE.Vector3 };
  /** pulses per metre of distance from the origin */
  uWaves: { value: number };
  /** +1 outward, -1 inward; shared so a lesson can reverse flow (breathing) */
  uDir: { value: number };
  uStrength: { value: number };
}

export function flowUniforms(origin: THREE.Vector3, waves: number, dir = 1, strength = 1, beat?: { value: number }): FlowUniforms {
  return { uBeat: beat ?? { value: 0 }, uHeart: { value: origin.clone() }, uWaves: { value: waves }, uDir: { value: dir }, uStrength: { value: strength } };
}

/**
 * A vessel material with a travelling glow. `dir` +1 sends pulses away from the origin point
 * (arteries, motor nerves), -1 toward it (veins, sensory nerves).
 */
export function flowMaterial(opts: {
  color: number; glow: number; uniforms: FlowUniforms; sharp?: boolean; opacity?: number;
}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: opts.color, roughness: 0.45, metalness: 0.02, side: THREE.DoubleSide });
  if (opts.opacity !== undefined && opts.opacity < 1) {
    mat.transparent = true;
    mat.opacity = opts.opacity;
    mat.depthWrite = false;
  }
  const glow = new THREE.Color(opts.glow);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBeat = opts.uniforms.uBeat;
    shader.uniforms.uHeart = opts.uniforms.uHeart;
    shader.uniforms.uGlow = { value: glow };
    shader.uniforms.uDir = opts.uniforms.uDir;
    shader.uniforms.uWaves = opts.uniforms.uWaves;
    shader.uniforms.uStrength = opts.uniforms.uStrength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlowPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFlowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlowPos;\nuniform float uBeat;\nuniform vec3 uHeart;\nuniform vec3 uGlow;\nuniform float uDir;\nuniform float uWaves;\nuniform float uStrength;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float fd = distance(vFlowPos, uHeart);
        float ph = fract(uBeat - uDir * fd * uWaves);
        float band = ${opts.sharp ? 'smoothstep(0.0, 0.04, ph) * (1.0 - smoothstep(0.04, 0.22, ph))' : 'smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.08, 0.45, ph))'};
        float fine = 0.5 + 0.5 * sin(6.2832 * (fd * 28.0 - uDir * uBeat * 2.0));
        totalEmissiveRadiance += uGlow * (band * 0.9 + fine * 0.12) * uStrength;`,
      );
  };
  mat.customProgramCacheKey = () => `flow-${opts.sharp ? 1 : 0}`;
  return mat;
}

/** A material whose glow follows a shared 0..1 uniform (glands, contracting muscle, chambers). */
export function glowMaterial(color: number, glow: number, level: { value: number }, opacity?: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide });
  if (opacity !== undefined && opacity < 1) {
    mat.transparent = true;
    mat.opacity = opacity;
    mat.depthWrite = false;
  }
  const g = new THREE.Color(glow);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLevel = level;
    shader.uniforms.uGlow = { value: g };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLevel;\nuniform vec3 uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * uLevel;');
  };
  mat.customProgramCacheKey = () => 'glow';
  return mat;
}

/** Scale a loaded item about a pivot each frame without disturbing its stored transform. */
export class Squeezer {
  private base = new Map<number, THREE.Matrix4>();
  private m = new THREE.Matrix4();
  private t1 = new THREE.Matrix4();
  private t2 = new THREE.Matrix4();
  private s = new THREE.Matrix4();
  constructor(private viewer: Viewer) {}

  set(id: number, pivot: THREE.Vector3, sx: number, sy: number, sz: number, ty = 0) {
    this.t1.makeTranslation(pivot.x, pivot.y + ty, pivot.z);
    this.s.makeScale(sx, sy, sz);
    this.t2.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
    this.m.copy(this.t1).multiply(this.s).multiply(this.t2);
    this.setMatrix(id, this.m);
  }

  /** Apply a world-space transform on top of the item's stored transform. */
  setMatrix(id: number, world: THREE.Matrix4) {
    const node = this.viewer.nodes[id];
    if (!node) return;
    let base = this.base.get(id);
    if (!base) {
      node.updateMatrix();
      base = node.matrix.clone();
      this.base.set(id, base);
      node.matrixAutoUpdate = false;
    }
    node.matrix.multiplyMatrices(world, base);
    node.matrixWorldNeedsUpdate = true;
  }

  restore() {
    for (const [id, base] of this.base) {
      const node = this.viewer.nodes[id];
      if (!node) continue;
      node.matrix.copy(base);
      node.matrixAutoUpdate = true;
      node.matrix.decompose(node.position, node.quaternion, node.scale);
      node.matrixWorldNeedsUpdate = true;
    }
    this.base.clear();
    this.viewer.invalidate();
  }
}
