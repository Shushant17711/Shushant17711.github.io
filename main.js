/* Shushant Kumar Choudhary — experiments, graded.
   Scenes: decode → protocol → SurgeryNet → VISHWAS → Hamiltonian ⟶iris⟶ Mirage → Awaaz → index → evidence → close */
(() => {
  const kit = window.motionKit ? motionKit.init() : { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
  const reduced = kit.reduced;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const phone = () => innerWidth <= 760;
  const C = { ink: '#14206e', red: '#e8341c', medici: '#4f63c9', isabella: '#9fb4ec', pad: '#f8f6f0', night: '#0c1442', nightText: '#f5f3ec' };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (p, a, b) => clamp((p - a) / (b - a)); // local progress of p inside [a,b]

  // =====================================================================
  // DecodeField: the portrait as a field of measurement dots. Errors (red)
  // flip dots; a greedy matching decoder pairs defects (or sends them to the
  // boundary) and heals the dots along each matching edge.
  // =====================================================================
  class DecodeField {
    constructor(canvas, img, opts = {}) {
      this.c = canvas; this.x = canvas.getContext('2d'); this.img = img;
      this.colsWanted = opts.cols || 96; this.errors = []; this.matches = [];
      this.running = false; this.visible = true; this.lastInject = 0; this.lastFlicker = 0;
      this.onIdle = opts.onIdle || null;
      this.resize(); this.sample();
      this.noise = new Float32Array(this.n).fill(opts.decoded ? 0 : 1);
      this.heal = new Uint8Array(this.n).fill(opts.decoded ? 1 : 0);
      this.rnd = new Float32Array(this.n).map(() => Math.random());
      new ResizeObserver(() => { this.resize(); this.draw(); }).observe(canvas);
      new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.kick(); }).observe(canvas);
      if (fine || opts.touch) this.bindPointer();
    }
    resize() {
      const w = this.c.clientWidth || 600, dpr = Math.min(devicePixelRatio || 1, 2);
      this.c.width = w * dpr; this.c.height = w * dpr; this.x.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w; this.cols = this.colsWanted; this.step = w / this.cols; this.n = this.cols * this.cols;
    }
    sample() {
      const k = this.cols, o = document.createElement('canvas'); o.width = o.height = k;
      const ox = o.getContext('2d', { willReadFrequently: true }); ox.drawImage(this.img, 0, 0, k, k);
      const d = ox.getImageData(0, 0, k, k).data; this.t = new Float32Array(k * k);
      for (let i = 0; i < k * k; i++) {
        const lum = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
        this.t[i] = Math.pow(clamp((0.93 - lum) / 0.78), 0.85);
      }
    }
    seedErrors(spacing = 8) {
      const k = this.cols, cx = k / 2, list = [];
      for (let gy = spacing / 2; gy < k; gy += spacing) for (let gx = spacing / 2; gx < k; gx += spacing)
        list.push({ gx: clamp(gx + (Math.random() - .5) * spacing * .8, 0, k - 1), gy: clamp(gy + (Math.random() - .5) * spacing * .8, 0, k - 1) });
      list.sort((a, b) => Math.hypot(a.gx - cx, a.gy - cx) - Math.hypot(b.gx - cx, b.gy - cx));
      this.errors.push(...list.map((e) => ({ ...e, matched: false, born: performance.now() })));
    }
    decode({ rate = 70 } = {}) { this.rate = rate; this.kick(); }
    inject(gx, gy, r = 3.5) {
      const k = this.cols;
      for (let y = Math.max(0, Math.floor(gy - r)); y <= Math.min(k - 1, Math.ceil(gy + r)); y++)
        for (let x = Math.max(0, Math.floor(gx - r)); x <= Math.min(k - 1, Math.ceil(gx + r)); x++)
          if ((x - gx) ** 2 + (y - gy) ** 2 <= r * r) { const i = y * k + x; this.noise[i] = 1; this.heal[i] = 0; this.rnd[i] = Math.random(); }
      this.errors.push({ gx, gy, matched: false, born: performance.now() });
      this.rate = Math.max(this.rate || 0, 14); this.kick();
    }
    injectRandom(count) { for (let i = 0; i < count; i++) this.inject(Math.random() * this.cols, Math.random() * this.cols, 2.2); }
    bindPointer() {
      const at = (e) => { const r = this.c.getBoundingClientRect(); return [(e.clientX - r.left) / this.step, (e.clientY - r.top) / this.step]; };
      this.c.addEventListener('pointermove', (e) => {
        const now = performance.now(); if (now - this.lastInject < 70) return; this.lastInject = now;
        const [gx, gy] = at(e); if (gx < 0 || gy < 0 || gx > this.cols || gy > this.cols) return; this.inject(gx, gy);
      });
    }
    decoderStep(now) {
      const open = this.errors.filter((e) => !e.matched);
      if (!open.length) return false;
      // wait a beat so a visitor sees the error before it's matched
      const e = open[0]; if (now - e.born < 260) return true;
      e.matched = true;
      let best = null, bd = 16;
      for (const o of open) { if (o === e || o.matched) continue; const d = Math.hypot(o.gx - e.gx, o.gy - e.gy); if (d < bd) { bd = d; best = o; } }
      let b;
      if (best) { best.matched = true; b = { gx: best.gx, gy: best.gy, edge: false }; }
      else { // match to the nearest boundary, like a surface-code decoder
        const k = this.cols, opts = [[0, e.gy, e.gx], [k, e.gy, k - e.gx], [e.gx, 0, e.gy], [e.gx, k, k - e.gy]].sort((p, q) => p[2] - q[2]);
        b = { gx: opts[0][0], gy: opts[0][1], edge: true };
      }
      this.matches.push({ a: e, b, t0: now, healed: false });
      return true;
    }
    healAlong(m, R = 6.2) {
      const k = this.cols, ax = m.a.gx, ay = m.a.gy, bx = m.b.gx, by = m.b.gy;
      const minx = Math.max(0, Math.floor(Math.min(ax, bx) - R)), maxx = Math.min(k - 1, Math.ceil(Math.max(ax, bx) + R));
      const miny = Math.max(0, Math.floor(Math.min(ay, by) - R)), maxy = Math.min(k - 1, Math.ceil(Math.max(ay, by) + R));
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2), px = ax + t * dx, py = ay + t * dy;
        if ((x - px) ** 2 + (y - py) ** 2 <= R * R) this.heal[y * k + x] = 1;
      }
    }
    kick() { if (!this.running && this.visible) { this.running = true; this.last = performance.now(); requestAnimationFrame((t) => this.frame(t)); } }
    frame(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      // decoder budget
      this.budget = (this.budget || 0) + (this.rate || 0) * dt;
      let pending = this.errors.some((e) => !e.matched);
      while (this.budget >= 1 && pending) { this.budget -= 1; pending = this.decoderStep(now) && this.errors.some((e) => !e.matched); if (!pending) break; }
      if (!pending) this.budget = 0;
      // matches: grow 220 ms → heal → hold → fade
      for (const m of this.matches) if (!m.healed && now - m.t0 > 220) { m.healed = true; this.healAlong(m); }
      this.matches = this.matches.filter((m) => now - m.t0 < 1100);
      this.errors = this.errors.filter((e) => !e.matched || now - e.born < 400);
      // noise decays where healed; noisy dots flicker
      let noisy = 0;
      for (let i = 0; i < this.n; i++) {
        if (this.heal[i] && this.noise[i] > 0) this.noise[i] = Math.max(0, this.noise[i] - dt * 3.2);
        if (this.noise[i] > 0.01) noisy++;
      }
      if (now - this.lastFlicker > 85) { this.lastFlicker = now; for (let i = 0; i < this.n; i++) if (this.noise[i] > 0.3) this.rnd[i] = Math.random(); }
      this.draw(now);
      const active = noisy > 0 || this.matches.length || this.errors.length;
      if (active && this.visible) requestAnimationFrame((t) => this.frame(t));
      else { this.running = false; if (!active && this.onIdle) { const f = this.onIdle; this.onIdle = null; f(); } }
    }
    draw(now = performance.now()) {
      const x = this.x, s = this.step, k = this.cols, maxR = s * 0.6;
      x.clearRect(0, 0, this.w, this.w);
      const ink = new Path2D(), red = new Path2D();
      for (let gy = 0; gy < k; gy++) for (let gx = 0; gx < k; gx++) {
        const i = gy * k + gx, nz = this.noise[i];
        const tt = nz > 0.01 ? lerp(this.t[i], this.rnd[i] * this.rnd[i], nz) : this.t[i];
        const r = Math.sqrt(tt) * maxR; if (r < 0.45) continue;
        const p = nz > 0.55 ? red : ink, cx = (gx + .5) * s, cy = (gy + .5) * s;
        p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, Math.PI * 2);
      }
      x.fillStyle = C.ink; x.fill(ink);
      x.fillStyle = C.red; x.globalAlpha = .8; x.fill(red); x.globalAlpha = 1;
      // defects
      x.strokeStyle = C.red; x.lineWidth = Math.max(1.5, s * .28);
      for (const e of this.errors) if (!e.matched) {
        const cx = e.gx * s, cy = e.gy * s, r = s * 1.5;
        x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
      }
      // matching edges
      x.lineCap = 'round';
      for (const m of this.matches) {
        const age = now - m.t0, grow = clamp(age / 220), fade = 1 - clamp((age - 700) / 400);
        const ax = m.a.gx * s, ay = m.a.gy * s, bx = lerp(ax, m.b.gx * s, grow), by = lerp(ay, m.b.gy * s, grow);
        x.globalAlpha = fade; x.strokeStyle = C.ink; x.lineWidth = Math.max(2, s * .32);
        x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
        x.fillStyle = C.ink; x.beginPath(); x.arc(ax, ay, s * .7, 0, 7); x.fill();
        if (grow === 1) { x.beginPath(); m.b.edge ? x.rect(bx - s * .7, by - s * .7, s * 1.4, s * 1.4) : x.arc(bx, by, s * .7, 0, 7); x.fill(); }
        x.globalAlpha = 1;
      }
    }
  }

  // ---------- typewriter (pre-registration lines) ----------
  function typeInto(el, { speed = 32, delay = 0 } = {}) {
    const full = el.dataset.type || el.textContent; el.setAttribute('aria-label', full);
    if (reduced) { el.textContent = full; return Promise.resolve(); }
    el.textContent = '';
    return new Promise((res) => setTimeout(() => {
      let i = 0; const id = setInterval(() => { el.textContent = full.slice(0, ++i); if (i >= full.length) { clearInterval(id); res(); } }, speed);
    }, delay));
  }
  function thump(el, from = 2.4) {
    if (!hasGsap || reduced) { el.style.opacity = 1; return; }
    gsap.fromTo(el, { opacity: 0, scale: from, rotate: -16 }, { opacity: 1, scale: 1, rotate: -9, duration: .42, ease: 'back.out(2.4)' });
  }

  // =====================================================================
  // 1 · HERO
  // =====================================================================
  const photo = new Image(); photo.src = 'assets/photo.jpg';
  let hero = null, closeField = null;
  photo.decode().then(() => {
    const canvas = $('#decode-hero');
    if (!canvas.getContext) { document.documentElement.classList.add('no-canvas'); return; }
    hero = new DecodeField(canvas, photo, { cols: phone() ? 64 : 96, decoded: reduced, touch: true });
    if (reduced) { hero.draw(); $('.hero__stamp').style.opacity = 1; return; }
    hero.draw();
    typeInto($('.hero__h0'), { speed: 34, delay: 250 }).then(() => {
      hero.seedErrors(phone() ? 7 : 8);
      hero.onIdle = () => thump($('.hero__stamp'));
      hero.decode({ rate: 95 });
    });
    if (hasGsap) gsap.from(['.hero__first', '.hero__last'], { yPercent: 40, opacity: 0, duration: 1.4, ease: 'expo.out', stagger: .12, delay: .2 });
    // scroll speed shakes errors into the field (only while the hero is on screen)
    if (kit.lenis) kit.lenis.on('scroll', (e) => { if (hero.visible && Math.abs(e.velocity) > 18 && Math.random() < .25) hero.injectRandom(1); });
  }).catch(() => document.documentElement.classList.add('no-canvas'));

  if (!hasGsap || reduced) {
    // final states without motion
    $$('.stamp').forEach((s) => (s.style.opacity = 1));
    buildLattice(true); buildRing(true); buildIndex(); drawDrift(1);
    photo.decode().then(() => { closeField = new DecodeField($('#decode-close'), photo, { cols: 64, decoded: true }); closeField.draw(); });
    return;
  }

  const ST = ScrollTrigger;
  const mm = gsap.matchMedia();

  // hero pull-back: the face shrinks into the protocol's card corner, names part
  gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
    .to('.hero__field', { scale: .38, yPercent: 55, rotate: -6, ease: 'none' }, 0)
    .to('.hero__first', { xPercent: -60, ease: 'none' }, 0)
    .to('.hero__last', { xPercent: 60, ease: 'none' }, 0)
    .to(['.hero__lede', '.hero__prereg', '.hero__hint'], { opacity: 0, ease: 'none', duration: .4 }, 0);

  // =====================================================================
  // 2 · PROTOCOL — words arrive, the card is written, stamped, then zoomed through
  // =====================================================================
  {
    const card = $('.card--protocol'), h = $('.card__h'); const full = h.dataset.type; h.setAttribute('aria-label', full);
    const tl = gsap.timeline({ scrollTrigger: { trigger: '.protocol__stage', pin: true, start: 'top top', end: '+=210%', scrub: 0.6, invalidateOnRefresh: true,
      onUpdate: (st) => { const p = seg(st.progress, .2, .5); h.textContent = full.slice(0, Math.round(full.length * p)) || ' '; } } });
    tl.from('.pw1', { xPercent: -30, opacity: 0, duration: .12 }, 0)
      .from('.pw2', { xPercent: 30, opacity: 0, duration: .12 }, .05)
      .from('.pw3', { xPercent: -20, opacity: 0, duration: .12 }, .1)
      .from(card, { y: '70vh', rotate: 8, duration: .2, ease: 'power3.out' }, .05)
      .to('.protocol__words', { opacity: .4, duration: .15 }, .2)
      .fromTo('.card__stamp', { opacity: 0, scale: 2.6, rotate: -18 }, { opacity: 1, scale: 1, rotate: -9, duration: .06, ease: 'back.out(2)' }, .55)
      .from('.protocol__note', { opacity: 0, y: 30, duration: .1 }, .58)
      // zoom-through: the card fills the screen and becomes the SurgeryNet paper
      .to(['.protocol__note', '.protocol__words'], { opacity: 0, duration: .08 }, .76)
      .to(card, { scale: () => Math.max(innerWidth / card.offsetWidth, innerHeight / card.offsetHeight) * 1.35, rotate: 0, backgroundColor: C.pad, boxShadow: 'none', duration: .22, ease: 'power2.in' }, .78)
      .to(card.children, { opacity: 0, duration: .06 }, .92);
  }

  // =====================================================================
  // 3 · SURGERYNET — two patches merge, defects appear, GNN matches them
  // =====================================================================
  function buildLattice(final = false) {
    const svg = $('.lattice'), NS = 'http://www.w3.org/2000/svg', d = 5, cell = 64, gap = cell * 2;
    const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; };
    const ox1 = 70, oy = 120, ox2 = ox1 + d * cell + gap;
    const patch = (ox, cls) => {
      mk('rect', { x: ox, y: oy, width: d * cell, height: d * cell, class: 'bnd ' + cls });
      for (let r = 0; r < d; r++) for (let c = 0; c < d; c++)
        mk('rect', { x: ox + c * cell + 3, y: oy + r * cell + 3, width: cell - 6, height: cell - 6, rx: 6, class: ((r + c) % 2 ? 'px ' : 'pz ') + cls });
      for (let r = 0; r <= d; r++) for (let c = 0; c <= d; c++) mk('circle', { cx: ox + c * cell, cy: oy + r * cell, r: 7, class: 'q ' + cls });
    };
    patch(ox1, 'pa'); patch(ox2, 'pb');
    // merge strip between the patches
    for (let r = 0; r < d; r++) for (let c = 0; c < 2; c++)
      mk('rect', { x: ox1 + d * cell + c * cell + 3, y: oy + r * cell + 3, width: cell - 6, height: cell - 6, rx: 6, class: 'merge ' + ((r + c + 1) % 2 ? 'px' : 'pz') });
    // defects and their matching edges (spacelike pairs + one timelike-looking pair across the seam)
    const P = (ox, c, r) => [ox + (c + .5) * cell, oy + (r + .5) * cell];
    const pairs = [[P(ox1, 1, 1), P(ox1, 3, 1)], [P(ox1, 4, 3), P(ox1 + d * cell, 1, 3)], [P(ox2, 2, 0), P(ox2, 2, 2)], [P(ox2, 0, 4), P(ox2, 3, 4)], [P(ox1, 0, 4), [ox1 - 30, oy + 4.5 * cell]]];
    pairs.forEach(([a, b], i) => {
      const line = mk('path', { d: `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`, class: 'match m' + i });
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); line.style.strokeDasharray = L; line.style.strokeDashoffset = final ? 0 : L;
      [a, b].forEach((p, j) => { if (i === 4 && j === 1) return; mk('circle', { cx: p[0], cy: p[1], r: 15, class: 'defect d' + i }); });
    });
    return { pairs: pairs.length };
  }
  {
    const { pairs } = buildLattice();
    const tl = gsap.timeline({ scrollTrigger: { trigger: '.exp--surgery .exp__stage', pin: true, start: 'top top', end: '+=200%', scrub: 0.6 } });
    tl.from('.lattice-plane', { rotateX: 70, rotateZ: -50, scale: 1.4, duration: .15, ease: 'power2.out' }, 0)
      .from('.exp--surgery .exp__copy > *', { y: 40, opacity: 0, stagger: .02, duration: .1 }, .05)
      .from('.lattice .pa', { x: -140, duration: .2 }, .08)
      .from('.lattice .pb', { x: 140, duration: .2 }, .08)
      .to('.lattice .merge', { opacity: 1, stagger: { each: .006, from: 'center' }, duration: .05 }, .25);
    for (let i = 0; i < pairs; i++) {
      tl.to('.lattice .d' + i, { opacity: 1, scale: 1, transformOrigin: 'center', duration: .03 }, .34 + i * .05)
        .to('.lattice .m' + i, { strokeDashoffset: 0, duration: .05 }, .42 + i * .055)
        .to('.lattice .d' + i, { opacity: .15, duration: .03 }, .48 + i * .055);
    }
    tl.from('.bar__track i', { scaleX: 0, stagger: .05, duration: .12 }, .45)
      .to('.lattice-plane', { rotateX: 44, rotateZ: -18, duration: .5, ease: 'none' }, .3)
      .add(() => {}, .7)
      .fromTo('.exp--surgery .exp__stamp', { opacity: 0, scale: 2.4 }, { opacity: 1, scale: 1, duration: .05, ease: 'back.out(2)' }, .74)
      // exit: the patches split apart (the merge is undone) and the copy lifts away
      .to('.lattice .merge', { opacity: 0, duration: .05 }, .86)
      .to('.lattice .pa, .lattice .m0, .lattice .m1, .lattice .m4, .lattice .d0, .lattice .d1, .lattice .d4', { x: -900, duration: .14, ease: 'power2.in' }, .86)
      .to('.lattice .pb, .lattice .m2, .lattice .m3, .lattice .d2, .lattice .d3', { x: 900, duration: .14, ease: 'power2.in' }, .86)
      .to('.exp--surgery .exp__copy, .exp--surgery .exp__stamp', { y: -80, opacity: 0, duration: .1 }, .88);
  }

  // =====================================================================
  // 4 · VISHWAS — a swarm with one liar; vote-only vs ClaimCheck
  // =====================================================================
  {
    const cv = $('.swarm'), x = cv.getContext('2d'); let W = 0, H = 0, P = 0, liveT = 0;
    const N = 28, drones = [];
    const fit = () => { const dpr = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); };
    for (let i = 0; i < N; i++) {
      const ring = i < 8 ? 0 : i < 18 ? 1 : 2, k = ring === 0 ? i : ring === 1 ? i - 8 : i - 18, n = [8, 10, 10][ring];
      drones.push({ ring, a: (k / n) * Math.PI * 2 + ring * .3, liar: i === 13, accused: [3, 9, 21].includes(i), ph: Math.random() * 6 });
    }
    const pos = (d, t) => {
      const cx = W * (phone() ? .5 : .62), cy = H * (phone() ? .56 : .52), R = Math.min(W, H) * [.13, .26, .38][d.ring] * (phone() ? 1.05 : 1);
      const a = d.a + t * (.06 + d.ring * .015) * (d.ring % 2 ? -1 : 1);
      return [cx + Math.cos(a) * R + Math.sin(t * 1.3 + d.ph) * 6, cy + Math.sin(a) * R * .82 + Math.cos(t + d.ph) * 6];
    };
    function drone(px, py, s, col, rot, alpha = 1, led = C.nightText, tumble = 0) {
      x.save(); x.globalAlpha = alpha; x.translate(px, py); x.rotate(tumble); x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 2;
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, ax = Math.cos(a) * s, ay = Math.sin(a) * s;
        x.beginPath(); x.moveTo(0, 0); x.lineTo(ax, ay); x.stroke();                       // arm
        x.beginPath(); x.ellipse(ax, ay, s * .55, s * .2, rot + k, 0, 7); x.stroke(); }      // spinning rotor
      x.fillRect(-s * .32, -s * .32, s * .64, s * .64);                                      // body
      x.fillStyle = led; x.beginPath(); x.arc(0, 0, s * .16, 0, 7); x.fill();                // status LED
      x.restore();
    }
    const tally = $$('.tally__n'); const voteRow = $('.tally__row--vote'), ccRow = $('.tally__row--cc');
    function draw(t) {
      x.clearRect(0, 0, W, H);
      const s = Math.min(W, H) * .022, pts = drones.map((d) => pos(d, t));
      const accuse = seg(P, .12, .3), vote = seg(P, .3, .5), audit = seg(P, .55, .78), collapse = seg(P, .88, 1);
      const liarP = pts[13];
      // ranging links between neighbours (the broadcast data ClaimCheck reads)
      x.strokeStyle = 'rgba(245,243,236,.10)'; x.lineWidth = 1;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1]; if (dx * dx + dy * dy < (s * 9) ** 2) { x.beginPath(); x.moveTo(...pts[i]); x.lineTo(...pts[j]); x.stroke(); } }
      // false accusations from the liar
      drones.forEach((d, i) => { if (!d.accused || accuse === 0) return; const p = pts[i];
        x.strokeStyle = C.red; x.lineWidth = 2.5; x.setLineDash([8, 7]); x.lineDashOffset = -t * 40;
        x.beginPath(); x.moveTo(...liarP); x.lineTo(lerp(liarP[0], p[0], accuse), lerp(liarP[1], p[1], accuse)); x.stroke(); x.setLineDash([]); });
      // ClaimCheck audit rays: neighbours' ranging contradicts the claim
      if (audit > 0) drones.forEach((d, i) => { if (!d.accused) return; const p = pts[i];
        pts.forEach((q, j) => { if (j === i || j === 13) return; const dd = Math.hypot(q[0] - p[0], q[1] - p[1]); if (dd > s * 10) return;
          x.strokeStyle = `rgba(245,243,236,${.75 * audit})`; x.lineWidth = 2; x.beginPath(); x.moveTo(...q); x.lineTo(lerp(q[0], p[0], audit), lerp(q[1], p[1], audit)); x.stroke(); }); });
      drones.forEach((d, i) => {
        let [px, py] = pts[i];
        if (collapse > 0) { const k = collapse * collapse; px = lerp(px, W / 2, k); py = lerp(py, H / 2, k); }
        // removal = the drone loses lift and falls out of the swarm. Vote-only drops the 3 honest
        // drones the liar accused; ClaimCheck's audit puts them back and drops the liar instead.
        const fallVote = d.accused ? seg(vote, .15, 1) * (1 - seg(audit, .25, 1)) : 0;
        const fallLiar = d.liar ? seg(P, .72, .86) : 0;
        const f = Math.max(fallVote, fallLiar);
        const col = d.liar && audit > .3 ? '#ff7a5f' : C.nightText;
        if (f > .02) {
          // empty slot left in the formation, crossed out in red pen
          x.strokeStyle = C.red; x.lineWidth = 2.5; x.globalAlpha = Math.min(1, f * 3); const r = s * 1.1;
          x.beginPath(); x.moveTo(px - r, py - r); x.lineTo(px + r, py + r); x.moveTo(px + r, py - r); x.lineTo(px - r, py + r); x.stroke();
          x.globalAlpha = 1;
          const ox = px, oy = py, dir = d.ph > 3 ? 1 : -1;
          py += f * f * (H - py + s * 6); px += dir * f * s * 4;
          // dashed fall trail
          x.strokeStyle = 'rgba(232,52,28,.45)'; x.lineWidth = 1.5; x.setLineDash([3, 6]);
          x.beginPath(); x.moveTo(ox, oy); x.quadraticCurveTo(ox, (oy + py) / 2, px, py); x.stroke(); x.setLineDash([]);
          drone(px, py, s * (1 - collapse * .7), col, t * 22 * (1 - f * .9), 1 - f * .25, C.red, dir * f * f * 5);
          return;
        }
        drone(px, py, s * (1 - collapse * .7), col, t * 22, 1, d.liar && accuse > 0 ? C.red : '#9fb4ec');
      });
      if (collapse > .6) { x.fillStyle = C.nightText; x.globalAlpha = seg(collapse, .6, 1); x.beginPath(); x.arc(W / 2, H / 2, 10 + 40 * seg(collapse, .8, 1), 0, 7); x.fill(); x.globalAlpha = 1; }
      tally[0].textContent = Math.round(92 * seg(P, .32, .5));
      tally[1].textContent = '0';
      voteRow.style.opacity = P < .3 ? .35 : 1; ccRow.style.opacity = P < .55 ? .35 : 1;
    }
    let raf = 0, on = false;
    const loop = (ts) => { liveT = ts / 1000; draw(liveT); if (on) raf = requestAnimationFrame(loop); };
    fit(); addEventListener('resize', fit);
    const tl = gsap.timeline({ scrollTrigger: { trigger: '.exp--swarm .exp__stage', pin: true, start: 'top top', end: '+=220%', scrub: 0.5,
      onUpdate: (st) => { P = st.progress; if (!on) draw(liveT); },
      onToggle: (st) => { on = st.isActive; if (on) raf = requestAnimationFrame(loop); else cancelAnimationFrame(raf); document.body.classList.toggle('is-night', st.isActive); } } });
    tl.from('.exp__copy--swarm > *', { y: 30, opacity: 0, stagger: .02, duration: .08 }, .02)
      .from('.tally', { x: 60, opacity: 0, duration: .08 }, .08)
      .fromTo('.exp--swarm .exp__stamp', { opacity: 0, scale: 2.4, xPercent: -50 }, { opacity: 1, scale: 1, xPercent: -50, duration: .04, ease: 'back.out(2)' }, .8)
      .to('.exp--swarm .exp__stamp', { opacity: 0, duration: .04 }, .9)
      .to(['.exp__copy--swarm', '.tally'], { opacity: 0, duration: .06 }, .88)
      .to({}, { duration: .02 }, .98);
    // material wipe in: the night field opens from the centre seam (the lattice splitting)
    gsap.fromTo('.exp--swarm .exp__stage', { clipPath: 'inset(0% 50% 0% 50%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none',
      scrollTrigger: { trigger: '.exp--swarm', start: 'top bottom', end: 'top top', scrub: true } });
  }

  // =====================================================================
  // 5 + 6 · HAMILTONIAN (pendulum + drift) ⟶ iris from the bob ⟶ MIRAGE
  // =====================================================================
  function drawDrift(p) {
    const good = [], bad = [], n = 90;
    for (let i = 0; i <= n * p; i++) { const t = i / n, X = 40 + t * 470;
      good.push(`${i ? 'L' : 'M'}${X.toFixed(1)} ${(186 - 4 * Math.sin(t * 40) * .5).toFixed(1)}`);
      bad.push(`${i ? 'L' : 'M'}${X.toFixed(1)} ${(186 - Math.min(170, 2 + 150 * Math.pow(Math.max(0, t - .35), 1.8) + 6 * Math.sin(t * 30) * t)).toFixed(1)}`); }
    $('.drift__good').setAttribute('d', good.join(' ') || 'M40 186'); $('.drift__bad').setAttribute('d', bad.join(' ') || 'M40 186');
  }
  {
    // the pendulum swings with real (small-angle-free) dynamics; the scroll drives the energy plot
    const arm = $('.pend__arm'); let th = .9, om = 0, last = performance.now(), swinging = false;
    const step = (now) => { const dt = Math.min(.033, (now - last) / 1000); last = now;
      for (let k = 0; k < 4; k++) { om += -9.81 / 2.2 * Math.sin(th) * dt / 4; th += om * dt / 4; }
      arm.style.transform = `rotate(${th}rad)`; if (swinging) requestAnimationFrame(step); };
    const page = $('.browser__page'), agent = $('.agent'), browser = $('.browser');
    const tl = gsap.timeline({ scrollTrigger: { trigger: '.act-hm__stage', pin: true, start: 'top top', end: '+=360%', scrub: 0.6, invalidateOnRefresh: true,
      onToggle: (st) => { swinging = st.isActive; if (swinging) { last = performance.now(); requestAnimationFrame(step); } },
      onUpdate: (st) => { drawDrift(Math.max(.06, seg(st.progress, .04, .3))); page.classList.toggle('is-xray', st.progress > .62); } } });
    // scale jump in: the collapsed swarm's dot becomes the bob
    tl.from('.pend', { scale: .12, transformOrigin: '50% 66%', duration: .07, ease: 'power3.out' }, 0)
      .from('.pend__copy > *', { y: 40, opacity: 0, stagger: .015, duration: .06 }, .03)
      .fromTo('.pend__stamp', { opacity: 0, scale: 3, rotate: -20 }, { opacity: 1, scale: 1, rotate: -9, duration: .03, ease: 'back.out(2.2)' }, .36)
      .to({}, { duration: .06 }, .4)
      // iris: Mirage opens out of the bob
      .to('.exp--mirage', { clipPath: 'circle(150% at 26% 62%)', duration: .12, ease: 'power2.in' }, .46)
      .from('.browser', { scale: .6, rotate: -4, duration: .1 }, .5)
      .from('.exp--mirage .exp__copy > *', { y: 40, opacity: 0, stagger: .012, duration: .05 }, .55)
      // the x-ray lens sweeps over the page and finds the hidden instruction
      .fromTo(page.querySelector('.xray'), { '--x': '10%', '--y': '20%' }, { '--x': '45%', '--y': '64%', duration: .1 }, .62)
      // the agent's cursor falls for it
      .to(agent, { left: '14%', top: '82%', duration: .1, ease: 'power2.inOut' }, .72)
      .to('.bp__btn--bad', { backgroundColor: C.red, color: '#ffffff', borderColor: C.red, duration: .02 }, .82)
      .fromTo('.exp--mirage .exp__stamp', { opacity: 0, scale: 2.4 }, { opacity: 1, scale: 1, duration: .03, ease: 'back.out(2)' }, .83)
      // zoom-through the browser into the next scene
      .to(['.exp--mirage .exp__copy', '.exp--mirage .exp__stamp'], { opacity: 0, duration: .04 }, .9)
      .to(browser, { scale: () => (innerWidth / browser.offsetWidth) * 2.6, transformOrigin: '50% 60%', duration: .08, ease: 'power3.in' }, .92);
  }

  // =====================================================================
  // 7 · AWAAZ — twelve real voice samples on a ring
  // =====================================================================
  function buildRing(final = false) {
    const L = [['hi_IN', 'हिन्दी', 'Hindi'], ['ta_IN', 'தமிழ்', 'Tamil'], ['bn_BD', 'বাংলা', 'Bengali'], ['te_IN', 'తెలుగు', 'Telugu'], ['mr_IN', 'मराठी', 'Marathi'], ['kn_IN', 'ಕನ್ನಡ', 'Kannada'],
      ['ml_IN', 'മലയാളം', 'Malayalam'], ['gu_IN', 'ગુજરાતી', 'Gujarati'], ['pa_IN', 'ਪੰਜਾਬੀ', 'Punjabi'], ['or_IN', 'ଓଡ଼ିଆ', 'Odia'], ['as_IN', 'অসমীয়া', 'Assamese'], ['ur_PK', 'اردو', 'Urdu']];
    const ring = $('.ring'); const R = phone() ? 230 : 360;
    L.forEach(([code, script, en], i) => {
      const b = document.createElement('button'); b.className = 'ring__card'; b.type = 'button'; b.setAttribute('role', 'listitem');
      b.setAttribute('aria-label', `Play Awaaz speaking ${en}`); b.dataset.code = code;
      b.innerHTML = `<span class="ring__script" lang="${code.slice(0, 2)}">${script}</span><span class="ring__en">${en}</span>`;
      b.style.transform = `rotateY(${i * 30}deg) translateZ(${R}px)`; ring.appendChild(b);
    });
    // audio + analyser → wave canvas
    let ctx, analyser, current, wave = $('.wave'), wx = wave.getContext('2d'), playing = null;
    const fitW = () => { const dpr = Math.min(devicePixelRatio || 1, 2); wave.width = wave.clientWidth * dpr; wave.height = wave.clientHeight * dpr; wx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fitW();
    const buf = new Uint8Array(1024);
    function drawWave(ts) {
      const w = wave.clientWidth, h = wave.clientHeight; wx.clearRect(0, 0, w, h);
      wx.strokeStyle = C.ink; wx.lineWidth = 3; wx.lineCap = 'round'; wx.beginPath();
      if (analyser && playing) { analyser.getByteTimeDomainData(buf); for (let i = 0; i < buf.length; i += 4) { const X = (i / buf.length) * w, Y = h / 2 + ((buf[i] - 128) / 128) * h * .9; i ? wx.lineTo(X, Y) : wx.moveTo(X, Y); } }
      else { const t = (ts || 0) / 1000; for (let i = 0; i <= 120; i++) { const X = (i / 120) * w; const env = Math.sin((i / 120) * Math.PI); const Y = h / 2 + Math.sin(i * .35 + t * 3) * 7 * env; i ? wx.lineTo(X, Y) : wx.moveTo(X, Y); } }
      wx.stroke(); requestAnimationFrame(drawWave);
    }
    if (!final) requestAnimationFrame(drawWave); else drawWave(0);
    ring.addEventListener('click', (e) => {
      const b = e.target.closest('.ring__card'); if (!b) return;
      if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.connect(ctx.destination); }
      if (current) { current.pause(); $$('.ring__card').forEach((c) => c.classList.remove('is-playing')); }
      current = new Audio(`assets/voice/${b.dataset.code}.ogg`); ctx.createMediaElementSource(current).connect(analyser);
      b.classList.add('is-playing'); playing = b; current.play();
      current.onended = () => { b.classList.remove('is-playing'); playing = null; };
    });
  }
  buildRing();
  {
    const tl = gsap.timeline({ scrollTrigger: { trigger: '.exp--voice .exp__stage', pin: true, start: 'top top', end: '+=170%', scrub: 0.6 } });
    tl.fromTo('.ring', { rotateX: -14, rotateY: 60 }, { rotateX: -8, rotateY: -330, ease: 'none', duration: 1 }, 0)
      .from('.ring-wrap', { scale: .55, duration: .12 }, 0)
      .from('.exp__copy--voice > *', { y: 30, opacity: 0, stagger: .015, duration: .06 }, .05)
      .fromTo('.exp--voice .exp__stamp', { opacity: 0, scale: 2.4 }, { opacity: 1, scale: 1, duration: .04, ease: 'back.out(2)' }, .4)
      // out: the ring flattens into a row that becomes the index ribbon
      .to('.ring-wrap', { scaleY: .35, y: '22vh', duration: .12, ease: 'power2.in' }, .88)
      .to(['.exp__copy--voice', '.exp--voice .exp__stamp'], { opacity: 0, duration: .06 }, .9);
  }

  // =====================================================================
  // 8 · INDEX — the rest of the notebook on a curved ribbon
  // =====================================================================
  function buildIndex() {
    const items = [
      ['PRABHAT', 'Extreme-weather anomalies tracked through an ensemble forecast, downscaled 12 → 5 km. A runtime spectral gate refuses to publish a smoothed field.', 'FastAPI · React · MapLibre · SIH26078', 'PRABHAT', 'Gated'],
      ['AeroWM-FDIR', 'Latent world-model RL plus MPC, with real-time fault detection, isolation and recovery for 6-DOF powered descent.', 'Python · TD-MPC2 · MPC', 'AeroWM-FDIR', 'Recovered'],
      ['DequantEngine', 'Builds matched tensor-network baselines for PennyLane QNNs and finds where classical models catch up.', 'PennyLane · quimb · PyTorch', 'TensorEngine', '2 bugs filed'],
      ['EntangleRSA', 'What does entanglement buy a quantum RL policy? Representational similarity of PQC vs MLP policies, 255 runs.', 'PennyLane · PPO · RSA', 'EntangleRSA', '255 runs'],
      ['gymtorax-baselines', 'PID, PPO, SAC and model-based CEM-MPC for tokamak plasma control in Gym-TORAX; protocol frozen before training.', 'Python · Gym-TORAX', 'gymtorax-baselines', 'Frozen'],
      ['git-episodic-memory', 'Every coding-agent turn as a hidden Git commit, so the agent can ask why a line exists. No LLM summaries.', 'Bash · Git notes', 'git-episodic-memory', 'Zero LLM'],
      ['DecisionX', 'A simulated expert boardroom that synthesises independent AI opinions into a decision report.', 'Next.js · TypeScript', 'DecisionX', 'Boardroom'],
      ['Lex', 'Planner, coder and reviewer agents working on your project together, from the terminal or a local web UI.', 'Python · multi-agent', 'AI-Agent-Lex', '3 agents'],
      ['Scheme Setu', 'Matches citizens to Indian central government schemes and explains them in their own language.', 'FastAPI · FAISS', 'GovSchemeAssistant', 'Multilingual'],
      ['LenovoRGB', 'Sixteen reactive keyboard-backlight modes for Lenovo laptops. Six people starred it.', 'Python', 'LenovoRGB', '★ 6'],
      ['impresario', 'A Claude Code skill: one sentence in, a choreographed website out. Partly responsible for this page.', 'JavaScript · agents', 'impresario', 'Meta'],
      ['QuietHours', 'An Android app that silences your phone on a schedule.', 'Kotlin · Jetpack Compose · Room', 'QuietHours', 'Shipped'],
    ];
    const ol = $('.ribbon');
    items.forEach(([t, d, s, repo, st], i) => {
      const li = document.createElement('li'); li.className = 'card hcard';
      li.innerHTML = `<span class="hcard__no mono-label"><span>No. ${String(i + 6).padStart(3, '0')}</span><span>graded</span></span>
        <h3>${t}</h3><p>${d}</p><span class="hcard__stack">${s}</span><a href="https://github.com/Shushant17711/${repo}">github.com/${repo} →</a>
        <span class="stamp" aria-hidden="true">${st}</span>`;
      ol.appendChild(li);
    });
  }
  buildIndex();
  {
    const ol = $('.ribbon'), cards = $$('.hcard');
    const dist = () => Math.max(0, ol.scrollWidth - innerWidth * .55);
    gsap.timeline({ scrollTrigger: { trigger: '.index__stage', pin: true, start: 'top top', end: () => '+=' + dist() * .8, scrub: 0.6, invalidateOnRefresh: true,
      onUpdate: () => { // bend the ribbon: cards tilt and sink with distance from the centre
        const mid = innerWidth / 2;
        cards.forEach((c) => { const r = c.getBoundingClientRect(), k = clamp(((r.left + r.width / 2) - mid) / Math.max(innerWidth, 900), -1, 1);
          c.style.transform = `translateY(calc(-50% + ${(k * k * 110).toFixed(1)}px)) rotateY(${(-k * 14).toFixed(1)}deg) rotateZ(${(k * 2.5).toFixed(1)}deg)`; }); } } })
      .from('.index__title', { y: 60, duration: .08 }, 0)
      .to(ol, { x: () => -dist(), ease: 'none', duration: 1 }, 0)
      .to('.index__title', { opacity: .45, duration: .1 }, .3);
  }

  // =====================================================================
  // 9 · EVIDENCE — counters
  // =====================================================================
  $$('.counts b').forEach((b) => {
    const to = +b.dataset.count, o = { v: 0 };
    gsap.to(o, { v: to, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: b, start: 'top 85%' }, onUpdate: () => (b.textContent = Math.round(o.v)) });
  });
  gsap.from('.counts li', { y: 60, opacity: 0, stagger: .1, duration: .9, ease: 'expo.out', scrollTrigger: { trigger: '.counts', start: 'top 75%' } });

  // =====================================================================
  // 10 · CLOSE — the portrait decodes again; the verdict reads HELD
  // =====================================================================
  photo.decode().then(() => {
    closeField = new DecodeField($('#decode-close'), photo, { cols: 64, touch: true });
    closeField.draw();
    ST.create({ trigger: '.close', start: 'top 65%', once: true, onEnter: () => {
      closeField.seedErrors(7); closeField.onIdle = () => thump($('.close__stamp'), 3); closeField.decode({ rate: 80 }); } });
  });
  gsap.from('.close__title', { y: 80, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.close__title', start: 'top 90%' } });

  // ---------- review demo: the pointer injects errors into the hero ----------
  window.__impresarioDemo = async () => {
    if (!hero) await photo.decode().catch(() => {});
    await new Promise((r) => setTimeout(r, 3800));
    if (hero) for (let i = 0; i < 7; i++) hero.inject(hero.cols * (.3 + i * .07), hero.cols * (.38 + Math.sin(i) * .08));
  };

  addEventListener('load', () => ST.refresh());
  document.fonts && document.fonts.ready.then(() => ST.refresh());
})();
