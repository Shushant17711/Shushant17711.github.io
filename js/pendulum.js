/* pendulum.js — a real double pendulum (two uniform rods, m = l = 1, g = 9.81), integrated with the
   generalised leapfrog (Störmer–Verlet for a non-separable Hamiltonian, which is symplectic), drawn on
   a 2D canvas with its tip trace in gold. film.js drives the framing through window.__dp = { x, y, s, on }. */
(function () {
  const cv = document.querySelector('.dp'); if (!cv) return;
  const ctx = cv.getContext('2d');
  const out = document.getElementById('dpdrift');
  const G = 9.81, H = 0.002;
  const dq = (q, p) => { const c = Math.cos(q[0] - q[1]), d = 16 - 9 * c * c;
    return [6 * (2 * p[0] - 3 * c * p[1]) / d, 6 * (8 * p[1] - 3 * c * p[0]) / d]; };
  const dp = (q, p) => { const [w1, w2] = dq(q, p), a = w1 * w2 * Math.sin(q[0] - q[1]);
    return [-0.5 * (a + 3 * G * Math.sin(q[0])), -0.5 * (-a + G * Math.sin(q[1]))]; };
  const energy = (q, p) => { const [w1, w2] = dq(q, p), c = Math.cos(q[0] - q[1]);
    return (w2 * w2 + 4 * w1 * w1 + 3 * w1 * w2 * c) / 6 - 0.5 * G * (3 * Math.cos(q[0]) + Math.cos(q[1])); };
  function step(q, p) {
    let ph = p.slice();
    for (let k = 0; k < 5; k++) { const f = dp(q, ph); ph = [p[0] + (H / 2) * f[0], p[1] + (H / 2) * f[1]]; }
    const v0 = dq(q, ph); let qn = q.slice();
    for (let k = 0; k < 5; k++) { const v1 = dq(qn, ph); qn = [q[0] + (H / 2) * (v0[0] + v1[0]), q[1] + (H / 2) * (v0[1] + v1[1])]; }
    const f = dp(qn, ph);
    return [qn, [ph[0] + (H / 2) * f[0], ph[1] + (H / 2) * f[1]]];
  }
  let q = [2.05, 2.7], p = [0, 0];
  const E0 = energy(q, p);
  const N = 2200; const tr = new Float32Array(N * 2); let head = 0, count = 0;
  const tip = () => [Math.sin(q[0]) + Math.sin(q[1]), Math.cos(q[0]) + Math.cos(q[1])];
  const push = () => { const t = tip(); tr[head * 2] = t[0]; tr[head * 2 + 1] = t[1]; head = (head + 1) % N; count = Math.min(N, count + 1); };
  let W = 0, Hh = 0, dpr = 1, B = 0;
  // the canvas is only the pendulum's reach (a square around the pivot), moved with a transform, not a full-screen layer:
  // full-screen 2D canvases are expensive to composite on software-rendered browsers and phones
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const size = () => {
    dpr = window.__softGL ? 0.75 : Math.min(matchMedia('(pointer: coarse)').matches ? 1.5 : 1.5, devicePixelRatio || 1);
    const host = RM ? cv : cv.parentElement; W = host.clientWidth; Hh = host.clientHeight;
    if (RM) { cv.width = W * dpr; cv.height = Hh * dpr; return; }
    B = Math.ceil(4.4 * 0.2 * Math.min(W, Hh) + 48);
    Object.assign(cv.style, { inset: 'auto', left: '0px', top: '0px', width: B + 'px', height: B + 'px', willChange: 'transform' });
    cv.width = Math.round(B * dpr); cv.height = Math.round(B * dpr);
  };
  addEventListener('resize', size); size();

  function draw(dp) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    if (!dp || dp.on <= 0.01) return;
    const L = dp.s * Math.min(W, Hh), ox = dp.x * W, oy = dp.y * Hh;
    if (RM) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    else { const bx = Math.round(ox - B / 2), by = Math.round(oy - B / 2); cv.style.transform = `translate3d(${bx}px,${by}px,0)`; ctx.setTransform(dpr, 0, 0, dpr, -bx * dpr, -by * dpr); }
    const X = (u) => ox + u[0] * L, Y = (u) => oy + u[1] * L;
    ctx.globalAlpha = dp.on;
    // swept reach (the pendulum's whole state space boundary), faint
    ctx.strokeStyle = 'rgba(233,229,220,.10)'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.arc(ox, oy, 2 * L, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // trace: oldest → newest, fading in, additive gold
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const start = (head - count + N) % N;
    // batched into age bands: one stroke per band instead of one per segment (2200 strokes was the frame cost)
    const BANDS = window.__softGL ? 14 : 24, DEC = window.__softGL ? 4 : 1; // software raster: fewer, coarser strokes
    for (let j = 0; j < BANDS; j++) {
      const i0 = Math.max(1, Math.floor((j / BANDS) * count)), i1 = Math.floor(((j + 1) / BANDS) * count);
      if (i1 <= i0) continue;
      const age = (j + 0.5) / BANDS;
      ctx.strokeStyle = `rgba(${226 + 20 * age | 0},${184 + 30 * age | 0},${98 + 60 * age * age | 0},${(0.1 + 0.9 * age).toFixed(3)})`;
      ctx.lineWidth = 1.2 + 2.8 * age * age;
      ctx.beginPath(); let a = (start + i0 - 1) % N; ctx.moveTo(ox + tr[a * 2] * L, oy + tr[a * 2 + 1] * L);
      for (let i = i0; i <= i1 && i < count; i += (i + DEC > i1 ? 1 : DEC)) { a = (start + i) % N; ctx.lineTo(ox + tr[a * 2] * L, oy + tr[a * 2 + 1] * L); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // rods
    const b1 = [Math.sin(q[0]), Math.cos(q[0])], b2 = [b1[0] + Math.sin(q[1]), b1[1] + Math.cos(q[1])];
    const rod = (a, b, w) => { ctx.lineWidth = w; ctx.strokeStyle = '#2a2826'; ctx.beginPath(); ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); ctx.stroke();
      ctx.lineWidth = w * 0.55; ctx.strokeStyle = '#d9d3c7'; ctx.stroke(); };
    rod([0, 0], b1, Math.max(5, L * 0.05)); rod(b1, b2, Math.max(4, L * 0.042));
    // mount + joints
    ctx.fillStyle = '#3a3733'; ctx.fillRect(ox - L * 0.22, oy - L * 0.07, L * 0.44, L * 0.05);
    const joint = (u, r, gold) => { const g = ctx.createRadialGradient(X(u) - r * 0.35, Y(u) - r * 0.35, r * 0.1, X(u), Y(u), r);
      g.addColorStop(0, gold ? '#fff1c4' : '#f3f1ec'); g.addColorStop(0.55, gold ? '#e2b862' : '#a9a49b'); g.addColorStop(1, gold ? '#8a6420' : '#4a4743');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(u), Y(u), r, 0, 7); ctx.fill(); };
    joint([0, 0], Math.max(5, L * 0.045), false); joint(b1, Math.max(7, L * 0.07), true); joint(b2, Math.max(8, L * 0.085), true);
    // tip glow
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(X(b2), Y(b2), 0, X(b2), Y(b2), L * 0.35); g.addColorStop(0, 'rgba(246,190,90,.45)'); g.addColorStop(1, 'rgba(246,164,67,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(b2), Y(b2), L * 0.35, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let i = 0; i < 9000; i++) { [q, p] = step(q, p); if (i % 4 === 0) push(); }
    const show = () => { size(); draw({ x: 0.5, y: 0.3, s: 0.2, on: 1 }); };
    requestAnimationFrame(show); addEventListener('resize', show);
    return;
  }
  let last = performance.now(), acc = 0, n = 0, shown = 0;
  // warm start: 8 s of real simulated history, so the trace already exists when the scene opens
  for (let i = 0; i < 4000; i++) { [q, p] = step(q, p); if (++n % 3 === 0) push(); }
  function loop(now) {
    const d = window.__dp; const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (d && d.on > 0.01) {
      acc += dt; let k = 0;
      while (acc >= H && k < 60) { [q, p] = step(q, p); acc -= H; k++; if (++n % 3 === 0) push(); }
      if (k >= 60) acc = 0;
      if (out && now - shown > 250) { shown = now; out.textContent = (Math.abs(energy(q, p) - E0) / Math.abs(E0)).toExponential(1); }
      draw(d);
    } else if (cv.dataset.clear !== '1') { draw(null); }
    const on = d && d.on > 0.01;
    if (cv.dataset.clear !== (on ? '0' : '1')) cv.style.visibility = on ? '' : 'hidden'; // off-screen: not composited
    cv.dataset.clear = on ? '0' : '1';
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
