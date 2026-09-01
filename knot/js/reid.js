/* reid.js —— Reidemeister 移动的识别
 *
 * 做法：每一步形变都自适应二分，直到该步至多引发一个图解事件；
 * 然后比较前后两帧的 Gauss 符号串（交叉点已被 τ 跟踪器配上稳定 id），
 * 按组合特征分类：
 *
 *   R1：多/少 1 个交叉点，且它的两次出现在 Gauss 串里相邻（一个小扭结）。
 *   R2：多/少 2 个交叉点 c,d，它们的出现构成两对相邻，
 *       一对全是 O（上股连过两次），另一对全是 U。
 *   R3：交叉点集合不变，但 Gauss 串的循环次序变了；
 *       恰有 3 个交叉点参与（三条股扫过一个三角形）。
 */
(function (global) {
  'use strict';
  const R = {};

  function symsOld(oldD) {
    return oldD.gauss.map((g) => ({ c: oldD.crossings[g.k].id, o: g.over ? 1 : 0 }));
  }
  function symsNew(oldD, newD, m) {
    return newD.gauss.map((g) => ({
      c: m.pair[g.k] >= 0 ? oldD.crossings[m.pair[g.k]].id : -(g.k + 1),
      o: g.over ? 1 : 0
    }));
  }

  /* 因为交叉点 id 是跨帧稳定的，对齐两条 Gauss 串时不必枚举全部旋转：
   * 用 b 里的少数几个符号做锚点，只试它们在 a 中出现的位置。
   * 这把比对从 O(m²) 降到 O(m)，在几百个交叉点的乱图上很关键。 */
  function candidateRotations(a, b, anchors) {
    const n = a.length, seen = new Set(), out = [];
    const lim = Math.min(anchors, n);
    for (let t = 0; t < lim; t++) {
      const y = b[t];
      for (let r = 0; r < n; r++) {
        if (a[r].c !== y.c || a[r].o !== y.o) continue;
        const rot = (r - t + n) % n;
        if (!seen.has(rot)) { seen.add(rot); out.push(rot); }
      }
    }
    return out;
  }

  function diffAt(a, b, r) {
    const n = a.length;
    let d = 0;
    for (let k = 0; k < n; k++) {
      const x = a[(r + k) % n], y = b[k];
      if (x.c !== y.c || x.o !== y.o) d++;
    }
    return d;
  }

  function cyclicEqual(a, b) {
    const n = a.length;
    if (b.length !== n) return false;
    if (n === 0) return true;
    for (const r of candidateRotations(a, b, 1)) if (diffAt(a, b, r) === 0) return true;
    return false;
  }

  function without(seq, ids) {
    return seq.filter((e) => !ids.has(e.c));
  }

  function positions(seq, id) {
    const out = [];
    for (let k = 0; k < seq.length; k++) if (seq[k].c === id) out.push(k);
    return out;
  }

  const adj = (a, b, n) => (a + 1) % n === b || (b + 1) % n === a;

  /* R1：新增/消失的那个交叉点，两次出现相邻 */
  function isR1(seq, id) {
    const p = positions(seq, id);
    if (p.length !== 2) return false;
    return adj(p[0], p[1], seq.length);
  }

  /* R2：两个交叉点构成两对相邻，一对全上穿、一对全下穿 */
  function isR2(seq, id1, id2) {
    const n = seq.length;
    const p = positions(seq, id1), q = positions(seq, id2);
    if (p.length !== 2 || q.length !== 2) return false;
    const tries = [[[p[0], q[0]], [p[1], q[1]]], [[p[0], q[1]], [p[1], q[0]]]];
    for (const [pa, pb] of tries) {
      if (!adj(pa[0], pa[1], n) || !adj(pb[0], pb[1], n)) continue;
      const oa = seq[pa[0]].o, ob = seq[pb[0]].o;
      if (seq[pa[1]].o === oa && seq[pb[1]].o === ob && oa !== ob) return true;
    }
    return false;
  }

  /* 循环对齐后，找出所有位置不一致处涉及的交叉点。
   * 用多个锚点取最优对齐——R-移动只改动少数几个位置，锚点里总有落在未变处的。 */
  function changedIds(a, b) {
    const n = a.length;
    if (n === 0) return { ids: new Set(), diff: 0 };
    let best = null;
    for (const r of candidateRotations(a, b, 9)) {
      const diff = diffAt(a, b, r);
      if (best === null || diff < best.diff) best = { r: r, diff: diff };
    }
    if (best === null) best = { r: 0, diff: diffAt(a, b, 0) };
    const ids = new Set();
    for (let k = 0; k < n; k++) {
      const x = a[(best.r + k) % n], y = b[k];
      if (x.c !== y.c || x.o !== y.o) { ids.add(x.c); ids.add(y.c); }
    }
    return { ids: ids, diff: best.diff };
  }

  function newIds(oldD, newD, m) {
    const out = new Array(newD.crossings.length);
    for (let b = 0; b < out.length; b++)
      out[b] = m.pair[b] >= 0 ? oldD.crossings[m.pair[b]].id : -(b + 1);
    return out;
  }
  function idxOfIds(ids, idSet) {
    const out = [];
    for (let b = 0; b < ids.length; b++) if (idSet.has(ids[b])) out.push(b);
    return out;
  }

  /* 主分类函数。
   * 返回 {kind:'none'|'R1'|'R2'|'R2t'|'R3'|'multi', dir:+1|-1|0, newIdx:[], oldIdx:[]}
   * R2t = 极薄双角形塌缩后立刻反向重开（一次相切，等于 R2⁻ 紧接 R2⁺）。 */
  R.classify = function (oldD, newD, m) {
    if (!oldD) return { kind: 'none', dir: 0, newIdx: [], oldIdx: [] };
    const A = symsOld(oldD), B = symsNew(oldD, newD, m);
    const born = m.born, died = m.died;

    if (born.length === 0 && died.length === 0) {
      if (cyclicEqual(A, B)) return { kind: 'none', dir: 0, newIdx: [], oldIdx: [] };
      const ch = changedIds(A, B);
      const ids = newIds(oldD, newD, m);
      if (ch.ids.size === 3) return { kind: 'R3', dir: 0, newIdx: idxOfIds(ids, ch.ids), oldIdx: [] };
      if (ch.ids.size === 2) {
        const pair = [...ch.ids];
        if (isR2(A, pair[0], pair[1]) && isR2(B, pair[0], pair[1]))
          return { kind: 'R2t', dir: 0, newIdx: idxOfIds(ids, ch.ids), oldIdx: [] };
      }
      return { kind: 'multi', dir: 0, newIdx: [], oldIdx: [] };
    }

    // 两生两灭：同一处双角形塌缩后重开
    if (born.length === 2 && died.length === 2) {
      const b1 = -(born[0] + 1), b2 = -(born[1] + 1);
      const d1 = oldD.crossings[died[0]].id, d2 = oldD.crossings[died[1]].id;
      if (isR2(B, b1, b2) && isR2(A, d1, d2) &&
          cyclicEqual(without(A, new Set([d1, d2])), without(B, new Set([b1, b2]))))
        return { kind: 'R2t', dir: 0, newIdx: [born[0], born[1]], oldIdx: [] };
      return { kind: 'multi', dir: 0, newIdx: [], oldIdx: [] };
    }

    // 增加交叉点
    if (died.length === 0 && born.length === 1) {
      const id = -(born[0] + 1);
      if (isR1(B, id) && cyclicEqual(without(B, new Set([id])), A))
        return { kind: 'R1', dir: 1, newIdx: [born[0]], oldIdx: [] };
      return { kind: 'multi', dir: 0, newIdx: [], oldIdx: [] };
    }
    if (died.length === 0 && born.length === 2) {
      const i1 = -(born[0] + 1), i2 = -(born[1] + 1);
      if (isR2(B, i1, i2) && cyclicEqual(without(B, new Set([i1, i2])), A))
        return { kind: 'R2', dir: 1, newIdx: [born[0], born[1]], oldIdx: [] };
      // 也可能是两个独立的 R1，交给二分继续细分
      return { kind: 'multi', dir: 0, newIdx: [], oldIdx: [] };
    }
    // 减少交叉点
    if (born.length === 0 && died.length === 1) {
      const id = oldD.crossings[died[0]].id;
      if (isR1(A, id) && cyclicEqual(without(A, new Set([id])), B))
        return { kind: 'R1', dir: -1, newIdx: [], oldIdx: [died[0]] };
      return { kind: 'multi', dir: 0, newIdx: [], oldIdx: [] };
    }
    if (born.length === 0 && died.length === 2) {
      const i1 = oldD.crossings[died[0]].id, i2 = oldD.crossings[died[1]].id;
      if (isR2(A, i1, i2) && cyclicEqual(without(A, new Set([i1, i2])), B))
        return { kind: 'R2', dir: -1, newIdx: [], oldIdx: [died[0], died[1]] };
      return { kind: 'multi', dir: 0, newIdx: [], oldIdx: [] };
    }
    return { kind: 'multi', dir: 0, newIdx: [], oldIdx: [] };
  };

  R.label = function (ev) {
    if (ev.kind === 'R1') return ev.dir > 0 ? 'R1 ↑ 生成扭转' : 'R1 ↓ 消去扭转';
    if (ev.kind === 'R2') return ev.dir > 0 ? 'R2 ↑ 叠置两股' : 'R2 ↓ 拉开两股';
    if (ev.kind === 'R2t') return 'R2 ⇄ 相切翻转（R2↓ 紧接 R2↑）';
    if (ev.kind === 'R3') return 'R3 ↔ 股过交叉';
    if (ev.kind === 'multi') return '复合变化（未能细分）';
    return '无变化';
  };

  global.REID = R;
})(window);
