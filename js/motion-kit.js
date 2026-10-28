/* motion-kit.js — design-neutral plumbing for impresario builds.
 * Load after gsap, ScrollTrigger, SplitText (optional) and Lenis (optional).
 * Copy into the project; it carries no visual style of its own.
 *
 *   const kit = motionKit.init();          // { lenis, reduced, gsap }
 *   kit.revealLines('.hero__title');       // returns a timeline (add to your own)
 *   motionKit.cursor(); motionKit.magnetic('.btn');
 *   const fx = motionKit.shader(canvas, FRAG, { uA:[.1,.1,.2] });
 */
(function () {
  const g = window.gsap;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const state = { scroll: 0, vel: 0, mouse: [0.5, 0.5] };

  function init(opts = {}) {
    if (window.ScrollTrigger) g.registerPlugin(ScrollTrigger);
    if (window.SplitText) g.registerPlugin(SplitText);
    if (window.Flip) g.registerPlugin(Flip);
    let lenis = null;
    if (!reduced && window.Lenis && opts.smooth !== false) {
      lenis = new Lenis({ lerp: opts.lerp ?? 0.1, smoothWheel: true });
      window.__lenis = lenis; // scripts/shoot.mjs jumps it for captures
      lenis.on('scroll', (e) => {
        state.vel = e.velocity;
        window.ScrollTrigger && ScrollTrigger.update();
      });
      g.ticker.add((t) => lenis.raf(t * 1000));
      g.ticker.lagSmoothing(0);
    }
    addEventListener('scroll', () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      state.scroll = max > 0 ? scrollY / max : 0;
    }, { passive: true });
    addEventListener('pointermove', (e) => {
      state.mouse = [e.clientX / innerWidth, 1 - e.clientY / innerHeight];
    }, { passive: true });
    if (document.fonts && window.ScrollTrigger) document.fonts.ready.then(() => ScrollTrigger.refresh());
    document.documentElement.classList.toggle('reduced-motion', reduced);
    return { lenis, reduced, gsap: g, state, revealLines };
  }

  /* Masked line reveal. Returns a paused-friendly timeline you can place in yours. */
  function revealLines(target, vars = {}) {
    const tl = g.timeline();
    if (reduced || !window.SplitText) return tl;
    g.utils.toArray(target).forEach((el) => {
      const split = SplitText.create(el, { type: vars.type || 'lines', mask: vars.type || 'lines' });
      const parts = split[vars.type || 'lines'];
      tl.from(parts, { yPercent: 110, duration: vars.duration || 1.1, ease: vars.ease || 'expo.out',
        stagger: vars.stagger ?? 0.08 }, 0);
    });
    return tl;
  }

  /* Text decode/scramble to the element's own text. */
  function scramble(el, { duration = 1.2, chars = '!<>-_\\/[]{}—=+*^?#01' } = {}) {
    const final = el.textContent;
    if (reduced) return g.timeline();
    const o = { p: 0 };
    return g.to(o, { p: 1, duration, ease: 'none', onUpdate() {
      const n = Math.floor(o.p * final.length);
      el.textContent = final.slice(0, n) + [...final.slice(n)].map((c) =>
        c === ' ' ? ' ' : chars[(Math.random() * chars.length) | 0]).join('');
    }, onComplete() { el.textContent = final; } });
  }

  /* Lerped cursor. Elements with data-cursor="Label" grow it into a label. */
  function cursor({ className = 'mk-cursor' } = {}) {
    if (!fine || reduced) return null;
    const c = document.createElement('div');
    c.className = className; c.setAttribute('aria-hidden', 'true');
    c.innerHTML = '<span></span>';
    document.body.appendChild(c);
    if (!document.getElementById('mk-cursor-css')) {
      const s = document.createElement('style'); s.id = 'mk-cursor-css';
      s.textContent = `.${className}{position:fixed;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;
        border-radius:50%;background:currentColor;pointer-events:none;z-index:9999;mix-blend-mode:difference;
        color:#fff;display:grid;place-items:center;transition:width .35s cubic-bezier(.2,.8,.2,1),height .35s cubic-bezier(.2,.8,.2,1),margin .35s cubic-bezier(.2,.8,.2,1)}
        .${className}.is-label{width:84px;height:84px;margin:-42px 0 0 -42px}
        .${className} span{font:600 12px/1 system-ui;color:#000;opacity:0;transition:opacity .2s}
        .${className}.is-label span{opacity:1}`;
      document.head.appendChild(s);
    }
    const x = g.quickTo(c, 'x', { duration: 0.35, ease: 'power3' });
    const y = g.quickTo(c, 'y', { duration: 0.35, ease: 'power3' });
    addEventListener('pointermove', (e) => { x(e.clientX); y(e.clientY); });
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-cursor]');
      c.classList.toggle('is-label', !!t);
      c.firstChild.textContent = t ? t.dataset.cursor : '';
    });
    return c;
  }

  /* Magnetic pull toward the pointer. */
  function magnetic(selector, strength = 0.35) {
    if (!fine || reduced) return;
    g.utils.toArray(selector).forEach((el) => {
      const x = g.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1,0.4)' });
      const y = g.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1,0.4)' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        x((e.clientX - (r.left + r.width / 2)) * strength);
        y((e.clientY - (r.top + r.height / 2)) * strength);
      });
      el.addEventListener('pointerleave', () => { x(0); y(0); });
    });
  }

  /* Full-screen fragment shader. Supplies uTime,uRes,uMouse,uScroll,uVel.
   * Extra uniforms: { name: number | [vec2|vec3|vec4] } — mutate fx.uniforms.name to animate. */
  function shader(canvas, frag, extra = {}) {
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!gl) { canvas.style.display = 'none'; return null; }
    const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uniforms = {}; for (const k in extra) uniforms[k] = { value: extra[k] };
    const set = (name, v) => { const l = gl.getUniformLocation(prog, name); if (!l) return;
      if (typeof v === 'number') gl.uniform1f(l, v);
      else gl[`uniform${v.length}fv`](l, v); };
    const dpr = Math.min(devicePixelRatio, reduced ? 1 : 1.75);
    const resize = () => { canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height); };
    resize();
    let visible = true, smoothMouse = [0.5, 0.5], vel = 0;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
    const t0 = performance.now();
    const frame = () => {
      if (visible) {
        smoothMouse = smoothMouse.map((m, i) => m + (state.mouse[i] - m) * 0.06);
        vel += (state.vel - vel) * 0.1;
        set('uTime', reduced ? 0 : (performance.now() - t0) / 1000);
        set('uRes', [canvas.width, canvas.height]); set('uMouse', smoothMouse);
        set('uScroll', state.scroll); set('uVel', vel);
        for (const k in uniforms) set(k, uniforms[k].value);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (!reduced) requestAnimationFrame(frame);
    };
    frame();
    addEventListener('resize', () => { resize(); if (reduced) frame(); });
    return { uniforms, redraw: frame };
  }

  window.motionKit = { init, revealLines, scramble, cursor, magnetic, shader, state, reduced };
})();
