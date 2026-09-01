/* render.js —— 画笔
 *
 * 3D 视图与 2D 图解共用同一条正交投影，所以「你看到的立体纽结」与
 * 「右边的平面图解」严格是同一张投影图。
 * 上下穿的画法：先整条描一遍，再按深度从远到近，在每个交叉点处
 * 用背景色加粗描一小段、再补回颜色 —— 上股自然盖住下股。
 */
(function (global) {
  'use strict';
  const R = {};

  function lerp2(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

  R.hue = function (tau) { return (tau * 300 + 195) % 360; };

  R.screenPts = function (diag, view) {
    const n = diag.n, out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = view.toScreen(diag.X[i], diag.Y[i]);
    return out;
  };

  function walkFrom(sp, n, edge, t, dir, rPix) {
    const start = lerp2(sp[edge], sp[(edge + 1) % n], t);
    const out = [start];
    let e = edge, cur = start, acc = 0, guard = 0;
    while (acc < rPix && guard++ < n) {
      const nx = dir > 0 ? sp[(e + 1) % n] : sp[e];
      const d = Math.hypot(nx[0] - cur[0], nx[1] - cur[1]);
      if (acc + d >= rPix) {
        const f = (rPix - acc) / (d || 1);
        out.push(lerp2(cur, nx, f));
        return out;
      }
      acc += d; out.push(nx); cur = nx;
      e = dir > 0 ? (e + 1) % n : (e - 1 + n) % n;
    }
    return out;
  }

  function overPiece(sp, n, c, rPix) {
    const back = walkFrom(sp, n, c.overEdge, c.overT, -1, rPix);
    const fwd = walkFrom(sp, n, c.overEdge, c.overT, 1, rPix);
    back.reverse();
    return back.concat(fwd.slice(1));
  }

  function strokePath(ctx, pts, color, width) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /* 主绘制。style:
   *  {bg, width, gap, shade, flat, showPts, ptRadius, dim} */
  R.drawKnot = function (ctx, diag, view, style, state) {
    const n = diag.n;
    const sp = R.screenPts(diag, view);
    const cum = diag.cum, total = diag.total;

    let zmin = Infinity, zmax = -Infinity;
    for (let i = 0; i < n; i++) { if (diag.Z[i] < zmin) zmin = diag.Z[i]; if (diag.Z[i] > zmax) zmax = diag.Z[i]; }
    const zr = zmax - zmin || 1;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const colorAt = (i) => {
      const tau = cum[i] / total;
      const h = R.hue(tau);
      if (style.flat) return 'hsl(' + h.toFixed(0) + ',62%,52%)';
      const l = 34 + 30 * ((diag.Z[i] - zmin) / zr);
      const s = 55 + 25 * ((diag.Z[i] - zmin) / zr);
      return 'hsl(' + h.toFixed(0) + ',' + s.toFixed(0) + '%,' + l.toFixed(0) + '%)';
    };

    // 1) 整条描一遍
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      strokePath(ctx, [sp[i], sp[j]], colorAt(i), style.width);
    }

    // 2) 按深度从远到近，重描上股
    const order = diag.crossings.map((c, k) => k).sort(
      (a, b) => diag.crossings[a].zOver - diag.crossings[b].zOver);
    const rPix = style.width * 2.2 + style.gap * 1.4;
    for (const k of order) {
      const c = diag.crossings[k];
      const piece = overPiece(sp, n, c, rPix);
      strokePath(ctx, piece, style.bg, style.width + style.gap * 2);
      strokePath(ctx, piece, colorAt(c.overEdge), style.width);
    }

    // 3) 交叉点标记
    if (style.marks) {
      for (const c of diag.crossings) {
        const s = view.toScreen(c.x, c.y);
        ctx.beginPath();
        ctx.arc(s[0], s[1], 2.2, 0, Math.PI * 2);
        ctx.fillStyle = c.sign > 0 ? 'rgba(120,200,255,.85)' : 'rgba(255,150,120,.85)';
        ctx.fill();
      }
    }

    // 4) 控制点
    if (style.showPts) {
      for (let i = 0; i < n; i++) {
        const isSel = state && state.hover === i;
        const isDrag = state && state.drag === i;
        const rr = isDrag ? style.ptRadius + 3 : isSel ? style.ptRadius + 2 : style.ptRadius;
        ctx.beginPath();
        ctx.arc(sp[i][0], sp[i][1], rr, 0, Math.PI * 2);
        ctx.fillStyle = isDrag ? '#ffd166' : isSel ? '#ffffff' : 'rgba(255,255,255,.55)';
        ctx.fill();
        if (isDrag || isSel) {
          ctx.strokeStyle = 'rgba(0,0,0,.55)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    return sp;
  };

  /* 高亮某次 Reidemeister 移动涉及的交叉点 */
  R.highlight = function (ctx, view, marks, t) {
    if (!marks || !marks.length) return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.008);
    for (const m of marks) {
      const s = view.toScreen(m.x, m.y);
      ctx.beginPath();
      ctx.arc(s[0], s[1], 10 + 5 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
  };

  R.makeView = function (cx, cy, scale) {
    return {
      cx: cx, cy: cy, scale: scale,
      toScreen: function (x, y) { return [cx + x * scale, cy - y * scale]; },
      toWorld2: function (sx, sy) { return [(sx - cx) / scale, (cy - sy) / scale]; }
    };
  };

  /* 自适应铺满：返回 {scale, bcx, bcy}（bcx/bcy 是投影包围盒中心） */
  R.fitBounds = function (diag, w, h, margin) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < diag.n; i++) {
      if (diag.X[i] < x0) x0 = diag.X[i];
      if (diag.X[i] > x1) x1 = diag.X[i];
      if (diag.Y[i] < y0) y0 = diag.Y[i];
      if (diag.Y[i] > y1) y1 = diag.Y[i];
    }
    const bw = Math.max(x1 - x0, 1e-6), bh = Math.max(y1 - y0, 1e-6);
    const s = Math.min((w - 2 * margin) / bw, (h - 2 * margin) / bh);
    return { scale: s, bcx: (x0 + x1) / 2, bcy: (y0 + y1) / 2 };
  };

  R.smoothFit = function (prev, cur, k) {
    if (!prev) return cur;
    return {
      scale: prev.scale + (cur.scale - prev.scale) * k,
      bcx: prev.bcx + (cur.bcx - prev.bcx) * k,
      bcy: prev.bcy + (cur.bcy - prev.bcy) * k
    };
  };

  R.viewFromFit = function (fit, w, h, zoom, panx, pany) {
    const s = fit.scale * (zoom || 1);
    return R.makeView(w / 2 - fit.bcx * s + (panx || 0), h / 2 + fit.bcy * s + (pany || 0), s);
  };

  global.RENDER = R;
})(window);
