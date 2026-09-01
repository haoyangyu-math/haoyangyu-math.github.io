/* alex.js —— 由图解计算 Alexander 多项式
 *
 * Wirtinger 表示 + Fox 自由微分。设交叉点的上股为 c，下股由 a 进、b 出：
 *   正交叉：(1-t)·c + t·a - b = 0
 *   负交叉：(1-t)·c + t·b - a = 0
 * 划去任意一行一列后取行列式，即 Δ(t)（相差 ±t^k）。
 * 行列式用 ℤ[t] 上的 Bareiss 分数自由消元精确计算（BigInt 系数）。
 */
(function (global) {
  'use strict';
  const A = {};

  /* ---------- ℤ[t] 多项式（系数数组，下标 = t 的次数） ---------- */
  function pTrim(a) {
    let k = a.length - 1;
    while (k > 0 && a[k] === 0n) k--;
    return a.slice(0, k + 1);
  }
  const pZero = (a) => a.length === 1 && a[0] === 0n;
  function pAdd(a, b) {
    const n = Math.max(a.length, b.length), r = new Array(n);
    for (let i = 0; i < n; i++) r[i] = (a[i] || 0n) + (b[i] || 0n);
    return pTrim(r);
  }
  function pSub(a, b) {
    const n = Math.max(a.length, b.length), r = new Array(n);
    for (let i = 0; i < n; i++) r[i] = (a[i] || 0n) - (b[i] || 0n);
    return pTrim(r);
  }
  function pMul(a, b) {
    if (pZero(a) || pZero(b)) return [0n];
    const r = new Array(a.length + b.length - 1).fill(0n);
    for (let i = 0; i < a.length; i++) {
      if (a[i] === 0n) continue;
      for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j];
    }
    return pTrim(r);
  }
  function pNeg(a) { return a.map((x) => -x); }
  /* 精确除法（Bareiss 保证整除） */
  function pDivExact(a, b) {
    a = pTrim(a); b = pTrim(b);
    if (pZero(a)) return [0n];
    const da = a.length - 1, db = b.length - 1;
    if (da < db) return [0n];
    const q = new Array(da - db + 1).fill(0n);
    const r = a.slice();
    for (let k = da - db; k >= 0; k--) {
      const c = r[k + db] / b[db];
      q[k] = c;
      if (c !== 0n) for (let j = 0; j <= db; j++) r[k + j] -= c * b[j];
    }
    return pTrim(q);
  }

  function detPoly(M, n) {
    if (n === 0) return [1n];
    let sign = 1n, prev = [1n];
    for (let k = 0; k < n - 1; k++) {
      if (pZero(M[k][k])) {
        let p = -1;
        for (let r = k + 1; r < n; r++) if (!pZero(M[r][k])) { p = r; break; }
        if (p < 0) return [0n];
        const t = M[k]; M[k] = M[p]; M[p] = t; sign = -sign;
      }
      for (let i = k + 1; i < n; i++) {
        for (let j = k + 1; j < n; j++) {
          M[i][j] = pDivExact(pSub(pMul(M[i][j], M[k][k]), pMul(M[i][k], M[k][j])), prev);
        }
        M[i][k] = [0n];
      }
      prev = M[k][k];
    }
    return sign === 1n ? M[n - 1][n - 1] : pNeg(M[n - 1][n - 1]);
  }

  /* ---------- 由图解构造 Alexander 矩阵 ---------- */
  A.compute = function (diag, maxCross) {
    const nc = diag.crossings.length;
    if (nc === 0) return { ok: true, coeffs: [1], text: '1' };
    if (nc > (maxCross || 80)) return { ok: false, reason: 'too-many', n: nc };

    const arcs = global.DIAG.arcs(diag);
    if (!arcs) return { ok: false, reason: 'degenerate' };
    const seq = diag.gauss, m = seq.length;

    // 每个交叉点的上穿弧、下穿进弧/出弧
    const over = new Array(nc).fill(-1), inArc = new Array(nc).fill(-1), outArc = new Array(nc).fill(-1);
    for (let k = 0; k < m; k++) {
      const g = seq[k], c = g.k;
      if (g.over) over[c] = arcs.arcAt[k];
      else { outArc[c] = arcs.arcAt[k]; inArc[c] = (arcs.arcAt[k] - 1 + nc) % nc; }
    }
    for (let c = 0; c < nc; c++) if (over[c] < 0 || inArc[c] < 0) return { ok: false, reason: 'degenerate' };

    const M = [];
    for (let c = 0; c < nc; c++) {
      const row = [];
      for (let j = 0; j < nc; j++) row.push([0n]);
      const s = diag.crossings[c].sign;
      row[over[c]] = pAdd(row[over[c]], [1n, -1n]);              // (1-t)
      if (s > 0) {
        row[inArc[c]] = pAdd(row[inArc[c]], [0n, 1n]);           // + t·a
        row[outArc[c]] = pAdd(row[outArc[c]], [-1n]);            // - b
      } else {
        row[outArc[c]] = pAdd(row[outArc[c]], [0n, 1n]);         // + t·b
        row[inArc[c]] = pAdd(row[inArc[c]], [-1n]);              // - a
      }
      M.push(row);
    }
    // 划去最后一行、最后一列
    const N = nc - 1;
    const S = [];
    for (let i = 0; i < N; i++) S.push(M[i].slice(0, N));
    let det = detPoly(S, N);

    // 归一化：去掉 t^k 因子，使最低次为常数项；再定符号使 Δ(1)=+1
    det = pTrim(det);
    let lo = 0;
    while (lo < det.length - 1 && det[lo] === 0n) lo++;
    det = det.slice(lo);
    if (pZero(det)) return { ok: false, reason: 'zero' };
    let at1 = 0n;
    for (const c of det) at1 += c;
    if (at1 < 0n) { det = pNeg(det); at1 = -at1; }   // 定符号使 Δ(1) = +1

    const coeffs = det.map((x) => Number(x));
    return { ok: true, coeffs: coeffs, text: A.format(coeffs), at1: Number(at1) };
  };

  /* 以 t 的对称 Laurent 形式排版：中心次数为 -(d/2) .. (d/2) */
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sup(k) { return String(k).split('').map((ch) => SUP[ch] || ch).join(''); }

  A.format = function (coeffs) {
    const d = coeffs.length - 1;
    if (d === 0) return String(coeffs[0]);
    const half = d % 2 === 0 ? d / 2 : 0;      // 偶次时居中成对称 Laurent 形式
    const parts = [];
    for (let i = d; i >= 0; i--) {
      const c = coeffs[i];
      if (c === 0) continue;
      const e = i - half;
      const ae = Math.abs(c);
      const base = e === 0 ? '' : e === 1 ? 't' : 't' + sup(e);
      const term = base === '' ? String(ae) : (ae === 1 ? '' : ae) + base;
      parts.push((c < 0 ? '− ' : parts.length ? '+ ' : '') + term);
    }
    return parts.join(' ');
  };

  /* Alexander 多项式 → 常见纽结名（不足以完全区分纽结，仅作提示） */
  const TABLE = {
    '1': '0₁ 平凡结',
    '1,-1,1': '3₁ 三叶结',
    '-1,3,-1': '4₁ 八字结',
    '1,-1,1,-1,1': '5₁',
    '2,-3,2': '5₂',
    '-2,5,-2': '6₁（或 9₄₆）',
    '-1,3,-3,3,-1': '6₂',
    '1,-3,5,-3,1': '6₃',
    '1,-1,1,-1,1,-1,1': '7₁',
    '3,-5,3': '7₂',
    '2,-3,3,-3,2': '7₃',
    '4,-7,4': '7₄',
    '1,-2,3,-2,1': '3₁#3₁（祖母结／方结）',
    '1,-1,0,1,0,-1,1': '8₁₉',
    '1,-1,1,-1,1,-1,1,-1,1': '9₁',
    '-3,7,-3': '8₁'
  };

  A.identify = function (coeffs) {
    if (!coeffs) return null;
    const key = coeffs.join(',');
    if (TABLE[key]) return TABLE[key];
    const rev = coeffs.slice().reverse().join(',');
    if (TABLE[rev]) return TABLE[rev];
    return null;
  };

  A.eq = function (a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  /* 纽结行列式 |Δ(-1)| */
  A.determinant = function (coeffs) {
    if (!coeffs) return null;
    let s = 0;
    for (let i = 0; i < coeffs.length; i++) s += coeffs[i] * (i % 2 === 0 ? 1 : -1);
    return Math.abs(s);
  };

  global.ALEX = A;
})(window);
