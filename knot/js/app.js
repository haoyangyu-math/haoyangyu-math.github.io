/* app.js —— 交互、录制、界面 */
(function () {
  'use strict';
  const G = window.GEO, K = window.KNOT, LIB = window.LIB,
        DG = window.DIAG, RD = window.REID, AX = window.ALEX, RR = window.RENDER;

  const $ = (id) => document.getElementById(id);
  const mod = (a, n) => ((a % n) + n) % n;
  // 每步最多细分成 2^depth 小步；图解很乱时降低上限，保证交互仍然跟手
  const maxDepthFor = (nc) => (nc > 120 ? 3 : nc > 60 ? 5 : 8);

  const S = {
    pts: [],
    cam: { yaw: 0.75, pitch: 0.42, zoom: 1, panx: 0, pany: 0 },
    D: null,
    tracker: new DG.Tracker(),
    rec: new window.Recorder(),
    targetN: 84,
    te: 0.1, delta: 0.012, deltaScale: 0.12,
    opt: { minEdge: 0.03, minAngle: 0.04 },
    hover: -1, drag: -1,
    adapt: true, showPts: true, logViewEv: true,
    entry: null,
    counts: { R1: 0, R2: 0, R3: 0, multi: 0 },
    flash: null,
    playing: false, playT: 0, playAcc: 0, speed: '1',
    autoSim: false, autoTangle: false, tangleLeft: 0,
    sim: null,                       // 自动简化的状态，见 newSim()
    alex: null, alexRef: null, alexKey: '',
    sp3: null, view3: null, view2: null, fit3: null, fit2: null,
    dirtyUI: true
  };
  window.S = S;   // 方便在控制台里检查

  /* ================= 基础 ================= */

  function basis() { return DG.basis(S.cam.yaw, S.cam.pitch); }
  function computeD() { return DG.compute(S.pts, basis()); }

  function setPts(arr) {
    S.pts.length = 0;
    for (const p of arr) S.pts.push(p.slice());
  }

  /* δ 是「保证留出的最小间距」。它随纽结尺度走，但绝不允许超过当前构形
   * 实际达到的最小间距 —— 否则整条纽结会被自己卡死。每隔若干帧实测一次。 */
  let sepCounter = 0;
  function updateScales(force) {
    const total = K.totalLength(S.pts);
    S.te = total / S.targetN;
    if (force || --sepCounter <= 0) { sepCounter = 20; S.sep = K.minSeparation(S.pts); }
    let d = S.deltaScale * S.te;
    if (isFinite(S.sep)) d = Math.min(d, 0.6 * S.sep);
    // δ 给一个不随实测间距走的下限。库里的纽结间距都在 0.07 以上，这条下限
    // 从不生效；但从 lift.html 交接过来的纽结可能带着几条极短的边，实测间距
    // 会掉到 10⁻⁵，那时 δ 会跟着归零 —— 拓扑仍由 segTriHit 兜底，可是余量没了。
    S.delta = Math.max(d, 0.01 * S.te, 1e-9);
    S.opt = { minEdge: 0.30 * S.te, minAngle: 0.04 };
  }

  function refreshDiagram() {
    const nd = computeD();
    const m = S.tracker.match(S.D, nd, 0.06);
    if (S.D) S.tracker.commit(S.D, nd, m); else S.tracker.fresh(nd);
    S.D = nd;
  }

  /* ================= 核心：一步形变 + 事件识别 =================
   * 若一步引发了多于一个图解事件，就把这一步二分再试。
   * 关键性质：整段扫掠三角形安全 ⇒ 任何子段也安全，所以细分永远合法。 */

  function commitChange(apply, from, to, lerpFn, mkOp, cause, depth) {
    apply(to);
    const nd = computeD();
    const m = S.tracker.match(S.D, nd, 0.06);
    const ev = RD.classify(S.D, nd, m);

    if (ev.kind === 'multi' && depth < maxDepthFor(nd.crossings.length)) {
      apply(from);
      const mid = lerpFn(from, to, 0.5);
      commitChange(apply, from, mid, lerpFn, mkOp, cause, depth + 1);
      commitChange(apply, mid, to, lerpFn, mkOp, cause, depth + 1);
      return;
    }

    // 两股近乎相切时会出现极窄的「针尖双角形」，它的两个交叉点会来回抖动。
    // 图解能表达的最细特征不可能细于折线自身的边长，所以窄于 1/4 条边长的
    // 双角形翻转视为分辨率以下的抖动，不作为事件记录。
    let kind = ev.kind;
    if (kind === 'R2t' && ev.newIdx.length === 2) {
      const c1 = nd.crossings[ev.newIdx[0]], c2 = nd.crossings[ev.newIdx[1]];
      if (Math.hypot(c1.x - c2.x, c1.y - c2.y) < 0.25 * S.te) kind = 'none';
    }

    let evrec = null;
    if (kind !== 'none') {
      const keep = cause !== 'view' || S.logViewEv;
      if (keep) {
        evrec = { kind: kind, dir: ev.dir, cause: cause, marks: markPos(ev, S.D, nd) };
        if (kind === 'multi') {
          evrec.info = m.born.length + '生/' + m.died.length + '灭/Δn' +
            (nd.crossings.length - S.D.crossings.length);
        }
        const b = bucketOf(kind);
        if (S.counts[b] !== undefined) S.counts[b]++;
        S.flash = { marks: evrec.marks, until: performance.now() + 1400 };
        S.dirtyUI = true;
      }
    }
    S.tracker.commit(S.D, nd, m);
    const op = mkOp(from, to);
    op.ev = evrec;
    S.rec.push(op);
    S.D = nd;
  }

  const EVCOLOR = { R1: '#ffd166', R2: '#7ee0a5', R2t: '#7ee0a5', R3: '#ff9ecf', multi: '#ff8a8a' };
  const bucketOf = (kind) => (kind === 'R2t' ? 'R2' : kind);

  function markPos(ev, oldD, newD) {
    const col = EVCOLOR[ev.kind] || '#fff';
    const out = [];
    for (const b of ev.newIdx) out.push({ x: newD.crossings[b].x, y: newD.crossings[b].y, color: col });
    for (const a of ev.oldIdx) out.push({ x: oldD.crossings[a].x, y: oldD.crossings[a].y, color: col });
    return out;
  }

  /* ---- 移动一个控制点（受 Δ-move 约束） ----
   * delta / opt 可选：自动简化要用一套与手工拖动不同的余量与形状约束，
   * 但走的是同一条通道 —— 事件识别、计数、录制一个都不少。 */
  function moveVertex(i, target, delta, opt) {
    if (delta === undefined) { delta = S.delta; opt = S.opt; }
    const from = S.pts[i].slice();
    const f = K.maxSafeFrac(S.pts, i, target, delta, opt);
    if (f < 1e-3) { flashBlocked(); return false; }
    const to = G.lerp(from, target, f);
    if (G.dist(from, to) < 1e-7) return false;
    if (f < 0.985) flashBlocked();
    commitChange(
      (v) => { S.pts[i] = v.slice(); },
      from, to, G.lerp,
      (a, b) => ({ k: 'm', i: i, from: a.slice(), to: b.slice() }),
      'isotopy', 0);
    return true;
  }

  /* ---- 结构操作：插点（几何恒等）／删点 ---- */
  function insertVertex(at, p) {
    S.pts.splice(at, 0, p.slice());
    S.rec.push({ k: 'ins', at: at, p: p.slice(), ev: null });
    refreshDiagram();
  }

  function tryDecimate(j, delta, opt) {
    if (delta === undefined) { delta = S.delta; opt = S.opt; }
    const n = S.pts.length;
    if (n <= 28) return false;
    const L = S.pts[mod(j - 1, n)], A = S.pts[j], R = S.pts[(j + 1) % n];
    if (G.dist(L, A) > 0.55 * S.te || G.dist(A, R) > 0.55 * S.te) return false;
    if (!K.removeClear(S.pts, j, delta, opt.nearArc)) return false;
    const mid = G.lerp(L, R, 0.5);
    // 先移到中点（可能引发 R-移动，走正常通道），此时删点就是恒等操作
    commitChange((v) => { S.pts[j] = v.slice(); }, A.slice(), mid, G.lerp,
      (a, b) => ({ k: 'm', i: j, from: a.slice(), to: b.slice() }), 'isotopy', 0);
    const p = S.pts[j].slice();
    S.pts.splice(j, 1);
    S.rec.push({ k: 'del', at: j, p: p, ev: null });
    refreshDiagram();
    return true;
  }

  /* ---- 自适应重采样：返回可能移位后的索引 ---- */
  function maintainAround(i, delta, opt) {
    if (!S.adapt) return i;
    let n = S.pts.length;
    for (let d = -2; d <= 1; d++) {
      if (n >= 190) break;
      const j = mod(i + d, n);
      const a = S.pts[j], b = S.pts[(j + 1) % n];
      if (G.dist(a, b) > 1.8 * S.te) {
        insertVertex(j + 1, G.lerp(a, b, 0.5));
        n = S.pts.length;
        if (j + 1 <= i) i++;
      }
    }
    for (let d = -1; d <= 1; d++) {
      if (n <= 28) break;
      const j = mod(i + d, n);
      if (j === i) continue;
      if (tryDecimate(j, delta, opt)) { n = S.pts.length; if (j < i) i--; }
    }
    return mod(i, S.pts.length);
  }

  function flashBlocked() {
    const el = $('blocked');
    el.classList.add('show');
    clearTimeout(flashBlocked._t);
    flashBlocked._t = setTimeout(() => el.classList.remove('show'), 500);
  }

  /* ================= 视角 ================= */

  function setCamera(yaw, pitch) {
    pitch = G.clamp(pitch, -1.45, 1.45);
    if (Math.abs(yaw - S.cam.yaw) < 1e-6 && Math.abs(pitch - S.cam.pitch) < 1e-6) return;
    const from = { yaw: S.cam.yaw, pitch: S.cam.pitch };
    const to = { yaw: yaw, pitch: pitch };
    commitChange(
      (v) => { S.cam.yaw = v.yaw; S.cam.pitch = v.pitch; },
      from, to,
      (a, b, t) => ({ yaw: a.yaw + (b.yaw - a.yaw) * t, pitch: a.pitch + (b.pitch - a.pitch) * t }),
      (a, b) => ({ k: 'cam', from: { yaw: a.yaw, pitch: a.pitch }, to: { yaw: b.yaw, pitch: b.pitch } }),
      'view', 0);
  }

  /* ================= 打乱（离线版，用于生成缠绕的平凡结） ================= */

  function tangleRaw(pts, steps, seed, targetN) {
    const rnd = LIB.rng(seed);
    for (let s = 0; s < steps; s++) {
      const te = K.totalLength(pts) / targetN;
      const delta = 0.12 * te, opt = { minEdge: 0.30 * te, minAngle: 0.04 };
      const i = Math.floor(rnd() * pts.length) % pts.length;
      const dir = G.norm([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
      const target = G.add(pts[i], G.mul(dir, te * (0.8 + 2.4 * rnd())));
      const f = K.maxSafeFrac(pts, i, target, delta, opt);
      if (f > 0.05) pts[i] = G.lerp(pts[i], target, f);
      if (s % 5 === 0) resampleRaw(pts, te, delta);
    }
    resampleRaw(pts, K.totalLength(pts) / targetN, 0.12 * K.totalLength(pts) / targetN);
    return pts;
  }

  function resampleRaw(pts, te, delta) {
    for (let j = 0; j < pts.length && pts.length < 220; j++) {
      const a = pts[j], b = pts[(j + 1) % pts.length];
      if (G.dist(a, b) > 1.8 * te) { pts.splice(j + 1, 0, G.lerp(a, b, 0.5)); j++; }
    }
    for (let j = pts.length - 1; j >= 0 && pts.length > 30; j--) {
      const n = pts.length;
      const L = pts[mod(j - 1, n)], A = pts[j], R = pts[(j + 1) % n];
      if (G.dist(L, A) > 0.55 * te || G.dist(A, R) > 0.55 * te) continue;
      if (!K.removeClear(pts, j, delta)) continue;
      pts.splice(j, 1);
    }
  }

  /* ================= 加载纽结 ================= */

  function loadEntry(entry) {
    S.entry = entry;
    S.targetN = G.clamp(parseInt($('npts').value, 10) || 84, 40, 180);
    const pts = LIB.build(entry, S.targetN, (p, steps, seed) => tangleRaw(p, steps, seed, S.targetN));
    setPts(pts);

    // 依据初始最小间距挑一个不会一上来就把自己卡死的 δ
    S.deltaScale = 0.12;
    updateScales(true);
    S.deltaScale = Math.min(0.12, (0.35 * S.sep) / S.te);
    updateScales(true);

    S.tracker = new DG.Tracker();
    S.D = computeD();
    S.tracker.fresh(S.D);
    S.rec.reset(S.pts, S.cam);
    S.counts = { R1: 0, R2: 0, R3: 0, multi: 0 };
    S.flash = null;
    S.alexRef = null; S.alexKey = ''; S.alex = null;
    S.autoSim = false; S.autoTangle = false; S.playing = false; S.sim = null;
    $('btnSimplify').classList.remove('on');
    $('btnTangle').classList.remove('on');
    $('btnPlay').textContent = '▶ 回放';
    S.fit3 = null; S.fit2 = null;
    S.cam.zoom = 1; S.cam.panx = 0; S.cam.pany = 0;
    computeAlex(true);
    S.dirtyUI = true;
  }

  /* ================= Alexander 多项式 ================= */

  let alexTimer = null;
  function computeAlex(force) {
    const key = DG.symbols(S.D).map((s) => s.c + (s.o ? 'o' : 'u')).join(',');
    if (key === S.alexKey && !force) return;
    S.alexKey = key;
    clearTimeout(alexTimer);
    alexTimer = setTimeout(() => {
      const r = AX.compute(S.D, 80);
      S.alex = r;
      if (r.ok && !S.alexRef) S.alexRef = r.coeffs;
      S.dirtyUI = true;
    }, force ? 0 : 240);
  }

  /* ================= 回放 ================= */

  function seekTo(k) {
    S.rec.seek(k, S);
    updateScales(true);
    S.tracker = new DG.Tracker();
    S.D = computeD();
    S.tracker.fresh(S.D);
    recountUpTo(S.rec.cursor);
    S.dirtyUI = true;
  }

  function recountUpTo(k) {
    S.counts = { R1: 0, R2: 0, R3: 0, multi: 0 };
    for (let i = 0; i < k; i++) {
      const ev = S.rec.ops[i].ev;
      if (!ev) continue;
      const b = bucketOf(ev.kind);
      if (S.counts[b] !== undefined) S.counts[b]++;
    }
  }

  function playbackTick(dt) {
    const ops = S.rec.ops;
    if (S.rec.cursor >= ops.length) { stopPlay(); return; }
    if (S.speed === 'step') {
      S.playAcc += dt;
      if (S.playAcc > 100) { S.playAcc = 0; seekTo(S.rec.cursor + 1); }
    } else {
      S.playT += dt * Number(S.speed);
      let k = S.rec.cursor;
      while (k < ops.length && ops[k].t <= S.playT) k++;
      if (k !== S.rec.cursor) seekTo(k);
      else if (S.rec.cursor < ops.length && S.playT > ops[ops.length - 1].t) seekTo(ops.length);
    }
  }

  function startPlay() {
    if (!S.rec.ops.length) return;
    S.autoSim = S.autoTangle = false;
    $('btnSimplify').classList.remove('on');
    $('btnTangle').classList.remove('on');
    if (S.rec.cursor >= S.rec.ops.length) { seekTo(0); }
    S.playT = S.rec.cursor > 0 ? S.rec.ops[S.rec.cursor - 1].t : 0;
    S.playing = true;
    $('btnPlay').textContent = '⏸ 暂停';
  }
  function stopPlay() { S.playing = false; $('btnPlay').textContent = '▶ 回放'; S.dirtyUI = true; }

  /* ================= 自动简化 =================
   *
   * 从前这里是一个纯粹的 Laplacian 曲线缩短流：每个顶点往邻居中点挪。
   * 它有两个绕不过去的毛病 ——
   *
   *  · 打了结的曲线在缩短流下不可能变圆，结必须被抽紧；挡住两股互穿的只有
   *    余量 δ，而 δ 又随实测最小间距一起变小（见 updateScales），于是间距按
   *    几何级数往下掉，一路掉到 0.01·te 的地板。拓扑仍然安全，但 1% 条边长
   *    在屏幕上就是零 —— 投影出来是一个没有断口的四叉点。
   *  · 笔直的双股是 Laplacian 的**不动点**（中点就是自己）；折回的针尖想缩
   *    回去，扫掠三角形必须穿过两股之间那条只剩 δ 宽的缝，一定被否。于是
   *    针状部分冻死，只有结那一团继续缩，看上去就是一条腿跑到天边。
   *
   * 现在改成「收紧 — 充气」交替，和 lift.html 那边的 relax.js 同一套思路：
   *   收紧：只平滑，δ 随间距变小，让两股贴着彼此滑过去，多余的圈脱开；
   *   充气：平滑 + 排斥，δ 与实测间距脱钩（不再被自己一步步吃掉），
   *         把压扁的股重新撑开，并在每圈末尾把周长归一化 ——
   *         排斥力于是去改形状，而不是把整条曲线撑大。
   * 充气正是解冻针尖的那一步：两股被推开之后，下一轮收紧才缩得回去。
   *
   * 与 relax.js 的区别只在通道：这里每一次顶点移动都走 commitChange，
   * R-移动照常识别、计数、录进磁带。两处 relax.js 用快照做的事换了做法 ——
   * 整体放缩记成一条 scale 操作（相似变换，图解组合结构不变），
   * 「回到最好的构形」直接 seek 回磁带上的那一步，不需要另存快照。 */

  /* 分工：**收紧负责减交叉，充气负责把结果撑得看得清**。
   *
   * 这一点是试出来的。一度让「粗细掉到某个值」去触发转充气，结果打乱得厉害的
   * 构形一上来就比那个值还薄，收紧根本没机会跑；而充气面对三百个交叉的一团乱麻
   * 是撑不开的 —— 那里的排斥力几乎是径向的，分不开具体贴在一起的两股，反而跟着
   * 平滑一起把曲线揉塌（实测粗细从 0.025 掉到 0.003）。
   *
   * 所以收紧一直跑到**交叉数不再减少**为止，中途薄下去是过程、不是故障
   * （交出去的是留底的那一帧，不是最后一帧）；轮到充气时交叉已经不多，撑得开。 */
  const SIM = {
    tightenSweeps: 60,     // 一轮收紧最多扫几圈（兜底上限）
    inflateSweeps: 40,     // 一轮充气最多扫几圈
    minPhase: 8,           // 一轮充气至少扫几圈（防相位乒乓，见 endSweep）
    maxSweeps: 900,
    patience: 120,         // 连着这些圈没刷新留底就收手
    spread: 1.0,           // 排斥强度（相对边长）
    crossStall: 12,        // 收紧连着这些圈没减交叉，就转去充气
    fatAt: 0.9,            // 撑到这里就够了，转回收紧
    thickFloor: 0.25       // 低于这个粗细的构形不算「拿得出手」，见 better()
  };

  function newSim() {
    updateScales(true);
    const te = S.te || 1;
    const sm = {
      idx: 0, acc: 0, sweeps: 0,
      phase: 'tighten', phaseSweeps: 0, phaseLen: 0, jitter: 0,
      lastLen: K.totalLength(S.pts), lastShape: 0, stall: 0,
      sinceBest: 0,
      // 抖动用定种随机而不是 Math.random：同一个构形按两次「自动简化」应当走出
      // 同一条路。回放本来就忠实（磁带记的是绝对坐标），但可复现才好排查。
      rnd: LIB.rng(0x9e3779b9),
      gap: K.farSep(S.pts, 1.5 * S.te) / te,
      thick: K.farSep(S.pts, 6 * S.te) / te,
      bestCross: Infinity, bestThick: -1, bestCursor: -1
    };
    sm.lastCross = S.D.crossings.length;
    sm.crossStall = 0;
    return sm;
  }

  /* 简化时的形状约束：折角下限提到 ≈20°（手工拖动用的 0.04 只是拦住彻底对折），
   * 并按**弧长**划一个自身邻域 —— 邻域之内只做精确相交判定，之外一律留足 δ。
   * 没有这一条，近邻天然的贴合会把全局最小间距一直压在地板上，于是相距几十条
   * 边长的两股也能被一路蹭到一起。 */
  function simOpt() { return { minEdge: 0.30 * S.te, minAngle: 0.35, nearArc: 1.5 * S.te }; }

  /* 回转半径：周长被归一化钉住之后，用它判断「形状还在不在变」，且只要 O(n) */
  function shapeRadius() {
    const c = K.centroid(S.pts);
    let s = 0;
    for (const p of S.pts) s += G.dist2(p, c);
    return Math.sqrt(s / S.pts.length);
  }

  /* 绕定点整体放缩。相似变换 ⇒ 图解只是跟着缩放，组合结构一点没变，
   * 所以不走 commitChange（那里是给可能引发 R-移动的形变准备的），
   * 而是作为一整条 scale 操作记进磁带。 */
  function scaleAll(c, s) {
    for (const p of S.pts) {
      p[0] = c[0] + (p[0] - c[0]) * s;
      p[1] = c[1] + (p[1] - c[1]) * s;
      p[2] = c[2] + (p[2] - c[2]) * s;
    }
    S.rec.push({ k: 'scale', c: c.slice(), s: s, ev: null });
    refreshDiagram();
  }

  function normalizeLength(L0) {
    const len = K.totalLength(S.pts);
    if (!(len > 0) || !(L0 > 0)) return;
    const s = L0 / len;
    if (Math.abs(s - 1) < 1e-9) return;
    scaleAll(K.centroid(S.pts), s);
  }

  /* 排斥方向：1/r² 的力，只取方向。skip 按下标排除近邻即可 —— 这里的折线
   * 由自适应重采样维持得相当均匀，不像提升出来的那样疏密相差百倍。 */
  function repelDir(i, skip) {
    const n = S.pts.length, A = S.pts[i];
    let fx = 0, fy = 0, fz = 0;
    for (let j = 0; j < n; j++) {
      const dd = Math.abs(i - j);
      if (Math.min(dd, n - dd) <= skip) continue;
      const dx = A[0] - S.pts[j][0], dy = A[1] - S.pts[j][1], dz = A[2] - S.pts[j][2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < 1e-18) continue;
      const inv = 1 / (r2 * Math.sqrt(r2));
      fx += dx * inv; fy += dy * inv; fz += dz * inv;
    }
    const l = Math.hypot(fx, fy, fz);
    if (!(l > 0)) return null;
    return [fx / l, fy / l, fz / l];
  }

  function simplifyTick() {
    if (!S.sim) S.sim = newSim();          // 控制台里直接调也能用
    const sm = S.sim;
    const inflate = sm.phase === 'inflate';
    const opt = simOpt();
    // 充气的 δ 与实测最小间距**脱钩**（否则间距会被自己一步步吃掉），但也绝不
    // 索取比现有间距更多的余量 —— 那会把整条曲线冻死在最薄的状态上。
    const delta = inflate
      ? Math.max(Math.min(0.05, 0.5 * sm.gap) * S.te, 1e-12)
      : S.delta;
    const per = Math.max(3, Math.round(S.pts.length / 8));
    for (let c = 0; c < per; c++) {
      const n = S.pts.length;
      if (n < 12) break;
      const i = mod(sm.idx, n);
      const L = S.pts[mod(i - 1, n)], A = S.pts[i], R = S.pts[(i + 1) % n];
      let target = G.lerp(A, G.lerp(L, R, 0.5), inflate ? 0.45 : 0.55);

      if (inflate) {
        const f = repelDir(i, 4);
        if (f) target = G.add(target, G.mul(f, SIM.spread * S.te * 0.30));
        // 完全压平的构形里排斥力几乎没有垂直分量，加一点抖动打破这种对称。
        // 抖动同样要过 Δ-move 判定，所以它不会把纽结型改掉。
        if (sm.jitter > 0) {
          const a = sm.rnd() * 2 * Math.PI, u = sm.rnd() * 2 - 1;
          const s = Math.sqrt(1 - u * u);
          target = G.add(target, G.mul([s * Math.cos(a), s * Math.sin(a), u], sm.jitter * S.te));
        }
      }

      moveVertex(i, target, delta, opt);
      maintainAround(i, delta, opt);
      sm.idx++;

      // 顶点数会变，用累计计数判断「走完一圈」，别拿 idx 去取模
      if (++sm.acc >= S.pts.length) { sm.acc = 0; endSweep(); }
      // endSweep 里可能已经收手 —— 它会 seek 回留底的那一帧，本 tick 剩下的
      // 移动是按旧状态算的目标点，接着做下去会当场把恢复出来的构形毁掉。
      if (!S.autoSim) break;
    }
  }

  function endSweep() {
    const sm = S.sim;
    sm.sweeps++; sm.phaseSweeps++;
    // 归一化要排在 updateScales 前面：顺序反了的话 S.te 还是放缩前的边长，
    // 后面所有「以边长为单位」的量都会差一个放缩比 —— 记分记下的粗细
    // 就与日后 seek 回去量到的对不上。
    if (sm.phase === 'inflate') normalizeLength(sm.phaseLen);
    updateScales();
    measure(sm);
    scoreAndKeep();                            // 每圈都参与评选，见 better()
    if (!S.autoSim) return;                    // 记分时可能已经判定该收手了

    if (sm.phase === 'inflate') {
      const sh = shapeRadius();
      const d = Math.abs(sh - sm.lastShape) / (sh || 1);
      sm.lastShape = sh;
      sm.stall = d < 0.0008 ? sm.stall + 1 : 0;
      if (sm.jitter > 0) sm.jitter *= 0.88;
      sm.phaseBest = Math.max(sm.phaseBest, sm.thick);
      // 撑够了就收（别恋战：充气跑久了会开始瞎晃，反而把股蹭到一起），
      // 或者已经比本轮最好的时候薄了一大截 —— 那也是在瞎晃。
      //
      // 但这些判据都要等充气跑满 minPhase 圈才作数。不然会这样：充气第一圈
      // 粗细抖低一点就被判成「瞎晃」踢回收紧，收紧一圈又因为太薄踢回充气，
      // 两个相位以一圈为周期乒乓，patience 的循环计数几下就用完 ——
      // 实测有跑 3 圈就停在 86 个交叉上的。撑开本来就需要连着撑几圈。
      const done = sm.phaseSweeps >= SIM.inflateSweeps ||
        (sm.phaseSweeps >= SIM.minPhase &&
          (sm.thick > SIM.fatAt || sm.thick < 0.5 * sm.phaseBest || sm.stall >= 3));
      if (done) enterPhase('tighten');
    } else {
      // 收紧时任由它缩小、也任由它变薄：整体收缩正是把多余的圈挤出去的那个过程。
      // 什么时候够了？交叉数不再减少的时候 —— 那才说明这一轮收紧使完了劲。
      const nc = S.D.crossings.length;
      if (nc < sm.lastCross) { sm.lastCross = nc; sm.crossStall = 0; } else sm.crossStall++;
      const len = K.totalLength(S.pts);
      const d = Math.abs(len - sm.lastLen) / (len || 1);
      sm.lastLen = len;
      sm.stall = d < 0.0015 ? sm.stall + 1 : 0;
      if (sm.crossStall >= SIM.crossStall || sm.stall >= 3 ||
          sm.phaseSweeps >= SIM.tightenSweeps) enterPhase('inflate');
    }

    // 收手的判据是「多久没找到更好的一帧了」，而不是按循环数计的耐心 ——
    // 后者跟相位长度绑在一起，相位一短就提前把运行掐掉。只要还在刷新留底，
    // 就说明这套流程仍然使得上劲，接着跑。
    if (S.autoSim && (sm.sinceBest > SIM.patience || sm.sweeps > SIM.maxSweeps)) finishSimplify();
  }

  /* 两把尺子，都以边长为单位：
   *   gap  —— 排除近邻的弧长与 opt.nearArc 取齐，量的正是 δ 判定真正管着的
   *           那些边对，只用来给充气时的 δ 封顶；
   *   thick—— 排除 6 条边长，量的是「两股贴没贴到一起」，用于相位切换与记分。
   * 两者各 O(n²)，相对每次移动都要重算一遍的图解可以忽略。 */
  function measure(sm) {
    const te = S.te || 1;
    sm.gap = K.farSep(S.pts, 1.5 * S.te) / te;
    sm.thick = K.farSep(S.pts, 6 * S.te) / te;
  }

  function enterPhase(next) {
    const sm = S.sim;
    if (next === 'tighten') {
      sm.phase = 'tighten'; sm.phaseSweeps = 0; sm.stall = 0;
      sm.lastCross = S.D.crossings.length; sm.crossStall = 0;
    } else {
      enterInflate(sm);
    }
    S.dirtyUI = true;
  }

  function enterInflate(sm) {
    sm.phase = 'inflate'; sm.phaseSweeps = 0; sm.stall = 0; sm.phaseBest = 0;
    sm.phaseLen = K.totalLength(S.pts);      // 本轮充气固定在这个周长上重塑形状
    sm.lastShape = shapeRadius();
    sm.jitter = 0.05;
  }

  /* 每圈记一次分，留下最好的那一刻在**磁带上的位置**（不用另存快照）。
   *
   * 排序：先看粗细够不够 thickFloor，再比交叉数，最后比粗细。
   * 把粗细放在最前面是有道理的 —— 一个 8 交叉但两股贴到 0.03 条边长的构形，
   * 画出来就是几个没有断口的叉点，Alexander 也未必算得对；它不比一个
   * 撑得开的 10 交叉构形更「简」。
   *
   * 但「都不达标时就只比粗细」是不行的（试过）：收紧全过程都在 thickFloor 以下，
   * 那样一来减交叉的进展一概不算数，最后交出去的会是最初那几圈的构形 ——
   * 实测有交出 108 个交叉的。达标的构形一个都没有时，最少交叉仍然是能给的
   * 最好答案。 */
  function better(nc, th, sm) {
    const a = th >= SIM.thickFloor, b = sm.bestThick >= SIM.thickFloor;
    if (a !== b) return a;
    if (nc !== sm.bestCross) return nc < sm.bestCross;
    return th > sm.bestThick;
  }

  function scoreAndKeep() {
    const sm = S.sim, th = sm.thick;
    if (better(S.D.crossings.length, th, sm)) {
      sm.bestCross = S.D.crossings.length; sm.bestThick = th; sm.bestCursor = S.rec.cursor;
      sm.sinceBest = 0;
      S.rec.barrier();     // 钉住这个位置，别让后面的小移动并进上一条把它挪走
    } else sm.sinceBest++;
    // 「太薄了就收手」这条曾经写在这里，试下来是帮倒忙：一个刚被打乱的纽结本来
    // 就只有 0.02 条边长粗，而收紧的头几圈还会先让它更薄 —— 无论判据取绝对值
    // 还是取相对历史最粗，都会在真正开始干活之前把运行掐掉（实测有跑 3 圈就
    // 停在 86 个交叉上的）。
    //
    // 而且它本来就不必要：交出去的构形是 seek 回**留底的那一帧**，不是最后一帧。
    // 中途薄下去只是过程，最终结果由 better() 把关。真正退化到接近机器精度时
    // 才停 —— 那种状态下连留底都不可信了。
    if (th < 0.001) finishSimplify();
  }

  function finishSimplify() {
    const sm = S.sim;
    // 回到「交叉最少、并列时最粗」的那一帧。它是磁带上真实经过的一步，
    // seek 回去当然不改变纽结型；再往下走会自动截断被丢弃的那条尾巴。
    if (sm.bestCursor >= 0 && sm.bestCursor < S.rec.cursor) seekTo(sm.bestCursor);
    S.autoSim = false;
    $('btnSimplify').classList.remove('on');
    S.dirtyUI = true;
  }

  /* ================= 自动打乱 ================= */

  function tangleTick() {
    for (let c = 0; c < 3; c++) {
      const n = S.pts.length;
      const i = Math.floor(Math.random() * n) % n;
      const dir = G.norm([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]);
      const target = G.add(S.pts[i], G.mul(dir, S.te * (1.0 + 2.4 * Math.random())));
      moveVertex(i, target);
      maintainAround(i);
      S.tangleLeft--;
    }
    if (S.tangleLeft <= 0) { S.autoTangle = false; $('btnTangle').classList.remove('on'); }
  }

  /* ================= 绘制 ================= */

  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { w: w, h: h, dpr: dpr };
  }

  function draw(now) {
    // ---- 3D ----
    const cv = $('c3d'), ctx = cv.getContext('2d');
    const m = fitCanvas(cv);
    ctx.clearRect(0, 0, m.w, m.h);
    const f3 = RR.fitBounds(S.D, m.w, m.h, 54 * m.dpr);
    S.fit3 = RR.smoothFit(S.fit3, f3, 0.14);
    S.view3 = RR.viewFromFit(S.fit3, m.w, m.h, S.cam.zoom, S.cam.panx, S.cam.pany);
    S.sp3 = RR.drawKnot(ctx, S.D, S.view3, {
      bg: '#0e131f', width: 7 * m.dpr, gap: 2.6 * m.dpr, shade: true, flat: false,
      showPts: S.showPts, ptRadius: 2.6 * m.dpr, marks: false
    }, { hover: S.hover, drag: S.drag });
    if (S.flash && now < S.flash.until) RR.highlight(ctx, S.view3, S.flash.marks, now);

    // ---- 2D 图解 ----
    const cv2 = $('c2d'), ctx2 = cv2.getContext('2d');
    const m2 = fitCanvas(cv2);
    ctx2.fillStyle = '#f7f8fb';
    ctx2.fillRect(0, 0, m2.w, m2.h);
    const f2 = RR.fitBounds(S.D, m2.w, m2.h, 22 * m2.dpr);
    S.fit2 = RR.smoothFit(S.fit2, f2, 0.16);
    S.view2 = RR.viewFromFit(S.fit2, m2.w, m2.h, 1, 0, 0);
    RR.drawKnot(ctx2, S.D, S.view2, {
      bg: '#f7f8fb', width: 4.2 * m2.dpr, gap: 2.2 * m2.dpr, flat: true,
      showPts: false, ptRadius: 0, marks: true
    }, null);
    if (S.flash && now < S.flash.until) RR.highlight(ctx2, S.view2, S.flash.marks, now);
  }

  /* ================= 界面刷新 ================= */

  /* 间距那一行顺带报出自动简化的状态。「粗细」是相隔 6 条边长以上的两段之间的
   * 最小距离，以边长为单位。
   *
   * 跑完之后如果交出去的那一帧仍然很薄，就据实说 —— 别让它默默画成一个没有
   * 断口的叉点。有些构形确实撑不开（试过在结果上再充一轮气，粗细纹丝不动、
   * 交叉反而涨回去），那时能做的就是把话讲明白，让人自己拖开看。 */
  function simStatus() {
    const sm = S.sim;
    if (!sm) return '';
    if (S.autoSim) {
      return '　' + (sm.phase === 'inflate' ? '充气' : '收紧') + ' ' + sm.sweeps + ' 圈' +
        (sm.thick > 0 ? '　粗细 ' + sm.thick.toFixed(3) : '');
    }
    if (sm.bestThick >= 0 && sm.bestThick < SIM.thickFloor) {
      return '　⚠ 简化后两股仅隔 ' + sm.bestThick.toFixed(3) +
             ' 条边长，图上的叉点没有断口 —— 转个视角或手动拖开再看';
    }
    return '';
  }

  let lastUI = 0;
  function updateUI(now) {
    if (!S.dirtyUI && now - lastUI < 200) return;
    lastUI = now; S.dirtyUI = false;

    $('vCross').textContent = S.D.crossings.length;
    $('vWrithe').textContent = (S.D.writhe > 0 ? '+' : '') + S.D.writhe;
    $('vN').textContent = S.pts.length;
    $('vSep').textContent = (isFinite(S.sep) ? S.sep.toFixed(4) : '–') +
      ' / δ ' + S.delta.toFixed(4) + simStatus();
    $('vGauss').textContent = DG.gaussString(S.D);

    const a = S.alex;
    if (a && a.ok) {
      $('vAlex').textContent = a.text;
      $('vDet').textContent = AX.determinant(a.coeffs);
      const nm = AX.identify(a.coeffs);
      $('vName').textContent = nm || '（不在内置表中）';
      const w = $('invWarn');
      if (S.alexRef && !AX.eq(S.alexRef, a.coeffs)) {
        w.textContent = '⚠ Alexander 多项式发生了变化 —— 这不应该出现，请报告。';
      } else if (S.entry && S.entry.alex && !AX.eq(S.entry.alex, a.coeffs)) {
        w.textContent = 'ℹ 与库中登记的 Δ(t) 不同（可能是镜像或次序差异）。';
      } else { w.textContent = ''; }
    } else if (a && a.reason === 'too-many') {
      $('vAlex').textContent = '交叉点过多（' + a.n + '），已跳过';
      $('vName').textContent = '–'; $('vDet').textContent = '–';
    }

    $('cR1').textContent = S.counts.R1;
    $('cR2').textContent = S.counts.R2;
    $('cR3').textContent = S.counts.R3;

    const tl = $('timeline');
    tl.max = S.rec.ops.length;
    tl.value = S.rec.cursor;
    $('tlLabel').textContent = S.rec.cursor + ' / ' + S.rec.ops.length;

    buildEventList();
  }

  let evSig = '';
  function buildEventList() {
    const evs = S.rec.events();
    const sig = evs.length + ':' + S.rec.cursor;
    if (sig === evSig) return;
    evSig = sig;
    const ul = $('evList');
    if (!evs.length) { ul.innerHTML = '<li class="empty">还没有检测到 Reidemeister 移动。试试拖动一个控制点。</li>'; return; }
    const show = evs.slice(-300);
    const html = show.map((e) => {
      const ev = e.op.ev;
      const cur = e.idx === S.rec.cursor ? ' class="cur"' : '';
      const tag = ev.kind === 'multi' ? '<span class="tag" style="color:#ff8a8a">?</span>'
        : '<span class="tag ' + bucketOf(ev.kind).toLowerCase() + '">' +
          (ev.kind === 'R2t' ? 'R2⇄' : ev.kind) + '</span>';
      return '<li' + cur + ' data-idx="' + e.idx + '">' + tag +
        '<span class="txt">' + RD.label(ev) +
        (ev.cause === 'view' ? ' <span class="cause">· 视角</span>' : '') + '</span>' +
        '<span class="tm">' + (e.op.t / 1000).toFixed(1) + 's</span></li>';
    }).join('');
    ul.innerHTML = html;
    const cur = ul.querySelector('li.cur');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  /* ================= 指针交互 ================= */

  let dragState = null;

  function evtPos(e, cv) {
    const r = cv.getBoundingClientRect();
    const dpr = cv.width / (r.width || 1);
    return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
  }

  function pickVertex(p) {
    if (!S.sp3) return -1;
    const R2 = Math.pow(13 * Math.min(2, window.devicePixelRatio || 1), 2);
    let best = -1, bestZ = -Infinity;
    for (let i = 0; i < S.sp3.length; i++) {
      const dx = S.sp3[i][0] - p[0], dy = S.sp3[i][1] - p[1];
      if (dx * dx + dy * dy > R2) continue;
      if (S.D.Z[i] > bestZ) { bestZ = S.D.Z[i]; best = i; }
    }
    return best;
  }

  function setupPointer() {
    const cv = $('c3d');
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const p = evtPos(e, cv);
      const pick = pickVertex(p);
      const modKey = e.ctrlKey || e.metaKey;
      if (e.button === 0 && pick >= 0 && !modKey) {
        if (S.playing) stopPlay();
        S.drag = pick;
        dragState = { mode: 'vertex', depth: G.dot(S.pts[pick], basis().w), lastY: p[1], shift: e.shiftKey };
      } else {
        dragState = { mode: modKey ? 'pan' : 'orbit', x: p[0], y: p[1] };
      }
    });

    cv.addEventListener('pointermove', (e) => {
      const p = evtPos(e, cv);
      if (!dragState) {
        const h = pickVertex(p);
        if (h !== S.hover) { S.hover = h; cv.style.cursor = h >= 0 ? 'grab' : 'crosshair'; }
        return;
      }
      if (dragState.mode === 'vertex') {
        const b = basis();
        if (e.shiftKey !== dragState.shift) {
          dragState.shift = e.shiftKey;
          dragState.depth = G.dot(S.pts[S.drag], b.w);
          dragState.lastY = p[1];
        }
        let target;
        if (e.shiftKey) {
          const dz = -(p[1] - dragState.lastY) / S.view3.scale;
          dragState.lastY = p[1];
          target = G.add(S.pts[S.drag], G.mul(b.w, dz));
        } else {
          const xy = S.view3.toWorld2(p[0], p[1]);
          target = G.add(G.add(G.mul(b.u, xy[0]), G.mul(b.v, xy[1])), G.mul(b.w, dragState.depth));
        }
        moveVertex(S.drag, target);
        S.drag = maintainAround(S.drag);
        S.hover = S.drag;
      } else if (dragState.mode === 'orbit') {
        const dx = p[0] - dragState.x, dy = p[1] - dragState.y;
        dragState.x = p[0]; dragState.y = p[1];
        setCamera(S.cam.yaw - dx * 0.006, S.cam.pitch + dy * 0.006);
      } else {
        S.cam.panx += p[0] - dragState.x;
        S.cam.pany += p[1] - dragState.y;
        dragState.x = p[0]; dragState.y = p[1];
      }
    });

    const end = () => { dragState = null; S.drag = -1; S.dirtyUI = true; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      S.cam.zoom = G.clamp(S.cam.zoom * Math.exp(-e.deltaY * 0.0012), 0.25, 8);
    }, { passive: false });
  }

  /* ================= 控件 ================= */

  function setupUI() {
    const sel = $('libSel');
    sel.innerHTML = LIB.entries.map((e, i) =>
      '<option value="' + i + '">' + e.name + '　—　' + e.note + '</option>').join('');
    sel.value = '1';
    sel.addEventListener('change', () => loadEntry(LIB.entries[+sel.value]));

    $('btnReset').addEventListener('click', () => loadEntry(LIB.entries[+sel.value]));
    $('npts').addEventListener('change', () => loadEntry(LIB.entries[+sel.value]));

    $('btnTangle').addEventListener('click', () => {
      S.autoTangle = !S.autoTangle;
      if (S.autoTangle) { S.tangleLeft = 240; S.autoSim = false; $('btnSimplify').classList.remove('on'); stopPlay(); }
      $('btnTangle').classList.toggle('on', S.autoTangle);
    });

    $('btnSimplify').addEventListener('click', () => {
      S.autoSim = !S.autoSim;
      if (S.autoSim) {
        S.sim = newSim();
        S.autoTangle = false; $('btnTangle').classList.remove('on'); stopPlay();
      }
      $('btnSimplify').classList.toggle('on', S.autoSim);
    });

    $('ckPts').addEventListener('change', (e) => { S.showPts = e.target.checked; });
    $('ckAdapt').addEventListener('change', (e) => { S.adapt = e.target.checked; });
    $('ckViewEv').addEventListener('change', (e) => { S.logViewEv = e.target.checked; });

    $('btnPlay').addEventListener('click', () => { S.playing ? stopPlay() : startPlay(); });
    $('btnStepFwd').addEventListener('click', () => { stopPlay(); seekTo(S.rec.cursor + 1); });
    $('btnStepBack').addEventListener('click', () => { stopPlay(); seekTo(S.rec.cursor - 1); });
    $('btnNextEv').addEventListener('click', () => { stopPlay(); jumpEvent(1); });
    $('btnPrevEv').addEventListener('click', () => { stopPlay(); jumpEvent(-1); });
    $('speed').addEventListener('change', (e) => { S.speed = e.target.value; });

    $('timeline').addEventListener('input', (e) => { stopPlay(); seekTo(+e.target.value); });

    $('evList').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-idx]');
      if (!li) return;
      stopPlay(); seekTo(+li.dataset.idx);
    });

    $('btnExport').addEventListener('click', () => {
      const blob = new Blob([S.rec.toJSON({ knot: S.entry ? S.entry.id : '?', name: S.entry ? S.entry.name : '' })],
        { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'isotopy-' + (S.entry ? S.entry.id : 'knot') + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    });

    $('btnImport').addEventListener('click', () => $('fileIn').click());
    $('fileIn').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          S.rec.fromJSON(r.result);
          S.rec.restart(S);
          S.entry = null;
          updateScales();
          S.tracker = new DG.Tracker();
          S.D = computeD(); S.tracker.fresh(S.D);
          S.alexRef = null; S.alexKey = ''; computeAlex(true);
          S.fit3 = S.fit2 = null; evSig = '';
          seekTo(0);
        } catch (err) { alert('导入失败：' + err.message); }
      };
      r.readAsText(f);
      e.target.value = '';
    });

    $('btnHelp').addEventListener('click', () => $('help').hidden = false);
    $('helpClose').addEventListener('click', () => $('help').hidden = true);

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault(); stopPlay(); seekTo(S.rec.cursor - 1);
      } else if (e.key === ' ') {
        e.preventDefault(); S.playing ? stopPlay() : startPlay();
      } else if (e.key === 'Escape') { $('help').hidden = true; }
    });
  }

  function jumpEvent(dir) {
    const ops = S.rec.ops;
    let k = S.rec.cursor;
    if (dir > 0) { for (let i = k; i < ops.length; i++) if (ops[i].ev) { seekTo(i + 1); return; } seekTo(ops.length); }
    else { for (let i = k - 2; i >= 0; i--) if (ops[i].ev) { seekTo(i + 1); return; } seekTo(0); }
  }

  /* ================= 主循环 ================= */

  let lastNow = performance.now();
  function frame(now) {
    const dt = Math.min(64, now - lastNow); lastNow = now;
    if (S.playing) playbackTick(dt);
    else if (S.autoSim) simplifyTick();
    else if (S.autoTangle) tangleTick();
    updateScales();
    computeAlex(false);
    draw(now);
    updateUI(now);
    requestAnimationFrame(frame);
  }

  /* ================= 启动 ================= */

  // 调试入口：页面不可见时 rAF 会被节流，可用它手动推进
  S.dev = { simplify: simplifyTick, tangle: tangleTick, move: moveVertex,
            maintain: maintainAround, seek: seekTo, load: loadEntry, camera: setCamera };

  /* 从「从投影图还原纽结」那一页交接过来的纽结（lift.html 写进 localStorage） */
  function loadHandoff() {
    if (new URLSearchParams(location.search).get('from') !== 'lift') return false;
    const txt = localStorage.getItem('knot-handoff');
    if (!txt) return false;
    localStorage.removeItem('knot-handoff');
    try {
      S.rec.fromJSON(txt);
      S.rec.restart(S);
      S.entry = null;
      S.targetN = G.clamp(S.pts.length, 40, 180);
      $('npts').value = S.targetN;
      $('libSel').selectedIndex = -1;      // 这条纽结不来自库，别显示成库里的条目
      S.deltaScale = 0.12;
      updateScales(true);
      S.deltaScale = Math.min(0.12, (0.35 * S.sep) / S.te);
      updateScales(true);
      S.tracker = new DG.Tracker();
      S.D = computeD(); S.tracker.fresh(S.D);
      S.counts = { R1: 0, R2: 0, R3: 0, multi: 0 };
      S.alexRef = null; S.alexKey = ''; computeAlex(true);
      S.fit3 = S.fit2 = null; evSig = '';
      return true;
    } catch (err) {
      console.warn('交接失败：', err);
      return false;
    }
  }

  setupUI();
  setupPointer();
  if (!loadHandoff()) loadEntry(LIB.entries[1]);   // 默认：三叶结
  requestAnimationFrame(frame);

  /* 控制台自检：逐个加载库条目，核对 Alexander 多项式 */
  window.verifyLibrary = function () {
    const out = [];
    const savedCam = { yaw: S.cam.yaw, pitch: S.cam.pitch };
    for (const e of LIB.entries) {
      const pts = LIB.build(e, 84, (p, st, sd) => tangleRaw(p, st, sd, 84));
      const sep = K.minSeparation(pts);
      const d = DG.compute(pts, DG.basis(0.75, 0.42));
      const tr = new DG.Tracker(); tr.fresh(d);
      const a = AX.compute(d, 30);
      out.push({
        id: e.id, 交叉点: d.crossings.length, 最小间距: +sep.toFixed(4),
        Δ: a.ok ? a.coeffs.join(',') : a.reason,
        期望: e.alex.join(','),
        符合: a.ok && (AX.eq(a.coeffs, e.alex) || AX.eq(a.coeffs.slice().reverse(), e.alex)),
        识别: a.ok ? AX.identify(a.coeffs) : null
      });
    }
    S.cam.yaw = savedCam.yaw; S.cam.pitch = savedCam.pitch;
    console.table(out);
    return out;
  };
})();
