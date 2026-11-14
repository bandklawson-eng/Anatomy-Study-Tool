import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { Atlas, DATA_BASE, Landmark } from '../data/meta';
import { heartLook, lookFor } from './palette';

(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const HIDDEN = 0;
export const NORMAL = 1;
export const GHOST = 2;

export type ViewName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

const SEL_COLOR = 0xffc93c;

export interface PinLabel {
  index: number;
  lm: Landmark;
}

export class Viewer {
  atlas: Atlas;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root = new THREE.Group();
  overlay = new THREE.Group();

  want: Uint8Array;
  nodes: (THREE.Object3D | null)[];
  meshes: THREE.Mesh[][];
  selected = new Set<number>();
  hover = -1;
  colorByAction = false;
  /** Per-item material overrides (used by physiology animations). */
  overrides = new Map<number, THREE.Material>();

  private chunkState: Uint8Array;
  private chunkPromise: (Promise<void> | null)[];
  private mirrorsOfChunk: number[][];
  private loader: GLTFLoader;
  private mats = new Map<string, THREE.Material>();
  private selMat: THREE.MeshStandardMaterial;
  private raycaster = new THREE.Raycaster();
  private needsRender = true;
  private frameCbs = new Set<(t: number, dt: number) => void>();
  private clipPlane: THREE.Plane | null = null;
  private anim: { t0: number; dur: number; fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTgt: THREE.Vector3; toTgt: THREE.Vector3 } | null = null;
  private lastT = 0;
  private pending = 0;
  private disposed = false;

  // landmark pins
  private labelLayer: HTMLDivElement;
  private pins: { el: HTMLButtonElement; pos: THREE.Vector3; anchor: THREE.Vector3 }[] = [];
  private pinLines: THREE.LineSegments | null = null;
  private pinDots: THREE.Points | null = null;

  onPick: (id: number, ev: PointerEvent) => void = () => {};
  onHover: (id: number, x: number, y: number) => void = () => {};
  onLoading: (pending: number) => void = () => {};
  onPinClick: (landmarkIndex: number) => void = () => {};

  constructor(canvas: HTMLCanvasElement, labelLayer: HTMLDivElement, atlas: Atlas) {
    this.atlas = atlas;
    this.canvas = canvas;
    this.labelLayer = labelLayer;
    const n = atlas.items.length;
    this.want = new Uint8Array(n);
    this.nodes = new Array(n).fill(null);
    this.meshes = Array.from({ length: n }, () => []);
    const nc = atlas.meta.chunks.length;
    this.chunkState = new Uint8Array(nc);
    this.chunkPromise = new Array(nc).fill(null);
    this.mirrorsOfChunk = Array.from({ length: nc }, () => []);
    atlas.items.forEach((it, i) => {
      if (it.mi !== undefined && it.c !== undefined) this.mirrorsOfChunk[it.c].push(i);
    });

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.005, 30);
    this.camera.position.set(0, 0.95, 3.4);
    this.scene.add(this.camera);
    this.scene.add(this.root);
    this.scene.add(this.overlay);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4252, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(0.6, 0.9, 1.6);
    this.camera.add(key);
    this.camera.add(key.target);
    key.target.position.set(0, 0, -1);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 0.5);
    rim.position.set(-1.2, 0.4, -0.6);
    this.camera.add(rim);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.92, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.9;
    this.controls.zoomSpeed = 1.1;
    this.controls.minDistance = 0.03;
    this.controls.maxDistance = 8;
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('change', () => (this.needsRender = true));
    this.controls.addEventListener('start', () => (this.anim = null));
    this.controls.update();

    this.selMat = new THREE.MeshStandardMaterial({ color: SEL_COLOR, emissive: 0x7a4b00, emissiveIntensity: 0.55, roughness: 0.45, side: THREE.DoubleSide });

    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);

    this.bindPointer();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement!);
    this.resize();
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ loop
  private loop = (t: number) => {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    if (this.anim) {
      const a = this.anim;
      let k = Math.min(1, (t - a.t0) / a.dur);
      k = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(a.fromPos, a.toPos, k);
      this.controls.target.lerpVectors(a.fromTgt, a.toTgt, k);
      if (k >= 1) this.anim = null;
      this.needsRender = true;
    }
    if (this.frameCbs.size) {
      for (const cb of this.frameCbs) cb(t / 1000, dt);
      this.needsRender = true;
    }
    this.controls.update();
    if (this.needsRender) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this.updatePins();
    }
  };

  invalidate() {
    this.needsRender = true;
  }

  /** Register a per-frame callback; rendering becomes continuous while any is registered. */
  addFrame(cb: (t: number, dt: number) => void): () => void {
    this.frameCbs.add(cb);
    return () => {
      this.frameCbs.delete(cb);
      this.needsRender = true;
    };
  }

  private resize() {
    const p = this.canvas.parentElement!;
    const w = Math.max(1, p.clientWidth);
    const h = Math.max(1, p.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  // ------------------------------------------------------------------ materials
  private material(mk: string, variant: 'n' | 'g' | 'h', heart: boolean): THREE.Material {
    const key = `${mk}|${variant}|${heart ? 1 : 0}|${this.colorByAction ? 1 : 0}`;
    let m = this.mats.get(key);
    if (m) return m;
    const look = (heart && heartLook(mk)) || lookFor(mk, this.colorByAction);
    const mat = new THREE.MeshStandardMaterial({ color: look.color, roughness: look.rough, metalness: 0.02, side: THREE.DoubleSide });
    if (variant === 'g') {
      mat.transparent = true;
      mat.opacity = 0.09;
      mat.depthWrite = false;
      mat.roughness = 1;
    } else {
      if (look.opacity !== undefined && look.opacity < 1) {
        mat.transparent = true;
        mat.opacity = look.opacity;
        mat.depthWrite = look.opacity > 0.7;
      }
      if (variant === 'h') {
        mat.emissive = new THREE.Color(look.color).multiplyScalar(0.35);
        mat.color.lerp(new THREE.Color(0xffffff), 0.25);
      }
    }
    this.mats.set(key, mat);
    m = mat;
    return m;
  }

  setColorByAction(on: boolean) {
    if (this.colorByAction === on) return;
    this.colorByAction = on;
    this.refreshAll();
  }

  private applyItem(id: number) {
    const node = this.nodes[id];
    if (!node) return;
    const state = this.want[id];
    node.visible = state !== HIDDEN;
    if (!node.visible) return;
    const sel = this.selected.has(id);
    const ov = this.overrides.get(id);
    for (const mesh of this.meshes[id]) {
      const ud = mesh.userData;
      if (ov) mesh.material = ov;
      else if (sel) mesh.material = this.selMat;
      else mesh.material = this.material(ud.mk, state === GHOST ? 'g' : this.hover === id ? 'h' : 'n', ud.heart);
      mesh.renderOrder = state === GHOST && !sel && !ov ? 2 : 0;
    }
  }

  refreshAll() {
    for (let i = 0; i < this.nodes.length; i++) if (this.nodes[i]) this.applyItem(i);
    this.needsRender = true;
  }

  refreshItems(ids: Iterable<number>) {
    for (const id of ids) this.applyItem(id);
    this.needsRender = true;
  }

  // ------------------------------------------------------------------ visibility
  /** Apply a full visibility state (one byte per item) and the selection. Loads geometry as needed. */
  apply(want: Uint8Array, selected: Set<number>) {
    this.want = want;
    this.selected = selected;
    const chunks = this.atlas.meta.chunks.length;
    const need = new Uint8Array(chunks);
    const items = this.atlas.items;
    for (let i = 0; i < want.length; i++) {
      if (want[i] !== HIDDEN) {
        const c = items[i].c;
        if (c !== undefined) need[c] = 1;
      }
    }
    for (let c = 0; c < chunks; c++) if (need[c] && this.chunkState[c] === 0) void this.loadChunk(c);
    this.refreshAll();
  }

  isLoaded(id: number) {
    return !!this.nodes[id];
  }

  /** Resolves once the geometry for these items is on screen. */
  async ensureItems(ids: number[]) {
    const cs = new Set<number>();
    for (const id of ids) {
      const c = this.atlas.items[id].c;
      if (c !== undefined) cs.add(c);
    }
    await Promise.all([...cs].map((c) => this.loadChunk(c)));
  }

  loadChunk(c: number): Promise<void> {
    if (this.chunkPromise[c]) return this.chunkPromise[c]!;
    this.chunkState[c] = 1;
    this.pending++;
    this.onLoading(this.pending);
    const info = this.atlas.meta.chunks[c];
    const p = this.loader
      .loadAsync(`${DATA_BASE}geo/${info.f}`)
      .then((gltf) => {
        const heartLg = this.atlas.lg('heart');
        for (const node of [...gltf.scene.children]) {
          const id = +node.name;
          if (Number.isNaN(id)) continue;
          this.register(id, node, this.atlas.items[id].g === heartLg);
        }
        for (const id of this.mirrorsOfChunk[c]) {
          const src = this.nodes[this.atlas.items[id].mi!];
          if (!src) continue;
          const g = new THREE.Group();
          g.scale.x = -1;
          g.add(src.clone(true));
          g.children[0].visible = true;
          this.register(id, g, false);
        }
        this.chunkState[c] = 2;
      })
      .catch((err) => {
        console.error('Failed to load geometry', info.f, err);
        this.chunkState[c] = 0;
        this.chunkPromise[c] = null;
      })
      .finally(() => {
        this.pending--;
        this.onLoading(this.pending);
        this.needsRender = true;
      });
    this.chunkPromise[c] = p;
    return p;
  }

  private register(id: number, node: THREE.Object3D, heart: boolean) {
    const list: THREE.Mesh[] = [];
    node.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.userData.mk === undefined) {
        m.userData.mk = (m.material as THREE.Material).name || 'DefaultMaterial';
      }
      m.userData = { mk: m.userData.mk, id, heart };
      list.push(m);
    });
    this.meshes[id] = list;
    this.nodes[id] = node;
    this.root.add(node);
    node.updateMatrixWorld(true);
    this.applyItem(id);
  }

  // ------------------------------------------------------------------ picking
  private bindPointer() {
    const el = this.canvas;
    let downX = 0, downY = 0, downT = 0, moved = false, isDown = false;
    let lastHover = 0;
    el.addEventListener('pointerdown', (e) => {
      downX = e.clientX; downY = e.clientY; downT = performance.now(); moved = false; isDown = true;
    });
    el.addEventListener('pointermove', (e) => {
      if (isDown) {
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) moved = true;
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const now = performance.now();
      if (now - lastHover < 70) return;
      lastHover = now;
      const id = this.pick(e.clientX, e.clientY);
      this.setHover(id);
      this.onHover(id, e.clientX, e.clientY);
    });
    el.addEventListener('pointerup', (e) => {
      const wasDown = isDown;
      isDown = false;
      if (!wasDown || moved || performance.now() - downT > 600) return;
      this.onPick(this.pick(e.clientX, e.clientY), e);
    });
    el.addEventListener('pointercancel', () => (isDown = false));
    el.addEventListener('pointerleave', () => {
      this.setHover(-1);
      this.onHover(-1, 0, 0);
    });
  }

  setHover(id: number) {
    if (id === this.hover) return;
    const old = this.hover;
    this.hover = id;
    if (old >= 0) this.applyItem(old);
    if (id >= 0) this.applyItem(id);
    this.needsRender = true;
  }

  /** Returns the id of the front-most visible structure under the pointer, or -1. */
  pick(clientX: number, clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const box = new THREE.Box3();
    const cands: THREE.Mesh[] = [];
    const items = this.atlas.items;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < items.length; i++) {
      if (this.want[i] !== NORMAL || !this.nodes[i]) continue;
      const b = items[i].b!;
      box.min.set(b[0], b[1], b[2]);
      box.max.set(b[3], b[4], b[5]);
      if (!ray.intersectBox(box, tmp)) continue;
      for (const m of this.meshes[i]) {
        const g = m.geometry as any;
        if (!g.boundsTree) g.computeBoundsTree({ maxLeafTris: 8 });
        cands.push(m);
      }
    }
    (this.raycaster as any).firstHitOnly = !this.clipPlane;
    const hits = this.raycaster.intersectObjects(cands, false);
    hits.sort((a, b) => a.distance - b.distance);
    for (const h of hits) {
      if (this.clipPlane && this.clipPlane.distanceToPoint(h.point) < 0) continue;
      return h.object.userData.id as number;
    }
    return -1;
  }

  // ------------------------------------------------------------------ camera
  private viewDir(): THREE.Vector3 {
    return this.camera.position.clone().sub(this.controls.target).normalize();
  }

  focusBounds(min: number[], max: number[], opts: { dir?: THREE.Vector3; pad?: number; instant?: boolean } = {}) {
    const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const radius = Math.max(0.012, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const fov = Math.min(vfov, hfov);
    const dist = (radius / Math.sin(fov / 2)) * (opts.pad ?? 1.25);
    const dir = (opts.dir ?? this.viewDir()).clone().normalize();
    const toPos = center.clone().addScaledVector(dir, dist);
    if (opts.instant || (window as any).__instantCamera) {
      this.anim = null;
      this.camera.position.copy(toPos);
      this.controls.target.copy(center);
      this.controls.update();
    } else {
      this.anim = { t0: performance.now(), dur: 520, fromPos: this.camera.position.clone(), toPos, fromTgt: this.controls.target.clone(), toTgt: center };
    }
    this.needsRender = true;
  }

  focusItems(ids: number[], opts: { dir?: THREE.Vector3; pad?: number; instant?: boolean } = {}) {
    const b = this.atlas.bounds(ids);
    if (b) this.focusBounds(b[0], b[1], opts);
  }

  setView(name: ViewName, bounds?: [number[], number[]]) {
    const dirs: Record<ViewName, [number, number, number]> = {
      front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0], top: [0, 1, 0.001], bottom: [0, -1, 0.001],
    };
    const d = new THREE.Vector3(...dirs[name]);
    if (bounds) this.focusBounds(bounds[0], bounds[1], { dir: d, pad: 1.1 });
    else {
      const dist = this.camera.position.distanceTo(this.controls.target);
      if ((window as any).__instantCamera) {
        this.camera.position.copy(this.controls.target).addScaledVector(d.normalize(), dist);
        this.needsRender = true;
        return;
      }
      this.anim = {
        t0: performance.now(), dur: 520, fromPos: this.camera.position.clone(),
        toPos: this.controls.target.clone().addScaledVector(d.normalize(), dist),
        fromTgt: this.controls.target.clone(), toTgt: this.controls.target.clone(),
      };
    }
  }

  resetView() {
    this.focusBounds([-0.45, 0, -0.2], [0.45, 1.75, 0.2], { dir: new THREE.Vector3(0, 0, 1), pad: 1.02 });
  }

  // ------------------------------------------------------------------ cross-section
  /** Cut the model with a plane. axis: 0 = sagittal (x), 1 = transverse (y), 2 = coronal (z). */
  setClip(axis: 0 | 1 | 2 | null, position = 0, flip = false) {
    if (axis === null) {
      this.clipPlane = null;
      this.renderer.clippingPlanes = [];
    } else {
      const n = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
      if (!flip) n.negate();
      // plane keeps points where n·p + c >= 0
      this.clipPlane = new THREE.Plane(n, flip ? -position : position);
      this.renderer.clippingPlanes = [this.clipPlane];
    }
    this.needsRender = true;
  }

  // ------------------------------------------------------------------ landmark pins
  setPins(pins: PinLabel[]) {
    for (const p of this.pins) p.el.remove();
    this.pins = [];
    if (this.pinLines) { this.overlay.remove(this.pinLines); this.pinLines.geometry.dispose(); this.pinLines = null; }
    if (this.pinDots) { this.overlay.remove(this.pinDots); this.pinDots.geometry.dispose(); this.pinDots = null; }
    if (!pins.length) { this.needsRender = true; return; }
    const linePos: number[] = [];
    const dotPos: number[] = [];
    for (const p of pins) {
      const a = new THREE.Vector3(...p.lm.a);
      const l = new THREE.Vector3(...p.lm.l);
      // pull the label a little closer to the surface than the source data places it
      const pos = a.clone().lerp(l, 0.55);
      linePos.push(a.x, a.y, a.z, pos.x, pos.y, pos.z);
      dotPos.push(a.x, a.y, a.z);
      const el = document.createElement('button');
      el.className = 'pin';
      el.textContent = p.lm.n;
      el.title = p.lm.n;
      el.addEventListener('click', (e) => { e.stopPropagation(); this.onPinClick(p.index); });
      this.labelLayer.appendChild(el);
      this.pins.push({ el, pos, anchor: a });
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    this.pinLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthTest: false }));
    this.pinLines.renderOrder = 10;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dotPos, 3));
    this.pinDots = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, depthTest: false }));
    this.pinDots.renderOrder = 11;
    this.overlay.add(this.pinLines, this.pinDots);
    this.needsRender = true;
  }

  highlightPin(index: number | null) {
    this.activePin = index ?? -1;
    this.pins.forEach((p, i) => p.el.classList.toggle('active', i === index));
    this.needsRender = true;
  }

  private activePin = -1;

  private updatePins() {
    if (!this.pins.length) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    // place labels front to back and collapse those that would overlap into dots
    const order: { i: number; x: number; y: number; z: number; hw: number }[] = [];
    this.pins.forEach((p, i) => {
      v.copy(p.pos).project(this.camera);
      const vis = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      if (!vis) { p.el.style.display = 'none'; return; }
      order.push({ i, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: i === this.activePin ? -2 : v.z, hw: p.el.textContent!.length * 3.2 + 9 });
    });
    order.sort((a, b) => a.z - b.z);
    const placed: { x: number; y: number; hw: number }[] = [];
    for (const o of order) {
      const p = this.pins[o.i];
      let clash = false;
      for (const q of placed) {
        if (Math.abs(o.y - q.y) < 21 && Math.abs(o.x - q.x) < o.hw + q.hw + 4) { clash = true; break; }
      }
      p.el.style.display = '';
      p.el.classList.toggle('dot', clash);
      if (!clash) placed.push(o);
      p.el.style.transform = `translate(-50%, -50%) translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px)`;
    }
  }

  /** Screen position of a world point (CSS pixels relative to the canvas). */
  project(p: [number, number, number]): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(...p).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.canvas.clientWidth, y: ((1 - v.y) / 2) * this.canvas.clientHeight, visible: v.z > -1 && v.z < 1 };
  }

  dispose() {
    this.disposed = true;
    this.controls.dispose();
    this.renderer.dispose();
  }
}
