/* library.js —— 经典纽结库
 *
 * 两种生成方式：
 *   1) 参数曲线（环面纽结 T(p,q)、八字结等经典公式）；
 *   2) 辫子闭包：给定 B_m 中的辫字（KnotInfo 的标准辫字），在实心环面里
 *      显式嵌入闭辫，从而覆盖非环面纽结与合成纽结。
 * 生成后统一重采样为 N 个顶点、归一化尺度、加微小扰动破除退化对称。
 */
(function (global) {
  'use strict';
  const G = global.GEO, K = global.KNOT;
  const L = {};

  /* ---------- 基础工具 ---------- */

  function sampleCurve(f, steps) {
    const out = [];
    for (let k = 0; k < steps; k++) out.push(f(k / steps));
    return out;
  }

  function resample(pts, N) {
    const n = pts.length, seg = new Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) { seg[i] = G.dist(pts[i], pts[(i + 1) % n]); total += seg[i]; }
    const out = [];
    let i = 0, acc = 0;
    for (let k = 0; k < N; k++) {
      const target = (total * k) / N;
      while (i < n - 1 && acc + seg[i] < target) { acc += seg[i]; i++; }
      const f = seg[i] > 1e-12 ? (target - acc) / seg[i] : 0;
      out.push(G.lerp(pts[i], pts[(i + 1) % n], G.clamp(f, 0, 1)));
    }
    return out;
  }

  function normalize(pts) {
    const c = K.centroid(pts);
    let r = 0;
    for (const p of pts) r = Math.max(r, G.dist(p, c));
    const s = r > 1e-9 ? 1 / r : 1;
    return pts.map((p) => G.mul(G.sub(p, c), s));
  }

  // 确定性伪随机，保证同一个库条目每次生成一致
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function jitter(pts, amp, seed) {
    const r = rng(seed);
    return pts.map((p) => [p[0] + (r() - 0.5) * amp, p[1] + (r() - 0.5) * amp, p[2] + (r() - 0.5) * amp]);
  }

  /* ---------- 参数曲线 ---------- */

  // (p,q) 环面纽结：绕轴 p 圈、绕管 q 圈
  function torus(p, q) {
    return function (s) {
      const t = 2 * Math.PI * p * s;
      const a = (q * t) / p;
      const R = 2 + Math.cos(a);
      return [R * Math.cos(t), R * Math.sin(t), Math.sin(a)];
    };
  }

  // 八字结 4_1 的经典参数式
  function figure8(s) {
    const t = 2 * Math.PI * s;
    return [(2 + Math.cos(2 * t)) * Math.cos(3 * t),
            (2 + Math.cos(2 * t)) * Math.sin(3 * t),
             Math.sin(4 * t)];
  }

  function circle(s) {
    const t = 2 * Math.PI * s;
    return [Math.cos(t), Math.sin(t), 0.12 * Math.sin(2 * t)];
  }

  /* ---------- 辫子闭包 ---------- */

  /* word: 形如 [1,1,-2,1] 的辫字（σ_i 记作 i，σ_i^{-1} 记作 -i）；
   * strands: 辫子股数 m。把 m 股放在 m 个不同半径上绕轴一周，
   * 每个字母占一列，交换所涉两股的半径，并在 z 方向分开上下。 */
  function braidCurve(word, strands, opt) {
    opt = opt || {};
    const R0 = opt.R0 || 1.7, dR = opt.dR || 0.42, h = opt.h || 0.42;
    const per = opt.samples || 9;
    const m = word.length;
    const radius = (k) => R0 + k * dR;
    const pts = [];
    let level = 0, loops = 0;
    do {
      for (let j = 0; j < m; j++) {
        const g = word[j], a = Math.abs(g) - 1, b = a + 1;
        const involved = level === a || level === b;
        const goingUp = level === a;
        // σ_i：由内向外的那股走上方（z>0）；σ_i^{-1} 反之
        const zs = g > 0 ? (goingUp ? 1 : -1) : (goingUp ? -1 : 1);
        for (let k = 0; k < per; k++) {
          const u = k / per;
          const th = (2 * Math.PI * (j + u)) / m;
          let rad, z;
          if (involved) {
            const f = (1 - Math.cos(Math.PI * u)) / 2;
            const from = radius(level), to = radius(level === a ? b : a);
            rad = from + (to - from) * f;
            z = zs * h * Math.sin(Math.PI * u);
          } else { rad = radius(level); z = 0; }
          pts.push([rad * Math.cos(th), rad * Math.sin(th), z]);
        }
        if (involved) level = level === a ? b : a;
      }
      loops++;
    } while (level !== 0 && loops < strands + 2);
    return pts;
  }

  /* ---------- 库条目 ---------- */

  const ENTRIES = [
    { id: '0_1',   name: '平凡结 0₁',        note: '圆周（不打结）',          make: () => sampleCurve(circle, 200),      alex: [1] },
    { id: '3_1',   name: '三叶结 3₁',        note: 'T(2,3) 环面纽结',        make: () => sampleCurve(torus(2, 3), 300), alex: [1, -1, 1] },
    { id: '4_1',   name: '八字结 4₁',        note: '最简的双向可逆两性结',    make: () => sampleCurve(figure8, 300),     alex: [-1, 3, -1] },
    { id: '5_1',   name: '五叶结 5₁',        note: 'T(2,5) 环面纽结',        make: () => sampleCurve(torus(2, 5), 360), alex: [1, -1, 1, -1, 1] },
    { id: '5_2',   name: '5₂',              note: '辫字 σ₁³σ₂σ₁⁻¹σ₂',        make: () => braidCurve([1, 1, 1, 2, -1, 2], 3), alex: [2, -3, 2] },
    { id: '6_1',   name: '装卸工结 6₁',      note: '辫字 σ₁²σ₂σ₁⁻¹σ₃⁻¹σ₂σ₃⁻¹', make: () => braidCurve([1, 1, 2, -1, -3, 2, -3], 4), alex: [-2, 5, -2] },
    { id: '6_2',   name: '6₂',              note: '辫字 σ₁³σ₂⁻¹σ₁σ₂⁻¹',      make: () => braidCurve([1, 1, 1, -2, 1, -2], 3), alex: [-1, 3, -3, 3, -1] },
    { id: '6_3',   name: '6₃',              note: '辫字 σ₁²σ₂⁻¹σ₁σ₂⁻²',      make: () => braidCurve([1, 1, -2, 1, -2, -2], 3), alex: [1, -3, 5, -3, 1] },
    { id: '7_1',   name: '七叶结 7₁',        note: 'T(2,7) 环面纽结',        make: () => sampleCurve(torus(2, 7), 420), alex: [1, -1, 1, -1, 1, -1, 1] },
    { id: '8_19',  name: '8₁₉',             note: 'T(3,4) 环面纽结',        make: () => sampleCurve(torus(3, 4), 480), alex: [1, -1, 0, 1, 0, -1, 1] },
    { id: 'granny', name: '祖母结 3₁#3₁',    note: '两个同手性三叶结的连通和', make: () => braidCurve([1, 1, 1, 2, 2, 2], 3), alex: [1, -2, 3, -2, 1] },
    { id: 'square', name: '方结 3₁#3₁*',     note: '两个反手性三叶结的连通和', make: () => braidCurve([1, 1, 1, -2, -2, -2], 3), alex: [1, -2, 3, -2, 1] },
    { id: 'tangled', name: '缠绕的平凡结',   note: '由圆周经上百次 Δ-move 打乱而成，仍是平凡结', make: null, alex: [1], tangle: 60 }
  ];

  L.entries = ENTRIES;

  /* 生成一个库条目的折线；tangleFn 由 app 提供（需要安全移动机制） */
  L.build = function (entry, N, tangleFn) {
    let pts;
    if (entry.tangle) {
      pts = normalize(resample(sampleCurve(circle, 200), N));
      pts = jitter(pts, 0.004, 12345);
      if (tangleFn) pts = tangleFn(pts, entry.tangle, 987654321);
      return pts;
    }
    pts = entry.make();
    pts = normalize(resample(pts, N));
    pts = jitter(pts, 0.004, 20240726);
    return pts;
  };

  L.resample = resample;
  L.normalize = normalize;
  L.rng = rng;

  global.LIB = L;
})(window);
