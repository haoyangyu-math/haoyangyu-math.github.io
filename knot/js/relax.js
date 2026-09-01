/* relax.js —— 三维松弛：把压扁的提升鼓成一个像样的纽结
 *
 * 提升出来的折线是数学上正确的，但它几乎是平的（除了交叉点附近那几个凸包），
 * 看不出立体感。这里让它自己舒展开：
 *   · 平滑力 —— 往相邻两点的中点靠，缩短、拉直；
 *   · 排斥力 —— 离非邻近的顶点远一点，把叠在一起的股撑开。
 *
 * 每一次顶点移动都过 KNOT.maxSafeFrac 的 Δ-move 判定，删点都过 KNOT.removeClear，
 * 所以整个过程是环境同痕：**纽结型不变**。松弛只会让它变好看，不会把结解开，
 * 也不会把结系上。
 *
 * 关于安全余量 δ ——
 * index.html 那边把 δ 取成「当前最小间距」的一个比例。那样做在一个本来就舒展的
 * 纽结上没问题，但在这里会塌掉：提升出来的构形几乎是平的，最小间距只有边长的
 * 万分之几，而一步移动又恰恰允许把间距吃到 δ，于是间距按几何级数往下掉，
 * 几十步就归零 —— 那时两股就真的穿过去了。更糟的是最小间距是**全局**的：
 * 曲线上任何一处贴得太近，都会把整条曲线的余量一起拖垮。
 *
 * 所以**充气**时的 δ 干脆只由边长定，与当前间距无关：δ = 0.05·te。
 * 于是每一步之后，所有（非豁免的）边对之间都至少隔着 0.05 条边长，间距再也
 * 不会被自己吃掉。代价是本来就比 δ 贴得更近的那几段会就地冻住 —— Δ-move
 * 判定会一直否掉它们 —— 但那是安全的一侧，而且曲线其余部分照常松弛。
 *
 * **收紧**则相反，仍旧沿用 index.html 的做法让 δ 随间距一起变小：那正是两股
 * 贴着彼此滑过去、多余的圈得以脱开的机制，没有它平凡结就解不开。
 *
 * 至于「有没有出事」，靠的不是几何代理量而是 Alexander 多项式：它在整个松弛
 * 过程中都不该变，liftapp 每隔几百毫秒现算一次去核对。
 */
(function (global) {
  'use strict';
  const G = global.GEO, K = global.KNOT;
  const R = {};
  const mod = (a, n) => ((a % n) + n) % n;

  R.make = function (pts, targetN) {
    const st = {
      pts: pts, targetN: targetN || 110,
      minN: 24, maxN: 260,
      idx: 0, acc: 0, sweeps: 0, len0: 0, lastLen: 0, lastShape: 0, stall: 0,
      te: 1, delta: 1e-6, opt: null,
      tighten: false, sep: Infinity, sepCounter: 0, jitter: 0,
      best: null, bestScore: -1
    };
    R.updateScales(st);
    st.len0 = st.lastLen = K.totalLength(st.pts);
    st.lastShape = R.shape(st.pts);
    return st;
  };

  /* 形状尺度（回转半径）。周长被 normalize 钉住之后，它是判断「还在不在变」
   * 的可用信号，而且只要 O(n)。 */
  R.shape = function (pts) {
    const c = K.centroid(pts);
    let s = 0;
    for (const p of pts) s += G.dist2(p, c);
    return Math.sqrt(s / pts.length);
  };

  /* 绕质心整体缩放到指定周长。相似变换是 ℝ³ 的微分同胚，
   * 纽结型当然不变，不需要任何判定。
   * 有了它，排斥力就不再是「把整条曲线撑大」而是「在固定周长下把股撑开」——
   * 压扁的构形在这个意义下很差，于是它会自己鼓成立体的。 */
  R.normalize = function (st, L0) {
    const len = K.totalLength(st.pts);
    if (!(len > 0) || !(L0 > 0)) return;
    const s = L0 / len;
    if (Math.abs(s - 1) < 1e-9) return;
    const c = K.centroid(st.pts);
    for (const p of st.pts) {
      p[0] = c[0] + (p[0] - c[0]) * s;
      p[1] = c[1] + (p[1] - c[1]) * s;
      p[2] = c[2] + (p[2] - c[2]) * s;
    }
  };

  R.updateScales = function (st) {
    st.te = K.totalLength(st.pts) / st.targetN;
    if (st.tighten) {
      // 收紧用的是 index.html 那一套：余量随当前最小间距一起变小，
      // 两股才能贴着彼此滑过去 —— 这正是多余的圈得以脱开的机制。
      if (--st.sepCounter <= 0) { st.sepCounter = 12; st.sep = K.minSeparation(st.pts); }
      let d = 0.12 * st.te;
      if (isFinite(st.sep)) d = Math.min(d, 0.6 * st.sep);
      st.delta = Math.max(d, 1e-12);
    } else {
      st.delta = Math.max(0.05 * st.te, 1e-12);
    }
    // minAngle 取 0.35（≈20°）而不是 index.html 的 0.04：那边只要挡住折线彻底
    // 对折，这里还想让松弛出来的曲线看着是光滑的。
    // nearArc：沿曲线 1.5 条边长以内算「自身邻域」，那里只查相交、不查余量。
    // 提升出来的折线取样疏密相差百倍，没有这一条就只能把删点的余量调到近零，
    // 而那等于放任曲线无余量地朝别处挪。
    st.opt = { minEdge: 0.30 * st.te, minAngle: 0.35, nearArc: 1.5 * st.te };
  };

  /* 「粗细」：沿曲线相隔 6 条边长以上的两段之间的最小距离。
   * 排除近邻要按弧长，不能按下标 —— 提升出来的折线取样疏密相差百倍。
   * 实现在 knot.js，index.html 那边的自动简化也要用同一个量。 */
  R.farSep = K.farSep;

  /* 充气是个启发式的美化过程，跑久了会把相距很远的两股慢慢蹭到一起
   * （每一步都过了 Δ-move 判定，纽结型不变，但两股贴到万分之一条边长，
   * 投影出来就是一个没有断口的四叉点）。所以一边跑一边记分：
   * 每隔几圈量一次「粗细」，把**最好的那个构形**留底，收敛时取回它。
   * 留底的构形是刚刚真实经过的状态，取回它当然不改变纽结型。 */
  function scoreAndKeep(st) {
    const s = R.farSep(st.pts, 6 * st.te) / (st.te || 1);
    if (s > st.bestScore) {
      st.bestScore = s;
      st.best = st.pts.map((p) => p.slice());
    }
    return s;
  }

  /* 这条纽结上有没有「两股贴到一起」的地方。
   * 平面曲线本来就有近乎相切的两段时，提升出来就是这样，松弛也拉不开 ——
   * 画出来会是一个没有断口的四叉点。据实报出来，别假装没事。 */
  R.isThin = function (st) { return st.bestScore >= 0 && st.bestScore < 0.06; };

  R.restoreBest = function (st) {
    if (!st.best) return false;
    st.pts.length = 0;
    for (const p of st.best) st.pts.push(p.slice());
    R.updateScales(st);
    return true;
  };

  /* 「碎屑」顶点：两条邻边里有一条短得不成比例。
   * 一般的删点要求两条邻边都短，于是取样密集区的**边界**顶点会被漏掉
   * （它一侧是 0.002 条边长的碎边、另一侧是正常边）。这里放它进来试一次；
   * 能不能删仍旧由 removeClear 说了算，删不掉就留着 —— 留着只是不好看，
   * 松弛本身的余量 δ 只由边长定，不受这些碎边影响。 */
  function sliver(st, L, A, Rp) {
    return Math.min(G.dist(L, A), G.dist(A, Rp)) < 0.08 * st.te;
  }

  /* ---------- 抽稀 ----------
   * 提升出来的折线在交叉点附近取样很密，边长远小于 opt.minEdge，
   * 这会让 shapeOK 直接否掉一切移动。所以松弛之前必须先抽到均匀。 */
  R.decimateTo = function (st, target) {
    let guard = 0;
    while (st.pts.length > target && guard++ < 60) {
      let removed = 0;
      for (let j = st.pts.length - 1; j >= 0; j--) {
        if (st.pts.length <= Math.max(st.minN, target)) break;
        const n = st.pts.length;
        const L = st.pts[mod(j - 1, n)], A = st.pts[j], Rp = st.pts[(j + 1) % n];
        if (!sliver(st, L, A, Rp) && G.dist(L, A) + G.dist(A, Rp) > 1.3 * st.te) continue;
        if (!K.removeClear(st.pts, j, st.delta, st.opt.nearArc)) continue;
        st.pts.splice(j, 1);                 // removeClear 通过 ⇒ 删除本身就是一次 Δ-move
        removed++;
      }
      if (!removed) break;
      R.updateScales(st);
    }
    return st.pts.length;
  };

  /* ---------- 排斥方向 ---------- */
  function repelDir(pts, i, skip) {
    const n = pts.length, A = pts[i];
    let fx = 0, fy = 0, fz = 0;
    for (let j = 0; j < n; j++) {
      const dd = Math.abs(i - j);
      if (Math.min(dd, n - dd) <= skip) continue;
      const dx = A[0] - pts[j][0], dy = A[1] - pts[j][1], dz = A[2] - pts[j][2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < 1e-18) continue;
      const inv = 1 / (r2 * Math.sqrt(r2));      // 1/r² 的力，方向单位化
      fx += dx * inv; fy += dy * inv; fz += dz * inv;
    }
    const l = Math.hypot(fx, fy, fz);
    if (!(l > 0)) return null;
    return [fx / l, fy / l, fz / l];
  }

  /* ---------- 一小段松弛 ----------
   * spread = 0：只平滑（收缩拉直，用来自动简化）
   * spread > 0：平滑 + 排斥（充气） */
  R.step = function (st, spread, budget) {
    const tighten = !(spread > 0);
    if (st.tighten !== tighten) { st.tighten = tighten; st.sepCounter = 0; R.updateScales(st); }
    const per = budget || Math.max(6, Math.round(st.pts.length / 5));
    for (let c = 0; c < per; c++) {
      const n = st.pts.length;
      if (n < 12) break;
      const i = mod(st.idx, n);
      const L = st.pts[mod(i - 1, n)], A = st.pts[i], Rp = st.pts[(i + 1) % n];

      let target = G.lerp(A, G.lerp(L, Rp, 0.5), spread > 0 ? 0.45 : 0.55);

      if (spread > 0) {
        const f = repelDir(st.pts, i, 4);
        if (f) target = G.add(target, G.mul(f, spread * st.te * 0.30));
        // 完全平放的构形里排斥力几乎没有竖直分量，加一点抖动打破这种对称，
        // 否则煎饼只会在平面里越摊越大。抖动同样要过 Δ-move 判定。
        if (st.jitter > 0) {
          const a = Math.random() * 2 * Math.PI, u = Math.random() * 2 - 1;
          const s = Math.sqrt(1 - u * u);
          target = G.add(target, G.mul([s * Math.cos(a), s * Math.sin(a), u], st.jitter * st.te));
        }
      }

      const fr = K.maxSafeFrac(st.pts, i, target, st.delta, st.opt);
      if (fr > 0.02) st.pts[i] = G.lerp(A, target, fr);
      R.maintain(st, i);
      st.idx++;

      // 顶点数会变，用累计计数判断「走完一圈」，别拿 idx 去取模
      if (++st.acc >= st.pts.length) { st.acc = 0; endSweep(st, spread); }
    }
    return st.stall >= 4 || st.sweeps > 900;      // 收敛（或够久了）
  };

  function endSweep(st, spread) {
    st.sweeps++;
    R.updateScales(st);
    if (spread > 0) {
      // 充气时把周长缩回 len0，排斥力于是去改形状而不是把整条曲线撑大。
      // 相似变换不改变纽结型，这一步不需要任何判定。
      R.normalize(st, st.len0);
      const sh = R.shape(st.pts);                 // 周长已被钉住，看形状还在不在变
      const d = Math.abs(sh - st.lastShape) / (sh || 1);
      st.lastShape = sh;
      st.stall = d < 0.0008 ? st.stall + 1 : 0;
      if (st.jitter > 0) st.jitter = st.sweeps > 25 ? 0 : st.jitter * 0.93;
      if (st.sweeps % 4 === 0) {
        const s = scoreAndKeep(st);
        // 薄到这个程度必须收手：此时 segTriHit 已经在数值上不可靠，
        // 再跑下去真的会把纽结型跑变（实测 300 圈之后 Δ(t) 变过）。
        if (s < 0.02) st.stall = 99;
        // 或者已经比最好的时候薄了一大截 —— 再跑也只会更糟
        else if (st.bestScore > 0.05 && s < 0.4 * st.bestScore) st.stall = 99;
      }
    } else {
      // 收紧时任由它缩小：整体收缩正是把多余的圈挤出去的那个过程
      const len = K.totalLength(st.pts);
      const d = Math.abs(len - st.lastLen) / (len || 1);
      st.lastLen = len;
      st.stall = d < 0.0015 ? st.stall + 1 : 0;
    }
  }

  /* 自适应重采样：返回可能移位后的索引 */
  R.maintain = function (st, i) {
    let n = st.pts.length;
    for (let d = -2; d <= 1; d++) {
      if (n >= st.maxN) break;
      const j = mod(i + d, n);
      const a = st.pts[j], b = st.pts[(j + 1) % n];
      if (G.dist(a, b) > 1.8 * st.te) {
        st.pts.splice(j + 1, 0, G.lerp(a, b, 0.5));   // 取在边上，几何上是恒等
        n = st.pts.length;
        if (j + 1 <= i) i++;
      }
    }
    for (let d = -1; d <= 1; d++) {
      if (n <= st.minN) break;
      const j = mod(i + d, n);
      if (j === i) continue;
      const L = st.pts[mod(j - 1, n)], A = st.pts[j], Rp = st.pts[(j + 1) % n];
      if (!sliver(st, L, A, Rp) &&
          (G.dist(L, A) > 0.55 * st.te || G.dist(A, Rp) > 0.55 * st.te)) continue;
      if (!K.removeClear(st.pts, j, st.delta, st.opt.nearArc)) continue;
      st.pts.splice(j, 1);
      n = st.pts.length;
      if (j < i) i--;
    }
    return mod(i, st.pts.length);
  };

  global.RELAX = R;
})(window);
