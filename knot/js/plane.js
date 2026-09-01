/* plane.js —— 平面闭折线：拉动、重采样、自相交（影子）
 *
 * 这一阶段还没有「上下」。曲线只是平面上一条一般位置的浸入闭曲线，
 * 交叉点只是画面上两股的重叠点 —— 纽结论里管这个叫 shadow（影子）。
 * 因为不涉及纽结型，平面上的移动完全自由：不需要任何安全判定，
 * 交叉点可以随便生、随便灭、随便互相穿过。
 */
(function (global) {
  'use strict';
  const G = global.GEO;
  const P = {};

  const dist2 = (a, b) => { const x = a[0] - b[0], y = a[1] - b[1]; return x * x + y * y; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const mod = (a, n) => ((a % n) + n) % n;

  P.circle = function (n, r) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      out.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return out;
  };

  /* 累积弧长：cum[i] 是走到第 i 个顶点的长度，cum[n] 是周长 */
  P.cumlen = function (pts) {
    const n = pts.length, cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + dist(pts[i], pts[(i + 1) % n]);
    return cum;
  };

  P.totalLength = function (pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
    return s;
  };

  /* 弧长 s 处的点（s 按周长取模） */
  P.pointAt = function (pts, cum, s) {
    const n = pts.length, total = cum[n];
    if (!(total > 0)) return pts[0].slice();
    s = ((s % total) + total) % total;
    let lo = 0, hi = n;
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const i = lo, i2 = (i + 1) % n, seg = cum[i + 1] - cum[i];
    const t = seg > 1e-15 ? (s - cum[i]) / seg : 0;
    return [pts[i][0] + (pts[i2][0] - pts[i][0]) * t,
            pts[i][1] + (pts[i2][1] - pts[i][1]) * t];
  };

  /* ---------- 拉动 ----------
   * 抓住第 i 个顶点位移 (dx,dy)，沿弧长以余弦衰减带动邻近的顶点。
   * 单点拖动会拉出针尖，整段带动才有「拽一根绳子」的手感。 */
  P.pull = function (pts, i, dx, dy, rad, cum) {
    const n = pts.length;
    cum = cum || P.cumlen(pts);
    const total = cum[n];
    if (rad <= 0 || total <= 0) { pts[i][0] += dx; pts[i][1] += dy; return; }
    const s0 = cum[i];
    for (let j = 0; j < n; j++) {
      let d = Math.abs(cum[j] - s0);
      d = Math.min(d, total - d);
      if (d >= rad) continue;
      const w = 0.5 * (1 + Math.cos((Math.PI * d) / rad));
      pts[j][0] += dx * w;
      pts[j][1] += dy * w;
    }
  };

  /* ---------- 重采样 ----------
   * 把边长维持在 te 附近。平面上没有拓扑约束，插点删点都是自由的。 */
  P.resample = function (pts, te, minN, maxN) {
    const long2 = (1.7 * te) * (1.7 * te);
    for (let j = 0; j < pts.length && pts.length < maxN; j++) {
      const a = pts[j], b = pts[(j + 1) % pts.length];
      if (dist2(a, b) > long2) { pts.splice(j + 1, 0, mid(a, b)); j--; }   // 再看前半段
    }
    for (let j = pts.length - 1; j >= 0 && pts.length > minN; j--) {
      const n = pts.length;
      const L = pts[mod(j - 1, n)], A = pts[j], R = pts[(j + 1) % n];
      if (dist(L, A) > 0.6 * te || dist(A, R) > 0.6 * te) continue;
      pts.splice(j, 1);
    }
    return pts;
  };

  /* ---------- 平滑 ----------
   * 拉普拉斯平滑，把拉动留下的折角抹平。平面上没有拓扑要守，随便平滑。 */
  P.smooth = function (pts, k, iters) {
    const n = pts.length;
    for (let it = 0; it < (iters || 1); it++) {
      const src = pts.map((p) => p.slice());
      for (let i = 0; i < n; i++) {
        const L = src[mod(i - 1, n)], R = src[(i + 1) % n];
        pts[i][0] += k * ((L[0] + R[0]) / 2 - src[i][0]);
        pts[i][1] += k * ((L[1] + R[1]) / 2 - src[i][1]);
      }
    }
    return pts;
  };

  /* 平面上两线段的最近点（Ericson），返回参数、距离与两最近点之差 */
  function seg2Closest(ax, ay, bx, by, cx, cy, dx, dy) {
    const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy;
    const wx = ax - cx, wy = ay - cy;
    const a = ux * ux + uy * uy, b = ux * vx + uy * vy, c = vx * vx + vy * vy;
    const d = ux * wx + uy * wy, e = vx * wx + vy * wy;
    const D = a * c - b * b, EPS = 1e-14;
    let sN, sD = D, tN, tD = D;
    if (D < EPS) { sN = 0; sD = 1; tN = e; tD = c; }
    else {
      sN = b * e - c * d; tN = a * e - b * d;
      if (sN < 0) { sN = 0; tN = e; tD = c; }
      else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
    }
    if (tN < 0) {
      tN = 0;
      if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; }
    } else if (tN > tD) {
      tN = tD;
      if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; }
    }
    const s = Math.abs(sD) < EPS ? 0 : sN / sD;
    const t = Math.abs(tD) < EPS ? 0 : tN / tD;
    const px = wx + s * ux - t * vx, py = wy + s * uy - t * vy;
    return { s: s, t: t, d: Math.hypot(px, py), px: px, py: py };
  }

  /* ---------- 疏开：把「擦肩而过」的两段推开 ----------
   *
   * 平面曲线上两股可以贴到 0.05 条边长以内而并不相交。提升之后它们在空间里
   * 也就贴那么近，而三维松弛救不了：δ 比那个间距大得多，Δ-move 判定会把那一带
   * 的移动全部否掉，于是它们永远贴在一起 —— 投影出来就是一个没有断口的四叉点。
   *
   * 修在平面上才是对症的：这一阶段是**自由同伦**，怎么动都合法，
   * 所以直接把它们推开就是了，不需要任何判定。推开可能顺带增减交叉点，
   * 那也完全没关系 —— 这正是「移动」阶段允许的事。
   *
   * 要按**边对边**找，不能按顶点对顶点：折线上会有长达一两条边长的长边，
   * 两股最近的地方常常落在长边中间，顶点之间却还隔着一条多边长。 */
  P.declutter = function (pts, minDist, skipArc, iters) {
    for (let it = 0; it < (iters || 10); it++) {
      const n = pts.length;
      const sh = P.shadow(pts);
      const cum = sh.cum, total = sh.total, nc = sh.crossings.length;
      const m = sh.events.length;
      const w = bumpWidths(sh);

      /* 交叉点处两股本来就该相交，不能去推它 —— 否则每一个交叉点都会被推散，
       * 而且推出来的还是更浅的交角，越推越糟。
       * 所以要求的间距从交叉点处的 0 升到「凸包结束处」的 minDist：凸包一结束
       * 两股就回到同一高度，那正是必须已经在平面上分开的地方。
       *
       * 关键是要用**每个交叉点自己的**凸包半宽 w，不能用平均值：交叉点在弧长上
       * 疏密不均时，挤在一起的那几个 w 比平均值小一个量级，用平均值去卡，
       * 恰恰在最需要的地方几乎不起作用。 */
      const ratio = new Float64Array(n);       // 到最近事件的弧长，按该事件的 w 归一
      for (let i = 0; i < n; i++) {
        const mid = (cum[i] + cum[i + 1]) / 2;
        let best = Infinity;
        for (let p = 0; p < m; p++) {
          let d = Math.abs(mid - sh.events[p].s);
          if (d > total / 2) d = total - d;
          const rr = d / w[p];
          if (rr < best) best = rr;
        }
        ratio[i] = nc ? best : Infinity;
      }

      const ax = new Float64Array(n), ay = new Float64Array(n);
      let hits = 0;
      for (let i = 0; i < n; i++) {
        const i2 = (i + 1) % n;
        for (let j = i + 1; j < n; j++) {
          let arc = (cum[j] + cum[j + 1]) / 2 - (cum[i] + cum[i + 1]) / 2;
          if (arc > total / 2) arc = total - arc;
          if (arc < skipArc) continue;
          const req = minDist * Math.min(1, Math.min(ratio[i], ratio[j]));
          if (req <= 0) continue;
          const j2 = (j + 1) % n;
          const r = seg2Closest(pts[i][0], pts[i][1], pts[i2][0], pts[i2][1],
                                pts[j][0], pts[j][1], pts[j2][0], pts[j2][1]);
          if (r.d >= req) continue;
          hits++;
          let ux, uy;
          if (r.d > 1e-12) { ux = r.px / r.d; uy = r.py / r.d; }
          else {                              // 正好相交：沿第一条边的法向推开
            const ex = pts[i2][0] - pts[i][0], ey = pts[i2][1] - pts[i][1];
            const el = Math.hypot(ex, ey) || 1;
            ux = -ey / el; uy = ex / el;
          }
          const push = (req - r.d) * 0.5;
          ax[i] += ux * push * (1 - r.s); ay[i] += uy * push * (1 - r.s);
          ax[i2] += ux * push * r.s;       ay[i2] += uy * push * r.s;
          ax[j] -= ux * push * (1 - r.t);  ay[j] -= uy * push * (1 - r.t);
          ax[j2] -= ux * push * r.t;       ay[j2] -= uy * push * r.t;
        }
      }
      if (!hits) break;
      for (let i = 0; i < n; i++) { pts[i][0] += ax[i] * 0.6; pts[i][1] += ay[i] * 0.6; }
      P.smooth(pts, 0.18, 1);                 // 推完抹一下，别留下折角
    }
    return pts;
  };

  /* 每个「经过交叉点」事件的凸包半宽 —— 与 LIFT.build 里同一个公式。
   * 疏开与陡化都要用它：那是「凸包结束、两股回到同一高度」的地方。 */
  function bumpWidths(sh) {
    const m = sh.events.length, total = sh.total, w = new Array(m);
    for (let p = 0; p < m; p++) {
      const gPrev = p === 0 ? sh.events[0].s + total - sh.events[m - 1].s
                            : sh.events[p].s - sh.events[p - 1].s;
      const gNext = p === m - 1 ? sh.events[0].s + total - sh.events[m - 1].s
                                : sh.events[p + 1].s - sh.events[p].s;
      w[p] = Math.max(Math.min(0.45 * Math.min(gPrev, gNext), 0.06 * total), 1e-7 * total);
    }
    return w;
  }

  /* ---------- 打乱：一串随机的拉动 ----------
   * 位移幅度和作用半径挂钩，否则拉出来的全是针尖。 */
  P.tangle = function (pts, steps, te, rng, minN, maxN) {
    rng = rng || Math.random;
    for (let s = 0; s < steps; s++) {
      const i = Math.floor(rng() * pts.length) % pts.length;
      const a = rng() * 2 * Math.PI;
      const rad = te * (5 + 12 * rng());
      const amp = rad * (0.5 + 1.1 * rng());
      P.pull(pts, i, Math.cos(a) * amp, Math.sin(a) * amp, rad);
      if (s % 2 === 0) { P.resample(pts, te, minN, maxN); P.smooth(pts, 0.35, 1); }
    }
    P.resample(pts, te, minN, maxN);
    P.smooth(pts, 0.4, 2);
    return pts;
  };

  /* ---------- 影子：所有自相交 ----------
   * 每个交叉点记下两条支（branch）：a 是弧长在前的那条，b 在后。
   * ea/ta 是所在边与边内参数，sa 是弧长，(ax,ay) 是该支的走向。
   * 事件表 events 就是沿曲线走一圈依次遇到的 2n 次「经过交叉点」。 */
  P.shadow = function (pts) {
    const n = pts.length;
    const cum = P.cumlen(pts);
    const total = cum[n] || 1;
    const cr = [];
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const ax = pts[i2][0] - pts[i][0], ay = pts[i2][1] - pts[i][1];
      for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;   // 相邻边不算交叉
        const j2 = (j + 1) % n;
        const hit = G.seg2Cross(pts[i][0], pts[i][1], pts[i2][0], pts[i2][1],
                                pts[j][0], pts[j][1], pts[j2][0], pts[j2][1]);
        if (!hit) continue;
        // i+2 ≤ j ⇒ cum[i+1] ≤ cum[j] ⇒ sa < sb，所以 a 总是弧长在前的那支
        cr.push({
          x: pts[i][0] + ax * hit.t,
          y: pts[i][1] + ay * hit.t,
          ea: i, ta: hit.t, sa: cum[i] + hit.t * (cum[i + 1] - cum[i]),
          eb: j, tb: hit.u, sb: cum[j] + hit.u * (cum[j + 1] - cum[j]),
          ax: ax, ay: ay,
          bx: pts[j2][0] - pts[j][0], by: pts[j2][1] - pts[j][1]
        });
      }
    }
    // 「a 支在上」时该交叉点的符号；b 支在上时取反
    for (const c of cr) c.sign0 = c.ax * c.by - c.ay * c.bx > 0 ? 1 : -1;

    const events = [];
    for (let k = 0; k < cr.length; k++) {
      events.push({ k: k, br: 0, s: cr[k].sa });
      events.push({ k: k, br: 1, s: cr[k].sb });
    }
    events.sort((p, q) => p.s - q.s);

    return { n: n, cum: cum, total: total, crossings: cr, events: events };
  };

  /* 屏幕坐标下离 (sx,sy) 最近的交叉点 */
  P.pickCrossing = function (sh, view, sx, sy, rPix) {
    let best = -1, bd = rPix * rPix;
    for (let k = 0; k < sh.crossings.length; k++) {
      const s = view.toScreen(sh.crossings[k].x, sh.crossings[k].y);
      const d = (s[0] - sx) * (s[0] - sx) + (s[1] - sy) * (s[1] - sy);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };

  P.pickVertex = function (pts, view, sx, sy, rPix) {
    let best = -1, bd = rPix * rPix;
    for (let i = 0; i < pts.length; i++) {
      const s = view.toScreen(pts[i][0], pts[i][1]);
      const d = (s[0] - sx) * (s[0] - sx) + (s[1] - sy) * (s[1] - sy);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  /* 平面点集的自适应取景，接口与 RENDER.fitBounds 一致 */
  P.fitBounds = function (pts, w, h, margin) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
    const bw = Math.max(x1 - x0, 1e-6), bh = Math.max(y1 - y0, 1e-6);
    return { scale: Math.min((w - 2 * margin) / bw, (h - 2 * margin) / bh),
             bcx: (x0 + x1) / 2, bcy: (y0 + y1) / 2 };
  };

  global.PLANE = P;
})(window);
