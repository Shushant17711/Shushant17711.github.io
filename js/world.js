/* world.js — the procedural world (#world: surface-code lattice, cloud deck) and the actors (#actor):
   the Bloch sphere (intro + contact), the drone swarm (VISHWAS) and the lander (AeroWM-FDIR only).
   Reads window.FILM.t (scroll in vh) written by film.js. */
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { buildLander } from './lander.js';

const FILM = window.FILM || { t: 0, reduced: true };
const reduced = !!FILM.reduced;
// quality tier: phones, touch tablets and low-core laptops get 1x pixels, no shadows, lighter dust
let LOW = matchMedia('(pointer: coarse)').matches || innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4;
// software WebGL (SwiftShader / llvmpipe — e.g. Chromium on Wayland + NVIDIA with GPU acceleration off): every pixel costs CPU
const SOFT = (() => { try { const g = document.createElement('canvas').getContext('webgl'); if (!g) return true;
  const e = g.getExtension('WEBGL_debug_renderer_info'); const r = String(e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER));
  g.getExtension('WEBGL_lose_context')?.loseContext(); return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r); } catch { return false; } })();
const DPR = SOFT ? 0.5 : LOW ? 1 : Math.min(window.devicePixelRatio || 1, 1.25);
document.documentElement.classList.toggle('soft-gl', SOFT);
if (SOFT) { LOW = true; window.__softGL = true; window.dispatchEvent(new Event('resize')); }
const C = {
  night: new THREE.Color(0x111111), gold: new THREE.Color(0xe2b862), sodium: new THREE.Color(0xf6a443), plasma: new THREE.Color(0xff7a2a),
  warm: new THREE.Color(0xf3f1ec), airglow: new THREE.Color(0xe9e5dc), stone: new THREE.Color(0x5e5a54), hot: new THREE.Color(0xfff1cf),
};

/* ── helpers ── */
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
function kf(list, t) {
  if (t <= list[0][0]) return list[0].slice(1);
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (t <= b[0]) { const u = sm((t - a[0]) / (b[0] - a[0] || 1)); return a.slice(1).map((v, k) => v + (b[k + 1] - v) * u); }
  }
  return list[list.length - 1].slice(1);
}
const band = (t, a, b, fi = 10, fo = 10) => Math.min(a <= 0 ? 1 : sm((t - a) / fi), b >= 1e8 ? 1 : sm((b - t) / fo));
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function renderer(canvas, alpha, aa = !LOW) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: aa, alpha, powerPreference: 'high-performance' });
  r.setPixelRatio(DPR); r.setSize(innerWidth, innerHeight, false); r.outputColorSpace = THREE.SRGBColorSpace;
  if (alpha) r.setClearColor(0x000000, 0);
  return r;
}
const GLSL_NOISE = `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
float fb(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=.5; } return s; }`;
// additive light on a transparent canvas: add colour, never write alpha, so it composites as pure light over the DOM
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();

/* ═════════════════════════ WORLD ═════════════════════════ */
const wr = renderer(document.getElementById('world'), false, false);
wr.setClearColor(C.night);
const ws = new THREE.Scene();
const wcam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 2000);

/* surface-code lattice: two distance-5 logical patches (A | B) with a 3-column routing region between them.
   Plaquettes are drawn as flat tiles (X type gold, Z type stone), with weight-2 boundary stabilisers as half-discs. */
const lattice = new THREE.Group(); ws.add(lattice);
const tileMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const FACES = [], DATA = [], HALVES = [];
for (let ix = 0; ix < 12; ix++) for (let iz = 0; iz < 4; iz++) {
  const cx = ix - 5.5, cz = iz - 1.5, x = (ix + iz) % 2 ? 'X' : 'Z';
  FACES.push({ cx, cz, type: x, seam: cx > -2 && cx < 2 ? Math.round(cx + 1.5) : -1 });
}
for (let x = -6; x <= 6; x++) for (let z = -2; z <= 2; z++) DATA.push({ x, z, seam: x >= -1 && x <= 1 ? x + 1 : -1 });
// top/bottom boundaries (X type) at alternating columns; left/right (Z type) at alternating rows
for (let ix = 0; ix < 12; ix++) { const cx = ix - 5.5, seam = cx > -2 && cx < 2 ? Math.round(cx + 1.5) : -1;
  HALVES.push({ x: cx, z: ix % 2 ? -2 : 2, rot: ix % 2 ? Math.PI : 0, type: 'X', seam, inner: 0 }); }
for (let iz = 0; iz < 4; iz++) { const cz = iz - 1.5;
  if (iz % 2 === 0) { HALVES.push({ x: -6, z: cz, rot: -Math.PI / 2, type: 'Z', seam: -1, inner: 0 }); HALVES.push({ x: 2, z: cz, rot: -Math.PI / 2, type: 'Z', seam: -1, inner: 1 }); }
  else { HALVES.push({ x: -2, z: cz, rot: Math.PI / 2, type: 'Z', seam: -1, inner: 1 }); HALVES.push({ x: 6, z: cz, rot: Math.PI / 2, type: 'Z', seam: -1, inner: 0 }); } }
const tileGeo = new THREE.PlaneGeometry(0.93, 0.93); tileGeo.rotateX(-Math.PI / 2);
const halfGeo = new THREE.CircleGeometry(0.465, 20, 0, Math.PI); halfGeo.rotateX(-Math.PI / 2);
const tiles = new THREE.InstancedMesh(tileGeo, tileMat, FACES.length);
const halves = new THREE.InstancedMesh(halfGeo, tileMat, HALVES.length);
const qubits = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }), DATA.length);
[tiles, halves, qubits].forEach((m) => { for (let i = 0; i < m.count; i++) m.setColorAt(i, C.gold); });
lattice.add(tiles, halves, qubits);
const outlineGeo = new THREE.BufferGeometry(); outlineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
const outline = new THREE.LineSegments(outlineGeo, new THREE.LineBasicMaterial({ color: C.sodium, transparent: true, opacity: 0.85 })); lattice.add(outline);
const pairGeo = new THREE.BufferGeometry(); pairGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 8 * 6), 3));
const pairLines = new THREE.LineSegments(pairGeo, new THREE.LineBasicMaterial({ color: C.hot, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
lattice.add(pairLines);
const COL = { X: new THREE.Color(0x8a6c34), Z: new THREE.Color(0x3a3834) };
const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), YAX = new THREE.Vector3(0, 1, 0);
// merge parameter: 0 = two patches, 1 = one merged patch
const mergeAt = (t) => (t < 280 ? 0 : t < 300 ? (t - 280) / 20 : t < 318 ? 1 : t < 336 ? 1 - (t - 318) / 18 : 0);
const seamK = (m, s) => sm(clamp(m * 4 - s, 0, 1)); // the routing region fills column by column
function updateLattice(now, t) {
  const m = mergeAt(t), active = [];
  FACES.forEach((f, i) => {
    const k = f.seam < 0 ? 1 : seamK(m, f.seam);
    const flash = f.seam < 0 ? 0 : Math.sin(Math.PI * k);
    mtx.compose(tmpV.set(f.cx, 0, f.cz), q.identity(), tmpV2.set(1, 1, 1).multiplyScalar(Math.max(0.0001, k)));
    tiles.setMatrixAt(i, mtx); tiles.setColorAt(i, col.copy(COL[f.type]).lerp(C.gold, flash * 0.9));
    if (k > 0.99) active.push(i);
  });
  HALVES.forEach((h, i) => {
    let k = h.seam >= 0 ? seamK(m, h.seam) : 1; if (h.inner) k = 1 - sm(m * 1.4);
    mtx.compose(tmpV.set(h.x, 0, h.z), q.setFromAxisAngle(YAX, h.rot), tmpV2.set(1, 1, 1).multiplyScalar(Math.max(0.0001, k)));
    halves.setMatrixAt(i, mtx); halves.setColorAt(i, COL[h.type]);
  });
  DATA.forEach((d, i) => {
    const k = d.seam < 0 ? 1 : seamK(m, d.seam === 0 ? 0.5 : d.seam === 1 ? 1.5 : 2.5);
    mtx.compose(tmpV.set(d.x, 0.06, d.z), q.identity(), tmpV2.set(1, 1, 1).multiplyScalar(Math.max(0.0001, k)));
    qubits.setMatrixAt(i, mtx); qubits.setColorAt(i, col.copy(C.airglow).lerp(C.sodium, d.seam >= 0 ? Math.sin(Math.PI * k) * 0.8 : 0));
  });
  // syndrome flashes + decoder pairing arcs, among the stabilisers that are active right now
  const ep = Math.floor(now / 900); seed = 1000 + ep; const ph = (now % 900) / 900;
  const arr = pairGeo.attributes.position.array; arr.fill(0);
  for (let p = 0; p < 4 && active.length > 4; p++) {
    const a = active[Math.floor(rnd() * active.length)], b = active[Math.floor(rnd() * active.length)];
    const A = FACES[a], B = FACES[b]; if (Math.hypot(A.cx - B.cx, A.cz - B.cz) > 4) continue;
    tiles.setColorAt(a, C.sodium); tiles.setColorAt(b, C.sodium);
    if (ph > 0.35) for (let s = 0; s < 8; s++) {
      const u0 = s / 8, u1 = (s + 1) / 8, k = Math.min(1, (ph - 0.35) / 0.4); if (u1 > k) break;
      arr.set([lerp(A.cx, B.cx, u0), 0.05 + Math.sin(u0 * Math.PI) * 0.7, lerp(A.cz, B.cz, u0), lerp(A.cx, B.cx, u1), 0.05 + Math.sin(u1 * Math.PI) * 0.7, lerp(A.cz, B.cz, u1)], (p * 8 + s) * 6);
    }
  }
  // logical-patch outlines: two rectangles whose inner edges slide over each other as the patches merge
  const aR = lerp(-1.55, 6.45, sm(m)), bL = lerp(1.55, -6.45, sm(m)), z0 = -2.55, z1 = 2.55, y = 0.02;
  const rect = (x0, x1) => [x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0];
  outlineGeo.attributes.position.array.set([...rect(-6.45, aR), ...rect(bL, 6.45)]); outlineGeo.attributes.position.needsUpdate = true;
  tiles.instanceMatrix.needsUpdate = halves.instanceMatrix.needsUpdate = qubits.instanceMatrix.needsUpdate = true;
  tiles.instanceColor.needsUpdate = halves.instanceColor.needsUpdate = qubits.instanceColor.needsUpdate = true;
  pairGeo.attributes.position.needsUpdate = true;
}

// cloud deck (soft billboards) — the AeroWM-FDIR descent only
const cloudTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) { const x = 60 + rnd() * 136, y = 80 + rnd() * 100, r = 30 + rnd() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const clouds = new THREE.Group(); ws.add(clouds);
const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, color: 0xa9abae, transparent: true, opacity: 0.75, depthWrite: false });
const NCLOUD = LOW ? 56 : 120;
for (let i = 0; i < NCLOUD; i++) {
  const s = new THREE.Sprite(cloudMat); const deck = i < NCLOUD / 2;
  s.position.set((rnd() - 0.5) * 90, deck ? -34 - rnd() * 8 : -20 + rnd() * 60, -rnd() * 70 + 5);
  const k = deck ? 22 + rnd() * 18 : 8 + rnd() * 14; s.scale.set(k * 1.6, k, 1); clouds.add(s);
}

const CAM = [
  [176, 0, 15, 9, 0, -1, 0], [240, 0, 10.5, 8.6, 0, -2.2, 0], [330, 1.0, 9.2, 8.0, 0, -2.2, 0], [366, 2.2, 6.5, 6.5, 0, -2, 0],
  [505, 0, 32, 12, 0, 26, 0], [508, 0, 32, 12, 0, 26, 0], [705, 0, -31, 10, 0, -37, 0],
];

/* ═════════════════════════ ACTORS ═════════════════════════ */
const ar = renderer(document.getElementById('actor'), true);
ar.autoClear = false;

/* ── A. the Bloch sphere: one qubit, drawn as gold dust. The state vector precesses; scrolling "measures" it —
      the sphere flattens into the ring that opens onto About. ── */
const xs = new THREE.Scene();
const xcam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.005, 60);
const XD = 3.6;
const xg = new THREE.Group(); xs.add(xg);
const BN = LOW ? 9000 : 16000, BR = LOW ? 1300 : 2000, BA = LOW ? 260 : 420; // shell dust, two great circles, the |0>–|1> axis
const bPos = new Float32Array((BN + BR * 2 + BA) * 3), bRnd = new Float32Array(BN + BR * 2 + BA), bKind = new Float32Array(BN + BR * 2 + BA);
{
  let i = 0; const put = (x, y, z, k) => { bPos.set([x, y, z], i * 3); bRnd[i] = Math.random(); bKind[i] = k; i++; };
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let n = 0; n < BN; n++) { const y = 1 - (2 * (n + 0.5)) / BN, r = Math.sqrt(1 - y * y), th = ga * n; const j = 1 + (Math.random() - 0.5) * 0.035; put(Math.cos(th) * r * j, y * j, Math.sin(th) * r * j, 0); }
  for (let n = 0; n < BR; n++) { const a = (n / BR) * Math.PI * 2; put(Math.cos(a), 0, Math.sin(a), 1); }   // equator
  for (let n = 0; n < BR; n++) { const a = (n / BR) * Math.PI * 2; put(Math.cos(a), Math.sin(a), 0, 1); }   // meridian
  for (let n = 0; n < BA; n++) { const y = -1.12 + (2.24 * n) / (BA - 1); if (Math.floor(n / 6) % 2) put(0, y, 0, 2); else put(0, y, 0, 2); }
}
const bGeo = new THREE.BufferGeometry();
bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
bGeo.setAttribute('aR', new THREE.BufferAttribute(bRnd, 1));
bGeo.setAttribute('aK', new THREE.BufferAttribute(bKind, 1));
const blochMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uIn: { value: 0 }, uRing: { value: 0 }, uRingR: { value: 0.5 }, uFade: { value: 1 }, uMouse: { value: new THREE.Vector2(9, 9) },
    uHover: { value: 0 }, uAspect: { value: 1 }, uPx: { value: 1 }, uSize: { value: 1 }, uVec: { value: new THREE.Vector3(0, 1, 0) }, uGold: { value: C.gold }, uHot: { value: C.hot } },
  vertexShader: `attribute float aR; attribute float aK;
    uniform float uTime, uIn, uRing, uRingR, uHover, uAspect, uPx, uSize; uniform vec2 uMouse; uniform vec3 uVec;
    varying float vB; varying float vH;
    void main(){
      vec3 s = position;
      float shell = step(aK, .5);
      // shimmer: the shell breathes a little, grain by grain
      s *= 1. + shell * .014 * sin(aR * 61. + uTime * (1. + aR));
      // arrival: dust condenses from a wide cloud onto the sphere
      vec3 far = normalize(position + vec3(sin(aR * 91.), cos(aR * 53.), sin(aR * 17.)) * 1.3) * (2.6 + aR * 2.8);
      float a = smoothstep(aR * .55, aR * .55 + .45, uIn);
      vec3 p = mix(far, s, a);
      // measurement: everything falls onto one ring facing the viewer
      float ang = atan(position.y, position.x) + (aK > 1.5 ? aR * 6.2832 : 0.);
      vec3 ring = vec3(cos(ang), sin(ang), 0.) * uRingR * (1. + (fract(aR * 7.31) - .5) * .05);
      p = mix(p, ring, smoothstep(aR * .35, aR * .35 + .65, uRing));
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      vec4 cp = projectionMatrix * mv;
      // the cursor parts the dust and lights it
      vec2 d = (cp.xy / cp.w - uMouse) * vec2(uAspect, 1.);
      float m = exp(-dot(d, d) * 22.) * uHover * (1. - uRing);
      cp.xy += normalize(d + 1e-5) / vec2(uAspect, 1.) * m * .07 * cp.w;
      vec3 wc = (modelMatrix * vec4(0., 0., 0., 1.)).xyz;
      float front = clamp(.5 + .5 * normalize((modelMatrix * vec4(p, 1.)).xyz - wc).z, 0., 1.);
      float tip = pow(max(dot(normalize(position), uVec), 0.), 90.) * shell;
      vH = clamp(tip * 1.6 + m, 0., 1.);
      vB = mix(.16 + .5 * front, .55 + .45 * front, step(.5, aK)) * a + tip * 1.4 + m * 1.2 + uRing * .5;
      vB *= aK > 1.5 ? (mod(floor((position.y + 1.12) * 14.), 2.) * .8) : 1.;
      gl_Position = cp;
      gl_PointSize = (1.4 + aK * .35 + tip * 4. + m * 2.2) * uPx * uSize * (${XD.toFixed(1)} / -mv.z);
    }`,
  fragmentShader: `uniform float uFade; uniform vec3 uGold, uHot; varying float vB; varying float vH;
    void main(){ float r = length(gl_PointCoord - .5); if (r > .5) discard; float k = smoothstep(.5, .08, r);
      gl_FragColor = vec4(mix(uGold, uHot, vH) * vB * k * uFade, 1.); }`,
  transparent: true, depthWrite: false, depthTest: false, ...ADD,
});
const bloch = new THREE.Points(bGeo, blochMat); bloch.frustumCulled = false; xg.add(bloch);
// the state vector: a gold needle from the centre to the tip, with a glowing head
const vecGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
const vecMat = new THREE.LineBasicMaterial({ color: C.hot, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, ...ADD });
const vecLine = new THREE.Line(vecGeo, vecMat); vecLine.frustumCulled = false; xg.add(vecLine);
const headSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffe2a8, transparent: true, depthWrite: false, depthTest: false, ...ADD })); xg.add(headSpr);
let mx = 0, my = 0, tmx = 0, tmy = 0, hov = 0, thov = 0;
addEventListener('pointermove', (e) => { tmx = (e.clientX / innerWidth) * 2 - 1; tmy = (e.clientY / innerHeight) * 2 - 1; thov = 1; });
document.addEventListener('pointerleave', () => { thov = 0; });
const T0 = performance.now();
const stateV = new THREE.Vector3();

/* ── B. lander + swarm scene ── */
const as = new THREE.Scene();
const acam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100); acam.position.set(0, 0, 10);
const HH = 10 * Math.tan((17.5 * Math.PI) / 180);
as.environment = (() => { const pm = new THREE.PMREMGenerator(ar); const e = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); return e; })();
as.environmentIntensity = 0.55;
as.add(new THREE.HemisphereLight(0x2b2824, 0x5a4a38, 1.4));
const key = new THREE.DirectionalLight(0xfff2dc, 4.2); key.position.set(-4, 6, 5); as.add(key); as.add(key.target);
key.castShadow = !LOW; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0008; key.shadow.normalBias = 0.02; key.shadow.radius = 2;
ar.shadowMap.enabled = !LOW; ar.shadowMap.type = THREE.PCFShadowMap;
const rim = new THREE.DirectionalLight(0xe0d2bc, 1.4); rim.position.set(5, 1, -6); as.add(rim);
const plumeLight = new THREE.PointLight(0xff9a4a, 0, 8, 1.5); as.add(plumeLight);
const KEYDIR = new THREE.Vector3(-4, 6, 5).normalize();

const LND = buildLander();
const { lander, body, ENG, LEGS } = LND; as.add(lander);
LEGS.forEach((l) => (l.rotation.z = 2.67)); // stowed for the whole FDIR sequence

const plumeMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uHot: { value: C.warm }, uCool: { value: new THREE.Color(0xffa95e) }, uRe: { value: 0 }, uPl: { value: C.plasma } },
  vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
    void main(){ vY = -position.y; vec4 wp = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: GLSL_NOISE + `uniform float uT, uRe; uniform vec3 uHot, uCool, uPl; varying float vY; varying vec3 vN; varying vec3 vV;
    void main(){
      float core = pow(abs(dot(vN, vV)), 1.6);
      float n = fb(vec2(vY*6. - uT*9., core*3. + uT*2.));
      float diamonds = .75 + .25*sin(vY*42. - uT*30.);
      float fade = pow(1. - clamp(vY,0.,1.), 1.4);
      vec3 c = mix(uCool, uHot, smoothstep(.55, .0, vY) * core);
      c = mix(c, uPl, uRe * .6);
      float a = fade * core * (.55 + .7*n) * diamonds;
      gl_FragColor = vec4(c * a * 1.7, 1.);
    }`,
  transparent: true, depthWrite: false, ...ADD, side: THREE.DoubleSide,
});
const plumeGeo = new THREE.ConeGeometry(0.15, 1, 28, 12, true); plumeGeo.translate(0, -0.5, 0);
ENG.forEach((e) => { const m = new THREE.Mesh(plumeGeo, plumeMat); m.position.y = -0.36; e.plume = m; e.g.add(m); });

const PN = 700;
const part = { pos: new Float32Array(PN * 3), col: new Float32Array(PN * 3), vel: new Float32Array(PN * 3), life: new Float32Array(PN), max: new Float32Array(PN), hue: new Float32Array(PN), i: 0 };
const partGeo = new THREE.BufferGeometry(); partGeo.setAttribute('position', new THREE.BufferAttribute(part.pos, 3)); partGeo.setAttribute('color', new THREE.BufferAttribute(part.col, 3));
const partMat = new THREE.PointsMaterial({ size: 0.16, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, ...ADD });
const particles = new THREE.Points(partGeo, partMat); particles.frustumCulled = false; as.add(particles);

const sheathMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uOp: { value: 0 }, uPl: { value: C.plasma }, uG: { value: C.gold } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 wp = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: GLSL_NOISE + `uniform float uT, uOp; uniform vec3 uPl, uG; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ float f = pow(1. - abs(dot(vN, vV)), 2.2); float n = fb(vec2(atan(vP.z,vP.x)*3., vP.y*4. + uT*6.));
      float bottom = smoothstep(.6, -1.1, vP.y);
      vec3 c = mix(uPl, uG*1.3, n*.6); gl_FragColor = vec4(c * (f*(.6+n) + bottom*n*.5) * uOp * 1.6, 1.); }`,
  transparent: true, depthWrite: false, ...ADD, side: THREE.DoubleSide,
});
const sheath = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), sheathMat); sheath.scale.set(1.15, 1.35, 1.15); lander.add(sheath);

const cylText = new THREE.Group(); lander.add(cylText);
function buildCylText() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 112; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.font = '600 64px "Martian Mono", monospace'; g.textBaseline = 'middle';
  const s = 'DETECT · ISOLATE · RECOVER · '; let x = 0; const w = g.measureText(s).width; const k = 2048 / (Math.round(2048 / w) * w);
  g.setTransform(k, 0, 0, 1, 0, 0); while (x < 2048 / k) { g.fillText(s, x, 58); x += w; }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  cylText.clear();
  const geo = new THREE.CylinderGeometry(1.55, 1.55, 0.26, 96, 1, true);
  cylText.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: C.airglow, transparent: true, side: THREE.FrontSide, depthWrite: false, ...ADD })));
}
buildCylText();
if (document.fonts) document.fonts.load('600 64px "Martian Mono"').then(buildCylText).catch(() => {});

// lander path, FDIR only: [t, x(frac of half-width), y(frac of half-height), scale, roll°, pitch°, presence, yaw°]
const ACT = [
  [500, 0.12, 0.2, 1.0, 0, 10, 0, 0], [508, 0.12, 0.2, 1.0, 0, 10, 1, 0], [536, 0.32, 0.16, 1.75, 0, 12, 1, 18], [690, 0.32, 0.16, 1.75, 0, 12, 1, 18],
  [700, 0.32, 0.3, 1.5, 0, 12, 1, 18], [703, 0.32, 0.3, 1.5, 0, 12, 0, 18],
];
const ACT_PHONE = [
  [500, 0.1, 0.0, 0.8, 0, 10, 0, 0], [508, 0.1, 0.0, 0.8, 0, 10, 1, 0], [536, 0.12, -0.3, 1.1, 0, 12, 1, 18], [690, 0.12, -0.3, 1.1, 0, 12, 1, 18],
  [700, 0.12, -0.2, 1.0, 0, 12, 1, 18], [703, 0.12, -0.2, 1.0, 0, 12, 0, 18],
];

/* ── C. the swarm: 36 quadrotors; ClaimCheck audits each accusation against ranging data; 6 liars are caught and drop ── */
const SW = 36, LIARS = [3, 9, 14, 21, 27, 33];
const droneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.35 });
const dBody = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.085, 0.05, 12), droneMat, SW);
const dArm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.016, 0.026), new THREE.MeshStandardMaterial({ color: 0x2c2a27, metalness: 0.6, roughness: 0.5 }), SW * 2);
const rotorGeo = new THREE.RingGeometry(0.035, 0.075, 24); rotorGeo.rotateX(-Math.PI / 2);
const dRotor = new THREE.InstancedMesh(rotorGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, ...ADD }), SW * 4);
const dLed = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), SW);
// give every instanced mesh its colour buffer up front: adding it on the first frame changes the shader (a recompile stall)
[dBody, dRotor, dLed].forEach((m) => { for (let i = 0; i < m.count; i++) m.setColorAt(i, C.sodium); });
[dBody, dArm, dRotor, dLed].forEach((m) => { m.frustumCulled = false; as.add(m); });
const swOff = Array.from({ length: SW }, () => [(rnd() - 0.5) * 2, (rnd() - 0.5) * 2, -rnd() * 3 + 0.6, rnd() * 6.28]);
const auditGeo = new THREE.BufferGeometry(); auditGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LIARS.length * 3 * 6), 3));
const audit = new THREE.LineSegments(auditGeo, new THREE.LineBasicMaterial({ color: C.sodium, transparent: true, opacity: 0.9, depthWrite: false, ...ADD })); audit.frustumCulled = false; as.add(audit);
const pulseMat = new THREE.MeshBasicMaterial({ color: C.plasma, transparent: true, opacity: 0, side: THREE.DoubleSide, ...ADD, depthWrite: false });
const pulses = LIARS.map(() => { const p = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), pulseMat.clone()); as.add(p); return p; });
const dronePos = Array.from({ length: SW }, () => new THREE.Vector3());

/* ── per-frame ── */
const down = new THREE.Vector3();
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = FILM.t || 0; const time = now / 1000;
  const aspect = innerWidth / innerHeight; const HW = HH * aspect; const phone = aspect < 0.8;

  /* world */
  const latOn = t >= 175 && t < 366, cloudOn = t >= 506 && t < 706;
  const cv = kf(CAM, t); wcam.position.set(cv[0], cv[1], cv[2]); wcam.lookAt(cv[3], cv[4], cv[5]);
  lattice.visible = latOn; if (latOn) updateLattice(now, t);
  lattice.scale.setScalar(phone ? 0.62 : 1);
  clouds.visible = cloudOn;
  cloudMat.color.set(0x6a6c70).lerp(C.plasma, 0.45 * (1 - sm((t - 560) / 120))); cloudMat.opacity = 0.32;
  const worldOn = latOn || cloudOn;
  if (worldOn || wDirty) { wcam.aspect = aspect; wcam.updateProjectionMatrix(); wr.render(ws, wcam); wDirty = worldOn; }

  if (reduced) return;
  // the DOM layering: the Bloch sphere sits under the type (intro, contact)
  const under = t < 130 || t > 1310;
  if (under !== FILM.under) { FILM.under = under; document.body.classList.toggle('actor-under', under); }
  // actor canvas: hidden and not drawn at all while no actor is on screen
  const xOn = t < 124 || t > 1316, lOn = t > 490 && t < 712, sOn = t > 700 && t < 850;
  const actorOn = xOn || lOn || sOn || particles.visible;
  if (actorOn !== aShown) { aShown = actorOn; actorEl.style.visibility = actorOn ? '' : 'hidden'; if (!actorOn) ar.clear(); }
  if (!actorOn) return;
  ar.clear();

  /* A. Bloch sphere: intro (condenses, precesses, flattens into the lens ring) and contact (returns as a ring around the links) */
  const xIntro = t < 124, xEnd = t > 1316;
  if (xIntro || xEnd) {
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05; hov += (thov - hov) * 0.06;
    const hh = XD * Math.tan((20 * Math.PI) / 180), hw = hh * aspect;
    const sHero = phone ? hw * 0.86 : hh * 0.84;
    const pxW = (2 * hh) / innerHeight; // world units per CSS px at the sphere's depth
    let fade = 1, ring = 0, s = sHero, py = phone ? 0.02 * hh : 0.02 * hh, px = 0;
    let yaw = time * 0.07 + mx * 0.35, pitch = 0.32 + my * 0.18;
    const lensPx = (k) => (38.6 / 200) * Math.min(Math.min(innerWidth, innerHeight) * 0.7, 560) * k; // the lens loop's radius at zoom k
    let ringPx = lensPx(0.7);
    if (xIntro) {
      fade = 1 - sm((t - 114) / 9);
      ring = sm((t - 50) / 46);
      if (t > 98) { const k = Math.min(1, (t - 98) / 28); ringPx = lensPx(0.7 + 13.3 * k * k); }
      const e = sm((t - 44) / 40);
      yaw = lerp(yaw, Math.round(yaw / (Math.PI * 2)) * Math.PI * 2, e); pitch = lerp(pitch, 0, e); py = lerp(py, 0, e);
    } else {
      fade = band(t, 1316, 1e9, 10);
      ring = 0.15 + 0.85 * sm((t - 1340) / 40);
      s = lerp(sHero, phone ? hw * 0.9 : hh * 0.9, ring);
      ringPx = (phone ? 0.92 : 1) * s / pxW;
      py = lerp(0.02 * hh, phone ? 0.02 * hh : -0.2 * hh, ring);
      pitch = lerp(pitch, 1.05 + my * 0.08, ring); yaw = lerp(yaw, mx * 0.2, ring);
    }
    xcam.fov = 40; xcam.position.set(0, 0, XD); xcam.up.set(0, 1, 0); xcam.lookAt(0, 0, 0);
    xg.position.set(px, py, 0); xg.scale.setScalar(s); xg.rotation.set(pitch, yaw, 0, 'XYZ');
    // the state: Larmor precession about |0>, tipped by the cursor
    const th = 0.78 + Math.sin(time * 0.23) * 0.18 + my * 0.25, ph = time * 0.55 + mx * 0.6;
    stateV.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    const U = blochMat.uniforms;
    U.uTime.value = time; U.uIn.value = sm(Math.min(1, (now - T0) / 3200)); U.uRing.value = ring; U.uRingR.value = (ringPx * pxW) / s;
    U.uFade.value = fade; U.uMouse.value.set(mx, -my); U.uHover.value = hov; U.uAspect.value = aspect; U.uPx.value = ar.getPixelRatio();
    U.uSize.value = phone ? 0.9 : Math.min(1.3, Math.max(0.85, innerHeight / 820)); U.uVec.value.copy(stateV);
    const vk = U.uIn.value * (1 - sm(ring * 3)) * fade;
    vecGeo.attributes.position.setXYZ(1, stateV.x, stateV.y, stateV.z); vecGeo.attributes.position.needsUpdate = true;
    vecMat.opacity = 0.85 * vk; vecLine.visible = headSpr.visible = vk > 0.01;
    headSpr.position.copy(stateV); headSpr.scale.setScalar(0.07 / s * hh); headSpr.material.opacity = vk;
    xcam.aspect = aspect; xcam.updateProjectionMatrix();
    ar.render(xs, xcam);
  }

  /* B. lander — the AeroWM-FDIR scene only */
  const a = kf(phone ? ACT_PHONE : ACT, t);
  let [ax, ay, s, roll, pitch, pres, yawD] = a;
  const landerOn = pres > 0.02 && t > 498 && t < 706;
  const swK = band(t, 712, 836, 10, 6), swarmOn = swK > 0.01;
  lander.visible = landerOn;
  if (landerOn) {
    let yaw = (yawD * Math.PI) / 180 + Math.sin(time * 0.45) * 0.08;
    const sinceFault = (now - FILM.fault) / 1000;
    let out = 0, rollX = 0, gimbal = 0;
    if (t > 545 && t < 705) {
      out = sm((t - 556) / 5) * (1 - sm((t - 640) / 8));
      rollX = 25 * sm((t - 576) / 14) * (1 - sm((t - 612) / 30));
      gimbal = sm((t - 606) / 6) * (1 - sm((t - 650) / 10));
    }
    if (sinceFault >= 0 && sinceFault < 4) { const u = sinceFault; out = Math.max(out, u < 2.6 ? 1 : 1 - (u - 2.6) / 1.4); rollX = Math.max(rollX, 25 * Math.sin(Math.min(1, u / 2.2) * Math.PI)); gimbal = Math.max(gimbal, u > 0.9 && u < 3.4 ? 1 : 0); }
    roll += rollX;
    lander.position.set(ax * HW, ay * HH, 0);
    lander.scale.setScalar(Math.max(0.0001, s * pres));
    lander.rotation.set(0, 0, (roll * Math.PI) / 180);
    body.rotation.set((pitch * Math.PI) / 180, yaw, 0);
    const vel = Math.abs((window.__lenis && window.__lenis.velocity) || 0), throttle = Math.min(vel / 50, 0.9);
    const P = pres;
    const lengthL = 2.6 * (1 + throttle) * (0.92 + 0.08 * Math.sin(time * 37));
    ENG.forEach((e, i) => {
      const k = P * (1 - (i === 2 ? out : 0));
      e.plume.visible = k > 0.01;
      e.plume.scale.set(1 + lengthL * 0.27, lengthL * k, 1 + lengthL * 0.27);
      e.g.rotation.set(Math.sin(e.a) * gimbal * 0.35, 0, -Math.cos(e.a) * gimbal * 0.35);
      e.hot.material.opacity = k * (0.55 + 0.25 * Math.sin(time * 29 + i));
    });
    plumeMat.uniforms.uT.value = time; plumeMat.uniforms.uRe.value = band(t, 505, 640, 15, 40);
    plumeLight.intensity = P * 6;
    lander.updateMatrixWorld(true);
    ENG[0].g.getWorldPosition(plumeLight.position); plumeLight.position.y -= 0.45 * s;
    key.target.position.copy(lander.position); key.position.copy(lander.position).addScaledVector(KEYDIR, 14);
    { const sc = key.shadow.camera, e = 1.7 * Math.max(0.3, s) + 0.4; sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 2; sc.far = 30; sc.updateProjectionMatrix(); }
    down.set(0, -1, 0).applyQuaternion(body.getWorldQuaternion(q));
    const rate = P * (220 + throttle * 400) * dt;
    for (let e = 0; e < ENG.length; e++) {
      if (e === 2 && out > 0.5) continue;
      let n = rate / 4 + (Math.random() < (rate / 4) % 1 ? 1 : 0);
      ENG[e].g.getWorldPosition(tmpV); tmpV.addScaledVector(down, 0.3 * s);
      for (; n >= 1; n--) {
        const i = part.i++ % PN; const sp = (2.4 + Math.random() * 2) * s * (1 + throttle);
        part.pos.set([tmpV.x, tmpV.y, tmpV.z], i * 3);
        part.vel.set([down.x * sp + (Math.random() - 0.5) * s * 1.6, down.y * sp + (Math.random() - 0.5) * s * 0.6, down.z * sp + (Math.random() - 0.5) * s * 1.6], i * 3);
        part.life[i] = part.max[i] = 0.35 + Math.random() * 0.45; part.hue[i] = t > 505 && t < 650 ? 1 : 0;
      }
    }
    sheathMat.uniforms.uT.value = time; sheathMat.uniforms.uOp.value = band(t, 503, 625, 12, 30) * 0.55;
    sheath.visible = sheathMat.uniforms.uOp.value > 0.01;
    const ct = band(t, 548, 700, 14, 12);
    cylText.visible = ct > 0.01; cylText.rotation.set(-((pitch * Math.PI) / 180) * 0.4, -time * 0.6 - t * 0.02, 0); cylText.scale.setScalar(0.5 + ct * 0.36);
    cylText.children.forEach((m) => (m.material.opacity = ct));
    partMat.size = 0.16 * Math.max(0.5, s);
  } else { plumeLight.intensity = 0; if (t > 706 || t < 498) part.life.fill(0); }
  // exhaust particles keep fading after the lander leaves
  let liveParts = 0;
  for (let i = 0; i < PN; i++) {
    if (part.life[i] <= 0) { part.col[i * 3] = part.col[i * 3 + 1] = part.col[i * 3 + 2] = 0; continue; }
    liveParts++; part.life[i] -= dt; const u = Math.max(0, part.life[i] / part.max[i]);
    for (let k = 0; k < 3; k++) { part.pos[i * 3 + k] += part.vel[i * 3 + k] * dt; part.vel[i * 3 + k] *= 0.985; }
    col.copy(C.warm).lerp(part.hue[i] ? C.plasma : C.sodium, 1 - u).multiplyScalar(u * u * 0.9);
    part.col.set([col.r, col.g, col.b], i * 3);
  }
  partGeo.attributes.position.needsUpdate = true; partGeo.attributes.color.needsUpdate = true;
  particles.visible = liveParts > 0;

  /* C. swarm */
  [dBody, dArm, dRotor, dLed, audit].forEach((m) => (m.visible = swarmOn));
  pulses.forEach((p) => (p.visible = false));
  if (swarmOn) {
    const k01 = clamp((t - 712) / 120, 0, 1), sc = phone ? 0.75 : 1.25;
    const cx = lerp(-0.25, 0.25, k01) * HW, cy = (phone ? 0.42 : 0.3) * HH;
    for (let i = 0; i < SW; i++) {
      const o = swOff[i]; const li = LIARS.indexOf(i);
      const caught = li >= 0 ? sm((t - (746 + li * 9)) / 5) : 0;
      const fall = li >= 0 ? Math.max(0, t - (754 + li * 9)) : 0;
      const p = dronePos[i].set(cx + o[0] * HW * (phone ? 0.85 : 0.82) * swK + Math.sin(time * 1.3 + o[3]) * 0.08, cy + o[1] * HH * (phone ? 0.22 : 0.32) + Math.cos(time * 1.7 + o[3]) * 0.06 - fall * fall * 0.0035, o[2]);
      const tilt = 0.12 + (li >= 0 ? Math.min(1.2, fall * 0.04) : 0);
      q.setFromEuler(new THREE.Euler(Math.sin(time + o[3]) * 0.08, o[3], -tilt));
      const vis = swK * (fall > 30 ? 0 : 1);
      mtx.compose(p, q, tmpV2.setScalar(sc * vis)); dBody.setMatrixAt(i, mtx); dBody.setColorAt(i, col.copy(C.airglow).lerp(C.plasma, caught * 0.85));
      for (let a2 = 0; a2 < 2; a2++) { const qa = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(YAX, Math.PI / 4 + (a2 * Math.PI) / 2)); mtx.compose(p, qa, tmpV2.setScalar(sc * vis)); dArm.setMatrixAt(i * 2 + a2, mtx); }
      for (let r = 0; r < 4; r++) { const ang = Math.PI / 4 + (r * Math.PI) / 2; tmpV.set(Math.cos(ang) * 0.148, 0.02, Math.sin(ang) * 0.148).multiplyScalar(sc).applyQuaternion(q).add(p);
        mtx.compose(tmpV, q, tmpV2.setScalar(sc * vis)); dRotor.setMatrixAt(i * 4 + r, mtx); dRotor.setColorAt(i * 4 + r, col.copy(C.gold).multiplyScalar(0.8 + 0.2 * Math.sin(time * 50 + r + i))); }
      tmpV.set(0, 0.035, 0.08).multiplyScalar(sc).applyQuaternion(q).add(p); mtx.compose(tmpV, q, tmpV2.setScalar(sc * vis)); dLed.setMatrixAt(i, mtx);
      dLed.setColorAt(i, li >= 0 && caught > 0.5 ? C.plasma : (Math.sin(time * 6 + i) > 0.6 ? C.hot : C.sodium));
    }
    // ClaimCheck: three neighbours range-check each accusation (gold lines draw in), then the liar is flagged and drops
    const arr = auditGeo.attributes.position.array; arr.fill(0);
    LIARS.forEach((li, j) => {
      const ta = 746 + j * 9, k = sm((t - (ta - 10)) / 9) * (1 - sm((t - (ta + 6)) / 6));
      if (k <= 0.01) return;
      const L = dronePos[li]; const near = dronePos.map((p, i) => [i, p.distanceToSquared(L)]).filter(([i]) => i !== li && !LIARS.includes(i)).sort((x, y) => x[1] - y[1]).slice(0, 3);
      near.forEach(([i], n) => { const A = dronePos[i]; arr.set([A.x, A.y, A.z, lerp(A.x, L.x, k), lerp(A.y, L.y, k), lerp(A.z, L.z, k)], (j * 3 + n) * 6); });
      const ph = clamp((t - ta) / 10, 0, 1); const p = pulses[j];
      if (ph > 0 && ph < 1) { p.visible = true; p.position.copy(L); p.scale.setScalar((0.1 + ph * 0.6) * sc); p.material.opacity = (1 - ph) * 0.9; }
    });
    auditGeo.attributes.position.needsUpdate = true;
    [dBody, dArm, dRotor, dLed].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    key.target.position.set(0, cy, 0); key.position.set(0, cy, 0).addScaledVector(KEYDIR, 14);
    { const scm = key.shadow.camera; scm.left = -HW; scm.right = HW; scm.top = HH; scm.bottom = -HH; scm.updateProjectionMatrix(); }
  }


  if (landerOn || swarmOn || particles.visible) { acam.aspect = aspect; acam.updateProjectionMatrix(); ar.render(as, acam); }
}

// adaptive resolution: if frames run slow for a second, render fewer pixels (and recover when fast again)
let wDirty = true, aShown = true, fq = 1, avg = 16.7, lastLoop = 0, settle = 0;
const actorEl = document.getElementById('actor');
function setQuality(q) { fq = q; wr.setPixelRatio(DPR * q); ar.setPixelRatio(DPR * q); wr.setSize(innerWidth, innerHeight, false); ar.setSize(innerWidth, innerHeight, false); wDirty = true; }
function loop(now) {
  const d = lastLoop ? now - lastLoop : 16.7; lastLoop = now;
  if (d < 250) avg += (d - avg) * 0.05; // ignore tab switches
  settle += d;
  if (settle > 1200) {
    if (avg > 24 && fq > 0.5) { setQuality(Math.max(0.5, fq - 0.2)); settle = 0; }
    else if (avg < 14 && fq < 1) { setQuality(Math.min(1, fq + 0.1)); settle = 0; }
  }
  frame(now); requestAnimationFrame(loop);
}
addEventListener('resize', () => { wr.setSize(innerWidth, innerHeight, false); ar.setSize(innerWidth, innerHeight, false); wDirty = true; });
if (reduced) { frame(performance.now()); } else requestAnimationFrame(loop);

/* warm-up: compile every scene's shaders (and the shadow variants) while the intro plays, so the first lattice /
   lander / swarm frame doesn't stall 150–380 ms on shader compilation. Hidden canvas, one scene per idle slot. */
if (!reduced) {
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
  const warm = async (r, scene, cam) => {
    const was = []; scene.traverse((o) => { was.push([o, o.visible]); o.visible = true; });
    try { if (r.compileAsync) await r.compileAsync(scene, cam); else r.compile(scene, cam); } catch (e) { /* ignore */ }
    // one real render into a tiny offscreen target builds the shadow-map programs too, without touching the screen
    const rt = new THREE.WebGLRenderTarget(16, 16); const prev = r.getRenderTarget();
    r.setRenderTarget(rt); r.render(scene, cam); r.setRenderTarget(prev); rt.dispose();
    was.forEach(([o, v]) => { o.visible = v; });
  };
  setTimeout(() => idle(async () => {
    await warm(wr, ws, wcam); wDirty = true;
    idle(() => warm(ar, as, acam));
  }), 2500);
}
