
"use strict";

(() => {

if (!new URLSearchParams(location.search).get("theme") &&
    matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.dataset.theme = "dark";

function makeWasi(getMemory) {
  const NOSUP = 58, BADF = 8, OK = 0;
  const td = new TextDecoder();
  const view = () => new DataView(getMemory().buffer);
  return {
    args_get: () => OK,
    args_sizes_get: (c, s) => { const v = view(); v.setUint32(c, 0, true); v.setUint32(s, 0, true); return OK; },
    environ_get: () => OK,
    environ_sizes_get: (c, s) => { const v = view(); v.setUint32(c, 0, true); v.setUint32(s, 0, true); return OK; },
    clock_time_get: (id, p, out) => { view().setBigUint64(out, BigInt(Math.round(performance.now() * 1e6)), true); return OK; },
    fd_close: () => BADF, fd_fdstat_get: () => BADF, fd_filestat_get: () => BADF,
    fd_filestat_set_size: () => BADF, fd_filestat_set_times: () => BADF,
    fd_prestat_get: () => BADF, fd_prestat_dir_name: () => BADF,
    fd_read: () => BADF, fd_readdir: () => BADF, fd_seek: () => BADF, fd_tell: () => BADF,
    fd_write: (fd, iovs, count, written) => {
      const v = view();
      let total = 0, text = "";
      for (let i = 0; i < count; i++) {
        const ptr = v.getUint32(iovs + i * 8, true), len = v.getUint32(iovs + i * 8 + 4, true);
        text += td.decode(new Uint8Array(getMemory().buffer, ptr, len));
        total += len;
      }
      if (text.trim()) console.log("[engine]", text);
      v.setUint32(written, total, true);
      return OK;
    },
    path_create_directory: () => NOSUP, path_filestat_get: () => NOSUP,
    path_filestat_set_times: () => NOSUP, path_open: () => NOSUP,
    path_readlink: () => NOSUP, path_remove_directory: () => NOSUP,
    path_rename: () => NOSUP, path_unlink_file: () => NOSUP,
    poll_oneoff: () => NOSUP,
    proc_exit: code => { throw new Error("engine exit " + code); },
    random_get: (ptr, len) => { crypto.getRandomValues(new Uint8Array(getMemory().buffer, ptr, len)); return OK; }
  };
}

class Engine {
  constructor(instance) {
    this.e = instance.exports;
    this.enc = new TextEncoder();
    this.dec = new TextDecoder();
  }
  prepare(formula) {
    const b = this.enc.encode(formula);
    const p = this.e.walloc(b.length);
    new Uint8Array(this.e.memory.buffer, p, b.length).set(b);
    const slot = this.e.prepare(p, b.length);
    this.e.wfree(p);
    if (slot < 0) throw new Error(this.note());
    return slot;
  }
  note() {
    const cap = 512, p = this.e.walloc(cap);
    const n = this.e.note(p, cap);
    const s = this.dec.decode(new Uint8Array(this.e.memory.buffer, p, n));
    this.e.wfree(p);
    return s || "parse error";
  }
  evalAt(slot, x) { return this.e.evalat(slot, x); }
  sample(slot, lo, hi, count) {
    const p = this.e.walloc(count * 8);
    this.e.sample(slot, lo, hi, count, p);
    const out = new Float64Array(this.e.memory.buffer.slice(p, p + count * 8));
    this.e.wfree(p);
    return out;
  }
  drop(slot) { this.e.drop(slot); }
}

function bisect(g, a, b) {
  let fa = g(a);
  for (let i = 0; i < 24; i++) {
    const m = (a + b) / 2, fm = g(m);
    if (!isFinite(fm)) break;
    if ((fa <= 0) !== (fm <= 0)) b = m; else { a = m; fa = fm; }
  }
  return (a + b) / 2;
}

function vertex(x0, y0, x1, y1, x2, y2) {
  const d = (x0 - x1) * (x0 - x2) * (x1 - x2);
  if (!d) return x1;
  const a = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / d;
  if (!a) return x1;
  const b = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / d;
  const x = -b / (2 * a);
  return (x > Math.min(x0, x2) && x < Math.max(x0, x2)) ? x : x1;
}

const HOST = {
  engine: null,
  queue: [],
  listener: null,
  state: { cs: "cartesian", formulas: [], options: null },
  slots: new Map(),
  grids: [],
  
  opt: null
};

const pixelSize = () => {
  const o = HOST.opt;
  if (!o || !o.canvasW || !o.canvasH || !o.maxX || !o.maxY) return 0;
  return (2 * o.maxX / o.canvasW + 2 * o.maxY / o.canvasH) / 2;
};

const reply = m => {
  if (HOST.listener) HOST.listener({ data: JSON.stringify(m) });
};

function slotFor(text) {
  if (HOST.slots.has(text)) return HOST.slots.get(text);
  const slot = HOST.engine.prepare(text);
  HOST.slots.set(text, slot);
  return slot;
}
function dropStale(keep) {
  for (const [text, slot] of [...HOST.slots])
    if (!keep.has(text)) { HOST.engine.drop(slot); HOST.slots.delete(text); }
}

const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const PALETTE = ["--c1", "--c2", "--c3", "--c4", "--c5"];

function extremaCount(ys) {
  let e = 0;
  for (let k = 1; k + 1 < ys.length; k++) {
    const a = ys[k] - ys[k - 1], b = ys[k + 1] - ys[k];
    if (isFinite(a) && isFinite(b) && (a > 0) !== (b > 0)) e++;
  }
  return e;
}

function doBuild(m) {
  const o = m.options, polar = m.cs === "polar";
  HOST.opt = o;
  HOST.state = { cs: m.cs, formulas: m.formulas, options: o };
  reply({ type: "busy" });

  const t0 = performance.now();
  const keep = new Set(m.formulas.filter(f => f.on).map(f => f.text));
  dropStale(keep);

  const base = Math.max(300, Math.round((o.quality || 18) * 90));
  let count = Math.min(9000, o.precise ? base * 2 : base) | 0;

  const lo = polar ? 0 : o.centerX - o.maxX;
  const hi = polar ? (o.polarAngle || 360) * Math.PI / 180 : o.centerX + o.maxX;

  const active = [];
  let firstError = "";
  m.formulas.forEach((f, i) => {
    if (!f.on) return;
    try { active.push({ i, slot: slotFor(f.text) }); }
    catch (e) { if (!firstError) firstError = f.text + ": " + e.message; }
  });

  let samples = active.map(a => HOST.engine.sample(a.slot, lo, hi, count));

  
  if (o.autoquality) {
    const wave = Math.max(0, ...samples.map(extremaCount));
    const ideal = Math.min(9000, Math.max(count, wave * 12));
    if (ideal > count * 1.25) {
      count = ideal;
      samples = active.map(a => HOST.engine.sample(a.slot, lo, hi, count));
    }
  }

  const xs = new Float64Array(count);
  for (let k = 0; k < count; k++) xs[k] = lo + (hi - lo) * k / (count - 1);

  const list = [];
  HOST.grids = [];
  let total = 0;

  active.forEach((a, n) => {
    const i = a.i;
    const ys = samples[n];
    HOST.grids.push({ i, xs, ys, polar, slot: a.slot });

    const lim = polar ? 1e6 : Math.abs(o.centerY) + o.maxY * 50;
    const seg = [];
    let cur = [];
    for (let k = 0; k < count; k++) {
      const v = ys[k];
      if (!isFinite(v) || Math.abs(v) > lim) {
        if (cur.length >= 4) seg.push(cur);
        cur = [];
        continue;
      }
      if (polar) cur.push(v * Math.cos(xs[k]), v * Math.sin(xs[k]));
      else cur.push(xs[k], v);
      total++;
    }
    if (cur.length >= 4) seg.push(cur);
    const color = o.multicolor ? cssVar(PALETTE[i % PALETTE.length]) : cssVar(o.penColor || "--c1");
    list.push({ i, color, on: true, seg });
  });

  const ms = Math.max(1, Math.round(performance.now() - t0));
  reply({ type: "curves", list, points: total, ms, error: firstError || undefined });

  if (o.cross) reply(Object.assign({ type: "overlaps" }, findOverlaps()));
  if (o.peak) reply({ type: "extremes", ...findExtremes() });
}

function segmentCross(a, b, c, d) {
  const ax = b.x - a.x, ay = b.y - a.y, bx = d.x - c.x, by = d.y - c.y;
  const denominator = ax * by - ay * bx;
  if (!denominator) return null;
  const af = ((c.x - a.x) * by - (c.y - a.y) * bx) / denominator;
  const bf = ((c.x - a.x) * ay - (c.y - a.y) * ax) / denominator;
  if (af < 0 || af > 1 || bf < 0 || bf > 1) return null;
  return { x: a.x + af * ax, y: a.y + af * ay };
}

function nearestOnSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const span = vx * vx + vy * vy;
  if (!span) return { x: a.x, y: a.y };
  let factor = ((p.x - a.x) * vx + (p.y - a.y) * vy) / span;
  if (factor < 0) factor = 0;
  if (factor > 1) factor = 1;
  return { x: a.x + factor * vx, y: a.y + factor * vy };
}

function segmentsGap(a, b, c, d) {
  let best = Infinity, point = a;
  const take = (from, till) => {
    const value = Math.hypot(from.x - till.x, from.y - till.y);
    if (value >= best) return;
    best = value;
    point = { x: (from.x + till.x) / 2, y: (from.y + till.y) / 2 };
  };
  take(a, nearestOnSegment(a, c, d));
  take(b, nearestOnSegment(b, c, d));
  take(c, nearestOnSegment(c, a, b));
  take(d, nearestOnSegment(d, a, b));
  return { gap: best, point };
}

function segmentsAside(a, b, c, d) {
  const dx = Math.max(Math.min(a.x, b.x) - Math.max(c.x, d.x),
                      Math.min(c.x, d.x) - Math.max(a.x, b.x));
  const dy = Math.max(Math.min(a.y, b.y) - Math.max(c.y, d.y),
                      Math.min(c.y, d.y) - Math.max(a.y, b.y));
  return Math.max(0, dx, dy);
}

function findOverlaps() {
  const out = [];

  let total = 0;

  const same = [];
  const LIMIT = 256;
  
  const near = (p, q, grain) => Math.hypot(p.x - q.x, p.y - q.y) <=
    (grain || 1e-6 * Math.max(1, Math.abs(p.x), Math.abs(p.y)));
  
  const put = (p, grain, a, b, arg) => {
    if (out.some(q => near(p, q, grain))) return;
    total++;
    if (out.length < LIMIT) out.push({ x: p.x, y: p.y, a: a, b: b, arg: arg });
  };

  // The argument step of a grid: the sampling is uniform.
  const step = G => G.xs.length > 1
    ? Math.abs(G.xs[G.xs.length - 1] - G.xs[0]) / (G.xs.length - 1) : 0;

  const at = (G, k) => G.polar
    ? { x: G.ys[k] * Math.cos(G.xs[k]), y: G.ys[k] * Math.sin(G.xs[k]) }
    : { x: G.xs[k], y: G.ys[k] };

  const eval2 = (G, t) => {
    const v = HOST.engine.evalAt(G.slot, t);
    if (!isFinite(v)) return null;
    return G.polar ? { x: v * Math.cos(t), y: v * Math.sin(t) } : { x: t, y: v };
  };

  
  const refine = (A, B, a0, a1, b0, b1, point) => {
    const chords = (af, at_, bf, bt) => {
      const p = eval2(A, af), q = eval2(A, at_);
      const r = eval2(B, bf), s = eval2(B, bt);
      if (!p || !q || !r || !s) return null;
      return segmentCross(p, q, r, s);
    };
    for (let depth = 0; depth < 24; depth++) {
      const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
      let value = chords(a0, am, b0, bm);
      if (value) { a1 = am; b1 = bm; }
      else if ((value = chords(a0, am, bm, b1))) { a1 = am; b0 = bm; }
      else if ((value = chords(am, a1, b0, bm))) { a0 = am; b1 = bm; }
      else if ((value = chords(am, a1, bm, b1))) { a0 = am; b0 = bm; }
      else break;
      point = value;
    }
    return point;
  };

  
  const approach = (A, B, a0, a1, b0, b1, point) => {
    const c = eval2(B, b0), d = eval2(B, b1);
    if (!c || !d) return point;
    
    const reach = u => {
      const p = eval2(A, u);
      if (!p) return null;
      const near = nearestOnSegment(p, c, d);
      return { gap: Math.hypot(p.x - near.x, p.y - near.y),
        point: { x: (p.x + near.x) / 2, y: (p.y + near.y) / 2 } };
    };
    for (let depth = 0; depth < 60; depth++) {
      const one = a0 + (a1 - a0) / 3, two = a1 - (a1 - a0) / 3;
      const left = reach(one), right = reach(two);
      if (!left || !right) break;
      if (left.gap <= right.gap) a1 = two; else a0 = one;
    }
    return reach((a0 + a1) / 2) || { gap: Infinity, point };
  };

  for (let a = 0; a < HOST.grids.length; a++)
    for (let b = a + 1; b < HOST.grids.length; b++) {
      const A = HOST.grids[a], B = HOST.grids[b];
      
      const side = 128;
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      const box = G => {
        for (let k = 0; k < G.xs.length; k++) {
          if (!isFinite(G.ys[k])) continue;
          const p = at(G, k);
          if (p.x < left) left = p.x;
          if (p.x > right) right = p.x;
          if (p.y < top) top = p.y;
          if (p.y > bottom) bottom = p.y;
        }
      };
      box(A);
      box(B);
      if (!isFinite(left)) continue;
      const stepX = (right - left) / side || 1, stepY = (bottom - top) / side || 1;
      const cell = (value, least, step) =>
        Math.min(side - 1, Math.max(0, Math.floor((value - least) / step)));
      const cells = new Map();
      for (let l = 0; l + 1 < B.xs.length; l++) {
        if (!isFinite(B.ys[l]) || !isFinite(B.ys[l + 1])) continue;
        const p = at(B, l), q = at(B, l + 1);
        for (let x = cell(Math.min(p.x, q.x), left, stepX); x <= cell(Math.max(p.x, q.x), left, stepX); x++)
          for (let y = cell(Math.min(p.y, q.y), top, stepY); y <= cell(Math.max(p.y, q.y), top, stepY); y++) {
            const key = y * side + x;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(l);
          }
      }
      const seen = new Int32Array(B.xs.length);
      let mark = 0;
      
      const gap = new Float64Array(A.xs.length).fill(Infinity);
      const gapPoint = new Array(A.xs.length);
      const gapMate = new Int32Array(A.xs.length);
      const crossed = new Uint8Array(A.xs.length);
      const touches = [];
      
      const close = new Float64Array(A.xs.length).fill(Infinity);
      const sameFlag = new Uint8Array(A.xs.length);
      const pending = [];
      for (let k = 0; k + 1 < A.xs.length; k++) {
        if (!isFinite(A.ys[k]) || !isFinite(A.ys[k + 1])) continue;
        const p = at(A, k), q = at(A, k + 1);
        const chord = Math.hypot(q.x - p.x, q.y - p.y);
        mark++;
        
        const x0 = Math.max(0, cell(Math.min(p.x, q.x), left, stepX) - 1);
        const x1 = Math.min(side - 1, cell(Math.max(p.x, q.x), left, stepX) + 1);
        const y0 = Math.max(0, cell(Math.min(p.y, q.y), top, stepY) - 1);
        const y1 = Math.min(side - 1, cell(Math.max(p.y, q.y), top, stepY) + 1);
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++) {
            const list = cells.get(y * side + x);
            if (!list) continue;
            for (const l of list) {

              if (seen[l] === mark) continue;
              seen[l] = mark;
              const r = at(B, l), s = at(B, l + 1);
              if (segmentsAside(p, q, r, s) > chord) continue;
              /*
                Closeness for the indistinguishable-stretch detector is the
                distance from the MIDPOINT of the segment to the other curve.
                On truly coinciding curves every midpoint lies on the other
                one; a curve that merely CROSSES stands aside between the
                crossings. "Crossed means zero" chained crossed segments of a
                coarse fast curve into a false stretch and silenced its real
                crossings.
              */
              const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
              const foot = nearestOnSegment(mid, r, s);
              const midGap = Math.hypot(mid.x - foot.x, mid.y - foot.y);
              if (midGap < close[k]) close[k] = midGap;
              let value = segmentCross(p, q, r, s);
              if (!value) {

                const got = segmentsGap(p, q, r, s);
                if (got.gap < gap[k]) { gap[k] = got.gap; gapPoint[k] = got.point; gapMate[k] = l; }
                continue;
              }
              value = refine(A, B, A.xs[k], A.xs[k + 1], B.xs[l], B.xs[l + 1], value);
              pending.push({ point: value, k: k, chord: chord });
              crossed[k] = 1;
            }
          }
      }
      
      const pixel = pixelSize();
      if (pixel > 0) {
        const edge = pixel * Math.min(HOST.opt.canvasW, HOST.opt.canvasH) / 10;
        let m = 0;
        while (m < close.length) {
          if (!(close[m] < pixel)) { m++; continue; }
          let n = m, walk = 0;
          while (n < close.length && close[n] < pixel) {
            if (n + 1 < A.xs.length) {
              const u = at(A, n), v = at(A, n + 1);
              walk += Math.hypot(v.x - u.x, v.y - u.y);
            }
            n++;
          }
          if (walk >= edge) {
            for (let p = m; p < n; p++) sameFlag[p] = 1;
            same.push({ a: a, b: b, back: at(A, m), face: at(A, n - 1) });
          }
          m = n;
        }
      }
      /*
        A duplicate is the SAME crossing reported by neighbouring segment
        pairs; refined points agree to a fraction of a thousandth. The merge
        radius is the half-sum of the argument steps, as in the engine. The
        chord of a segment is the wrong radius: on a coarsely sampled fast
        curve it reaches tenths of a unit, and genuinely distinct neighbouring
        crossings sit closer than that - they were being eaten as duplicates.
      */
      const grain = (step(A) + step(B)) / 2;
      for (const item of pending) {
        if (sameFlag[item.k]) continue;
        put(item.point, grain, a, b, A.xs[item.k]);
      }
      
      for (let k = 1; k + 1 < gap.length; k++) {
        if (sameFlag[k]) continue;
        if (crossed[k - 1] || crossed[k] || crossed[k + 1]) continue;
        if (!isFinite(gap[k - 1]) || !isFinite(gap[k + 1])) continue;
        
        if (gap[k] * (1 + 1e-6) >= gap[k - 1] || gap[k] > gap[k + 1]) continue;
        const p = at(A, k), q = at(A, k + 1);
        const chord = Math.hypot(q.x - p.x, q.y - p.y);
        if (gap[k] > chord) continue;
        
        const l = gapMate[k];
        const got = approach(A, B, A.xs[k], A.xs[Math.min(k + 2, A.xs.length - 1)],
          B.xs[l], B.xs[Math.min(l + 2, B.xs.length - 1)], gapPoint[k]);
        
        if (got.gap > chord * 1e-2) continue;
        touches.push({ point: got.point, gap: got.gap, chord: chord, arg: A.xs[k] });
      }
      
      touches.sort((one, two) => one.gap - two.gap);
      for (const spot of touches) put(spot.point, spot.chord, a, b, spot.arg);
    }

  
  const pixel = pixelSize();
  const spacing = HOST.opt && HOST.opt.markSpacing > 0 ? HOST.opt.markSpacing : 0;
  let shown = out;
  if (pixel > 0 && spacing > 0 && out.length > 1) {
    const bound = spacing * pixel;
    const order = out.slice().sort((one, two) =>
      (one.a - two.a) || (one.b - two.b) || (one.arg - two.arg));
    const kept = [];
    for (const item of order) {
      if (kept.some(q => q.a === item.a && q.b === item.b &&
          Math.hypot(q.x - item.x, q.y - item.y) < bound)) continue;
      kept.push(item);
    }
    shown = kept;
  }
  return { list: named(shown), total: total, same: same };
}

function named(list) {
  list.forEach((p, i) => { p.name = String.fromCharCode(65 + i % 26); });
  return list;
}

function findExtremes() {
  const max = [], min = [];
  for (const G of HOST.grids)
    for (let k = 1; k + 1 < G.xs.length; k++) {
      const y0 = G.ys[k - 1], y1 = G.ys[k], y2 = G.ys[k + 1];
      if (!isFinite(y0) || !isFinite(y1) || !isFinite(y2)) continue;
      const hill = y1 > y0 && y1 >= y2, dale = y1 < y0 && y1 <= y2;
      if (!hill && !dale) continue;
      const t = vertex(G.xs[k - 1], y0, G.xs[k], y1, G.xs[k + 1], y2);
      const v = HOST.engine.evalAt(G.slot, t);
      if (!isFinite(v)) continue;
      const p = G.polar ? [v * Math.cos(t), v * Math.sin(t)] : [t, v];
      (hill ? max : min).push(p);
      if (max.length + min.length >= 120) return thin({ max, min });
    }
  return thin({ max, min });
}

function thin(spots) {
  const pixel = pixelSize();
  const spacing = HOST.opt && HOST.opt.markSpacing > 0 ? HOST.opt.markSpacing : 0;
  if (!(pixel > 0) || !spacing) return spots;
  const bound = spacing * pixel;
  const sift = list => {
    const kept = [];
    for (const p of list)
      if (!kept.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < bound)) kept.push(p);
    return kept;
  };
  return { max: sift(spots.max), min: sift(spots.min) };
}

function doTrace(m) {
  const polar = HOST.state.cs === "polar";
  const points = [];
  for (const G of HOST.grids) {
    
    const f = HOST.state.formulas[G.i];
    if (!f || f.trace === false) continue;
    const v = HOST.engine.evalAt(G.slot, m.param);
    if (!isFinite(v)) continue;
    if (polar) points.push({ i: G.i, x: v * Math.cos(m.param), y: v * Math.sin(m.param) });
    else points.push({ i: G.i, x: m.param, y: v });
  }
  reply({ type: "trace", polar, param: m.param, list: points });
}

const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function monotone(G) {
  let up = 0, down = 0, flat = 0;
  for (let k = 1; k < G.ys.length; k++) {
    const a = G.ys[k - 1], b = G.ys[k];
    if (!isFinite(a) || !isFinite(b)) continue;
    if (b > a) up++; else if (b < a) down++; else flat++;
  }
  const all = up + down + flat;
  if (!all) return "";
  if (!down) return "increasing throughout";
  if (!up) return "decreasing throughout";
  return "increasing " + Math.round(up * 100 / all) + "%, decreasing " +
    Math.round(down * 100 / all) + "%";
}

function areaAndMean(G) {
  let area = 0, span = 0;
  for (let k = 1; k < G.xs.length; k++) {
    const a = G.ys[k - 1], b = G.ys[k];
    if (!isFinite(a) || !isFinite(b)) continue;
    const w = G.xs[k] - G.xs[k - 1];
    area += (a + b) / 2 * w;
    span += w;
  }
  return { area, mean: span ? area / span : NaN };
}

/*
  How the report is dressed. Exactly what ReportFacts hands over in the plugin:
  the rules travel with the markup, because the report is inserted into someone
  else's page and has no place of its own in that page's stylesheet.

  The page's own variables come first and the spares through var(): inside the
  plugin panel the report lives within the page theme, in a separate window
  there is no theme around it.
*/
const REPORT_CSS =
  '<style>' +
  '.rep{color:var(--ink,var(--r-ink));font:13px/1.55 "Segoe UI",system-ui,sans-serif;' +
  '--r-ink:#1e242c;--r-dim:#5c6570;--r-faint:#98a0ac;--r-line:#e6e9ee;' +
  '--r-soft:#f4f6f9;--r-card:#ffffff;--r-up:#12855f;--r-down:#c0392b}' +
  '[data-theme="dark"] .rep{--r-ink:#e6e9ee;--r-dim:#a7b0bb;--r-faint:#7d8792;' +
  '--r-line:#333941;--r-soft:#23272d;--r-card:#1c2024;--r-up:#4fd1a5;--r-down:#ff8a80}' +
  '.rep h2{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;' +
  'color:var(--ink-faint,var(--r-faint));margin:0 0 14px;padding-bottom:8px;' +
  'border-bottom:1px solid var(--line,var(--r-line))}' +
  '.rep h3{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;' +
  'color:var(--ink-faint,var(--r-faint));margin:22px 0 9px}' +
  '.rep section{margin:0 0 26px}' +
  '.rep .fn-dot{width:10px;height:10px;border-radius:50%;flex:none;display:inline-block;' +
  'box-shadow:0 0 0 1px rgba(128,128,128,.5)}' +
  '.rep .kv{display:grid;grid-template-columns:minmax(120px,168px) 1fr;gap:1px;' +
  'background:var(--line,var(--r-line))}' +
  '.rep .kv>div{background:var(--panel,var(--r-card));padding:9px 14px}' +
  '.rep .kv .k{color:var(--ink-dim,var(--r-dim));font-size:12px}' +
  '.rep .kv .v{font-variant-numeric:tabular-nums}' +
  '.rep .chips{display:flex;flex-wrap:wrap;gap:5px}' +
  '.rep .chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;' +
  'border-radius:6px;background:var(--line-soft,var(--r-soft));' +
  'border:1px solid var(--line,var(--r-line));' +
  'font-family:"Cascadia Mono",Consolas,ui-monospace,monospace;font-size:11.5px;' +
  'font-variant-numeric:tabular-nums;white-space:nowrap}' +
  '.rep .up{color:var(--r-up)}.rep .down{color:var(--r-down)}' +
  '.rep .arr{font-size:12px;line-height:1}' +
  '.rep .tiles{display:flex;flex-wrap:wrap;gap:8px}' +
  '.rep .tile{flex:1 1 132px;border:1px solid var(--line,var(--r-line));border-radius:9px;' +
  'background:var(--panel,var(--r-card));padding:10px 13px}' +
  '.rep .tile .t{color:var(--ink-faint,var(--r-faint));font-size:10.5px;' +
  'text-transform:uppercase;letter-spacing:.6px}' +
  '.rep .tile .d{margin-top:3px;font-size:14px;font-variant-numeric:tabular-nums}' +
  '.rep table.pts{width:100%;border-collapse:collapse;font-size:12px}' +
  '.rep table.pts th{text-align:left;font-weight:600;font-size:10.5px;' +
  'text-transform:uppercase;letter-spacing:.6px;color:var(--ink-faint,var(--r-faint));' +
  'padding:0 12px 7px 0;border-bottom:1px solid var(--line,var(--r-line))}' +
  '.rep table.pts td{padding:8px 12px 8px 0;border-bottom:1px solid var(--line,var(--r-line));' +
  'font-variant-numeric:tabular-nums;vertical-align:top}' +
  '.rep table.pts tr:last-child td{border-bottom:0}' +
  '.rep .nm{display:inline-flex;align-items:center;justify-content:center;min-width:20px;' +
  'height:20px;padding:0 5px;border-radius:5px;' +
  'background:var(--accent-soft,rgba(47,111,235,.10));color:var(--accent,#2f6feb);' +
  'font-size:11px;font-weight:600}' +
  '.rep .pair{display:flex;align-items:center;gap:6px;margin:2px 0}' +
  '.rep .note{color:var(--ink-faint,var(--r-faint));font-size:11.5px;margin:10px 0 0}' +
  '.rep .mono{font-family:"Cascadia Mono",Consolas,ui-monospace,monospace}' +
  '.rep table.facts{border-collapse:collapse;width:100%;max-width:560px;margin-bottom:8px}' +
  '.rep table.facts td{padding:7px 12px 7px 0;' +
  'border-bottom:1px solid var(--line,var(--r-line));font-size:12px}' +
  '.rep table.facts td.n{color:var(--ink-dim,var(--r-dim));width:42%}' +
  '.rep table.facts td.v{font-variant-numeric:tabular-nums}' +
  '</style>';

/*
  The report. The markup follows ReportFacts in the plugin line for line: a
  summary in tiles, the window, the formulas, a table of intersections, a table
  of extrema, then the facts for each function.

  What stood here before was a flat list of name and value pairs, and beside
  the plugin's report it read as a draft: no distance from the centre, no
  colour for the curve, no angle in polar, and no line saying how many
  intersections did not fit.
*/
function doReport() {
  const o = HOST.state.options || {};
  const dec = o.decimals != null ? o.decimals : 4;
  const fmt = v => Number.isFinite(v) ? (+v).toFixed(dec) : "-";
  const polar = HOST.state.cs === "polar";
  const away = p => fmt(Math.hypot(p.x !== undefined ? p.x : p[0],
                                   p.y !== undefined ? p.y : p[1]));

  // The angle in degrees and in radians at once, as the classic window does it.
  const turn = a => fmt(a * 180 / Math.PI) + "&deg; " +
    '<span class="k">(' + fmt(a) + " rad)</span>";

  /*
    The colour of a curve arrives from the page together with the formula: the
    page draws it, and only the page knows what the pen is set to and whether
    each formula gets a colour of its own. Without that field the report would
    colour its marks at random and disagree with the picture.
  */
  const named = i => {
    const f = HOST.state.formulas[i];
    if (!f) return "";
    const tint = f.color || "#888888";
    return '<span class="pair"><span class="fn-dot" style="background:' + tint +
      '"></span><span class="mono">' + esc(f.text) + "</span></span>";
  };

  const tile = (name, value) => '<div class="tile"><div class="t">' + name +
    '</div><div class="d">' + value + "</div></div>";
  const kv = (name, value) => '<div class="k">' + name + '</div><div class="v">' +
    value + "</div>";
  const row = (n, v) => '<tr><td class="n">' + n + '</td><td class="v">' + v + "</td></tr>";
  const chips = list => list.length
    ? list.map(v => '<span class="chip">' + fmt(v) + "</span>").join(" ") : "-";

  let out = '<section><h2>Report</h2>';

  // A summary in tiles: the main things are visible without reading a table.
  out += '<div class="tiles">';
  out += tile("Coordinate system", polar ? "Polar" : "Cartesian");
  if (polar) out += tile("Angle limit", turn((o.polarAngle || 360) * Math.PI / 180));
  else out += tile("X range", fmt(o.centerX - o.maxX) + " .. " + fmt(o.centerX + o.maxX));
  out += tile("Quality", String(o.quality != null ? o.quality : "-"));
  out += tile("High precision", o.precise ? "on" : "off");
  out += "</div>";

  out += "<h3>The window</h3><div class=\"kv\">";
  out += kv("Centre", "X: " + fmt(o.centerX) + ", Y: " + fmt(o.centerY));
  out += kv("Size", "across " + fmt(o.maxX * 2) + ", down " + fmt(o.maxY * 2));
  out += "</div>";

  const shown = HOST.state.formulas
    .map((f, i) => ({ f, i }))
    .filter(x => x.f && x.f.on);
  out += '<h3>Formulas</h3><div class="chips">';
  for (const x of shown) out += '<span class="chip">' + named(x.i) + "</span>";
  out += "</div>";

  if (o.cross && HOST.grids.length > 1) {
    /*
      findOverlaps gives back { list, total, same }, not a bare array. This used
      to ask the object for a length, get undefined, and skip the section
      altogether - while the same points were being drawn on the canvas.
    */
    const found = findOverlaps();
    const list = found.list || [];
    out += "<h3>Intersections</h3>";
    out += '<table class="pts"><tr><th>Point</th><th>X</th><th>Y</th>' +
      "<th>From the centre</th><th>Curves</th></tr>";
    for (const p of list) {
      out += '<tr><td><span class="nm">' + esc(p.name || "\u2022") + "</span></td><td>" +
        fmt(p.x) + "</td><td>" + fmt(p.y) + "</td><td>" + away(p) + "</td><td>";
      if (polar) {
        /*
          Both curves are sampled on ONE grid of the parameter, so they arrive
          at the point at the same angle. The component gives every curve a
          grid of its own and the angles there can differ - inventing that
          difference here would be dishonest.
        */
        out += named(p.a) + '<span class="k"> at ' + turn(p.arg) + "</span>" +
          named(p.b) + '<span class="k"> at ' + turn(p.arg) + "</span>";
      }
      else out += named(p.a) + named(p.b);
      out += "</td></tr>";
    }
    out += "</table>";
    if (!list.length) out += '<p class="note">No intersections found.</p>';
    /*
      The number found, not the number shown. Marks are thinned out, and without
      this line the report would keep quiet about what did not fit.
    */
    if (found.total > list.length)
      out += '<p class="note">Intersections found: ' + found.total + ", marked: " +
        list.length + ". The rest are closer than " + (o.markSpacing || 0) +
        " pixels to each other.</p>";
    /*
      Stretches where the curves cannot be told apart: there is no separate
      intersection point there. Without this line "found nothing" and "nothing
      to find" look the same.
    */
    for (const s of (found.same || [])) {
      out += '<p class="note">The curves ' + named(s.a) + " and " + named(s.b) +
        " cannot be told apart from (" + fmt(s.back.x) + ", " + fmt(s.back.y) +
        ") to (" + fmt(s.face.x) + ", " + fmt(s.face.y) +
        "): there are no separate intersection points there.</p>";
    }
  }

  if (o.peak) {
    const e = findExtremes();
    out += "<h3>Extrema</h3>";
    out += '<table class="pts"><tr><th>Kind</th><th>X</th><th>Y</th>' +
      "<th>From the centre</th>" + (polar ? "<th>Angle</th>" : "") + "</tr>";
    const put = (list, up) => {
      for (const p of list.slice(0, 24)) {
        out += '<tr><td><span class="arr ' + (up ? "up" : "down") + '">' +
          (up ? "&#8599;" : "&#8600;") + "</span> " + (up ? "maximum" : "minimum") +
          "</td><td>" + fmt(p[0]) + "</td><td>" + fmt(p[1]) + "</td><td>" +
          away(p) + "</td>";
        if (polar) out += "<td>" + turn(Math.atan2(p[1], p[0])) + "</td>";
        out += "</tr>";
      }
    };
    put(e.max || [], true);
    put(e.min || [], false);
    out += "</table>";
    if (!(e.max || []).length && !(e.min || []).length)
      out += '<p class="note">No extrema found.</p>';
  }
  out += "</section>";

  // The facts for each function: computed for a function of X.
  let facts = "";
  for (const G of HOST.grids) {
    const f = HOST.state.formulas[G.i];
    if (!f) continue;

    const roots = [];
    let lo = Infinity, hi = -Infinity, defined = 0, breaks = 0, pieces = 1, wasGap = false;
    for (let k = 0; k < G.xs.length; k++) {
      const v = G.ys[k];
      if (!isFinite(v)) {
        if (!wasGap && k) { breaks++; pieces++; }
        wasGap = true;
        continue;
      }
      wasGap = false;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      defined++;
      if (k && isFinite(G.ys[k - 1]) && (G.ys[k - 1] <= 0) !== (v <= 0) && roots.length < 24)
        roots.push(bisect(t => HOST.engine.evalAt(G.slot, t), G.xs[k - 1], G.xs[k]));
    }

    facts += "<h3>" + esc(f.text) + "</h3>";
    if (!defined) {
      facts += '<table class="facts">' + row("Values", "none in this window") + "</table>";
      continue;
    }
    const am = areaAndMean(G);
    facts += '<table class="facts">' +
      row(polar ? "Radius zeros" : "Roots", chips(roots)) +
      row("Range", fmt(lo) + " to " + fmt(hi)) +
      row("Domain breaks", breaks ? String(breaks) : "none") +
      row("Curve pieces", String(pieces)) +
      row("Monotonicity", monotone(G) || "-") +
      row(polar ? "Swept area" : "Area under the curve", fmt(am.area)) +
      row("Mean value", fmt(am.mean)) +
      row("Points sampled", String(G.xs.length)) +
      "</table>";
  }
  if (facts)
    facts = '<section class="factbox"><h2>Facts about the functions</h2>' + facts +
      '<p class="note">Computed over the same sampling as the curve, so the step ' +
      'tightens where the function runs steep. Roots and vertices are refined by ' +
      'the engine rather than read off a grid node.</p></section>';

  const html = HOST.grids.length
    ? REPORT_CSS + '<div class="rep">' + out + facts + "</div>"
    : "";
  reply({ type: "report", html: html ||
    "<p class='empty'>Build a graph - facts about the functions will appear here.</p>" });
}


const NS = new URLSearchParams(location.search).has("selftest")
  ? "gbwasm.selftest." : "gbwasm.";
const STATE_KEY = NS + "state";

function savedState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STATE_KEY)); } catch (e) { return null; }
  /*
    An empty list is a state too, when the person emptied it on purpose: the
    page marks such emptiness. Without the mark, emptiness is discarded exactly
    as before.
  */
  if (!s || !Array.isArray(s.formulas)) return null;
  if (s.formulas.length === 0) return s.cleared ? s : null;
  return s;
}

const MARKS_KEY = NS + "marks";
const loadMarks = () => { try { return JSON.parse(localStorage.getItem(MARKS_KEY)) || []; } catch (e) { return []; } };

function doBookmark(m) {
  const marks = loadMarks();
  if (m.mode === "save") {
    marks[m.slot] = { cs: HOST.state.cs, formulas: HOST.state.formulas, options: HOST.state.options };
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  }
  if (m.mode === "load" && marks[m.slot]) {
    
    const state = marks[m.slot];
    marks[m.slot] = null;
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
    reply({ type: "snapshot", ...state });
  }
  reply({ type: "bookmarks", slots: Array.from({ length: 10 }, (_, i) => !!marks[i]) });
}

function doCopy(m) {
  const text = (m && m.text) || HOST.state.formulas.map(f => f.text).join("\n");
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
}

function doPaste() {
  if (!navigator.clipboard || !navigator.clipboard.readText) return;
  navigator.clipboard.readText()
    .then(text => reply({ type: "clipboard", text: text || "" }))
    .catch(() => {});
}
function handle(m) {
  switch (m.cmd) {
    case "ready": {
      
      const fb = document.getElementById("fontBtn");
      if (fb) (fb.closest(".row") || fb).style.display = "none";

      const last = savedState();
      if (last) reply({ type: "snapshot", ...last });
      reply({ type: "bookmarks", slots: Array.from({ length: 10 }, (_, i) => !!loadMarks()[i]) });
      break;
    }
    case "build":
      doBuild(m);
      /*
        The "emptied by the user" mark travels with the state. Without it an
        empty list is indistinguishable from accidental emptiness, and the page
        put the built-in example back on top of a blank sheet somebody had made
        deliberately.
      */
      try { localStorage.setItem(STATE_KEY, JSON.stringify({ cs: m.cs, formulas: m.formulas, options: m.options, cleared: !!m.cleared, sheets: m.sheets })); }
      catch (e) {}
      break;
    case "trace": doTrace(m); break;
    case "report": doReport(); break;
    case "bookmark": doBookmark(m); break;
    case "copy": doCopy(m); break;
    case "paste": doPaste(); break;
    case "size": case "signfont": break;
  }
}

window.chrome = window.chrome || {};
window.chrome.webview = {
  postMessage(json) {
    let m;
    try { m = JSON.parse(json); } catch (e) { return; }
    if (HOST.engine) handle(m);
    else HOST.queue.push(m);
  },
  addEventListener(kind, cb) { if (kind === "message") HOST.listener = cb; }
};

async function engineBytes() {
  if (typeof PARSEWASM_GZ === "undefined") return null;
  const packed = Uint8Array.from(atob(PARSEWASM_GZ), c => c.charCodeAt(0));
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

(async () => {
  try {
    let memory;
    const imports = { wasi_snapshot_preview1: makeWasi(() => memory) };
    const inline = await engineBytes();
    const { instance } = inline
      ? await WebAssembly.instantiate(inline.buffer, imports)
      : await WebAssembly.instantiateStreaming(fetch("parsewasm.wasm"), imports);
    memory = instance.exports.memory;
    instance.exports._initialize();
    /*
      How many loop turns the engine is given for one curve.

      A formula like While(1 = 1, ...) never ends on its own, and there is
      nothing outside to interrupt the engine with: the module is
      single-threaded, and while it computes this page runs nothing at all - no
      timers, no repaint, no handlers. The tab dies in silence. A limit is the
      only thing that stands in the way.

      A million turns is about a second for a whole curve in the worst case
      (measured: a thousand points of an endless formula are cut off in 0.85 s).
      Ordinary formulas do not come close to spending that: a thousand points of
      a sine take a millisecond, and a loop that honestly ends at every point
      takes six.
    */
    instance.exports.looplimit(1000000);
    HOST.engine = new Engine(instance);
    
    const q = HOST.queue.splice(0);
    const restore = q.some(m => m.cmd === "ready") && !!savedState();
    (restore ? q.filter(m => m.cmd !== "build") : q).forEach(handle);
    console.log("[host] engine up, queue drained:", q.length, restore ? "(restoring saved state)" : "");
  } catch (e) {
    console.error("[host] engine failed:", e);
    reply({ type: "curves", list: [], points: 0, ms: 0, error: "engine failed to load: " + e.message });
  }
})();

})();
