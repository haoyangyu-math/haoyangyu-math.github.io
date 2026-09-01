/* diagram.js —— 正交投影、交叉点、Gauss 编码
 *
 * 采用正交投影：屏幕上看到的就是纽结图解本身。
 * 交叉点用「归一化弧长参数 τ∈[0,1)」定位，这样在顶点增删、交叉点
 * 越过顶点时 τ 都是连续的，可以跨帧稳定地跟踪同一个交叉点。
 */
(function (global) {
  'use strict';
  const G = global.GEO;
  const D = {};

  /* 由方位角 yaw / 仰角 pitch 生成相机正交基。
   * w 指向观察者（z 越大离相机越近），u 为屏幕右，v 为屏幕上。 */
  D.basis = function (yaw, pitch) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const w = [cp * Math.cos(yaw), cp * Math.sin(yaw), sp];
    let up = [0, 0, 1];
    if (Math.abs(G.dot(w, up)) > 0.999) up = [0, 1, 0];
    const u = G.norm(G.cross(up, w));
    const v = G.cross(w, u);
    return { u: u, v: v, w: w };
  };

  /* 计算图解。返回投影坐标、弧长表、交叉点表与 Gauss 序列。 */
  D.compute = function (pts, basis) {
    const n = pts.length;
    const u = basis.u, v = basis.v, w = basis.w;
    const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      X[i] = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
      Y[i] = p[0] * v[0] + p[1] * v[1] + p[2] * v[2];
      Z[i] = p[0] * w[0] + p[1] * w[1] + p[2] * w[2];
    }
    // 三维弧长
    const cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + G.dist(pts[i], pts[(i + 1) % n]);
    const total = cum[n] || 1;
    const tauOf = (i, s) => (cum[i] + s * (cum[i + 1] - cum[i])) / total;

    const crossings = [];
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;   // 相邻边不算交叉
        const j2 = (j + 1) % n;
        const hit = G.seg2Cross(X[i], Y[i], X[i2], Y[i2], X[j], Y[j], X[j2], Y[j2]);
        if (!hit) continue;
        const zi = Z[i] + (Z[i2] - Z[i]) * hit.t;
        const zj = Z[j] + (Z[j2] - Z[j]) * hit.u;
        const iOver = zi > zj;
        const oe = iOver ? i : j, ot = iOver ? hit.t : hit.u;
        const ue = iOver ? j : i, ut = iOver ? hit.u : hit.t;
        const oe2 = (oe + 1) % n, ue2 = (ue + 1) % n;
        const odx = X[oe2] - X[oe], ody = Y[oe2] - Y[oe];
        const udx = X[ue2] - X[ue], udy = Y[ue2] - Y[ue];
        // 正交标架 (上股方向, 下股方向) 定向为正 ⇒ 正交叉
        const sign = odx * udy - ody * udx > 0 ? 1 : -1;
        crossings.push({
          id: 0,
          x: X[i] + (X[i2] - X[i]) * hit.t,
          y: Y[i] + (Y[i2] - Y[i]) * hit.t,
          overEdge: oe, overT: ot, underEdge: ue, underT: ut,
          zOver: iOver ? zi : zj, zUnder: iOver ? zj : zi,
          tauO: tauOf(oe, ot), tauU: tauOf(ue, ut),
          sign: sign
        });
      }
    }

    // Gauss 序列：沿纽结走一圈，按 τ 排序所有「经过交叉点」的事件
    const gauss = [];
    for (let k = 0; k < crossings.length; k++) {
      const c = crossings[k];
      gauss.push({ k: k, over: true, tau: c.tauO, sign: c.sign });
      gauss.push({ k: k, over: false, tau: c.tauU, sign: c.sign });
    }
    gauss.sort((a, b) => a.tau - b.tau);

    let writhe = 0;
    for (const c of crossings) writhe += c.sign;

    return { n: n, X: X, Y: Y, Z: Z, cum: cum, total: total,
             crossings: crossings, gauss: gauss, writhe: writhe };
  };

  /* ---------- 交叉点跨帧跟踪：按 (τ_over, τ_under) 匹配 ---------- */

  function cyc(d) { d = Math.abs(d) % 1; return Math.min(d, 1 - d); }

  D.Tracker = function () {
    this.next = 1;
  };

  /* 只计算匹配，不改动任何状态 */
  D.Tracker.prototype.match = function (oldD, newD, thresh) {
    thresh = thresh || 0.06;
    const A = oldD ? oldD.crossings : [], B = newD.crossings;
    const cands = [];
    const th2 = thresh * thresh;
    for (let a = 0; a < A.length; a++) {
      const ao = A[a].tauO, au = A[a].tauU;
      for (let b = 0; b < B.length; b++) {
        const d0 = cyc(ao - B[b].tauO);
        if (d0 >= thresh) continue;                 // 先廉价地筛掉绝大多数
        const d1 = cyc(au - B[b].tauU);
        const d = d0 * d0 + d1 * d1;
        if (d < th2) cands.push([d, a, b]);
      }
    }
    cands.sort((p, q) => p[0] - q[0]);
    const usedA = new Array(A.length).fill(false);
    const usedB = new Array(B.length).fill(false);
    const pair = new Array(B.length).fill(-1);
    for (const [, a, b] of cands) {
      if (usedA[a] || usedB[b]) continue;
      usedA[a] = usedB[b] = true; pair[b] = a;
    }
    const born = [], died = [];
    for (let b = 0; b < B.length; b++) if (pair[b] < 0) born.push(b);
    for (let a = 0; a < A.length; a++) if (!usedA[a]) died.push(a);
    return { pair: pair, born: born, died: died };
  };

  /* 落实匹配：为新图解的交叉点分配稳定 id */
  D.Tracker.prototype.commit = function (oldD, newD, m) {
    for (let b = 0; b < newD.crossings.length; b++) {
      newD.crossings[b].id = m.pair[b] >= 0 ? oldD.crossings[m.pair[b]].id : this.next++;
    }
  };

  D.Tracker.prototype.fresh = function (newD) {
    for (const c of newD.crossings) c.id = this.next++;
  };

  /* 带 id 的 Gauss 符号串，用于组合分类 */
  D.symbols = function (diag) {
    return diag.gauss.map((g) => ({
      c: diag.crossings[g.k].id,
      o: g.over ? 1 : 0,
      s: diag.crossings[g.k].sign
    }));
  };

  /* 可读的带符号 Gauss code，例如 O1+ U2- O2- U1+ */
  D.gaussString = function (diag) {
    if (!diag.crossings.length) return '（无交叉点）';
    const label = new Map();
    let next = 1;
    const out = [];
    for (const g of diag.gauss) {
      const c = diag.crossings[g.k];
      if (!label.has(c.id)) label.set(c.id, next++);
      out.push((g.over ? 'O' : 'U') + label.get(c.id) + (c.sign > 0 ? '+' : '−'));
    }
    return out.join(' ');
  };

  /* 弧的划分：每个下穿点结束一条弧、开始下一条弧。
   * 返回 arcAt[k] = Gauss 序列第 k 个事件所在弧的编号。 */
  D.arcs = function (diag) {
    const seq = diag.gauss, m = seq.length, nc = diag.crossings.length;
    if (nc === 0) return null;
    let start = -1;
    for (let k = 0; k < m; k++) if (!seq[k].over) { start = k; break; }
    if (start < 0) return null;
    const arcAt = new Array(m);
    let a = 0;
    for (let step = 0; step < m; step++) {
      const k = (start + step) % m;
      if (!seq[k].over && step > 0) a = (a + 1) % nc;
      arcAt[k] = a;
    }
    return { arcAt: arcAt, count: nc, start: start };
  };

  global.DIAG = D;
})(window);
