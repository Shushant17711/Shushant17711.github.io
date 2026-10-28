/* film.js — DOM choreography. One master timeline, measured in vh of scroll.
   The Three.js world (world.js) reads the same clock: window.FILM.t = scrollY / innerHeight. */
(function () {
  const kit = motionKit.init({ lerp: 0.12 });
  const reduced = kit.reduced;
  const gsap = window.gsap;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const TOTAL = 1420;
  const FILM = (window.FILM = { t: 0, total: TOTAL, reduced, fault: -1e9, under: false });
  if (reduced) document.documentElement.classList.add('reduced');

  // scene windows (vh). Section heights follow the starts so section tops = scene starts.
  const S = { intro: 0, about: 120, lattice: 235, ring: 365, fdir: 505, swarm: 715, storm: 835, mirage: 955, builds: 1070, log: 1205, contact: 1325 };
  const ids = Object.keys(S);
  ids.forEach((id, i) => {
    const next = i < ids.length - 1 ? S[ids[i + 1]] : TOTAL + 100;
    if (!reduced) document.getElementById(id).style.height = next - S[id] + 'vh';
  });
  const SETTLE = { intro: 0, about: 175, lattice: 300, ring: 400, fdir: 600, swarm: 790, storm: 900, mirage: 1030, builds: 1160, log: 1290, contact: 1400 };

  // local scrims under every block of body copy that sits over 3D
  $$('.lede, .fdir__cap, .swarm__copy, .storm__copy, .mirage__copy').forEach((el) => el.classList.add('scrim'));

  /* ── graduations on the portrait medallion ── */
  $$('.ticks').forEach((g) => { for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, r0 = i % 6 ? 94.5 : 93, l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', (Math.cos(a) * r0).toFixed(2)); l.setAttribute('y1', (Math.sin(a) * r0).toFixed(2)); l.setAttribute('x2', (Math.cos(a) * 97).toFixed(2)); l.setAttribute('y2', (Math.sin(a) * 97).toFixed(2));
    l.setAttribute('stroke-width', i % 6 ? '.6' : '1.2'); g.appendChild(l); } });

  /* ── storm map: authored contours (wobbly closed loops around peaks) ── */
  (function buildMap() {
    const g = $('.map__contours'); if (!g) return;
    const NS = 'http://www.w3.org/2000/svg';
    const peaks = [[300, 300, 9], [760, 700, 7], [1250, 620, 8], [1100, 180, 5], [520, 880, 4]];
    let d = '';
    peaks.forEach(([px, py, n], k) => { for (let i = 1; i <= n; i++) { const r = i * 34; let p = ''; for (let a = 0; a <= 64; a++) { const th = (a / 64) * Math.PI * 2; const w = 1 + 0.18 * Math.sin(th * 3 + k + i * 0.4) + 0.08 * Math.sin(th * 7 - i); const x = px + Math.cos(th) * r * w * 1.25, y = py + Math.sin(th) * r * w; p += (a ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); } d += p + 'Z'; } });
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d); g.appendChild(path);
    const grid = (sel, step) => { const gg = $(sel); for (let x = 0; x <= 1600; x += step) { const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', x); l.setAttribute('x2', x); l.setAttribute('y1', 0); l.setAttribute('y2', 1000); gg.appendChild(l); } for (let y = 0; y <= 1000; y += step) { const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', 0); l.setAttribute('x2', 1600); l.setAttribute('y1', y); l.setAttribute('y2', y); gg.appendChild(l); } };
    grid('.map__grid', 120); grid('.map__grid2', 50);
    const ens = $('.map__ens');
    for (let i = 0; i < 6; i++) { const p = document.createElementNS(NS, 'path'); const o = (i - 2.5) * 26; p.setAttribute('d', `M${150 + o} ${860 - o} C ${420 + o * 2} ${760 + o}, ${560 - o} ${700 - o * 2}, ${760 + o} ${600 + o} S ${1090 + o * 3} ${420 - o}, ${1230 + o * 2} ${260 + o * 2}`); ens.appendChild(p); }
    const spin = $('.storm__spin');
    for (let i = 0; i < 4; i++) { const a = document.createElementNS(NS, 'path'); const r = 40 + i * 34; a.setAttribute('d', `M${r} 0 A ${r} ${r} 0 0 1 ${-r * 0.6} ${r * 0.8}`); a.setAttribute('fill', 'none'); a.setAttribute('stroke', 'var(--plasma)'); a.setAttribute('stroke-opacity', (0.8 - i * 0.15).toFixed(2)); a.setAttribute('stroke-width', 3 - i * 0.5); a.setAttribute('transform', `rotate(${i * 90})`); spin.appendChild(a); }
  })();

  // reduced motion: the film becomes a readable document; no timeline, no pins
  if (reduced) { $$('.layer').forEach((l) => { l.style.opacity = 1; l.style.visibility = 'visible'; }); return; }

  /* ── shards for the SurgeryNet card (radial wedges from an impact point) ── */
  const shardsEl = $('.shards'), card = $('.slab__card');
  const SH = [];
  (function buildShards() {
    let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const n = 12, cx = 62, cy = 46;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.3, a1 = ((i + 1) / n) * Math.PI * 2 + (r() - 0.5) * 0.3, R = 220;
      const d = document.createElement('div'); d.className = 'shard';
      const mid = (a0 + a1) / 2, rIn = 4 + r() * 6;
      d.style.clipPath = `polygon(${cx + Math.cos(a0) * rIn}% ${cy + Math.sin(a0) * rIn}%, ${cx + Math.cos(a0) * R}% ${cy + Math.sin(a0) * R}%, ${cx + Math.cos(a1) * R}% ${cy + Math.sin(a1) * R}%, ${cx + Math.cos(a1) * rIn}% ${cy + Math.sin(a1) * rIn}%)`;
      const c = card.cloneNode(true); c.querySelectorAll('a').forEach((a) => a.removeAttribute('href')); c.querySelectorAll('img').forEach((im) => (im.alt = '')); c.querySelectorAll('h2,h3').forEach((h) => { const d = document.createElement('div'); d.className = h.className; d.innerHTML = h.innerHTML; h.replaceWith(d); });
      d.appendChild(c); shardsEl.appendChild(d);
      SH.push({ el: d, dx: Math.cos(mid), dy: Math.sin(mid), d: r(), r: (r() - 0.5) * 120, z: 200 + r() * 600 });
    }
  })();
  const sizeShards = () => { shardsEl.style.height = card.offsetHeight + 'px'; };


  /* ── master timeline ── */
  gsap.registerPlugin(ScrollTrigger);
  const tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true });
  const show = (el, a, b, fin = 6, fout = 6) => {
    if (a > 0) tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: fin, immediateRender: false }, a);
    if (b < TOTAL) tl.fromTo(el, { opacity: 1 }, { opacity: 0, duration: fout, immediateRender: false }, b - fout);
  };
  const L = (id) => $(`#${id} .layer`);
  gsap.set($$('.layer'), { opacity: 0 });
  gsap.set(L('intro'), { opacity: 1 });

  /* #1 INTRO — the Bloch sphere condenses behind the name; scrolling flattens it into the gold ring that opens onto About */
  show(L('intro'), 0, 122, 1, 4);
  tl.to(['.layer--intro .lede', '.layer--intro .scrollcue', '.layer--intro .kicker', '.layer--intro .eq'], { y: 40, opacity: 0, duration: 24, stagger: 3 }, 36);
  tl.to('.name__top', { y: () => -innerHeight * 0.16, opacity: 0, duration: 22, ease: 'power2.in' }, 62);
  tl.to('.name__bot', { y: () => innerHeight * 0.2, opacity: 0, duration: 22, ease: 'power2.in' }, 62);
  const lens = $('.lens'), lensSvg = $('.lens svg');
  const about = L('about');
  const zoomP = { s: 0.12 };
  const applyZoom = () => {
    const size = Math.min(Math.min(innerWidth, innerHeight) * 0.7, 560); // the svg's untransformed width (css: min(70vmin,560px))
    gsap.set(lensSvg, { scale: zoomP.s });
    const R = 0.38 * (size / 2) * zoomP.s;
    about.style.clipPath = zoomP.s >= 13.9 ? 'none' : `circle(${Math.max(0, R).toFixed(1)}px at 50% 50%)`;
  };
  tl.set(lens, { visibility: 'visible' }, 98);
  tl.fromTo(lens, { opacity: 0 }, { opacity: 1, duration: 2 }, 98);
  tl.fromTo(zoomP, { s: 0.7 }, { s: 14, duration: 28, ease: 'power2.in', onUpdate: applyZoom }, 98);
  tl.fromTo(about, { opacity: 0 }, { opacity: 1, duration: 4, immediateRender: false }, 99);
  tl.fromTo(['.about__log', '.about__half'], { scale: 0.6 }, { scale: 1, duration: 28, ease: 'power2.in' }, 98);
  tl.set(lens, { visibility: 'hidden' }, 127);

  /* #2 ABOUT — split screen; the medallion on the left becomes an iris onto the lattice */
  const medal = $('.about__medal');
  const holeP = { r: 0 };
  const applyHole = () => {
    const r = medal.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    about.style.setProperty('--hx', cx + 'px'); about.style.setProperty('--hy', cy + 'px');
    const base = (r.width / 2) * 0.92;
    about.style.setProperty('--hole', (base * Math.min(1, holeP.r / 0.12) + holeP.r * Math.hypot(innerWidth, innerHeight) * 1.2).toFixed(1) + 'px');
  };
  tl.fromTo('.about__log .h2', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 12 }, 116);
  tl.fromTo('.facts div', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 8, stagger: 4 }, 122);
  tl.fromTo('.gauges li', { '--boot': 0, opacity: 0.3 }, { '--boot': 1, opacity: 1, duration: 10, stagger: 4 }, 140);
  tl.fromTo('.loadout', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 10 }, 154);
  tl.fromTo('.about__medal svg', { rotation: 0 }, { rotation: 90, duration: 110 }, 120);
  tl.fromTo('.about__portrait', { opacity: 1 }, { opacity: 0, duration: 6, immediateRender: false }, 196);
  tl.fromTo(holeP, { r: 0 }, { r: 1, duration: 36, ease: 'power2.in', onUpdate: applyHole, immediateRender: false }, 198);
  tl.to(['.about__log'], { x: 120, opacity: 0, duration: 24, ease: 'power2.in' }, 204);
  tl.set(about, { opacity: 0 }, 236);

  /* #3 LATTICE — the card rises off the tilted lattice (two patches merge, then split), then shatters */
  gsap.set(['.slab', shardsEl], { xPercent: -50, yPercent: -50 });
  show(L('lattice'), 196, 376, 6, 2);
  tl.fromTo('.lattice__kicker', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 10 }, 214);
  tl.fromTo('.slab', { rotationX: 72, z: -500, y: 260, opacity: 0 }, { rotationX: 30, z: -120, y: 60, opacity: 1, duration: 22, ease: 'power2.out' }, 200);
  tl.to('.slab', { rotationX: 12, z: 0, y: 0, duration: 40, ease: 'power2.out' }, 222);
  tl.to('.slab', { rotationX: 8, rotationZ: -1, duration: 70 }, 262);
  tl.call(() => $$('.slab [data-scramble]').forEach((el) => motionKit.scramble(el, { duration: 1 })), null, 236);
  const stLab = $$('.lattice__state span');
  const LST = [[226, 280], [280, 298], [298, 318], [318, 344]];
  LST.forEach(([a, b], i) => { tl.fromTo(stLab[i], { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 3, immediateRender: false }, a); tl.to(stLab[i], { opacity: 0, y: -10, duration: 3 }, b - 3); });
  tl.set('.slab', { opacity: 0 }, 344);
  tl.set(SH.map((s) => s.el), { visibility: 'visible' }, 344);
  tl.set(SH.map((s) => s.el), { visibility: 'hidden' }, 343.99);
  gsap.set(shardsEl, { rotationX: 8, rotationZ: -1 });
  SH.forEach((s) => {
    tl.fromTo(s.el, { x: 0, y: 0, z: 0, rotation: 0, opacity: 1 }, { x: s.dx * (500 + s.d * 500), y: s.dy * (360 + s.d * 400) + 200, z: s.z, rotation: s.r, rotationX: s.r * 0.8, opacity: 0, duration: 18 + s.d * 6, ease: 'power2.in', immediateRender: false }, 344);
  });
  tl.to('.lattice__kicker', { opacity: 0, duration: 8 }, 336);

  /* #4 PENDULUM → RING — a live double pendulum beside its real figure; then the cards orbit it, then a whip pan */
  show(L('ring'), 360, 512, 6, 4);
  const phone = () => innerWidth < 761;
  const DP = (window.__dp = { x: phone() ? 0.5 : 0.28, y: phone() ? 0.3 : 0.52, s: phone() ? 0.18 : 0.2, on: 0 });
  tl.fromTo(DP, { on: 0 }, { on: 1, duration: 8 }, 362);
  tl.fromTo(DP, { x: () => (phone() ? 0.5 : 0.28), y: () => (phone() ? 0.3 : 0.52), s: () => (phone() ? 0.18 : 0.2) },
    { x: 0.5, y: () => (phone() ? 0.46 : 0.5), s: () => (phone() ? 0.2 : 0.16), duration: 22, ease: 'power2.inOut', immediateRender: false }, 420);
  tl.to(DP, { on: 0, duration: 10 }, 494);
  tl.fromTo('.hwm', { x: 80, opacity: 0 }, { x: 0, opacity: 1, duration: 14, ease: 'power3.out' }, 366);
  tl.fromTo('.dp__read', { opacity: 0 }, { opacity: 1, duration: 8 }, 372);
  tl.to('.hwm', { x: 120, opacity: 0, duration: 14, ease: 'power2.in' }, 418);
  tl.to('.dp__read', { opacity: 0, duration: 8 }, 420);
  const rcs = $$('.rc');
  const ringState = { a: 0 };
  const placeRing = () => {
    const w = rcs[0].offsetWidth, n = rcs.length, R = phone() ? w * 0.9 : Math.max(w * (n > 4 ? 1.25 : 1.05), 300);
    let A = ringState.a;
    { const st = 360 / n, k = A / st, f = k - Math.floor(k), hold = phone() ? 0.7 : 0.55; const e = f < hold ? 0 : (f - hold) / (1 - hold); A = (Math.floor(k) + e * e * (3 - 2 * e)) * st; }
    rcs.forEach((c, i) => {
      const deg = (i / n) * 360 + A; const a = (deg * Math.PI) / 180;
      const z = Math.cos(a) * R - R * 0.2;
      c.style.transform = `translate3d(${(Math.sin(a) * R).toFixed(1)}px,-50%,${z.toFixed(1)}px) rotateY(${deg.toFixed(2)}deg)`;
      const front = Math.max(0, Math.cos(a));
      c.style.opacity = (phone() ? Math.pow(front, 14) : Math.pow(front, 1.2)).toFixed(2);
      c.style.zIndex = Math.round(z + 2000);
    });
  };
  tl.fromTo('.ring', { opacity: 0 }, { opacity: 1, duration: 8 }, 426);
  tl.fromTo('.ring__track', { z: -1800, rotationX: 30, scale: 0.6 }, { z: 0, rotationX: -4, scale: 1, duration: 22, ease: 'power3.out' }, 426);
  tl.fromTo(ringState, { a: 0 }, { a: () => -360 * (rcs.length - 1) / rcs.length, duration: 60, onUpdate: placeRing }, 428);
  tl.fromTo('.layer--ring .ghost', { xPercent: 10, opacity: 0 }, { xPercent: -40, opacity: 1, duration: 90 }, 420);
  tl.fromTo('.ring__kicker', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 10 }, 430);
  tl.to(ringState, { a: () => -360 * (rcs.length - 1) / rcs.length - 600, duration: 22, ease: 'power3.in', onUpdate: placeRing }, 490);
  tl.to('.whip', { opacity: 1, duration: 14, ease: 'power2.in' }, 492);
  tl.to('.ring', { filter: 'blur(14px)', xPercent: -30, duration: 18, ease: 'power2.in' }, 492);
  tl.to('.ring__kicker', { opacity: 0, duration: 8 }, 488);

  /* #5 ENGINE OUT — close-up on the lander; caption overlaid; FDIR sequence; smoke wipe */
  const fdir = L('fdir');
  fdir.style.zIndex = 16;
  show(fdir, 500, 724, 10, 2);
  tl.fromTo('.plasma', { opacity: 0 }, { opacity: 1, duration: 56 }, 494);
  tl.to('.plasma', { opacity: 0, duration: 60 }, 640);
  tl.fromTo('.fdir__cap', { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 14, ease: 'power3.out' }, 516);
  const FAULT = [560, 585, 610, 640];
  FILM.faultT = FAULT;
  const steps = $$('.fdir__steps li');
  const fdirSteps = (n) => steps.forEach((s, i) => s.classList.toggle('on', i < n));
  FAULT.forEach((t, i) => tl.call(() => fdirSteps(i + 1), null, t).call(() => fdirSteps(i), null, t - 0.01));
  const smokePath = $('#smokepath'); const smoke = { p: 0 };
  const cloudEdge = (y, phase) => { let d = ''; const n = 14; for (let i = 0; i <= n; i++) { const x = (i / n) * 100; const b = Math.sin(i * 1.7 + phase) * 4 + Math.sin(i * 0.6 + phase * 0.5) * 3; d += `L${x.toFixed(2)} ${(y + b).toFixed(2)} `; } return d; };
  const drawSmoke = () => { const p = smoke.p; if (p <= 0 || p >= 2) { smokePath.setAttribute('d', ''); return; }
    const y = 112 - (p <= 1 ? p : p - 1) * 128; const e = cloudEdge(y, p * 3);
    smokePath.setAttribute('d', p <= 1 ? `M0 100 L0 ${y.toFixed(2)} ${e} L100 100 Z` : `M0 0 L0 ${y.toFixed(2)} ${e} L100 0 Z`);
  };
  tl.fromTo(smoke, { p: 0 }, { p: 1, duration: 16, ease: 'power1.in', onUpdate: drawSmoke }, 686);
  tl.to('.fdir__cap', { opacity: 0, y: -30, duration: 8, ease: 'power2.in' }, 680);
  tl.to(smoke, { p: 2, duration: 14, ease: 'power1.out', onUpdate: drawSmoke }, 702);

  /* #6 SWARM — the numbers fill the frame; the swarm drifts across them and audits its own accusations */
  show(L('swarm'), 700, 852, 2, 8);
  tl.fromTo('.bleed', { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 18, ease: 'power3.out' }, 708);
  tl.fromTo('.bleed__cap', { opacity: 0 }, { opacity: 1, duration: 8 }, 722);
  tl.fromTo('.swarm__copy', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 14, ease: 'power3.out' }, 730);
  $$('[data-count]').forEach((el) => { const target = +el.dataset.count; const o = { v: 0 }; tl.fromTo(o, { v: target === 0 ? 7 : 0 }, { v: target, duration: 36, ease: 'power2.out', onUpdate: () => (el.textContent = Math.round(o.v)) }, 712); });
  tl.to('.bleed', { scale: 0.4, opacity: 0, duration: 24, ease: 'power2.in' }, 818);
  tl.to(['.swarm__copy', '.bleed__cap'], { y: 40, opacity: 0, duration: 16, ease: 'power2.in' }, 816);

  /* #7 STORM MAP — scale jump to straight-down; tracked cell */
  const storm = L('storm');
  show(storm, 822, 968, 14, 2);
  tl.fromTo('.map', { scale: 2.6, rotation: -12 }, { scale: 1, rotation: 0, duration: 36, ease: 'power3.out' }, 822);
  const track = $('.map__track'); track.setAttribute('pathLength', '1'); track.style.strokeDasharray = '0.012 0.008';
  tl.fromTo(track, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 50 }, 846);
  tl.fromTo('.map__track', { opacity: 0 }, { opacity: 1, duration: 4 }, 846);
  tl.fromTo('.map__ens path', { opacity: 0 }, { opacity: 1, duration: 10, stagger: 3 }, 856);
  tl.fromTo('.map__grid2', { strokeOpacity: 0 }, { strokeOpacity: 0.14, duration: 20 }, 868);
  tl.fromTo('.map__grid', { strokeOpacity: 0.1 }, { strokeOpacity: 0.03, duration: 20 }, 868);
  tl.fromTo('.storm__spin', { rotation: 0, svgOrigin: '0 0' }, { rotation: -420, duration: 140 }, 822);
  tl.fromTo('.storm', { scale: 0.6, svgOrigin: '1040 470' }, { scale: 1.1, duration: 60 }, 840);
  tl.fromTo('.storm__copy', { y: -60, opacity: 0 }, { y: 0, opacity: 1, duration: 18, ease: 'power3.out' }, 838);
  tl.fromTo('.storm__tag', { opacity: 0 }, { opacity: 1, duration: 6 }, 880);
  const sz = $('.screen-zoom'), bezel = $('.screen-zoom__bezel'), mirage = L('mirage');
  const zz = { s: 1.3 };
  const applyScreen = () => {
    gsap.set(bezel, { scale: zz.s });
    const w = bezel.offsetWidth * zz.s, h = bezel.offsetHeight * zz.s;
    const ix = Math.max(0, (innerWidth - w) / 2 + 3 * zz.s), iy = Math.max(0, (innerHeight - h) / 2 + 3 * zz.s);
    mirage.style.clipPath = zz.s >= 5.9 ? 'none' : `inset(${iy.toFixed(1)}px ${ix.toFixed(1)}px round ${(14 * zz.s).toFixed(1)}px)`;
  };
  tl.set(sz, { visibility: 'visible' }, 930);
  tl.fromTo(sz, { opacity: 0 }, { opacity: 1, duration: 5 }, 930);
  tl.fromTo(zz, { s: 1.3 }, { s: 6, duration: 34, ease: 'power2.in', onUpdate: applyScreen }, 934);

  /* #8 MIRAGE — split: the hostile page pulls the agent's cursor toward the hidden instruction; it refuses */
  show(mirage, 931, 1086, 3, 2);
  tl.call(applyScreen, null, 931);
  tl.fromTo('.mirage__copy', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 12, ease: 'power3.out' }, 936);
  tl.fromTo('.agent', { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 12, ease: 'power3.out' }, 944);
  const alog = $$('.agent__log li');
  const ALOG = [950, 962, 990, 1014, 1030];
  ALOG.forEach((t, i) => { tl.call(() => alog[i].classList.add('on'), null, t); tl.call(() => alog[i].classList.remove('on'), null, t - 0.01); });
  tl.fromTo('.inj', { clipPath: 'inset(-60px 100% -60px -60px)' }, { clipPath: 'inset(-60px -60px -60px -60px)', duration: 14 }, 972);
  // the agent's cursor: reads the first paragraph, is dragged toward the injection, resists, refuses, reads on
  const cur = $('.agent-cursor'), bb = $('.browser__body');
  const at = (sel, fx, fy) => () => { const e = $(sel), r = e.getBoundingClientRect(), o = bb.getBoundingClientRect(); return { x: r.left - o.left + r.width * fx, y: r.top - o.top + r.height * fy }; };
  const P = { a: at('.bp__p[data-read="1"]', 0.05, 0.3), b: at('.bp__p[data-read="1"]', 0.85, 0.75), c: at('.inj', 0.55, 0.5), d: at('.bp__p[data-read="2"]', 0.1, 0.35), e: at('.bp__p[data-read="2"]', 0.8, 0.7) };
  tl.fromTo(cur, { opacity: 0 }, { opacity: 1, duration: 4 }, 948);
  tl.fromTo(cur, { x: () => P.a().x, y: () => P.a().y }, { x: () => P.b().x, y: () => P.b().y, duration: 18, ease: 'power1.inOut', immediateRender: false }, 950);
  tl.to(cur, { x: () => P.c().x, y: () => P.c().y, duration: 16, ease: 'power2.in' }, 984);
  const gl = { p: 0 }; const inj = $('.inj');
  tl.fromTo(gl, { p: 0 }, { p: 1, duration: 26, onUpdate: () => { const k = gl.p < 1 ? Math.sin(gl.p * 97) * 10 * (1 - gl.p) : 0; inj.style.transform = `translateX(${k.toFixed(1)}px) skewX(${(k * 0.6).toFixed(1)}deg)`; cur.style.setProperty('--jit', (k * 0.6).toFixed(1) + 'px'); } }, 986);
  tl.call(() => { inj.classList.add('struck'); cur.classList.add('refused'); }, null, 1014).call(() => { inj.classList.remove('struck'); cur.classList.remove('refused'); }, null, 1013.99);
  tl.fromTo(inj, { '--st': 0 }, { '--st': 1, duration: 8, ease: 'back.out(2)' }, 1015);
  tl.to(cur, { x: () => P.d().x, y: () => P.d().y, duration: 12, ease: 'power2.out' }, 1018);
  tl.to(cur, { x: () => P.e().x, y: () => P.e().y, duration: 14, ease: 'power1.inOut' }, 1030);
  const builds = L('builds'); const tear = { y: -10 };
  const jag = Array.from({ length: 24 }, (_, i) => ((i * 7919) % 13) / 13);
  const applyTear = () => { const y = tear.y; if (y >= 112) { builds.style.clipPath = 'none'; return; } const pts = ['0% 0%', '100% 0%']; for (let i = 23; i >= 0; i--) { const x = (i / 23) * 100; pts.push(`${x.toFixed(1)}% ${Math.max(0, y + (jag[i] - 0.5) * 9).toFixed(1)}%`); } builds.style.clipPath = `polygon(${pts.join(',')})`; };
  show(builds, 1046, 1214, 1, 6);
  tl.fromTo(tear, { y: -10 }, { y: 112, duration: 32, ease: 'power2.inOut', onUpdate: applyTear }, 1046);
  tl.to('.browser', { xPercent: -20, skewX: 6, duration: 30, ease: 'power2.in' }, 1048);

  /* #9 BUILDS — a scattered 3D stack of real screenshots settles into a grid, then the camera pans down it */
  const scs = $$('.sc');
  let sd = 3; const r2 = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  scs.forEach((c, i) => {
    tl.fromTo(c, { x: (r2() - 0.5) * 1100, y: (r2() - 0.5) * 800, z: -300 - r2() * 1500, rotationX: (r2() - 0.5) * 120, rotationY: (r2() - 0.5) * 140, rotationZ: (r2() - 0.5) * 60, opacity: 0 },
      { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, opacity: 1, duration: 40, ease: 'power3.out' }, 1064 + i * 3);
  });
  tl.fromTo('.builds__head > *', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 14, stagger: 4, ease: 'power3.out' }, 1076);
  const stackOver = () => { const st = $('.stack'); return -Math.max(0, st.offsetTop + st.offsetHeight - innerHeight + 16); };
  tl.fromTo('.stack', { y: 0 }, { y: stackOver, duration: 70, ease: 'power1.inOut', immediateRender: false }, 1110);
  tl.to('.builds__head', { opacity: () => (stackOver() < -4 ? 0 : 1), y: () => Math.min(0, stackOver() * 0.5), duration: 20, ease: 'power1.in' }, 1110);
  // environment becomes layout: the grid lies down and becomes the floor of the next scene
  tl.to('.stack', { rotationX: 72, opacity: 0, transformOrigin: '50% 100%', duration: 22, ease: 'power2.in' }, 1184);
  tl.to('.builds__head', { opacity: 0, duration: 18, ease: 'power2.in' }, 1184);

  /* #10 LOG — a vertical line down the centre; a gold comet travels it and lights the entries on both sides */
  const traj = L('log');
  show(traj, 1196, 1330, 8, 6);
  const tsvg = $('.traj'), tgrid = $('.traj__grid'), tp = $('#trajpath'), tghost = $('.traj__ghost'), comet = $('.comet'), cglow = $('.comet__glow'), ctail = $('.comet__tail');
  const flags = $$('.flags li');
  let T = { pts: [], len: 1 };
  const trackAt = (u) => {
    const W = innerWidth, H = innerHeight, ph = W < 761;
    const sway = Math.sin(u * Math.PI * 1.5) * Math.pow(1 - u, 1.4) * (ph ? 0.22 : 0.1);
    return [W * (0.5 + sway), H * (0.14 + 0.78 * u)];
  };
  const buildTraj = () => {
    tsvg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    let g = '';
    for (let k = 0; k <= 10; k++) { const y = innerHeight * (0.14 + 0.078 * k); const x = innerWidth * 0.5; g += `<line x1="${x - 8}" y1="${y}" x2="${x + 8}" y2="${y}"/>`; }
    tgrid.innerHTML = g;
    T.pts = []; let d = '';
    for (let i = 0; i <= 120; i++) { const p = trackAt(i / 120); T.pts.push(p); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }
    tp.setAttribute('d', d); tghost.setAttribute('d', d);
    T.len = tp.getTotalLength(); tp.style.strokeDasharray = T.len;
    placeFlags();
  };
  const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'g'); leaders.setAttribute('class', 'traj__leaders'); tsvg.insertBefore(leaders, ctail);
  const placeFlags = () => {
    if (innerWidth < 761) { let y = 150; flags.forEach((f) => { f.style.left = '20px'; f.style.top = y + 'px'; y += f.offsetHeight + 10; }); leaders.innerHTML = ''; return; }
    const pad = Math.max(20, innerWidth * 0.05), head = $('.traj__head');
    const lastBottom = [head.offsetTop + head.offsetHeight + 16, 80]; let lg = '';
    flags.forEach((f, i) => {
      const u = +f.dataset.at; const [px, py] = trackAt(u);
      const side = i % 2; const w = f.offsetWidth, h = f.offsetHeight;
      const left = side ? innerWidth - pad - w : pad;
      const top = Math.max(py - h * 0.5, lastBottom[side] + 12); lastBottom[side] = top + h;
      f.style.left = left + 'px'; f.style.top = top + 'px';
      const ex = side ? left : left + w, ey = top + Math.min(h - 10, 18);
      lg += `<path data-at="${u}" d="M${ex} ${ey} H${(ex + px) / 2} L${px} ${py}"/><circle data-at="${u}" cx="${px}" cy="${py}" r="5"/>`;
    });
    leaders.innerHTML = lg;
  };
  buildTraj();
  const tr = { p: 0 };
  const applyTraj = () => {
    if (T.pts.length < 2) return;
    const n = T.pts.length - 1; const i = Math.min(n - 1, Math.floor(tr.p * n)); const a = T.pts[i], b = T.pts[i + 1]; const f = tr.p * n - i;
    const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
    tp.style.strokeDashoffset = T.len * (1 - tr.p);
    comet.setAttribute('cx', x); comet.setAttribute('cy', y); cglow.setAttribute('cx', x); cglow.setAttribute('cy', y);
    let d = `M${x.toFixed(1)} ${y.toFixed(1)}`; for (let k = i; k >= Math.max(0, i - 9); k--) d += `L${T.pts[k][0].toFixed(1)} ${T.pts[k][1].toFixed(1)}`;
    ctail.setAttribute('d', d);
    flags.forEach((fl) => { const on = tr.p >= +fl.dataset.at; fl.style.opacity = on ? 1 : 0; fl.style.transform = on ? 'none' : 'translateY(14px)'; });
    leaders.querySelectorAll('[data-at]').forEach((el) => el.classList.toggle('on', tr.p >= +el.dataset.at));
  };
  flags.forEach((f) => (f.style.transition = 'opacity .5s, transform .6s var(--ease)'));
  tl.fromTo('.traj__grid', { opacity: 0 }, { opacity: 1, duration: 14 }, 1196);
  tl.fromTo(['.comet', '.comet__glow', '.comet__tail'], { opacity: 0 }, { opacity: 1, duration: 6 }, 1204);
  tl.fromTo(tr, { p: 0 }, { p: 1, duration: 104, onUpdate: applyTraj }, 1206);
  tl.fromTo('.traj__head > *', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 12, stagger: 4, ease: 'power3.out' }, 1204);
  tl.to(['.flags', '.traj__head', '.traj__leaders', '.comet', '.comet__glow', '.comet__tail'], { opacity: 0, duration: 8 }, 1308);

  /* #11 CONTACT — the sphere returns as a ring; the links stand around it */
  const contact = L('contact');
  show(contact, 1312, TOTAL + 1, 10);
  tl.fromTo('.contact__title', { clipPath: 'inset(0 0 100% 0)', y: 40 }, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 16, ease: 'power3.out' }, 1322);
  tl.fromTo('.contact__head .kicker', { opacity: 0 }, { opacity: 1, duration: 8 }, 1316);
  tl.fromTo('.links li', { y: 40, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: 14, stagger: 3, ease: 'back.out(1.6)' }, 1366);
  tl.fromTo('.footer', { opacity: 0 }, { opacity: 1, duration: 10 }, 1388);
  tl.to({}, { duration: 0.001 }, TOTAL);

  /* ── drive: the timeline time = scroll in vh ── */
  const idx = $('#idx'), bar = $('#progbar'), label = $('#scenelabel');
  const layers = $$('.layer');
  let lastLabel = '';
  const sync = () => {
    const t = Math.min(TOTAL, Math.max(0, (scrollY / innerHeight) * 100));
    FILM.t = t;
    tl.time(t);
    if (t > 96 && t < 240) applyHole();
    bar.style.transform = `scaleX(${(t / TOTAL).toFixed(4)})`;
    let cur = 'intro'; for (const id of ids) if (t >= S[id] - 8) cur = id;
    const sec = document.getElementById(cur), lab = sec.dataset.label;
    if (lab !== lastLabel) { label.textContent = lab; idx.textContent = String(sec.dataset.scene).padStart(2, '0') + ' / 11'; lastLabel = lab; }
    layers.forEach((l) => { const o = +getComputedStyle(l).opacity; l.style.pointerEvents = o > 0.5 ? 'auto' : 'none'; l.style.visibility = o > 0.002 ? 'visible' : 'hidden'; });
  };
  gsap.ticker.add(sync);
  addEventListener('resize', () => { buildTraj(); placeRing(); applyHole(); sizeShards(); tl.invalidate(); sync(); });

  /* focus inside a scene scrolls the film to it */
  document.addEventListener('focusin', (e) => { const sec = e.target.closest && e.target.closest('.scene'); if (!sec) return; const t = SETTLE[sec.id]; if (Math.abs(FILM.t - t) > 30) jump(t, true); });
  const jump = (t, now) => { const y = (t / 100) * innerHeight; if (kit.lenis) kit.lenis.scrollTo(y, { immediate: !!now, duration: 2.2 }); else scrollTo(0, y); };
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => { const id = a.getAttribute('href').slice(1); if (id in SETTLE) { e.preventDefault(); jump(SETTLE[id]); } }));

  /* fault injection (click) */
  $('#inject').addEventListener('click', () => { FILM.fault = performance.now(); fdirReplay(); });
  const fdirReplay = () => { fdirSteps(0); [0, 1, 2, 3].forEach((i) => setTimeout(() => fdirSteps(i + 1), 250 + i * 900)); };
  window.__impresarioDemo = async () => { /* every scene is scroll-driven; nothing to simulate */ };

  requestAnimationFrame(() => { buildTraj(); placeRing(); applyHole(); sizeShards(); });
  document.fonts && document.fonts.ready.then(() => { buildTraj(); sizeShards(); });

  // pins for the capture tools: each scene is a pinned stage
  ids.forEach((id) => { const m = document.createElement('i'); m.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px'; document.getElementById(id).prepend(m);
    ScrollTrigger.create({ trigger: '#' + id, start: 'top top', end: 'bottom top', pin: m, pinSpacing: false }); });
  sync();
})();
