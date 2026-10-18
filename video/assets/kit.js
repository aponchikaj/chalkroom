/*
  Chalkroom Live film kit: motion helpers for HyperFrames scenes.

  Load inside a scene <template>, before the scene script:
    <script src="../assets/vendor/gsap.min.js"></script>
    <script src="../assets/kit.js"></script>

  Every helper ADDS tweens to the timeline you pass, at an ABSOLUTE time in the
  scene's LOCAL seconds (0 = the scene's data-start). Nothing here uses timers,
  Date, Math.random or CSS transitions, so every frame is a pure function of the
  seek time (verified by snapshot, also with backward seeks; see CONVENTIONS.md).

  Targets may be an element, a NodeList/array, or a selector. Selectors are
  resolved against document, so always pass scene-prefixed selectors or use
  Kit.scope(sceneId).q / .qa.
*/
(function () {
  if (window.Kit) return;

  const STEP = 0.09; // the product's two-frame step, 90 ms

  const toArr = (t) => {
    if (typeof t === 'string') return Array.from(document.querySelectorAll(t));
    if (t instanceof Element) return [t];
    return Array.from(t || []);
  };
  const one = (t) => toArr(t)[0];

  /* Scope queries to one scene so ids/classes from other scenes never match. */
  function scope(sceneId) {
    const all = document.querySelectorAll('[data-composition-id="' + sceneId + '"]');
    const root = all[all.length - 1] || document;
    return {
      root,
      q: (s) => root.querySelector(s),
      qa: (s) => Array.from(root.querySelectorAll(s)),
    };
  }

  /*
    track(tl, t0, t1, fn): the universal seek-safe pattern for anything that is
    not a tweenable property (text, counters, swaps). fn(localSecondsSinceT0,
    progress0to1) is called on every render while the playhead crosses or sits
    in [t0, t1], including backward seeks. fn(0, 0) is also called once now, so
    the DOM matches the first frame before the playhead ever reaches t0.
  */
  function track(tl, t0, t1, fn) {
    const dur = Math.max(0.001, t1 - t0);
    const p = { v: 0 };
    fn(0, 0);
    tl.fromTo(p, { v: 0 }, {
      v: 1, duration: dur, ease: 'none', immediateRender: false,
      onUpdate: () => fn(p.v * dur, p.v),
    }, t0);
    return t1;
  }

  /* Step-in: the product's only opacity entrance. opacity 0.4 -> 1, y 6 -> 0 in two frames. */
  function stepIn(tl, target, t, o = {}) {
    const els = toArr(target);
    const from = { opacity: o.fromOpacity ?? 0.4, y: o.y ?? 6 };
    const to = { opacity: 1, y: 0, duration: o.dur ?? STEP, ease: 'steps(2)', stagger: o.stagger ?? 0 };
    if (o.x !== undefined) { from.x = o.x; to.x = 0; }
    if (o.scale !== undefined) { from.scale = o.scale; to.scale = 1; }
    // Hidden until t: the element is invisible before its entrance.
    if (o.hideBefore !== false) {
      tl.set(els, { visibility: 'hidden' }, 0);
      if (o.stagger) els.forEach((el, i) => tl.set(el, { visibility: 'visible' }, t + i * o.stagger));
      else tl.set(els, { visibility: 'visible' }, t);
    }
    tl.fromTo(els, from, Object.assign(to, { immediateRender: false }), t);
    return t + (o.dur ?? STEP) + (o.stagger ? o.stagger * (els.length - 1) : 0);
  }

  /* Step-out: faster than the entrance, then hidden. */
  function stepOut(tl, target, t, o = {}) {
    const els = toArr(target);
    const dur = o.dur ?? 0.066;
    tl.to(els, { opacity: 0.3, y: o.y ?? -4, duration: dur, ease: 'steps(2)', stagger: o.stagger ?? 0 }, t);
    tl.set(els, { visibility: 'hidden' }, t + dur + (o.stagger ? o.stagger * (els.length - 1) : 0));
    return t + dur;
  }

  /* Hinge-in from the punched (left) edge: perspective(1400px) rotateY(-14deg) -> 0, stepped. */
  function hingeIn(tl, target, t, o = {}) {
    const els = toArr(target);
    const dur = o.dur ?? STEP * 2;
    const steps = o.steps ?? 3;
    tl.set(els, { visibility: 'hidden' }, 0);
    tl.set(els, { visibility: 'visible' }, t);
    tl.fromTo(els,
      { rotationY: o.from ?? -14, opacity: 0.4, transformPerspective: o.perspective ?? 1400, transformOrigin: o.origin ?? '0% 50%' },
      { rotationY: 0, opacity: 1, duration: dur, ease: 'steps(' + steps + ')', immediateRender: false, stagger: o.stagger ?? 0 },
      t);
    return t + dur;
  }

  /* Hinge-out: back to the punched edge and hidden. */
  function hingeOut(tl, target, t, o = {}) {
    const els = toArr(target);
    const dur = o.dur ?? STEP;
    tl.to(els, { rotationY: o.to ?? -14, opacity: 0.3, transformPerspective: o.perspective ?? 1400, transformOrigin: o.origin ?? '0% 50%', duration: dur, ease: 'steps(2)' }, t);
    tl.set(els, { visibility: 'hidden' }, t + dur);
    return t + dur;
  }

  /*
    Plot an SVG stroke like a pen plotter: stroke-dashoffset from length to 0 in
    steps(8). Works on path, line, polyline, polygon, rect, circle, ellipse.
    o.label: element(s) that step in at half the stroke time.
    o.dur default 0.72 s (8 visible steps).
  */
  function plot(tl, target, t, o = {}) {
    const els = toArr(target);
    const dur = o.dur ?? 0.72;
    els.forEach((el, i) => {
      const len = Math.ceil(el.getTotalLength ? el.getTotalLength() : 1000) + 2;
      const at = t + i * (o.stagger ?? 0);
      // keep the stroke fully hidden until it starts plotting
      tl.set(el, { strokeDasharray: len + ' ' + len, strokeDashoffset: len }, 0);
      tl.fromTo(el, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: dur, ease: 'steps(' + (o.steps ?? 8) + ')', immediateRender: false }, at);
    });
    const end = t + dur + (o.stagger ? o.stagger * (els.length - 1) : 0);
    if (o.label) stepIn(tl, o.label, t + dur / 2);
    return end;
  }

  /*
    Fill-in for a shape after it is plotted (box fills, bars): opacity steps.
  */
  function fillIn(tl, target, t, o = {}) {
    tl.fromTo(toArr(target), { opacity: 0 }, { opacity: o.to ?? 1, duration: o.dur ?? STEP, ease: 'steps(2)', immediateRender: false }, t);
    tl.set(toArr(target), { opacity: 0 }, 0);
    return t + (o.dur ?? STEP);
  }

  /*
    Type text into an element at ~18 chars/s (seek-safe, uses track()).
    o.cps chars per second (default 18), o.caret true adds a caret span while
    typing, o.keep (default true) keeps the caret visible after typing until
    o.caretUntil. o.prefix stays in front (e.g. "შენ: "). Returns end time.
    Text is split by code points, so Georgian is safe.
  */
  function typeText(tl, target, text, t, o = {}) {
    const el = one(target);
    const chars = Array.from(text);
    const cps = o.cps ?? 18;
    const dur = chars.length / cps;
    const prefix = o.prefix ?? '';
    const caret = o.caret !== false;
    const caretUntil = o.caretUntil ?? t + dur + 0.5;
    const placeholder = o.placeholder ?? null;
    const render = (n, showCaret) => {
      if (n === 0 && placeholder !== null && !showCaret) {
        el.innerHTML = '<span class="placeholder">' + esc(placeholder) + '</span>';
        return;
      }
      el.innerHTML = esc(prefix + chars.slice(0, n).join('')) + (showCaret ? '<span class="caret"></span>' : '');
    };
    track(tl, t, caretUntil, (s) => {
      const n = Math.min(chars.length, Math.floor(s * cps + 1e-6));
      render(n, caret && s < caretUntil - t - 1e-6);
    });
    // before t: empty / placeholder
    render(0, false);
    return t + dur;
  }

  /* Delete text letter by letter (s02's unsent question). Starts from the full text. */
  function deleteText(tl, target, text, t, o = {}) {
    const el = one(target);
    const chars = Array.from(text);
    const cps = o.cps ?? 22;
    const dur = chars.length / cps;
    track(tl, t, t + dur, (s) => {
      const n = Math.max(0, chars.length - Math.floor(s * cps + 1e-6));
      el.innerHTML = esc(chars.slice(0, n).join('')) + (o.caret !== false ? '<span class="caret"></span>' : '');
    });
    return t + dur;
  }

  /*
    Swap an element's text at given times: textAt(tl, el, [[0,'1 დღე'],[2,'3 დღე']]).
    Times are local seconds; the first entry is the initial text.
  */
  function textAt(tl, target, pairs, o = {}) {
    const el = one(target);
    const sorted = pairs.slice().sort((a, b) => a[0] - b[0]);
    const set = (v) => { if (o.html) el.innerHTML = v; else el.textContent = v; };
    const end = sorted[sorted.length - 1][0] + 0.001;
    track(tl, 0, end, (s) => {
      let v = sorted[0][1];
      for (const [at, txt] of sorted) if (s >= at - 1e-6) v = txt;
      set(v);
    });
    set(sorted[0][1]);
    return end;
  }

  /*
    Mono number ticking from a to b over dur (seek-safe). o.format(n) -> string,
    o.steps: number of visible ticks (defaults to |b-a|), o.ease (default none).
  */
  function countTo(tl, target, a, b, t, dur, o = {}) {
    const el = one(target);
    const fmt = o.format || ((n) => String(n));
    const ease = gsap.parseEase(o.ease || 'none');
    track(tl, t, t + dur, (s, p) => {
      const n = Math.round(a + (b - a) * ease(p));
      el.textContent = fmt(n);
    });
    el.textContent = fmt(a);
    return t + dur;
  }

  /* Cursor: smooth travel (power3.inOut), arrow tip at (x, y) in the parent's px. */
  function cursorMove(tl, cursor, t, x, y, o = {}) {
    const dur = o.dur ?? 0.8;
    tl.to(one(cursor), { x, y, duration: dur, ease: o.ease || 'power3.inOut' }, t);
    return t + dur;
  }

  /* Click: arrow presses to 0.92 for two frames and a ring steps out. */
  function cursorClick(tl, cursor, t, o = {}) {
    const c = one(cursor);
    const arrow = c.querySelector('.arrow');
    const ring = c.querySelector('.ring');
    tl.to(arrow, { scale: 0.92, duration: 0.066, ease: 'steps(2)' }, t);
    tl.to(arrow, { scale: 1, duration: 0.066, ease: 'steps(2)' }, t + 0.13);
    if (ring) {
      tl.fromTo(ring, { scale: 0.4, opacity: 1 }, { scale: 1.3, opacity: 0, duration: 0.3, ease: 'steps(3)', immediateRender: false }, t);
    }
    if (o.press) press(tl, o.press, t, o);
    return t + 0.3;
  }

  /* Press a .btn: invert to ink (class swap) at t, release after o.hold (null = stays pressed). */
  function press(tl, btn, t, o = {}) {
    const b = one(btn);
    const hold = o.hold === undefined ? 0.24 : o.hold;
    classAt(tl, b, 'pressed', t, hold === null ? null : t + hold);
    tl.fromTo(b, { scale: 1 }, { scale: 0.97, duration: 0.066, ease: 'steps(2)', immediateRender: false }, t);
    tl.to(b, { scale: 1, duration: 0.066, ease: 'steps(2)' }, t + 0.1);
    return t + 0.2;
  }

  /* Add a class at t (and remove it at tOff if given). Seek-safe. */
  function classAt(tl, target, cls, t, tOff = null) {
    const els = toArr(target);
    track(tl, 0, Math.max(t, tOff ?? t) + 0.001, (s) => {
      const on = s >= t - 1e-6 && (tOff === null || s < tOff - 1e-6);
      els.forEach((el) => el.classList.toggle(cls, on));
    });
    els.forEach((el) => el.classList.remove(cls));
    return t;
  }

  /* Camera: smooth push/pull/pan on a wrapper (scale, x, y), power3.inOut. */
  function camera(tl, wrapper, t, to, o = {}) {
    const dur = o.dur ?? 1.2;
    tl.to(one(wrapper), Object.assign({ duration: dur, ease: o.ease || 'power3.inOut' }, to), t);
    return t + dur;
  }

  /* Focus economy: fall back to the page (saturate 0.35, opacity 0.5) in two frames; and back. */
  function dim(tl, target, t, o = {}) {
    tl.to(toArr(target), { filter: 'saturate(' + (o.sat ?? 0.35) + ')', opacity: o.opacity ?? 0.5, duration: STEP, ease: 'steps(2)' }, t);
    return t + STEP;
  }
  function undim(tl, target, t) {
    tl.to(toArr(target), { filter: 'saturate(1)', opacity: 1, duration: STEP, ease: 'steps(2)' }, t);
    return t + STEP;
  }

  /* Stamp thunk: lands from 1.12x, stepped (pair with SFX "stamp"). */
  function stamp(tl, target, t, o = {}) {
    const els = toArr(target);
    tl.set(els, { visibility: 'hidden' }, 0);
    tl.set(els, { visibility: 'visible' }, t);
    tl.fromTo(els, { scale: o.from ?? 1.12, opacity: 0.4 }, { scale: 1, opacity: 1, duration: STEP, ease: 'steps(2)', immediateRender: false }, t);
    return t + STEP;
  }

  /* ---------- Icons (lucide geometry, 24x24, stroke) ---------- */
  const ICONS = {
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'arrow-up-right': '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'help-circle': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    'send': '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    'message-square': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    'layers': '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    'pen-tool': '<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/><path d="m2.3 2.3 7.286 7.286"/><circle cx="11" cy="11" r="2"/>',
    'list': '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'play': '<polygon points="6 3 20 12 6 21 6 3"/>',
  };
  function icon(name, cls = '') {
    return '<svg class="icon ' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  /* Replace every <i data-icon="name"></i> under root with the SVG icon. */
  function hydrateIcons(root = document) {
    root.querySelectorAll('i[data-icon]').forEach((i) => {
      i.outerHTML = icon(i.getAttribute('data-icon'), i.className);
    });
  }

  /*
    Build a cursor: Kit.makeCursor(parent, 'gio', 'გიო') -> element.
    Move it with cursorMove; its tip is at the element's (x, y).
  */
  function makeCursor(parent, who, name, o = {}) {
    const c = document.createElement('div');
    c.className = 'cursor ' + who + (o.cls ? ' ' + o.cls : '');
    c.innerHTML =
      '<div class="ring"></div>' +
      '<svg class="arrow" viewBox="0 0 44 44"><path d="M3 2 L3 34 L11.5 26.5 L17.5 40 L24 37 L18 24 L30 24 Z" fill="#1b1a17" stroke="#fbf8f1" stroke-width="2" stroke-linejoin="round"/></svg>' +
      (name ? '<div class="pill">' + esc(name) + '</div>' : '');
    parent.appendChild(c);
    if (o.x !== undefined) gsap.set(c, { x: o.x, y: o.y ?? 0 });
    return c;
  }

  /* Seeded random (mulberry32) for scatter/jitter. Same seed, same numbers, every frame. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /*
    SFX names. Scenes do NOT play audio. Each scene ships audio/cues/<sceneId>.json:
      { "scene": "s04-reveal", "cues": [ { "t": 30.42, "name": "paper" }, ... ] }
    with t in FILM seconds (scene data-start + local time). Kit.SFX is the fixed list.
  */
  const SFX = ['paper', 'stamp', 'plot', 'key', 'pop', 'chime', 'click', 'thud', 'whoosh', 'swap'];

  window.Kit = {
    STEP, SFX, scope, track, stepIn, stepOut, hingeIn, hingeOut, plot, fillIn,
    typeText, deleteText, textAt, countTo, cursorMove, cursorClick, press, classAt,
    camera, dim, undim, stamp, icon, hydrateIcons, makeCursor, esc, rng,
  };
})();
