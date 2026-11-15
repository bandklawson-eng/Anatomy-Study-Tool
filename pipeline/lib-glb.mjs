// Small helpers for reading glTF meshes as world-space triangle soups.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
export const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

/** Reads every mesh node: { name, pos: Float32Array (world), idx: Uint32Array } (primitives merged). */
export async function readNodes(file) {
  const doc = await io.read(file);
  await doc.transform(dequantize());
  const out = [];
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  scene.traverse((n) => {
    const mesh = n.getMesh();
    if (!mesh) return;
    const m = n.getWorldMatrix();
    const P = [], I = [];
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute('POSITION');
      const base = P.length / 3;
      const v = [0, 0, 0];
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, v);
        P.push(m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]);
      }
      const ix = p.getIndices();
      if (ix) for (let i = 0; i < ix.getCount(); i++) I.push(base + ix.getScalar(i));
      else for (let i = 0; i < a.getCount(); i++) I.push(base + i);
    }
    out.push({ name: n.getName(), pos: new Float32Array(P), idx: new Uint32Array(I) });
  });
  return out;
}

export function bounds(pos) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = pos[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  return [mn, mx];
}
