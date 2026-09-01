/* liftapp.js —— 三个阶段的交互与界面
 *
 * ① 移动   平面上的自由同伦：曲线只是曲线，没有上下，交叉点随便生灭。
 * ② 定上下 每个交叉点一个比特，这才成为一张纽结图解。
 * ③ 还原   提升成空间折线（精确），再在 Δ-move 约束下松弛成好看的样子。
 */
(function () {
  'use strict';
  const G = window.GEO, K = window.KNOT, DG = window.DIAG, AX = window.ALEX,
        RR = window.RENDER, P = window.PLANE, LF = window.LIFT, RX = window.RELAX;

  const $ = (id) => document.getElementById(id);
  const mod = (a, n) => ((a % n) + n) % n;
  const PAPER = '#f7f8fb', STAGE = '#0e131f';
  const ENUM_MAX = 12;

  const S = {
    mode: 'move',
    pts2: [], te0: 0.06, sh: null, bits: null,
    pts3: null, D2: null, verify: null,
    rlx: null, D3: null,
    cam: { yaw: 0.72, pitch: 0.46 },
    zoom: 1, panx: 0, pany: 0, fit: null, view: null,
    targetN: 96, pullRad: 8,
    hoverV: -1, hoverC: -1, drag: null, undo: [],
    autoRelax: false, autoSim: false,
    alex: null, alexRef: null, invWarn: '',
    enum: null, lastInv: 0,
    dirtyUI: true
  };
  window.S2 = S;          // 方便在控制台里检查

  /* ================= 基础 ================= */

  const teOf = () => Math.max(S.te0, P.totalLength(S.pts2) / 260);

  function refreshShadow() { S.sh = P.shadow(S.pts2); S.dirtyUI = true; }

  /* 疏开贴得太近的两股，再重采样。平面阶段是自由同伦，这一步怎么做都合法，
   * 但它对后面两步很要紧：平面上贴到零点几条边长以内的两段，提升之后在空间里
   * 也贴那么近，而三维松弛救不回来（δ 比那个间距大，那一带的移动会被全部否掉），
   * 投影出来就是一个没有断口的四叉点。尺度按三维松弛用的边长 total/110 来定。 */
  function tidy() {
    const tRel = P.totalLength(S.pts2) / 110;
    P.declutter(S.pts2, 0.5 * tRel, 2.5 * tRel, 10);
    P.resample(S.pts2, teOf(), 40, 260);
  }

  function newCircle() {
    S.targetN = G.clamp(parseInt($('npts').value, 10) || 96, 48, 200);
    S.pts2 = P.circle(S.targetN, 1);
    S.te0 = (2 * Math.PI) / S.targetN;
    S.undo.length = 0;
    S.bits = null; S.pts3 = null; S.D2 = null; S.verify = null;
    S.alex = null; S.alexRef = null; S.invWarn = '';
    S.fit = null; S.zoom = 1; S.panx = S.pany = 0;
    refreshShadow();
  }

  function pushUndo() {
    S.undo.push(S.pts2.map((p) => p.slice()));
    if (S.undo.length > 60) S.undo.shift();
  }

  function nearestIndex(pts, q) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i][0] - q[0]) * (pts[i][0] - q[0]) + (pts[i][1] - q[1]) * (pts[i][1] - q[1]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* ================= 提升 ================= */

  function rebuildLift() {
    const total = P.totalLength(S.pts2);
    S.pts3 = LF.build(S.pts2, S.sh, S.bits, { h: (1.6 * total) / 110, samples: 5 });
    S.verify = LF.verify(S.pts3, S.sh, S.bits);
    S.D2 = S.verify.D;
    const pd = LF.pseudoDiag(S.sh, S.bits);
    S.alex = AX.compute(pd, 60);
    S.alexRef = S.alex.ok ? S.alex.coeffs : null;
    S.invWarn = '';
    S.dirtyUI = true;
  }

  /* 松弛过程中 Δ(t) 不应该变 —— 这是对 Δ-move 那套约束的实时检验 */
  function checkInvariance(now) {
    if (now - S.lastInv < 700 || !S.D3 || !S.alexRef) return;
    S.lastInv = now;
    const a = AX.compute(S.D3, 60);
    if (!a.ok) return;
    const same = AX.eq(a.coeffs, S.alexRef) || AX.eq(a.coeffs.slice().reverse(), S.alexRef);
    S.invWarn = same ? '' : '⚠ 松弛过程中 Δ(t) 变了 —— 这不应该出现，请报告。';
    S.dirtyUI = true;
  }

  /* ================= 阶段切换 ================= */

  function setMode(m) {
    if (m === S.mode) return;
    if (m === 'choose') {
      tidy();
      refreshShadow();
      if (!S.sh.crossings.length) { flashHint('还没有交叉点 —— 先把曲线拉出交叉来'); return; }
      S.bits = LF.descending(S.sh, 0);
      rebuildLift();
    }
    if (m === 'lift') {
      if (!S.bits) { setMode('choose'); if (S.mode !== 'choose') return; }
      if (!S.verify || !S.verify.ok) { flashHint('还原自检没通过，先动一动曲线避开退化位置'); return; }
      const pts = S.pts3.map((p) => p.slice());
      S.rlx = RX.make(pts, 110);
      RX.decimateTo(S.rlx, 130);          // 先抽稀，否则短边会让 shapeOK 卡死一切移动
      startInflate();
      S.autoSim = false;
      S.cam.yaw = 0.72; S.cam.pitch = 0.46;
      S.D3 = null;
    }
    if (m === 'move' && S.mode !== 'move') {
      S.bits = null; S.pts3 = null; S.D2 = null; S.verify = null;
      S.rlx = null; S.D3 = null; S.autoRelax = S.autoSim = false;
      S.alex = null; S.alexRef = null; S.invWarn = '';
      stopEnum();
      flashHint('已回到移动阶段 —— 上下的选择被丢弃了');
    }
    S.mode = m;
    S.fit = null; S.zoom = 1; S.panx = S.pany = 0;
    S.hoverC = S.hoverV = -1; S.drag = null;
    for (const b of document.querySelectorAll('.step')) b.classList.toggle('on', b.dataset.mode === m);
    $('toolMove').hidden = m !== 'move';
    $('toolChoose').hidden = m !== 'choose';
    $('toolLift').hidden = m !== 'lift';
    $('panelEnum').hidden = m === 'move';
    $('btnInflate').classList.toggle('on', S.autoRelax);
    $('btnSimplify').classList.toggle('on', S.autoSim);
    S.dirtyUI = true;
  }

  /* 充气：以当前周长为准做归一化，抖动重新打开 */
  function startInflate() {
    if (!S.rlx) return;
    S.rlx.len0 = K.totalLength(S.rlx.pts);
    S.rlx.acc = 0; S.rlx.stall = 0; S.rlx.sweeps = 0;
    S.rlx.lastShape = RX.shape(S.rlx.pts);
    S.rlx.jitter = 0.15;
    S.rlx.best = null; S.rlx.bestScore = -1;
    S.autoRelax = true;
  }

  let hintTimer = null;
  function flashHint(txt) {
    $('hint').textContent = txt;
    $('hint').classList.add('flash');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { $('hint').classList.remove('flash'); S.dirtyUI = true; }, 2200);
  }

  /* ================= 绘制 ================= */

  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { w: w, h: h, dpr: dpr };
  }

  function seg(ctx, a, b, color, width) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }

  function draw(now) {
    const cv = $('cmain'), ctx = cv.getContext('2d');
    const m = fitCanvas(cv);
    if (S.mode === 'lift') drawLift(ctx, m);
    else if (S.mode === 'choose') drawChoose(ctx, m);
    else drawMove(ctx, m);
  }

  function drawMove(ctx, m) {
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, m.w, m.h);
    const f = P.fitBounds(S.pts2, m.w, m.h, 56 * m.dpr);
    S.fit = S.drag && S.drag.mode === 'pull' ? (S.fit || f) : RR.smoothFit(S.fit, f, 0.12);
    S.view = RR.viewFromFit(S.fit, m.w, m.h, S.zoom, S.panx, S.pany);

    const n = S.pts2.length, cum = P.cumlen(S.pts2), total = cum[n] || 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const a = S.view.toScreen(S.pts2[i][0], S.pts2[i][1]);
      const b = S.view.toScreen(S.pts2[(i + 1) % n][0], S.pts2[(i + 1) % n][1]);
      seg(ctx, a, b, 'hsl(' + RR.hue(cum[i] / total).toFixed(0) + ',62%,52%)', 4.6 * m.dpr);
    }
    for (const c of S.sh.crossings) {
      const s = S.view.toScreen(c.x, c.y);
      ctx.beginPath(); ctx.arc(s[0], s[1], 3.4 * m.dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,40,64,.72)'; ctx.fill();
    }
    for (let i = 0; i < n; i++) {
      const on = i === S.hoverV || (S.drag && S.drag.i === i);
      if (!on && i % 3) continue;                    // 顶点很密，只点出三分之一做示意
      const s = S.view.toScreen(S.pts2[i][0], S.pts2[i][1]);
      ctx.beginPath(); ctx.arc(s[0], s[1], (on ? 5.5 : 1.5) * m.dpr, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#ff9f43' : 'rgba(20,28,48,.22)'; ctx.fill();
    }
  }

  function drawChoose(ctx, m) {
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, m.w, m.h);
    if (!S.D2) return;
    const f = RR.fitBounds(S.D2, m.w, m.h, 56 * m.dpr);
    S.fit = RR.smoothFit(S.fit, f, 0.14);
    S.view = RR.viewFromFit(S.fit, m.w, m.h, S.zoom, S.panx, S.pany);
    RR.drawKnot(ctx, S.D2, S.view, {
      bg: PAPER, width: 5.4 * m.dpr, gap: 2.8 * m.dpr, flat: true,
      showPts: false, ptRadius: 0, marks: false
    }, null);
    for (let k = 0; k < S.sh.crossings.length; k++) {
      const c = S.sh.crossings[k];
      const s = S.view.toScreen(c.x, c.y);
      if (k === S.hoverC) {
        ctx.beginPath(); ctx.arc(s[0], s[1], 11 * m.dpr, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 2.4 * m.dpr; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(s[0], s[1], 2.2 * m.dpr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(30,40,64,.35)'; ctx.fill();
      }
    }
  }

  function drawLift(ctx, m) {
    ctx.fillStyle = STAGE; ctx.fillRect(0, 0, m.w, m.h);
    if (!S.D3) return;
    const f = RR.fitBounds(S.D3, m.w, m.h, 56 * m.dpr);
    S.fit = RR.smoothFit(S.fit, f, 0.14);
    S.view = RR.viewFromFit(S.fit, m.w, m.h, S.zoom, S.panx, S.pany);
    RR.drawKnot(ctx, S.D3, S.view, {
      bg: STAGE, width: 7 * m.dpr, gap: 2.6 * m.dpr, flat: false,
      showPts: false, ptRadius: 0, marks: false
    }, null);
  }

  /* ================= 界面 ================= */

  const NOTES = {
    move: '<p>屏幕上只有一条平面闭曲线。交叉点只是画面上两股的重叠点，<strong>没有上下</strong> —— ' +
      '纽结论里管它叫 shadow（影子）。平面上的移动不是空间中的同痕，所以这里不需要任何限制：' +
      '交叉点可以随便生、随便灭、随便互相穿过。</p><p>抓住曲线拖动就行。拉出足够多的交叉之后进入下一步。</p>',
    choose: '<p>现在每个交叉点是一个比特：谁在上，谁在下（下股在交叉处断开一小段）。' +
      '点击交叉点翻转它。</p><p><strong>下降</strong>必然给出平凡结 —— 它把你最开始画的那个圈还原了出来。' +
      '<strong>交替</strong>是另一极：由 Tait 猜想，约化掉扭结之后若还剩 n′≥3 个交叉点，' +
      '它的交叉数恰好是 n′。中间的 2ⁿ 种由你自己点。</p>',
    lift: '<p>提升是精确的：z ≡ 0，只在交叉点附近开互不重叠的凸包，上股 +h、下股 −h。' +
      '于是 (x,y) 唯一可能重合的地方就是交叉点，而那里两股相差 2h ⇒ 嵌入，且投影逐点等于你画的那张图。</p>' +
      '<p>之后的松弛每一步都受 Δ-move 约束，<strong>不改变纽结型</strong>。' +
      '「俯视」可以转回原来那张投影图的方向。</p>'
  };

  let lastUI = 0;
  function updateUI(now) {
    if (!S.dirtyUI && now - lastUI < 200) return;
    lastUI = now; S.dirtyUI = false;

    const nc = S.sh ? S.sh.crossings.length : 0;
    $('vCross').textContent = nc;
    $('vN').textContent = S.mode === 'lift' && S.rlx ? S.rlx.pts.length : S.pts2.length;

    if (S.mode === 'move' || !S.bits) {
      $('vWrithe').textContent = '–';
      $('vDet').textContent = '–';
      $('vAlex').textContent = '（还没有定上下）';
      $('vName').textContent = '–';
      $('vCheck').textContent = '–';
      $('vGauss').textContent = '–';
      $('warn').textContent = '';
    } else {
      const pd = LF.pseudoDiag(S.sh, S.bits);
      $('vWrithe').textContent = (pd.writhe > 0 ? '+' : '') + pd.writhe;
      $('vGauss').textContent = DG.gaussString(pd);
      const a = S.alex;
      if (a && a.ok) {
        $('vAlex').textContent = a.text;
        $('vDet').textContent = AX.determinant(a.coeffs);
        const isU = a.coeffs.length === 1 && Math.abs(a.coeffs[0]) === 1;
        $('vName').textContent = AX.identify(a.coeffs) || (isU ? '0₁ 平凡结' : '（不在内置表中）');
      } else {
        $('vAlex').textContent = a ? (a.reason === 'too-many' ? '交叉点过多（' + a.n + '），已跳过' : a.reason) : '–';
        $('vDet').textContent = '–'; $('vName').textContent = '–';
      }
      const v = S.verify;
      $('vCheck').textContent = v ? (v.ok ? '✓ 投影逐点吻合' : '✗ ' + v.reason) : '–';
      $('vCheck').style.color = v && v.ok ? '#b9e6c4' : '#ffb4b4';
      $('warn').textContent = S.invWarn ||
        (v && !v.ok ? '提升遇到了退化位置（两股几乎相切，或交叉点挤在一起）。回到移动阶段稍微动一下曲线即可。' : '') ||
        (S.mode === 'lift' && S.rlx && RX.isThin(S.rlx)
          ? '这条曲线上有两股几乎贴在一起（平面上就近乎相切），松弛拉不开它们 —— '
            + '图上那里会显示成一个没有断口的四叉点。回到移动阶段按「抚平」，或把那两段拉开一点再来。'
          : '');
    }

    if ($('note').dataset.mode !== S.mode) {
      $('note').dataset.mode = S.mode;
      $('note').innerHTML = NOTES[S.mode];
    }
    if (!$('hint').classList.contains('flash')) {
      $('hint').textContent =
        S.mode === 'move' ? '抓住曲线拖动 · 滚轮缩放 · ' + nc + ' 个交叉点'
        : S.mode === 'choose' ? '点击交叉点翻转上下'
        : (S.autoRelax ? '充气中…' : S.autoSim ? '简化中…' : '拖动旋转视角');
    }
    if (S.rlx && S.mode === 'lift') {
      $('btnInflate').classList.toggle('on', S.autoRelax);
      $('btnSimplify').classList.toggle('on', S.autoSim);
    }
    updateEnumUI();
  }

  /* ================= 枚举 2ⁿ 种选法 ================= */

  function startEnum() {
    const nc = S.sh ? S.sh.crossings.length : 0;
    if (!S.bits) return;
    if (nc > ENUM_MAX) { flashHint('交叉点超过 ' + ENUM_MAX + ' 个，2ⁿ 太大了'); return; }
    S.enum = { total: 1 << nc, i: 0, map: new Map(), running: true, nc: nc };
    $('btnEnumStop').hidden = false;
    S.dirtyUI = true;
  }
  function stopEnum() {
    if (S.enum) S.enum.running = false;
    $('btnEnumStop').hidden = true;
    S.dirtyUI = true;
  }

  function enumTick(budget) {
    const e = S.enum, t0 = performance.now();
    while (e.i < e.total && performance.now() - t0 < budget) {
      const bits = LF.fromMask(S.sh, e.i);
      const a = AX.compute(LF.pseudoDiag(S.sh, bits), 60);
      const key = a.ok ? a.coeffs.join(',') : '?' + a.reason;
      let r = e.map.get(key);
      if (!r) {
        const isU = a.ok && a.coeffs.length === 1 && Math.abs(a.coeffs[0]) === 1;
        r = { text: a.ok ? a.text : a.reason,
              name: (a.ok ? AX.identify(a.coeffs) : null) || (isU ? '平凡结' : ''),
              count: 0, mask: e.i };
        e.map.set(key, r);
      }
      r.count++;
      e.i++;
    }
    if (e.i >= e.total) stopEnum();
    S.dirtyUI = true;
  }

  let enumSig = '';
  function updateEnumUI() {
    const e = S.enum;
    const nc = S.sh ? S.sh.crossings.length : 0;
    $('btnEnum').disabled = !S.bits || nc > ENUM_MAX || nc === 0;
    if (!e) {
      $('enumState').textContent = nc && nc <= ENUM_MAX ? '2^' + nc + ' = ' + (1 << nc) : '–';
      return;
    }
    $('enumState').textContent = e.i + ' / ' + e.total;
    const sig = e.i + ':' + e.map.size;
    if (sig === enumSig) return;
    enumSig = sig;
    const rows = Array.from(e.map.values()).sort((a, b) => b.count - a.count);
    $('enumList').innerHTML = rows.map((r) =>
      '<li data-mask="' + r.mask + '"><span class="tag">' + r.count + '</span>' +
      '<span class="txt mono">' + r.text + '</span>' +
      '<span class="cause">' + r.name + '</span></li>').join('') ||
      '<li class="empty">…</li>';
  }

  /* ================= 交接给同痕演示 ================= */

  function handoff() {
    if (!S.rlx) return;
    const rd = (x) => Math.round(x * 1e5) / 1e5;
    localStorage.setItem('knot-handoff', JSON.stringify({
      format: 'knot-isotopy/1',
      meta: { from: 'lift', crossings: S.sh.crossings.length },
      initPts: S.rlx.pts.map((p) => p.map(rd)),
      initCam: { yaw: S.cam.yaw, pitch: S.cam.pitch },
      ops: []
    }));
    location.href = 'index.html?from=lift';
  }

  /* ================= 指针 ================= */

  function evtPos(e, cv) {
    const r = cv.getBoundingClientRect();
    const k = cv.width / Math.max(1, r.width);
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  }

  function setupPointer() {
    const cv = $('cmain');
    const dpr = () => Math.min(2, window.devicePixelRatio || 1);

    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    cv.addEventListener('pointerdown', (e) => {
      const p = evtPos(e, cv);
      cv.setPointerCapture(e.pointerId);
      const pan = e.ctrlKey || e.metaKey || e.button === 2;
      if (S.mode === 'move' && !pan && e.button === 0) {
        const i = P.pickVertex(S.pts2, S.view, p[0], p[1], 26 * dpr());
        if (i >= 0) { pushUndo(); S.drag = { mode: 'pull', i: i, last: p }; return; }
      }
      if (S.mode === 'choose' && !pan && e.button === 0) {
        const k = P.pickCrossing(S.sh, S.view, p[0], p[1], 24 * dpr());
        if (k >= 0) { S.bits[k] = 1 - S.bits[k]; stopEnum(); S.enum = null; rebuildLift(); return; }
      }
      if (S.mode === 'lift' && !pan) { S.drag = { mode: 'orbit', last: p }; return; }
      S.drag = { mode: 'pan', last: p };
    });

    cv.addEventListener('pointermove', (e) => {
      const p = evtPos(e, cv);
      if (!S.drag) {
        if (!S.view) return;
        if (S.mode === 'move') {
          const i = P.pickVertex(S.pts2, S.view, p[0], p[1], 26 * dpr());
          if (i !== S.hoverV) { S.hoverV = i; cv.style.cursor = i >= 0 ? 'grab' : 'default'; }
        } else if (S.mode === 'choose') {
          const k = P.pickCrossing(S.sh, S.view, p[0], p[1], 24 * dpr());
          if (k !== S.hoverC) { S.hoverC = k; cv.style.cursor = k >= 0 ? 'pointer' : 'default'; }
        }
        return;
      }
      const d = S.drag;
      if (d.mode === 'pull') {
        const dx = (p[0] - d.last[0]) / S.view.scale, dy = -(p[1] - d.last[1]) / S.view.scale;
        d.last = p;
        const te = teOf();
        P.pull(S.pts2, d.i, dx, dy, S.pullRad * te);
        const anchor = S.pts2[d.i].slice();
        P.resample(S.pts2, te, 40, 260);
        d.i = nearestIndex(S.pts2, anchor);
        S.hoverV = d.i;
        refreshShadow();
      } else if (d.mode === 'orbit') {
        S.cam.yaw -= (p[0] - d.last[0]) * 0.006;
        S.cam.pitch = G.clamp(S.cam.pitch + (p[1] - d.last[1]) * 0.006, -1.5, 1.5);
        d.last = p;
      } else {
        S.panx += p[0] - d.last[0];
        S.pany += p[1] - d.last[1];
        d.last = p;
      }
    });

    const end = () => {
      if (S.drag && S.drag.mode === 'pull') { tidy(); refreshShadow(); }
      S.drag = null; S.dirtyUI = true;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      S.zoom = G.clamp(S.zoom * Math.exp(-e.deltaY * 0.0011), 0.2, 10);
    }, { passive: false });
  }

  /* ================= 按钮 ================= */

  function setBits(b, why) {
    if (!b) { flashHint(why || '这种选法不可用'); return; }
    S.bits = b; S.enum = null; stopEnum(); rebuildLift();
  }

  function setupUI() {
    for (const b of document.querySelectorAll('.step')) {
      b.addEventListener('click', () => setMode(b.dataset.mode));
    }

    $('btnCircle').addEventListener('click', newCircle);
    $('btnUndo').addEventListener('click', () => {
      if (!S.undo.length) return;
      S.pts2 = S.undo.pop(); refreshShadow();
    });
    $('btnTangle').addEventListener('click', () => {
      pushUndo();
      P.tangle(S.pts2, 26, teOf(), Math.random, 40, 260);
      tidy();
      refreshShadow();
    });
    $('btnSmooth').addEventListener('click', () => {
      pushUndo();
      P.smooth(S.pts2, 0.45, 4);
      tidy();
      refreshShadow();
    });
    $('rngPull').addEventListener('input', (e) => {
      S.pullRad = +e.target.value; $('lblPull').textContent = e.target.value;
    });
    $('npts').addEventListener('change', newCircle);

    $('btnDesc').addEventListener('click', () => setBits(LF.descending(S.sh, 0)));
    $('btnAlt').addEventListener('click', () =>
      setBits(LF.alternating(S.sh, 0), '交替赋值失败 —— 曲线处在退化位置，动一下再试'));
    $('btnRand').addEventListener('click', () => setBits(LF.random(S.sh)));
    $('btnFlip').addEventListener('click', () => setBits(LF.flipAll(S.bits)));

    $('btnInflate').addEventListener('click', () => {
      S.autoSim = false;
      if (S.autoRelax) S.autoRelax = false; else startInflate();
      S.dirtyUI = true;
    });
    $('btnSimplify').addEventListener('click', () => {
      S.autoSim = !S.autoSim; S.autoRelax = false;
      if (S.autoSim && S.rlx) {
        S.rlx.acc = 0; S.rlx.stall = 0; S.rlx.sweeps = 0; S.rlx.jitter = 0;
        S.rlx.lastLen = K.totalLength(S.rlx.pts);
      }
      S.dirtyUI = true;
    });
    $('btnResetCam').addEventListener('click', () => {
      S.cam.yaw = 0; S.cam.pitch = 1.5; S.zoom = 1; S.panx = S.pany = 0;
    });
    $('btnHandoff').addEventListener('click', handoff);

    $('btnEnum').addEventListener('click', startEnum);
    $('btnEnumStop').addEventListener('click', stopEnum);
    $('enumList').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-mask]');
      if (!li) return;
      const keep = S.enum;
      S.bits = LF.fromMask(S.sh, +li.dataset.mask);
      rebuildLift();
      S.enum = keep;             // 保留枚举结果，只切换当前选法
      enumSig = '';
    });

    $('btnHelp').addEventListener('click', () => { $('help').hidden = false; });
    $('helpClose').addEventListener('click', () => { $('help').hidden = true; });
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && S.mode === 'move') {
        e.preventDefault();
        if (S.undo.length) { S.pts2 = S.undo.pop(); refreshShadow(); }
      } else if (e.key === 'Escape') { $('help').hidden = true; }
    });
  }

  /* ================= 主循环 ================= */

  function frame(now) {
    if (S.mode === 'lift' && S.rlx) {
      // 松弛按时间预算跑，别按次数 —— 否则一帧只走 1/5 圈，充气要等半分钟
      if (S.autoRelax || S.autoSim) {
        const spread = S.autoRelax ? 1.0 : 0;
        const t0 = performance.now();
        let done = false;
        while (!done && performance.now() - t0 < 7) done = RX.step(S.rlx, spread);
        if (done) {
          // 充气收敛后取回过程中「最粗」的那个构形：跑到最后往往反而把
          // 相距很远的两股蹭到了一起，投影出来是个没有断口的四叉点
          if (spread > 0) RX.restoreBest(S.rlx);
          S.autoRelax = S.autoSim = false;
          S.dirtyUI = true;
        }
      }
      RX.updateScales(S.rlx);
      S.D3 = DG.compute(S.rlx.pts, DG.basis(S.cam.yaw, S.cam.pitch));
      checkInvariance(now);
    }
    if (S.enum && S.enum.running) enumTick(10);
    draw(now);
    updateUI(now);
    requestAnimationFrame(frame);
  }

  /* ================= 启动 ================= */

  setupUI();
  setupPointer();
  newCircle();
  P.tangle(S.pts2, 14, S.te0, Math.random, 40, 260);   // 开局先随手缠一点，省得对着一个圆发呆
  refreshShadow();
  $('panelEnum').hidden = true;
  requestAnimationFrame(frame);
})();
