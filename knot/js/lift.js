/* lift.js —— 上下的选择，以及由投影图还原三维纽结
 *
 * bits[k] ∈ {0,1} 记录第 k 个交叉点「哪一支在上」：0 = 弧长在前的 a 支，1 = b 支。
 *
 * 还原（LIFT.build）是精确的，不是数值拟合：
 * 令 z(s) ≡ 0，只在每个「经过交叉点」的事件附近开一个凸包，上股抬到 +h、
 * 下股压到 −h，支撑区间取得比该事件到相邻事件的弧长间距还小，于是各凸包互不重叠。
 * 采样点只加在原折线的边上，所以平面形状逐点不变；(x,y) 唯一可能重合的地方
 * 就是交叉点，而那里两股的 z 相差 2h。因此得到的空间折线是嵌入的，
 * 且它的正交投影恰好是你画的那张图 —— 它就是那个纽结，差一个同痕。
 */
(function (global) {
  'use strict';
  const P = global.PLANE, DG = global.DIAG;
  const L = {};

  /* 俯视基：X=x, Y=y, Z=z，投影就是恒等 */
  L.TOP = { u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1] };

  /* ---------------- 上下的几种选法 ---------------- */

  /* 下降图解：沿曲线走一圈，每个交叉点第一次经过时判为上股。
   * 结果必然是平凡结 —— 这就是「还原出最开始画的那个圈」。 */
  L.descending = function (sh, start) {
    const nc = sh.crossings.length, ev = sh.events, m = ev.length;
    const bits = new Array(nc).fill(0);
    const seen = new Array(nc).fill(false);
    start = ((start || 0) % Math.max(1, m) + m) % Math.max(1, m);
    for (let p = 0; p < m; p++) {
      const e = ev[(p + start) % m];
      if (!seen[e.k]) { seen[e.k] = true; bits[e.k] = e.br; }
    }
    return bits;
  };

  /* 交替图解：沿曲线走，O、U、O、U… 交替。
   * 之所以总能这样赋值，是因为 Gauss 的可实现性条件：平面闭曲线的
   * Gauss 序列中，任一交叉点两次出现之间必夹着偶数个事件，于是这两次
   * 出现的位置奇偶相反。若数值退化导致条件不成立，返回 null。 */
  L.alternating = function (sh, phase) {
    const nc = sh.crossings.length, ev = sh.events, m = ev.length;
    const bits = new Array(nc).fill(-1);
    phase = phase ? 1 : 0;
    for (let p = 0; p < m; p++) {
      if (p % 2 !== phase) continue;
      const e = ev[p];
      if (bits[e.k] >= 0) return null;          // 同一交叉点两次都被判为上股
      bits[e.k] = e.br;
    }
    for (let k = 0; k < nc; k++) if (bits[k] < 0) return null;
    return bits;
  };

  L.random = function (sh, rng) {
    rng = rng || Math.random;
    return sh.crossings.map(() => (rng() < 0.5 ? 0 : 1));
  };

  L.flipAll = function (bits) { return bits.map((b) => 1 - b); };

  L.fromMask = function (sh, mask) {
    return sh.crossings.map((c, k) => ((mask >> k) & 1));
  };

  L.toMask = function (bits) {
    let m = 0;
    for (let k = 0; k < bits.length; k++) if (bits[k]) m |= (1 << k);
    return m;
  };

  /* ---------------- 组合层面的图解 ----------------
   * 只有 ALEX / DIAG.arcs / DIAG.gaussString 需要的字段，不含几何。
   * 枚举 2ⁿ 种选法时用它，省掉反复重建几何的开销。 */
  L.pseudoDiag = function (sh, bits) {
    const cr = sh.crossings.map((c, k) => ({
      id: k, x: c.x, y: c.y,
      sign: bits[k] === 0 ? c.sign0 : -c.sign0
    }));
    let writhe = 0;
    for (const c of cr) writhe += c.sign;
    const gauss = sh.events.map((e) => ({
      k: e.k, over: bits[e.k] === e.br, tau: e.s / sh.total, sign: cr[e.k].sign
    }));
    return { n: sh.n, crossings: cr, gauss: gauss, writhe: writhe };
  };

  /* ---------------- 提升 ---------------- */

  /* 凸包剖面：|u|≥1 处为 0，|u|≤1/Q 处为 1（顶上是一段平台，
   * 交叉点就落在这段平台里，所以它的高度恰好是 ±h）。 */
  function profile(u, Q) {
    const a = Math.abs(u);
    if (a >= 1) return 0;
    const f = (1 - a * a) * (1 - a * a);
    const f0 = (1 - 1 / (Q * Q)) * (1 - 1 / (Q * Q));
    return Math.min(1, f / f0);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 基线：一条低频、以周长为周期的高度扰动。
   *
   * 为什么需要它：只把交叉点抬起来的话，得到的是一张几乎平放的煎饼 ——
   * 平面上两股「差点相交」的地方（发夹、近乎相切的两段）在空间里就真的
   * 差点相交，最小间距可以小到 10⁻⁴ 条边长。后面的松弛靠这个间距定安全余量 δ，
   * 余量一小，每一步又允许把间距吃掉一截，几十步下来就归零、两股穿过去了。
   *
   * 基线只改 z、不改 (x,y)，所以投影图逐点不变。
   *
   * 它被一个比凸包更宽的窗口挡在交叉点之外（win：在整个凸包支撑集上为 1，
   * 到两倍宽处降到 0；基线乘的是 1−win）。这一点是必须的：交叉点附近两股在
   * 平面上本来就贴得很近，若让基线在那里生效，(z_a−z_b) 会在凸包边缘附近
   * 穿过零 —— 那正是平面距离还很小的地方，于是空间距离被做得更糟。
   * 挡在窗口外之后，交叉点邻域完全由 ±h 决定，而远处的「擦肩而过」由基线拉开。 */
  function baseline(total, seed) {
    const rnd = mulberry32(seed);
    const terms = [];
    let norm = 0;
    for (let k = 1; k <= 8; k++) {
      const a = (rnd() * 2 - 1) / k;
      terms.push({ k: k, a: a, p: rnd() * 2 * Math.PI });
      norm += Math.abs(a);
    }
    for (const t of terms) t.a /= norm || 1;          // ⇒ |g| ≤ 1
    return function (s) {
      let v = 0;
      for (const t of terms) v += t.a * Math.sin((2 * Math.PI * t.k * s) / total + t.p);
      return v;
    };
  }


  L.build = function (pts2, sh, bits, opt) {
    opt = opt || {};
    const nc = sh.crossings.length;
    const cum = sh.cum, total = sh.total, n = sh.n;
    if (nc === 0) return pts2.map((p) => [p[0], p[1], 0]);

    const Q = opt.samples || 5;
    const hMax = opt.h || total / 110;
    const ev = sh.events, m = ev.length;

    const w = new Array(m), hh = new Array(m), up = new Array(m);
    for (let p = 0; p < m; p++) {
      const gPrev = p === 0 ? ev[0].s + total - ev[m - 1].s : ev[p].s - ev[p - 1].s;
      const gNext = p === m - 1 ? ev[0].s + total - ev[m - 1].s : ev[p + 1].s - ev[p].s;
      // 0.45 < 1/2 ⇒ 相邻两个凸包的支撑区间必定不相交
      w[p] = Math.max(Math.min(0.45 * Math.min(gPrev, gNext), 0.06 * total), 1e-7 * total);
      hh[p] = Math.min(hMax, 0.7 * w[p]);
      up[p] = bits[ev[p].k] === ev[p].br ? 1 : -1;
    }

    /* 采样弧长：原顶点，加上每个凸包内的 2Q 个点。
     * 特意跳过事件本身那一点 —— 若在交叉点处放一个顶点，
     * 交点就落到边的端点上，seg2Cross 会按退化情形丢掉这个交叉点。 */
    const S = [];
    for (let i = 0; i < n; i++) S.push(cum[i]);
    for (let p = 0; p < m; p++) {
      for (let q = -Q; q <= Q; q++) {
        if (q === 0) continue;
        let s = ev[p].s + (w[p] * q) / Q;
        s = ((s % total) + total) % total;
        S.push(s);
      }
    }
    S.sort((a, b) => a - b);

    const g = baseline(total, (Math.round(total * 1e6) ^ (nc * 2654435761)) | 0);
    const A = (opt.base === undefined ? 1.5 : opt.base) * hMax;
    /* 基线的屏蔽窗：|u|≤w 处为 1，到 |u|=2w 平滑降到 0 */
    function shield(x) {
      if (x <= 1) return 1;
      if (x >= 2) return 0;
      const y = x - 1;
      return 1 - y * y * (3 - 2 * y);
    }

    const eps = 1e-9 * total;
    const out = [];
    let prev = -Infinity;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (s - prev < eps) continue;
      if (total - s < eps) continue;          // s≈total 与起点重合，跳过
      prev = s;
      let z = 0, win = 0;
      for (let p = 0; p < m; p++) {
        let d = Math.abs(s - ev[p].s);
        if (d > total / 2) d = total - d;
        if (d >= 2 * w[p]) continue;
        if (d < w[p]) z += up[p] * hh[p] * profile(d / w[p], Q);
        const sh = shield(d / w[p]);
        if (sh > win) win = sh;
      }
      z += A * g(s) * (1 - win);              // 交叉点邻域 win=1 ⇒ 基线不参与
      const xy = P.pointAt(pts2, cum, s);
      out.push([xy[0], xy[1], z]);
    }
    return out;
  };

  /* ---------------- 自检 ----------------
   * 把提升出来的空间折线重新投影一遍，核对交叉点个数与每个交叉点的
   * 上下（等价于核对符号：sign = ±sign0，由 bits 唯一决定）。 */
  L.verify = function (pts3, sh, bits) {
    const D = DG.compute(pts3, L.TOP);
    const nc = sh.crossings.length;
    if (D.crossings.length !== nc) {
      return { ok: false, reason: '交叉点数不符', got: D.crossings.length, want: nc, D: D };
    }
    let scale = 0;
    for (const c of sh.crossings) scale = Math.max(scale, Math.abs(c.x), Math.abs(c.y));
    const tol = Math.max(scale, 1) * 1e-6;
    const used = new Array(nc).fill(false);
    for (const c of D.crossings) {
      let best = -1, bd = Infinity;
      for (let k = 0; k < nc; k++) {
        if (used[k]) continue;
        const d = Math.hypot(c.x - sh.crossings[k].x, c.y - sh.crossings[k].y);
        if (d < bd) { bd = d; best = k; }
      }
      if (best < 0 || bd > tol) return { ok: false, reason: '交叉点对不上', D: D };
      used[best] = true;
      const want = bits[best] === 0 ? sh.crossings[best].sign0 : -sh.crossings[best].sign0;
      if (c.sign !== want) return { ok: false, reason: '第 ' + (best + 1) + ' 个交叉点的上下反了', D: D };
      if (!(c.zOver > c.zUnder)) return { ok: false, reason: '高度退化', D: D };
    }
    return { ok: true, D: D };
  };

  global.LIFT = L;
})(window);
