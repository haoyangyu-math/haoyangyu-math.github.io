/* geom.js —— 三维向量与几何谓词
 * 全部向量用普通数组 [x,y,z] 表示。
 */
(function (global) {
  'use strict';
  const G = {};

  G.add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  G.sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  G.mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  G.dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  G.cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  G.len = (a) => Math.hypot(a[0], a[1], a[2]);
  G.norm = (a) => { const l = G.len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  G.dist2 = (a, b) => { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; };
  G.dist = (a, b) => Math.sqrt(G.dist2(a, b));
  G.lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  G.clone = (a) => [a[0], a[1], a[2]];
  G.clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

  /* 两条线段之间的最小距离平方（Ericson, Real-Time Collision Detection） */
  G.segSegD2 = function (p1, q1, p2, q2) {
    const d1 = G.sub(q1, p1), d2 = G.sub(q2, p2), r = G.sub(p1, p2);
    const a = G.dot(d1, d1), e = G.dot(d2, d2), f = G.dot(d2, r);
    const EPS = 1e-15;
    let s, t;
    if (a <= EPS && e <= EPS) return G.dist2(p1, p2);
    if (a <= EPS) { s = 0; t = G.clamp(f / e, 0, 1); }
    else {
      const c = G.dot(d1, r);
      if (e <= EPS) { t = 0; s = G.clamp(-c / a, 0, 1); }
      else {
        const b = G.dot(d1, d2), denom = a * e - b * b;
        s = denom > EPS ? G.clamp((b * f - c * e) / denom, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = G.clamp(-c / a, 0, 1); }
        else if (t > 1) { t = 1; s = G.clamp((b - c) / a, 0, 1); }
      }
    }
    const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s];
    const c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
    return G.dist2(c1, c2);
  };

  /* 点到三角形的最近点 */
  G.closestPtTri = function (p, a, b, c) {
    const ab = G.sub(b, a), ac = G.sub(c, a), ap = G.sub(p, a);
    const d1 = G.dot(ab, ap), d2 = G.dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a;
    const bp = G.sub(p, b);
    const d3 = G.dot(ab, bp), d4 = G.dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3 || 1); return G.add(a, G.mul(ab, v)); }
    const cp = G.sub(p, c);
    const d5 = G.dot(ab, cp), d6 = G.dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6 || 1); return G.add(a, G.mul(ac, w)); }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / ((d4 - d3) + (d5 - d6) || 1);
      return G.add(b, G.mul(G.sub(c, b), w));
    }
    const denom = 1 / (va + vb + vc || 1);
    const v = vb * denom, w = vc * denom;
    return G.add(a, G.add(G.mul(ab, v), G.mul(ac, w)));
  };

  /* 线段 PQ 与三角形 ABC 是否相交（Möller–Trumbore，段版本）。
   * 返回段上参数 t∈[0,1]，无交返回 -1。近共面时返回 -1（由距离检测兜底）。 */
  G.segTriHit = function (p, q, a, b, c) {
    const d = G.sub(q, p), e1 = G.sub(b, a), e2 = G.sub(c, a);
    const h = G.cross(d, e2), det = G.dot(e1, h);
    if (Math.abs(det) < 1e-14) return -1;
    const inv = 1 / det, s = G.sub(p, a);
    const u = G.dot(s, h) * inv;
    if (u < 0 || u > 1) return -1;
    const qv = G.cross(s, e1);
    const v = G.dot(d, qv) * inv;
    if (v < 0 || u + v > 1) return -1;
    const t = G.dot(e2, qv) * inv;
    if (t < 0 || t > 1) return -1;
    return t;
  };

  /* 线段到三角形的最小距离平方（假定不相交；相交情形由 segTriHit 先行判掉，
   * 而共面相交会被「段—三角形边」的距离捕获为 0）。
   *
   * 只取「段对三条边」与「段的两个端点对三角形」是不够的：当线段近乎平行于
   * 三角形所在平面、又悬在三角形内部上方时，最近的一对点落在两者的内部，
   * 上面几项全都取不到它，距离会被**高估**——于是安全余量 δ 在这种构形下
   * 形同虚设（拓扑仍由 segTriHit 兜底，但两股可以被挤到任意近）。
   * 距离函数沿线段是凸的，所以沿段补采几个点就能把这一情形压住。 */
  G.segTriD2 = function (p, q, a, b, c) {
    let m = G.segSegD2(p, q, a, b);
    m = Math.min(m, G.segSegD2(p, q, b, c));
    m = Math.min(m, G.segSegD2(p, q, c, a));
    m = Math.min(m, G.dist2(p, G.closestPtTri(p, a, b, c)));
    m = Math.min(m, G.dist2(q, G.closestPtTri(q, a, b, c)));
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const x = [p[0] + dx * t, p[1] + dy * t, p[2] + dz * t];
      m = Math.min(m, G.dist2(x, G.closestPtTri(x, a, b, c)));
    }
    return m;
  };

  /* 平面上两线段求交，返回 {t, u} 或 null（端点处不算） */
  G.seg2Cross = function (ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-13) return null;
    const qpx = cx - ax, qpy = cy - ay;
    const t = (qpx * sy - qpy * sx) / den;
    const u = (qpx * ry - qpy * rx) / den;
    const E = 1e-9;
    if (t <= E || t >= 1 - E || u <= E || u >= 1 - E) return null;
    return { t: t, u: u };
  };

  global.GEO = G;
})(window);
