/*
  Classroom shell for the Chalkroom Live film: Kit.classroom(rootEl, opts).
  Builds the product's class layout (docs/pitch/img/board.png) in Georgian on a
  2560 x 1240 CANVAS inside a camera wrapper, and returns handles to every part.
  Load after kit.js:
    <link rel="stylesheet" href="../assets/classroom.css" />
    <script src="../assets/classroom.js"></script>
  API and pixel boxes: CONVENTIONS.md section 13. Pure DOM build, no timers, no random:
  call it synchronously in the scene script before building the timeline.
*/
(function () {
  if (!window.Kit) throw new Error('classroom.js needs kit.js first');
  if (window.Kit.classroom) return;

  const W = 2560, H = 1240;
  // Canvas boxes (x, y, w, h) in canvas px.
  const BOXES = {
    full:     { x: 0,    y: 0,    w: 2560, h: 1240 },
    masthead: { x: 0,    y: 0,    w: 2560, h: 150 },
    binding:  { x: 0,    y: 150,  w: 150,  h: 980 },
    stage:    { x: 150,  y: 150,  w: 1680, h: 980 },
    board:    { x: 220,  y: 190,  w: 1540, h: 747 },
    caption:  { x: 220,  y: 968,  w: 1540, h: 120 },
    lesson:   { x: 200,  y: 170,  w: 1580, h: 940 },   // board + caption
    rail:     { x: 1830, y: 150,  w: 620,  h: 980 },
    railList: { x: 1854, y: 262,  w: 580,  h: 850 },
    tabs:     { x: 2460, y: 150,  w: 100,  h: 980 },
    controls: { x: 0,    y: 1130, w: 2560, h: 110 },
    ask:      { x: 900,  y: 1130, w: 1660, h: 110 },   // ask input + ask button
  };
  // Screen targets (film px) a box is fitted into.
  const TARGETS = {
    safe:   { x: 0,  y: 0,  w: 1920, h: 885 },   // above a two-line subtitle strip (its top is y 893)
    inset:  { x: 80, y: 40, w: 1760, h: 850 },   // with the 80 px side margins
    frame:  { x: 0,  y: 0,  w: 1920, h: 1080 },  // whole frame (device screens)
  };
  // Named views: box + target.
  const VIEWS = {
    full:   ['full', 'safe'],      // the whole classroom, 0.7137x (s06 end, s07 start)
    device: ['full', 'frame'],     // whole classroom centred in a 16:9 screen, 0.75x
    lesson: ['lesson', 'inset'],   // board + caption, 0.9043x
    board:  ['board', 'inset'],    // board alone, 1.1429x
    rail:   ['rail', 'inset'],
  };

  const PEOPLE = [
    { id: 'ana', letter: 'ა', name: 'ანა', host: true },
    { id: 'nika', letter: 'ნ', name: 'ნიკა' },
    { id: 'gio', letter: 'გ', name: 'გიო' },
    { id: 'mari', letter: 'მ', name: 'მარი' },
  ];
  const TABS = [
    { hue: 'orange', title: 'რა არის PDA?', h: 236 },
    { hue: 'teal', title: 'bump-ის პოვნა', h: 250 },
    { hue: 'grass', title: 'ხელმოწერა invoke_signed-ით', h: 454 },
  ];

  const esc = (s) => window.Kit.esc(s);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  // mono digits, Georgian words in the head face (JetBrains Mono has no Georgian)
  const monoKa = (s) => esc(s).replace(/([Ⴀ-ჿ]+)/g, '<span class="cr-ka">$1</span>');

  function fit(box, target) {
    const b = typeof box === 'string' ? BOXES[box] : box;
    const t = typeof target === 'string' ? TARGETS[target] : target;
    const scale = Math.min(t.w / b.w, t.h / b.h);
    return {
      scale,
      x: t.x + (t.w - b.w * scale) / 2 - b.x * scale,
      y: t.y + (t.h - b.h * scale) / 2 - b.y * scale,
    };
  }
  function view(v, target) {
    if (v && typeof v === 'object' && 'scale' in v) return v;
    if (typeof v === 'string' && VIEWS[v] && !target) return fit(VIEWS[v][0], VIEWS[v][1]);
    return fit(v, target || 'inset');
  }

  function classroom(root, opts = {}) {
    const o = Object.assign({
      title: 'Solana PDA-ები',
      segment: 'ნაწილი 1 / 3: რა არის PDA?',
      phase: 'ასწავლის',
      hue: 'orange',
      page: 'გვერდი 1',
      caption: '',
      currentTab: 'orange',
      tabTimes: { orange: '0:30', teal: '~3წთ', grass: '~3წთ' },
      railTab: 'questions',
      punches: {},
      seats: '4/5',
      askPlaceholder: 'იკითხე ნებისმიერი რამ',
      askReady: false,
      view: 'full',
      hide: [],
    }, opts);

    const host = el('div', 'cr-host');
    const cam = el('div', 'cr-cam');
    const canvas = el('div', 'cr-canvas cr-hue-' + o.hue);
    host.appendChild(cam); cam.appendChild(canvas); root.appendChild(host);

    // ---- masthead
    const mast = el('div', 'masthead cr-masthead');
    const brand = el('div', 'brand', 'CHALKROOM LIVE');
    const head = el('div', 'cr-head');
    const classTitle = el('div', 'class-title', esc(o.title));
    const segment = el('div', 'segment', esc(o.segment));
    head.append(classTitle, segment);
    const right = el('div', 'right');
    const phase = el('span', 'stamp section cr-phase', esc(o.phase));
    const voice = el('span', 'cr-voice', 'ხმა ჩართულია');
    right.append(phase, voice);
    mast.append(brand, head, right);
    canvas.appendChild(mast);

    // ---- binding
    const binding = el('div', 'cr-binding');
    const punches = {};
    PEOPLE.forEach((p) => {
      const st = o.punches[p.id] || {};
      const seat = el('div', 'cr-seat cr-seat-' + p.id);
      const punch = el('div', 'punch ' + p.id + (st.away ? ' away' : ''),
        (p.host ? '<span class="host">H</span>' : '') + p.letter);
      const ready = el('span', 'mark cr-ready', Kit.icon('check'));
      const thread = el('span', 'mark cr-thread', Kit.icon('arrow-up-right'));
      if (!st.ready) ready.style.visibility = 'hidden';
      if (!st.thread) thread.style.visibility = 'hidden';
      punch.append(ready, thread);
      const name = el('div', 'punch-name', esc(p.name));
      seat.append(punch, name);
      if (st.hidden) seat.style.visibility = 'hidden';
      binding.appendChild(seat);
      punches[p.id] = { seat, el: punch, name, ready, thread };
    });
    const openSeat = el('div', 'cr-seat cr-seat-open');
    openSeat.appendChild(el('div', 'punch open'));
    binding.appendChild(openSeat);
    const seats = el('div', 'cr-seats', '<span class="mono">' + esc(o.seats) + '</span> აქ');
    binding.appendChild(seats);
    canvas.appendChild(binding);

    // ---- stage: board + caption
    const stage = el('div', 'cr-stage');
    const board = el('div', 'board cr-board');
    const pageNo = el('div', 'page-no', esc(o.page));
    const svgNS = 'http://www.w3.org/2000/svg';
    const boardSvg = document.createElementNS(svgNS, 'svg');
    boardSvg.setAttribute('viewBox', '0 0 1540 747');
    boardSvg.setAttribute('class', 'cr-board-svg');
    board.append(pageNo, boardSvg);
    const caption = el('div', 'caption-line cr-caption', esc(o.caption));
    stage.append(board, caption);
    canvas.appendChild(stage);

    // ---- right rail
    const rail = el('div', 'cr-rail');
    const railTabsEl = el('div', 'cr-rail-tabs');
    const tq = el('div', 'cr-rail-tab' + (o.railTab === 'questions' ? ' cr-on' : ''), 'კითხვები');
    const tn = el('div', 'cr-rail-tab' + (o.railTab === 'notes' ? ' cr-on' : ''), 'ჩანაწერები');
    railTabsEl.append(tq, tn);
    const railList = el('div', 'cr-rail-list');
    rail.append(railTabsEl, railList);
    canvas.appendChild(rail);

    // ---- fore-edge tab rail
    const tabRail = el('div', 'tab-rail cr-tabs');
    const tabs = {};
    TABS.forEach((t) => {
      const cur = t.hue === o.currentTab;
      const tab = el('div', 'tab ' + t.hue + (cur ? ' current' : ''));
      tab.style.height = t.h + 'px';
      const title = el('div', 'tab-title', esc(t.title));
      const time = el('div', 'tab-time', monoKa(o.tabTimes[t.hue] || ''));
      tab.append(title, time);
      tabRail.appendChild(tab);
      tabs[t.hue] = { el: tab, title, time };
    });
    canvas.appendChild(tabRail);

    // ---- control bar
    const controls = el('div', 'cr-controls');
    const hostLabel = el('span', 'cr-host-label', 'ჰოსტი');
    const slowerBtn = el('span', 'btn sm cr-slower', 'ნელა');
    const endBtn = el('span', 'btn sm cr-plain cr-end', 'დასრულება');
    const askInput = el('div', 'input cr-ask', '<span class="placeholder">' + esc(o.askPlaceholder) + '</span>');
    const askBtn = el('span', 'btn cr-askbtn ' + (o.askReady ? 'btn-primary' : 'cr-idle'), 'კითხვა');
    controls.append(hostLabel, slowerBtn, endBtn, askInput, askBtn);
    canvas.appendChild(controls);

    const parts = { masthead: mast, binding, stage, board, caption, rail, tabRail, controls };
    (o.hide || []).forEach((k) => { if (parts[k]) parts[k].style.visibility = 'hidden'; });

    const cr = {
      W, H, BOXES, VIEWS, TARGETS,
      host, cam, canvas,
      masthead: mast, brand, classTitle, segment, phase, voice,
      binding, punches, openSeat: openSeat.firstChild, seatCount: seats.firstChild, seats,
      stage, board, boardSvg, pageNo, caption,
      rail, railTabs: { questions: tq, notes: tn }, railList,
      tabRail, tabs,
      controls, hostLabel, slowerBtn, endBtn, askInput, askBtn,
      parts,
      view,
      // camera transform for a named view, a canvas box {x,y,w,h} (fitted into target), or {scale,x,y}
      setView(v, target) { gsap.set(cam, view(v, target)); return cr; },
      frame(tl, t, v, o2 = {}) {
        return Kit.camera(tl, cam, t, view(v, o2.target), { dur: o2.dur ?? 1.2, ease: o2.ease || 'power3.inOut' });
      },
      // canvas point -> film px for a given view (default: the view the shell was built with)
      toScreen(cx, cy, v) {
        const m = view(v || o.view);
        return { x: cx * m.scale + m.x, y: cy * m.scale + m.y };
      },
      // board-local point (1540 x 747 board px) -> canvas px
      boardToCanvas(bx, by) { return { x: BOXES.board.x + bx, y: BOXES.board.y + by }; },
    };
    cr.setView(o.view);
    return cr;
  }

  /*
    The PDA demo page (segment 1), in Georgian, at board-local px (1540 x 747).
    pdaBoard(boardEl, svgEl) adds the figures (all visible, static) and returns handles
    so a scene can plot them: { title, wallet, walletLabel, program, programLabel,
    arrow: [line, head], arrowLabel, circle, circleFill, circleLabel, formula, note,
    chipGot, chipConfused }. s06 plots them on; later scenes call it for the finished page.
  */
  function pdaBoard(board, svg) {
    const NS = 'http://www.w3.org/2000/svg';
    const shape = (tag, attrs, cls) => {
      const e = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
      e.setAttribute('class', cls);
      svg.appendChild(e);
      return e;
    };
    const div = (cls, html, css) => {
      const e = el('div', cls, html);
      Object.assign(e.style, css || {});
      board.appendChild(e);
      return e;
    };
    const h = {};
    h.title = div('fig-title cr-fig-title', 'PDA: პროგრამიდან მიღებული მისამართი', { left: '0px', width: '1540px', top: '70px', textAlign: 'center' });
    h.wallet = shape('rect', { x: 130, y: 200, width: 340, height: 130 }, 'stroke');
    h.walletLabel = div('fig-box', 'საფულე<br>(აქვს გასაღები)', { left: '130px', top: '200px', width: '340px', height: '130px', whiteSpace: 'nowrap' });
    h.program = shape('rect', { x: 640, y: 220, width: 240, height: 90 }, 'stroke');
    h.programLabel = div('fig-box', 'პროგრამა', { left: '640px', top: '220px', width: '240px', height: '90px' });
    h.arrow = [
      shape('path', { d: 'M 880 265 H 1200' }, 'stroke'),
      shape('path', { d: 'M 1178 251 L 1201 265 L 1178 279' }, 'stroke'),
    ];
    h.arrowLabel = div('fig-label', 'seeds + bump', { left: '960px', top: '214px' });
    h.circleFill = shape('circle', { cx: 1290, cy: 265, r: 74 }, 'fill-section');
    h.circle = shape('circle', { cx: 1290, cy: 265, r: 74 }, 'stroke accent');
    h.circleLabel = div('fig-box', 'PDA', { left: '1216px', top: '225px', width: '148px', height: '80px' });
    h.formula = div('fig-formula', 'PDA = <i>H</i>(seeds, programId, bump)', { left: '360px', top: '430px' });
    h.note = div('fig-note', 'PDA-ს ხელს მხოლოდ<br>პროგრამა აწერს', { left: '1070px', top: '545px', whiteSpace: 'nowrap' });
    h.chipGot = div('cr-sig cr-sig-ok', Kit.icon('check') + '<span class="mono">1</span> მიხვდა', { left: '560px', top: '366px' });
    h.chipConfused = div('cr-sig cr-sig-q', Kit.icon('help-circle') + '<span class="mono">2</span> დაბნეული', { left: '1218px', top: '138px' });
    return h;
  }

  window.Kit.classroom = classroom;
  window.Kit.classroom.pdaBoard = pdaBoard;
  window.Kit.classroom.BOXES = BOXES;
  window.Kit.classroom.VIEWS = VIEWS;
  window.Kit.classroom.view = view;
})();
