/* knot.js —— PL 纽结模型与「无自交」保证
 *
 * 纽结表示为空间闭合折线 pts[0..n-1]。把顶点 i 从 A 移到 B 时，
 * 两条相邻边扫过的区域是三角形 T1=(v[i-1],A,B) 与 T2=(v[i+1],A,B)。
 * 若 T1∪T2 与纽结其余部分无交（并保持最小间距 δ），该移动就是一次
 * Δ-move，可延拓成环境同痕 —— 纽结类型不变，且过程中处处是嵌入。
 */
(function (global) {
  'use strict';
  const G = global.GEO;
  const K = {};

  /* 收缩比例：对与三角形共享顶点的邻边，剔除顶点附近一小段，
   * 避免「合法的相接」被误判为碰撞。 */
  function shrinkFrac(P, Q, delta) {
    const L = G.dist(P, Q);
    if (L < 1e-12) return 0;
    return Math.min(0.45, (2.0 * delta) / L);
  }

  /* 检查一组三角形（均以顶点 i 的两条邻边为界）是否与纽结其余边相交，
   * 并尽量保持 δ 的间距。
   *
   * 与三角形共享顶点的两条邻边要区别对待：
   *   · 相交判定（决定拓扑正确性）只剔除共享顶点本身那一点 —— 这样任何
   *     真正的穿透都会被挡下；
   *   · 间距判定（只影响手感与数值稳健）在共享顶点附近留出 2δ 的合法接触带，
   *     否则邻边天然的相接会被误判成碰撞。 */
  const TINY = 1e-6;

  /* nearArc（可选）—— 按**弧长**划定的「自身邻域」。
   *
   * 上面那两条邻边的豁免是按**下标**给的，只免掉 eL、eR。折线取样均匀时够用；
   * 但取样一旦疏密不均（提升出来的折线在交叉点附近可以密上百倍），沿曲线再走
   * 三五个下标仍在原地，那几条边天然就落在 δ 以内，于是：
   *   · 想删掉这些密集取样点，删不动（余量被自己的邻居占着）；
   *   · 若为此把删除时的 δ 调小，曲线就能在**无余量**的情况下朝别处挪 ——
   *     两股相距五十条边长也能被一路蹭到万分之一条边长，投影出来就是
   *     一个没有断口的四叉点。
   * 正确的划法是按弧长：邻域之内只做精确的相交判定（拓扑依旧万无一失），
   * 邻域之外一律留足 δ。不传这个参数时行为与从前完全一致。 */
  K.trianglesClear = function (pts, i, tris, delta, nearArc) {
    const n = pts.length;
    if (n < 8) return false;
    const iPrev = (i - 1 + n) % n;   // 边 (v[i-1], v[i])
    const iCur = i;                  // 边 (v[i],   v[i+1])
    const eL = (i - 2 + n) % n;      // 边 (v[i-2], v[i-1])：与三角形共享 v[i-1]
    const eR = (i + 1) % n;          // 边 (v[i+1], v[i+2])：与三角形共享 v[i+1]
    const d2 = delta * delta;

    let cum = null, total = 0, si = 0;
    if (nearArc > 0) {
      cum = new Float64Array(n + 1);
      for (let k = 0; k < n; k++) cum[k + 1] = cum[k] + G.dist(pts[k], pts[(k + 1) % n]);
      total = cum[n];
      si = cum[i];
    }

    for (let j = 0; j < n; j++) {
      if (j === iPrev || j === iCur) continue;
      const P = pts[j], Q = pts[(j + 1) % n];
      let Pi = P, Qi = Q, Pd = P, Qd = Q;
      if (j === eL) {
        Qi = G.lerp(Q, P, TINY);
        const f = shrinkFrac(P, Q, delta); if (f > 0) Qd = G.lerp(Q, P, f);
      }
      if (j === eR) {
        Pi = G.lerp(P, Q, TINY);
        const f = shrinkFrac(P, Q, delta); if (f > 0) Pd = G.lerp(P, Q, f);
      }
      let localOnly = false;
      if (cum) {
        let a = Math.abs((cum[j] + cum[j + 1]) / 2 - si);
        if (a > total / 2) a = total - a;
        localOnly = a < nearArc;
      }
      for (let k = 0; k < tris.length; k++) {
        const T = tris[k];
        if (G.segTriHit(Pi, Qi, T[0], T[1], T[2]) >= 0) return false;
        if (!localOnly && G.segTriD2(Pd, Qd, T[0], T[1], T[2]) < d2) return false;
      }
    }
    return true;
  };

  /* 把顶点 i 移到 B 是否安全（纯拓扑判据，不含长度/角度这些美学约束） */
  K.moveClear = function (pts, i, B, delta, nearArc) {
    const n = pts.length;
    const A = pts[i], L = pts[(i - 1 + n) % n], R = pts[(i + 1) % n];
    return K.trianglesClear(pts, i, [[L, A, B], [R, A, B]], delta, nearArc);
  };

  /* 折角是否退化：两条边几乎重合（夹角趋于 0）时折线不再是嵌入 */
  function angleOK(L, B, R, cosMax) {
    const a = G.sub(L, B), b = G.sub(R, B);
    const la = G.len(a), lb = G.len(b);
    if (la < 1e-12 || lb < 1e-12) return false;
    return G.dot(a, b) / (la * lb) < cosMax;
  }

  /* 移动后的局部形状是否可接受（边长、折角） */
  K.shapeOK = function (pts, i, B, opt) {
    const n = pts.length;
    const L = pts[(i - 1 + n) % n], R = pts[(i + 1) % n];
    const LL = pts[(i - 2 + n) % n], RR = pts[(i + 2) % n];
    if (G.dist(L, B) < opt.minEdge || G.dist(B, R) < opt.minEdge) return false;
    const cosMax = Math.cos(opt.minAngle);
    if (!angleOK(L, B, R, cosMax)) return false;
    if (!angleOK(LL, L, B, cosMax)) return false;
    if (!angleOK(B, R, RR, cosMax)) return false;
    return true;
  };

  K.safeAt = function (pts, i, B, delta, opt) {
    return K.shapeOK(pts, i, B, opt) && K.moveClear(pts, i, B, delta, opt.nearArc);
  };

  /* 沿 A→target 二分，求最大可行比例。
   * 关键性质：整段扫掠三角形安全 ⇒ 任何前缀的扫掠三角形（子三角形）也安全，
   * 因此只需验证一次终点，之后可任意细分。 */
  K.maxSafeFrac = function (pts, i, target, delta, opt) {
    const A = pts[i];
    if (K.safeAt(pts, i, target, delta, opt)) return 1;
    let lo = 0, hi = 1;
    for (let k = 0; k < 16; k++) {
      const m = (lo + hi) / 2;
      if (K.safeAt(pts, i, G.lerp(A, target, m), delta, opt)) lo = m; else hi = m;
    }
    return lo * 0.96;             // 留一点余量
  };

  /* 删除顶点 i 是否安全：扫掠三角形为 (v[i-1], v[i], v[i+1]) */
  K.removeClear = function (pts, i, delta, nearArc) {
    const n = pts.length;
    if (n <= 12) return false;
    const A = pts[i], L = pts[(i - 1 + n) % n], R = pts[(i + 1) % n];
    return K.trianglesClear(pts, i, [[L, A, R]], delta, nearArc);
  };

  /* 「粗细」：沿曲线相隔 skipArc 以上的两段之间的最小距离。
   * 与 minSeparation 的区别在于排除近邻按**弧长**而不是按下标 —— 取样一旦
   * 疏密不均，按下标排除就会把真正贴到一起的两股也当成近邻放过去。
   * 这是判断「构形有没有被压薄」的量，minSeparation 则是给 δ 用的保守下界。 */
  K.farSep = function (pts, skipArc) {
    const n = pts.length;
    const cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + G.dist(pts[i], pts[(i + 1) % n]);
    const total = cum[n];
    let m = Infinity;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], mi = (cum[i] + cum[i + 1]) / 2;
      for (let j = i + 1; j < n; j++) {
        let d = (cum[j] + cum[j + 1]) / 2 - mi;
        if (d > total / 2) d = total - d;
        if (d < skipArc) continue;
        const s = G.segSegD2(a, b, pts[j], pts[(j + 1) % n]);
        if (s < m) m = s;
      }
    }
    return Math.sqrt(m);
  };

  /* 全局最小间距（不相邻边之间），用于加载时校验 */
  K.minSeparation = function (pts) {
    const n = pts.length;
    let m = Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;
        const d2 = G.segSegD2(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]);
        if (d2 < m) m = d2;
      }
    }
    return Math.sqrt(m);
  };

  K.totalLength = function (pts) {
    const n = pts.length;
    let s = 0;
    for (let i = 0; i < n; i++) s += G.dist(pts[i], pts[(i + 1) % n]);
    return s;
  };

  K.centroid = function (pts) {
    const c = [0, 0, 0];
    for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    return G.mul(c, 1 / pts.length);
  };

  global.KNOT = K;
})(window);
