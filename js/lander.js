/* lander.js — the hero actor, fully procedural.
   Descent stage of faceted, pillowed gold-foil panels (crinkle normal map, metal, env-lit),
   ascent-stage cabin with windows, docking tunnel, RCS quads, S-band dish + radar + VHF rods,
   four engine bells, four landing legs with footpads, probes and a ladder.
   Units: deployed lander is ~2.0 tall (footpad to dish), stowed ~1.6. Origin = descent-stage centre. */
import * as THREE from 'three';

function crinkleTextures() {
  const N = 512;
  const h = new Float32Array(N * N);
  const hs = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (x, y, P) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const g = (a, b) => hs(((a % P) + P) % P, ((b % P) + P) % P);
    const a = g(ix, iy), b = g(ix + 1, iy), c = g(ix, iy + 1), d = g(ix + 1, iy + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, amp = 1, f = 6;
    for (let o = 0; o < 5; o++) { const n = vn((x / N) * f, (y / N) * f, f); s += amp * (1 - Math.abs(n * 2 - 1)); amp *= 0.5; f *= 2; } // ridged = creases
    h[y * N + x] = s;
  }
  const nc = document.createElement('canvas'); nc.width = nc.height = N; const ng = nc.getContext('2d'); const nd = ng.createImageData(N, N);
  const cc = document.createElement('canvas'); cc.width = cc.height = N; const cg = cc.getContext('2d'); const cd = cg.createImageData(N, N);
  const H = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.4, dy = (H(x, y + 1) - H(x, y - 1)) * 2.4;
    const l = Math.hypot(dx, dy, 1); const i = (y * N + x) * 4;
    nd.data[i] = (-dx / l * 0.5 + 0.5) * 255; nd.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; nd.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[i + 3] = 255;
    const k = 0.78 + 0.22 * Math.min(1, H(x, y) / 1.6); // creases read darker
    cd.data[i] = 255 * k; cd.data[i + 1] = 255 * k * 0.97; cd.data[i + 2] = 255 * k * 0.9; cd.data[i + 3] = 255;
  }
  ng.putImageData(nd, 0, 0); cg.putImageData(cd, 0, 0);
  const normal = new THREE.CanvasTexture(nc); normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  const color = new THREE.CanvasTexture(cc); color.wrapS = color.wrapT = THREE.RepeatWrapping; color.colorSpace = THREE.SRGBColorSpace;
  return { normal, color };
}

export function buildLander() {
  const tex = crinkleTextures();
  const foil = (hex, rep = 1.4) => {
    const n = tex.normal.clone(); n.repeat.set(rep, rep); n.needsUpdate = true;
    const c = tex.color.clone(); c.repeat.set(rep, rep); c.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color: hex, map: c, metalness: 1, roughness: 0.3, normalMap: n, normalScale: new THREE.Vector2(0.85, 0.85), envMapIntensity: 1.25 });
  };
  const M = {
    gold: foil(0xe0b25a), goldDeep: foil(0xc98f3a), amberFoil: foil(0xb0773a, 2.2),
    silver: new THREE.MeshStandardMaterial({ color: 0xbdb8ae, metalness: 0.85, roughness: 0.34 }),
    paint: new THREE.MeshStandardMaterial({ color: 0x8a867e, metalness: 0.55, roughness: 0.42, flatShading: true }),
    black: new THREE.MeshStandardMaterial({ color: 0x17181a, metalness: 0.6, roughness: 0.45 }),
    bell: new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.9, roughness: 0.38, side: THREE.DoubleSide }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb8673a, metalness: 0.9, roughness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x08090b, metalness: 1, roughness: 0.06, emissive: 0x3a2410, emissiveIntensity: 0.6 }),
    bellHot: new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  const lander = new THREE.Group();
  const body = new THREE.Group(); lander.add(body);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  /* ── descent stage: 8 pillowed foil panels on an octagonal frame ── */
  const R = 0.66, Hs = 0.56, faces = 8;
  const apothem = R * Math.cos(Math.PI / faces), side = 2 * R * Math.sin(Math.PI / faces);
  for (let i = 0; i < faces; i++) {
    const a = (i / faces) * Math.PI * 2;
    const g = new THREE.PlaneGeometry(side * 0.985, Hs, 10, 8);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { // pillow bulge + random facet dents: foil blankets are not flat
      const u = p.getX(k) / (side / 2), v = p.getY(k) / (Hs / 2);
      const bulge = (1 - u * u) * (1 - v * v) * 0.045;
      const dent = (Math.sin(u * 7.3 + i * 1.7) * Math.sin(v * 5.1 - i) + Math.sin(u * 13 + v * 9 + i)) * 0.006;
      p.setZ(k, bulge + dent * (1 - u * u));
    }
    g.computeVertexNormals();
    const mat = i % 2 ? M.gold : M.goldDeep;
    const m = add(g.toNonIndexed(), mat, Math.sin(a) * apothem, 0, Math.cos(a) * apothem);
    m.geometry.computeVertexNormals();
    m.rotation.y = a;
    // dark corner strut at each panel edge
    const ea = a + Math.PI / faces;
    add(new THREE.BoxGeometry(0.035, Hs + 0.04, 0.035), M.black, Math.sin(ea) * R, 0, Math.cos(ea) * R).rotation.y = ea;
  }
  // top + bottom decks and rims
  const oct = (r, h) => new THREE.CylinderGeometry(r, r, h, faces, 1).rotateY(Math.PI / faces);
  add(oct(R * 0.99, 0.03), M.black, 0, Hs / 2, 0);
  add(oct(R * 1.0, 0.04), M.black, 0, -Hs / 2, 0);
  add(oct(R * 0.93, 0.05), M.amberFoil, 0, -Hs / 2 - 0.04, 0); // thermal blanket under the engines
  // a hatch-like bay on the front panel + a stencilled strip
  add(new THREE.BoxGeometry(0.3, 0.2, 0.02), M.black, 0, -0.02, apothem + 0.04);
  add(new THREE.BoxGeometry(0.22, 0.03, 0.025), M.copper, 0, 0.13, apothem + 0.045);

  /* ── engine bells: 4 lathed nozzles with copper bands and a hot inner wall ── */
  const bellPts = []; for (let k = 0; k <= 16; k++) { const u = k / 16; bellPts.push(new THREE.Vector2(0.05 + 0.13 * Math.pow(u, 0.62), -u * 0.34)); }
  const bellGeo = new THREE.LatheGeometry(bellPts, 32);
  const innerGeo = new THREE.LatheGeometry(bellPts.map((v) => new THREE.Vector2(v.x * 0.96, v.y)), 32);
  const ENG = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const e = new THREE.Group(); e.position.set(Math.cos(a) * 0.3, -Hs / 2 - 0.07, Math.sin(a) * 0.3); body.add(e);
    add(new THREE.CylinderGeometry(0.07, 0.085, 0.07, 16), M.black, 0, 0.02, 0, e);    // turbopump housing
    add(bellGeo, M.bell, 0, -0.01, 0, e);
    const hot = add(innerGeo, M.bellHot.clone(), 0, -0.01, 0, e);
    add(new THREE.TorusGeometry(0.18, 0.012, 6, 32).rotateX(Math.PI / 2), M.copper, 0, -0.35, 0, e);
    add(new THREE.TorusGeometry(0.11, 0.008, 6, 28).rotateX(Math.PI / 2), M.copper, 0, -0.14, 0, e);
    ENG.push({ g: e, out: 0, a, hot });
  }

  /* ── ascent stage: faceted cabin, windows, tunnel, tanks ── */
  const asc = new THREE.Group(); asc.position.y = Hs / 2; body.add(asc);
  const cabin = add(new THREE.CylinderGeometry(0.36, 0.44, 0.42, 6, 1), M.paint, 0, 0.24, 0.02, asc); cabin.rotation.y = Math.PI / 6;
  add(new THREE.CylinderGeometry(0.3, 0.36, 0.14, 6, 1).rotateY(Math.PI / 6), M.black, 0, 0.5, 0.02, asc);
  // front face: angled plate with two triangular windows
  const face = new THREE.Group(); face.position.set(0, 0.28, 0.4); face.rotation.x = -0.18; asc.add(face);
  add(new THREE.BoxGeometry(0.46, 0.3, 0.05), M.silver, 0, 0, 0, face);
  const tri = (flip) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.13 * flip, 0.0); s.lineTo(0.02 * flip, 0.12); s.closePath(); return new THREE.ShapeGeometry(s); };
  add(tri(-1), M.glass, -0.04, -0.02, 0.028, face);
  add(tri(1), M.glass, 0.04, -0.02, 0.028, face);
  add(new THREE.BoxGeometry(0.05, 0.05, 0.02), M.black, 0, 0.1, 0.03, face); // overhead window frame
  // docking tunnel + drogue ring on top
  add(new THREE.CylinderGeometry(0.13, 0.15, 0.14, 20), M.silver, 0, 0.64, 0, asc);
  add(new THREE.TorusGeometry(0.135, 0.018, 8, 24).rotateX(Math.PI / 2), M.black, 0, 0.71, 0, asc);
  // rear equipment bay (black) + side tanks (foil)
  add(new THREE.BoxGeometry(0.5, 0.3, 0.2), M.black, 0, 0.26, -0.36, asc);
  add(new THREE.BoxGeometry(0.52, 0.04, 0.22), M.amberFoil, 0, 0.42, -0.36, asc);
  [-1, 1].forEach((sx) => { const t = add(new THREE.CapsuleGeometry(0.1, 0.16, 6, 14), M.gold, sx * 0.43, 0.2, -0.05, asc); t.rotation.x = Math.PI / 2; });

  /* ── RCS quads: housing + 4 nozzles (up, down, two tangential) at the 4 cabin corners ── */
  const nozzle = new THREE.ConeGeometry(0.022, 0.07, 10, 1, true);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const q = new THREE.Group(); q.position.set(Math.sin(a) * 0.5, 0.33, Math.cos(a) * 0.5); q.rotation.y = a; asc.add(q);
    add(new THREE.BoxGeometry(0.1, 0.1, 0.08), M.silver, 0, 0, 0, q);
    add(new THREE.BoxGeometry(0.13, 0.13, 0.01), M.gold, 0, 0, -0.045, q);   // heat plate
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.14), M.black, 0, 0, -0.1, q).rotation.x = Math.PI / 2; // boom
    [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]].forEach(([x, y]) => {
      const n = add(nozzle, M.bell, x * 0.07, y * 0.07, 0.01, q);
      n.rotation.z = x ? -x * Math.PI / 2 : y > 0 ? Math.PI : 0;
    });
  }

  /* ── antennas: steerable S-band dish on a boom, rendezvous radar, two VHF rods ── */
  const dishPts = []; for (let k = 0; k <= 10; k++) { const r = (k / 10) * 0.17; dishPts.push(new THREE.Vector2(r, r * r * 1.9)); }
  const sband = new THREE.Group(); sband.position.set(0.3, 0.62, -0.18); asc.add(sband);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.36), M.silver, 0, 0.16, 0, sband);
  const dish = add(new THREE.LatheGeometry(dishPts, 28), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, metalness: 0.4, roughness: 0.45, side: THREE.DoubleSide }), 0, 0.36, 0, sband);
  dish.rotation.set(-0.7, 0, -0.5);
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.1), M.black, 0.02, 0.4, 0.02, sband).rotation.set(-0.7, 0, -0.5);
  const radar = add(new THREE.LatheGeometry(dishPts.map((v) => v.clone().multiplyScalar(0.5)), 20), M.silver, -0.24, 0.6, 0.22, asc);
  radar.rotation.x = Math.PI / 2 + 0.3;
  [-1, 1].forEach((sx) => { const r = add(new THREE.CylinderGeometry(0.005, 0.005, 0.34), M.silver, sx * 0.22, 0.7, -0.3, asc); r.rotation.set(-0.5, 0, sx * 0.55); });

  /* ── landing legs: primary strut, 2 secondaries, footpad, probe; pivot near the lower corner ── */
  const LEGS = [];
  const footPts = []; for (let k = 0; k <= 8; k++) { const u = k / 8; footPts.push(new THREE.Vector2(u * 0.16, Math.pow(u, 2.4) * 0.06)); }
  const footGeo = new THREE.LatheGeometry(footPts, 24);
  const strut = (len, r, mat) => new THREE.CylinderGeometry(r, r, len, 10).translate(0, -len / 2, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const pivot = new THREE.Group(); pivot.position.set(Math.cos(a) * 0.7, -0.12, Math.sin(a) * 0.7); pivot.rotation.y = -a; body.add(pivot);
    const leg = new THREE.Group(); pivot.add(leg);
    // primary: from pivot to the foot at (0.42, -0.78)
    // stowed = rotation.z 2.67 (strut vertical against the panels)
    const L1 = Math.hypot(0.42, 0.78); const ang = Math.atan2(0.42, 0.78);
    const prim = add(strut(L1, 0.03), M.gold, 0, 0, 0, leg); prim.rotation.z = ang;
    add(strut(L1 * 0.45, 0.038), M.silver, 0, 0, 0, leg).rotation.z = ang; // shock-absorber sleeve
    // secondaries: from the leg mid-point back toward the stage
    [-1, 1].forEach((sz) => {
      const from = new THREE.Vector3(0.21, -0.39, 0), to = new THREE.Vector3(-0.08, -0.12, sz * 0.2);
      const d = to.clone().sub(from); const s = add(new THREE.CylinderGeometry(0.012, 0.012, d.length(), 8), M.silver, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2, leg);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    });
    add(footGeo, M.gold, 0.42, -0.83, 0, leg);
    add(new THREE.SphereGeometry(0.03, 10, 8), M.silver, 0.42, -0.79, 0, leg);
    if (i !== 0) add(new THREE.CylinderGeometry(0.005, 0.005, 0.26), M.silver, 0.42, -0.96, 0, leg); // contact probe
    else for (let r = 0; r < 6; r++) add(new THREE.BoxGeometry(0.07, 0.008, 0.008), M.silver, 0.08 + r * 0.055, -0.15 - r * 0.1, 0, leg).rotation.z = ang; // ladder
    LEGS.push(leg);
  }

  body.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial) { o.castShadow = true; o.receiveShadow = true; } });
  ENG.forEach((e) => (e.hot.castShadow = false));
  return { lander, body, ENG, LEGS, M, windowLocal: new THREE.Vector3(0, Hs / 2 + 0.3, 0.44) };
}
