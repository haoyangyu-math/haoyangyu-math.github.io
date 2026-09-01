/* recorder.js —— 同痕的记录与回放
 *
 * 记录的是「操作流」而不是每帧快照：每条操作都可逆，因此时间轴既能
 * 前进也能后退，占用也很小。
 *   m     : 移动第 i 个控制点
 *   ins   : 在第 at 处插入控制点（几何上是恒等操作 —— 在边上取点）
 *   del   : 删除第 at 个控制点（删除前已把它移到相邻两点的中点，同样是恒等）
 *   cam   : 视角变化
 *   scale : 绕定点 c 整体放缩 s 倍
 *
 * scale 不是逐顶点的 Δ-move —— 拆成 n 次单点移动的话每一次单独都不合法。
 * 但它是 ℝ³ 的相似变换，图解在组合意义上完全不变（交叉点只是跟着缩放），
 * 所以它作为一整条操作被记录，既是同痕也不产生 R-移动事件。
 * 逆操作是绕同一个 c 放缩 1/s，故时间轴照样能倒退。
 */
(function (global) {
  'use strict';

  function Recorder() { this.ops = []; this.cursor = 0; }

  Recorder.prototype.reset = function (pts, cam) {
    this.initPts = pts.map((p) => p.slice());
    this.initCam = { yaw: cam.yaw, pitch: cam.pitch };
    this.ops = [];
    this.cursor = 0;
    this.t0 = performance.now();
    this.clock = 0;
  };

  Recorder.prototype.now = function () { return performance.now() - this.t0; };

  /* 在当前位置立一道「不许合并」的栅栏。
   * push 会把相邻的同顶点小移动并进上一条操作里 —— 那等于**改写**一条已经
   * 记下的操作。谁要是记住了 ops.length 这个位置、打算日后 seek 回来
   * （自动简化留底最好构形就是这么做的），改写就会让它回到别的地方去。 */
  Recorder.prototype.barrier = function () { this.noMerge = true; };

  Recorder.prototype.push = function (op) {
    if (this.cursor < this.ops.length) this.ops.length = this.cursor;  // 截断被覆盖的未来
    op.t = this.now();
    // 相邻的同类无事件小操作合并，避免操作流爆炸
    const last = this.noMerge ? null : this.ops[this.ops.length - 1];
    this.noMerge = false;
    if (last && !last.ev && !op.ev && op.t - last.t < 60) {
      if (op.k === 'm' && last.k === 'm' && last.i === op.i) { last.to = op.to; last.t = op.t; return; }
      if (op.k === 'cam' && last.k === 'cam') { last.to = op.to; last.t = op.t; return; }
    }
    this.ops.push(op);
    this.cursor = this.ops.length;
  };

  function scaleAbout(pts, c, s) {
    for (const p of pts) {
      p[0] = c[0] + (p[0] - c[0]) * s;
      p[1] = c[1] + (p[1] - c[1]) * s;
      p[2] = c[2] + (p[2] - c[2]) * s;
    }
  }

  Recorder.prototype.forward = function (op, S) {
    if (op.k === 'm') S.pts[op.i] = op.to.slice();
    else if (op.k === 'ins') S.pts.splice(op.at, 0, op.p.slice());
    else if (op.k === 'del') S.pts.splice(op.at, 1);
    else if (op.k === 'cam') { S.cam.yaw = op.to.yaw; S.cam.pitch = op.to.pitch; }
    else if (op.k === 'scale') scaleAbout(S.pts, op.c, op.s);
  };

  Recorder.prototype.backward = function (op, S) {
    if (op.k === 'm') S.pts[op.i] = op.from.slice();
    else if (op.k === 'ins') S.pts.splice(op.at, 1);
    else if (op.k === 'del') S.pts.splice(op.at, 0, op.p.slice());
    else if (op.k === 'cam') { S.cam.yaw = op.from.yaw; S.cam.pitch = op.from.pitch; }
    else if (op.k === 'scale') scaleAbout(S.pts, op.c, 1 / op.s);
  };

  /* 把状态推到第 k 步（0 = 初始状态） */
  Recorder.prototype.seek = function (k, S) {
    k = Math.max(0, Math.min(this.ops.length, k));
    while (this.cursor > k) { this.cursor--; this.backward(this.ops[this.cursor], S); }
    while (this.cursor < k) { this.forward(this.ops[this.cursor], S); this.cursor++; }
  };

  Recorder.prototype.restart = function (S) {
    S.pts.length = 0;
    for (const p of this.initPts) S.pts.push(p.slice());
    S.cam.yaw = this.initCam.yaw; S.cam.pitch = this.initCam.pitch;
    this.cursor = 0;
  };

  Recorder.prototype.duration = function () {
    return this.ops.length ? this.ops[this.ops.length - 1].t : 0;
  };

  Recorder.prototype.events = function () {
    const out = [];
    for (let i = 0; i < this.ops.length; i++) if (this.ops[i].ev) out.push({ idx: i + 1, op: this.ops[i] });
    return out;
  };

  Recorder.prototype.toJSON = function (meta) {
    return JSON.stringify({
      format: 'knot-isotopy/1',
      meta: meta || {},
      initPts: this.initPts,
      initCam: this.initCam,
      ops: this.ops.map((o) => {
        const r = { k: o.k, t: Math.round(o.t) };
        if (o.k === 'm') { r.i = o.i; r.from = o.from.map(rd); r.to = o.to.map(rd); }
        if (o.k === 'ins' || o.k === 'del') { r.at = o.at; r.p = o.p.map(rd); }
        if (o.k === 'cam') { r.from = o.from; r.to = o.to; }
        // 放缩比例不做取整：它是**累乘**的，任何截断都会在几百步之后
        // 把整条曲线的尺度带偏，而坐标的截断只是各自的局部误差。
        if (o.k === 'scale') { r.c = o.c.map(rd); r.s = o.s; }
        if (o.ev) r.ev = { kind: o.ev.kind, dir: o.ev.dir, cause: o.ev.cause };
        return r;
      })
    });
  };

  /* 坐标精度：自动简化会让两股贴到 0.01 条边长，1e-5 的截断与之同量级 ——
   * 存盘再读回来算出的图解可能与原来不同。取到 1e-7 才在余量之下。 */
  function rd(x) { return Math.round(x * 1e7) / 1e7; }

  Recorder.prototype.fromJSON = function (txt) {
    const o = JSON.parse(txt);
    if (!o || o.format !== 'knot-isotopy/1') throw new Error('文件格式不匹配');
    this.initPts = o.initPts.map((p) => p.slice());
    this.initCam = o.initCam;
    this.ops = o.ops;
    this.cursor = 0;
    this.t0 = performance.now();
    return o.meta || {};
  };

  global.Recorder = Recorder;
})(window);
