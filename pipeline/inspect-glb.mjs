// node pipeline/inspect-glb.mjs file.glb : prints mesh nodes, triangle counts and world bounds
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  console.log('##', f.split('/').pop());
  scene.traverse((n) => {
    const m = n.getMesh();
    if (!m) return;
    let tris = 0;
    for (const p of m.listPrimitives()) { const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
    const b = getBounds(n);
    console.log(n.getName().padEnd(52), String(Math.round(tris)).padStart(7), b.min.map((x) => x.toFixed(3)).join(','), '|', b.max.map((x) => x.toFixed(3)).join(','));
  });
}
