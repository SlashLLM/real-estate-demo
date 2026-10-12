import { Gfx, fractal as _f, rng, type Ctx, type Env, type Medium, type P } from "./core";
import type { Film } from "./film";
import { bounds, clamp, fillShape, hatchRuns, inside, lerpP } from "./gallery";

// HOUSE STREET · ballpoint sketch. A Singapore neighbourhood in one blue biro, for the PropertyPro AI hero.
//
// MEDIUM. One ballpoint, near-constant line weight; tone only from WHERE hatch strokes sit (one direction, a
//   cross direction where it is darker, a third in the deepest darks) and the bead a firm stroke leaves.
// SUBJECT (focal, lower left): an HDB slab block, corridor-access type. Open void deck on pillars; each storey a
//   white parapet band over a shaded corridor with doors; lift motor room and water tank on the roof; bamboo
//   laundry poles out of the side kitchen windows. Beside it a rain tree (short trunk, wide umbrella crown). A low
//   street runs right: a lamp post, two gabled terrace houses, shrubs; a condo tower's edge at the far right.
// LIGHT from the upper left: the block's right face, the corridor recesses, the void deck and the crown's underside
//   are in shade. GROUND is plain white (no paper grain) so the site can multiply this over its own background.
// LIVE (optional): `t` in [0, 1) sways the laundry. t = 0 is the still, so a loop can start on the finished drawing.

export const W = 1600, H = 900, GY = 820;
const BIRO = "#23379f", PAPER = "#ffffff";
const BIRO_M: Medium = { nib: 0.98, taper: 0.12, pressure: 0.1, retrace: true, wobble: 1.15, rough: 0.3 };

// ---------------------------------------------------------------- the drawing clock (optional)
export type Kind = "build" | "line" | "detail" | "h1" | "h2" | "fill";
export type Clock = (kind: Kind, len: number, part?: string) => number;
const clockOf = (g: Gfx) => (g as Gfx & { clock?: Clock }).clock;
const plen = (pts: P[]) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
const prog = (g: Gfx, kind: Kind, pts: P[], part?: string) => { const c = clockOf(g); return c ? c(kind, plen(pts), part) : 1; };

// ---------------------------------------------------------------- the biro
type SO = { w?: number; op?: number; seed: number; wob?: number; blob?: boolean; retrace?: boolean; kind?: Kind; part?: string };
let BOIL = 0; // set per call by drawHouseStreet: 0 for the still and the draw-in, a hair for the idle loop
const stroke = (g: Gfx, pts: P[], o: SO) => {
  const { w = 1.1, op = 0.86, seed, wob = 0.35, retrace = false, kind = "line" } = o, progress = prog(g, kind, pts, o.part), blob = (o.blob ?? false) && progress >= 1;
  if (progress <= 0) return;
  g.pen(pts, { w, color: BIRO, seed, wobble: wob, boil: BOIL, taper: 1, opacity: op, retrace, progress });
  if (blob) { // the ball stops: a bead of ink at the end, a smaller one where it started
    const e = pts[pts.length - 1], s0 = pts[0], c = g.cur, r = rng(seed * 7);
    g.touch(e[0] - 4, e[1] - 4, e[0] + 4, e[1] + 4); g.touch(s0[0] - 3, s0[1] - 3, s0[0] + 3, s0[1] + 3);
    c.fillStyle = BIRO; c.globalAlpha = 0.8; c.beginPath(); c.arc(e[0] + (r() - 0.5), e[1] + (r() - 0.5), 1.1 + r() * 0.7, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.5; c.beginPath(); c.arc(s0[0], s0[1], 0.7 + r() * 0.5, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  }
};
// straight edges: one mark per edge, each overshooting its corner by a hair, the way a sketcher boxes in a shape
const lines = (g: Gfx, pts: P[], o: SO, closed = false) => {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ov = Math.min(2.2, l * 0.08);
    const a2: P = [a[0] - (dx / l) * ov, a[1] - (dy / l) * ov], b2: P = [b[0] + (dx / l) * ov, b[1] + (dy / l) * ov];
    stroke(g, [a2, lerpP(a2, b2, 0.5), b2], { ...o, seed: o.seed + i * 7, blob: (o.blob ?? false) && i === n - 1 });
  }
};
// a closed outline drawn as two strokes, the way a hand goes round a shape in two goes
const outline = (g: Gfx, pts: P[], o: SO) => { const h = Math.ceil(pts.length / 2); stroke(g, pts.slice(0, h + 1), o); stroke(g, [...pts.slice(h), pts[0]], { ...o, seed: o.seed + 1 }); };
// hatching: runs cut into hand-length strokes with a slight bow; the runs are cached per call site
const hatch = (g: Gfx, region: P[], angle: number, gap: number, keep: (x: number, y: number) => boolean, seed: number, op = 0.62, kind: Kind = "h1", part?: string) => {
  const b = bounds(region), r = rng(seed), key = `hs:hatch:${seed}:${angle}:${gap}:${Math.round(b.x0)}:${Math.round(b.y0)}:${Math.round(b.x1)}`;
  let rs = g.env.cache.get(key) as P[][] | undefined;
  if (!rs) { rs = hatchRuns(b, angle, gap, (x, y) => inside(region, x, y) && keep(x, y), 2.5, seed); g.env.cache.set(key, rs); }
  rs.forEach((run, k) => {
    let i = 0;
    while (i < run.length - 1) {
      const n = Math.min(run.length - 1 - i, 6 + Math.floor(r() * 16)), seg = run.slice(i, i + n + 1);
      if (seg.length > 1) { const a = seg[0], z = seg[seg.length - 1], m = lerpP(a, z, 0.5), bow = (r() - 0.5) * 1.4; stroke(g, [a, [m[0] + bow, m[1] - bow], z], { w: 0.8, op: op * (0.75 + r() * 0.35), seed: seed * 1000 + k * 37 + i, wob: 0.22, kind, part }); }
      i += n + (r() < 0.25 ? 1 : 0);
    }
  });
};
const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const ragged = (x: number, y: number, k: number) => (_f(5, x, y, 0.035, 0.035, 2) - 0.5) * k; // a hand stops its hatching at a slightly different place each stroke

// scalloped crown / cloud / shrub outline along an elliptical arc (top half), wobble from rng
const scallops = (cx: number, cy: number, rx: number, ry: number, n: number, bump: number, seed: number, a0 = Math.PI, a1 = Math.PI * 2): P[] => {
  const r = rng(seed), out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t, mid = a0 + (a1 - a0) * ((i + 0.5) / n), k = 1 + (r() - 0.5) * 0.12;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    if (i < n) out.push([cx + Math.cos(mid) * (rx + bump * k), cy + Math.sin(mid) * (ry + bump * k)]);
  }
  return out;
};

// ---------------------------------------------------------------- the HDB block
const BX0 = 300, BX1 = 600, TOP = 590, STOREY = 28, FLOORS = 7, VOID = GY - (TOP + STOREY * FLOORS); // void deck 34
const D: P = [56, -20]; // depth: the right face recedes up and to the right
const sideAt = (s: number, y: number): P => [BX1 + D[0] * s, y + D[1] * s];

const block = (g: Gfx) => {
  const A: P = [BX0, TOP], B: P = [BX1, TOP], C: P = [BX1, GY], Dd: P = [BX0, GY];
  const Bb: P = [B[0] + D[0], B[1] + D[1]], Cb: P = [C[0] + D[0], C[1] + D[1]], Ab: P = [A[0] + D[0], A[1] + D[1]];
  const front = [A, B, C, Dd], side = [B, Bb, Cb, C];
  const slabs = Array.from({ length: FLOORS + 1 }, (_, k) => TOP + k * STOREY); // slabs[FLOORS] = void deck ceiling

  // construction: the box laid in faintly, a centre line, the ground run out
  stroke(g, [[BX0 - 30, GY + 1], [BX1 + 120, GY - 1]], { kind: "build", w: 0.8, op: 0.15, seed: 1, wob: 0.6 });
  stroke(g, [[(BX0 + BX1) / 2, TOP - 40], [(BX0 + BX1) / 2, GY]], { kind: "build", w: 0.8, op: 0.14, seed: 2, wob: 0.6 });
  lines(g, [[BX0 - 6, TOP + 4], [BX1 + 8, TOP - 3], [BX1 + 62, TOP - 24]], { kind: "build", w: 0.8, op: 0.13, seed: 3, wob: 1 });

  // paper first: the faces are knocked out so nothing behind them shows
  fillShape(g, [A, Ab, Bb, B], PAPER); fillShape(g, side, PAPER); fillShape(g, front, PAPER);

  // contours
  stroke(g, [Dd, A], { w: 1.25, op: 0.92, seed: 10, wob: 0.3, retrace: true, blob: true });
  stroke(g, [A, B], { w: 1.25, op: 0.92, seed: 11, wob: 0.3, retrace: true });
  stroke(g, [B, C], { w: 1.25, op: 0.92, seed: 12, wob: 0.3, retrace: true, blob: true });
  lines(g, [A, Ab, Bb], { w: 1.1, op: 0.88, seed: 13, wob: 0.3 });
  lines(g, [B, Bb, Cb], { w: 1.15, op: 0.9, seed: 14, wob: 0.3, retrace: true, blob: true });
  stroke(g, [C, Cb], { w: 1.0, op: 0.8, seed: 15, wob: 0.3 });

  // roof: lift motor room (centre right) and water tank (left), small boxes with their own depth
  const roofBox = (x0: number, x1: number, h: number, seed: number) => {
    const d: P = [D[0] * 0.35, D[1] * 0.35], y0 = TOP - h, a: P = [x0, TOP], b: P = [x0, y0], c: P = [x1, y0], e: P = [x1, TOP], cb: P = [x1 + d[0], y0 + d[1]], bb: P = [x0 + d[0], y0 + d[1]], eb: P = [x1 + d[0], TOP + d[1]];
    fillShape(g, [b, bb, cb, eb, e, a], PAPER);
    lines(g, [a, b, c, e], { w: 1.1, op: 0.9, seed, wob: 0.25, retrace: true, blob: true });
    lines(g, [b, bb, cb, eb], { w: 1.0, op: 0.85, seed: seed + 1, wob: 0.25 });
    stroke(g, [c, cb], { w: 0.9, op: 0.8, seed: seed + 2, wob: 0.2 });
    hatch(g, [c, cb, eb, e], -0.9, 3.2, () => true, seed + 3, 0.62, "h1");
  };
  roofBox(455, 520, 24, 20); roofBox(326, 372, 15, 30);
  // lift room door + a vent grille
  lines(g, [[478, TOP], [478, TOP - 14], [490, TOP - 14], [490, TOP]], { w: 0.85, op: 0.85, seed: 40, wob: 0.1, kind: "detail" });

  // storeys: slab edges carried round the corner, the parapet top, the corridor in shade, doors in the corridor
  for (let k = 0; k < FLOORS; k++) {
    const y0 = slabs[k], y1 = slabs[k + 1], par = y1 - 10;
    if (k > 0) {
      stroke(g, [[BX0, y0], [(BX0 + BX1) / 2, y0 + 0.6], [BX1, y0]], { w: 1.0, op: 0.88, seed: 100 + k, wob: 0.25 });
      stroke(g, [[BX1, y0], sideAt(1, y0)], { w: 0.85, op: 0.75, seed: 110 + k, wob: 0.2 });
    }
    stroke(g, [[BX0 + 1, par], [(BX0 + BX1) / 2, par - 0.5], [BX1 - 1, par]], { w: 0.95, op: 0.85, seed: 120 + k, wob: 0.25 });
    // the corridor recess: shaded under the slab above, doors and grilles darker
    const recess = rect(BX0 + 2, y0 + 1.5, BX1 - 2, par - 1);
    hatch(g, recess, -0.95, 3.4, (x, y) => (y - y0) < 13 + ragged(x, y, 6), 200 + k, 0.55, "h1", "block");
    for (let j = 0; j < 9; j++) {
      const dx = BX0 + 18 + j * 31.5, door = rect(dx, y0 + 4, dx + 9, par - 1);
      lines(g, [[dx, par - 1], [dx, y0 + 4], [dx + 9, y0 + 4], [dx + 9, par - 1]], { w: 0.75, op: 0.8, seed: 300 + k * 20 + j, wob: 0.08, kind: "detail" });
      hatch(g, door, 0.6, 2.4, () => true, 400 + k * 20 + j, 0.62, "h2", "block");
      if (j % 3 === 1) lines(g, [[dx + 13, y0 + 6], [dx + 22, y0 + 6], [dx + 22, y0 + 12], [dx + 13, y0 + 12]], { w: 0.65, op: 0.75, seed: 500 + k * 20 + j, wob: 0.06, kind: "detail" }, true); // a window grille
    }
    // side face: two kitchen windows a storey, dark
    [0.28, 0.66].forEach((s, j) => {
      const wq = [sideAt(s, y0 + 7), sideAt(s + 0.16, y0 + 7), sideAt(s + 0.16, y0 + 20), sideAt(s, y0 + 20)];
      lines(g, wq, { w: 0.7, op: 0.8, seed: 600 + k * 4 + j, wob: 0.06, kind: "detail" }, true);
      hatch(g, wq, 0.62, 2.2, () => true, 650 + k * 4 + j, 0.7, "h2", "block");
    });
  }
  // the side face in shade: one direction everywhere, a cross where the slabs throw their shadow and low down
  hatch(g, side, -0.9, 4.0, () => true, 700, 0.5, "h1", "block");
  hatch(g, side, 0.55, 4.4, (x, y) => { const local = (y - (TOP - (x - BX1) * (20 / 56))) % STOREY; return local < 8 || y > GY - 70 + ragged(x, y, 20); }, 701, 0.48, "h2", "block");

  // void deck: open ground floor, pillars carrying the block, the space behind in deep shade
  const vd = rect(BX0 + 2, GY - VOID + 1, BX1 - 2, GY - 1), pillars = [0, 1, 2, 3, 4, 5, 6].map((i) => BX0 + 6 + i * 46.5);
  const inPillar = (x: number) => pillars.some((px) => x >= px - 1 && x <= px + 9);
  pillars.forEach((px, i) => { stroke(g, [[px, GY - VOID], [px, GY]], { w: 0.95, op: 0.88, seed: 800 + i, wob: 0.12, kind: "detail" }); stroke(g, [[px + 8, GY - VOID], [px + 8, GY]], { w: 0.95, op: 0.88, seed: 820 + i, wob: 0.12, kind: "detail" }); });
  hatch(g, vd, -0.95, 3.2, (x) => !inPillar(x), 840, 0.62, "h1", "block");
  hatch(g, vd, 0.6, 3.4, (x, y) => !inPillar(x) && y < GY - 8 + ragged(x, y, 8), 841, 0.6, "h2", "block");
  hatch(g, vd, 0.05, 3.8, (x, y) => !inPillar(x) && y < GY - VOID + 12, 842, 0.58, "fill", "block");
  stroke(g, [[BX0, GY - VOID], [(BX0 + BX1) / 2, GY - VOID + 0.6], [BX1, GY - VOID]], { w: 1.05, op: 0.9, seed: 850, wob: 0.25 });
  // the block number, stencilled on the parapet the way every HDB block carries it
  stroke(g, [[BX0 + 14, TOP + 2 * STOREY - 7], [BX0 + 14, TOP + 2 * STOREY - 2]], { w: 0.9, op: 0.85, seed: 860, wob: 0.05, kind: "detail" });
  stroke(g, [[BX0 + 18, TOP + 2 * STOREY - 7], [BX0 + 22, TOP + 2 * STOREY - 7], [BX0 + 18, TOP + 2 * STOREY - 2], [BX0 + 22, TOP + 2 * STOREY - 2]], { w: 0.9, op: 0.85, seed: 861, wob: 0.05, kind: "detail" });
};

// bamboo laundry poles out of the side kitchen windows; the clothes sway with t
export const POLES: { k: number; s: number; len: number; items: { at: number; w: number; h: number; kind: "shirt" | "towel" | "pants"; ph: number }[] }[] = [
  { k: 1, s: 0.36, len: 62, items: [{ at: 0.35, w: 11, h: 13, kind: "shirt", ph: 0.1 }, { at: 0.62, w: 8, h: 15, kind: "towel", ph: 0.55 }, { at: 0.86, w: 9, h: 12, kind: "shirt", ph: 0.3 }] },
  { k: 3, s: 0.74, len: 54, items: [{ at: 0.42, w: 9, h: 16, kind: "pants", ph: 0.8 }, { at: 0.74, w: 11, h: 12, kind: "shirt", ph: 0.2 }] },
  { k: 4, s: 0.36, len: 66, items: [{ at: 0.3, w: 8, h: 14, kind: "towel", ph: 0.45 }, { at: 0.55, w: 11, h: 13, kind: "shirt", ph: 0.05 }, { at: 0.8, w: 8, h: 15, kind: "towel", ph: 0.7 }] },
  { k: 6, s: 0.74, len: 50, items: [{ at: 0.5, w: 10, h: 13, kind: "shirt", ph: 0.35 }] },
];
const laundry = (g: Gfx, t: number) => {
  POLES.forEach((p, i) => {
    const y0 = TOP + p.k * STOREY, a = sideAt(p.s + 0.08, y0 + 10), b: P = [a[0] + p.len * 0.82, a[1] + 4];
    stroke(g, [a, lerpP(a, b, 0.5), b], { w: 1.0, op: 0.9, seed: 900 + i, wob: 0.15, kind: "detail", part: "laundry" });
    p.items.forEach((it, j) => {
      const at = lerpP(a, b, it.at), sz = 1.35, sway = Math.sin(Math.PI * 2 * (2 * t) + it.ph * Math.PI * 2) * 0.22, c = Math.cos(sway), s = Math.sin(sway);
      const R = ([x, y]: P): P => [at[0] + (x * c - y * s) * sz, at[1] + (x * s + y * c) * sz], hw = it.w / 2;
      const shape: P[] = it.kind === "shirt"
        ? [[-hw, 0], [-hw - 3, 4], [-hw - 1, 6], [-hw + 1, 4.5], [-hw + 1, it.h], [hw - 1, it.h], [hw - 1, 4.5], [hw + 1, 6], [hw + 3, 4], [hw, 0]]
        : it.kind === "pants" ? [[-hw, 0], [-hw - 1, it.h], [-1, it.h], [0, 5], [1, it.h], [hw + 1, it.h], [hw, 0]]
        : [[-hw, 0], [-hw + 0.5, it.h], [hw - 0.5, it.h + 1], [hw, 0]];
      const pts = shape.map(R);
      fillShape(g, pts, PAPER);
      stroke(g, [...pts, pts[0]], { w: 0.8, op: 0.85, seed: 920 + i * 10 + j, wob: 0.08, kind: "detail", part: "laundry" });
      // the shade half of each garment, in a few short strokes
      for (let q = 1; q <= 3; q++) { const u = q / 4; stroke(g, [R([hw * 0.15, it.h * (0.25 + u * 0.6)]), R([hw * 0.85, it.h * (0.15 + u * 0.6)])], { w: 0.65, op: 0.55, seed: 960 + i * 20 + j * 4 + q, wob: 0.04, kind: "h1", part: "laundry" }); }
    });
  });
};

// ---------------------------------------------------------------- the rain tree
const TREE: P = [856, GY];
const tree = (g: Gfx) => {
  const [tx, ty] = TREE, crown = scallops(tx - 6, 706, 116, 84, 13, 11, 1200), under: P[] = [[tx - 122, 706], [tx - 80, 712], [tx - 30, 707], [tx + 20, 713], [tx + 70, 707], [tx + 110, 710]];
  const region: P[] = [...crown, ...under.slice().reverse()];
  stroke(g, [[tx - 120, 706], [tx - 6, 618], [tx + 110, 706]], { kind: "build", w: 0.8, op: 0.13, seed: 1190, wob: 1.2 });
  fillShape(g, region, PAPER);
  // trunk and limbs: short, spreading, a little twisted
  const trunkL: P[] = [[tx - 7, ty], [tx - 9, ty - 40], [tx - 14, ty - 78]], trunkR: P[] = [[tx + 8, ty], [tx + 6, ty - 44], [tx + 10, ty - 80]];
  stroke(g, trunkL, { w: 1.2, op: 0.92, seed: 1201, wob: 0.3, retrace: true, blob: true });
  stroke(g, trunkR, { w: 1.2, op: 0.92, seed: 1202, wob: 0.3, retrace: true });
  [[[tx - 14, ty - 78], [tx - 40, ty - 96], [tx - 74, ty - 108]], [[tx - 2, ty - 80], [tx + 2, ty - 98], [tx - 4, ty - 110]], [[tx + 10, ty - 80], [tx + 38, ty - 96], [tx + 70, ty - 106]]].forEach((l, i) => stroke(g, l as P[], { w: 1.05, op: 0.88, seed: 1210 + i, wob: 0.3, blob: true }));
  outline(g, crown, { w: 1.15, op: 0.9, seed: 1220, wob: 0.35, retrace: true });
  stroke(g, under, { w: 0.95, op: 0.82, seed: 1222, wob: 0.4 });
  // tone: the crown's underside and its right side in shade; the trunk shaded on its right
  const cTone = (x: number, y: number) => clamp(((y - 640) / 70) * 0.7 + ((x - tx) / 116) * 0.35 + ragged(x, y, 0.3));
  hatch(g, region, -0.9, 3.8, (x, y) => cTone(x, y) > 0.35, 1230, 0.55, "h1", "tree");
  hatch(g, region, 0.6, 4.2, (x, y) => cTone(x, y) > 0.68, 1231, 0.52, "h2", "tree");
  hatch(g, [[tx - 1, ty], [tx + 8, ty], [tx + 10, ty - 80], [tx + 1, ty - 80]], 0.9, 2.6, () => true, 1232, 0.6, "h1", "tree");
  // a scribble of leaf texture on the lit top, short curls
  const r = rng(1240);
  for (let i = 0; i < 14; i++) { const x = tx - 80 + r() * 140, y = 640 + r() * 30; stroke(g, [[x, y], [x + 4, y - 3], [x + 8, y]], { w: 0.7, op: 0.6, seed: 1241 + i, wob: 0.1, kind: "detail" }); }
};

// ---------------------------------------------------------------- the street
const shrub = (g: Gfx, cx: number, w: number, h: number, seed: number) => {
  const top = scallops(cx, GY, w / 2, h, 6, 5, seed), region: P[] = [...top];
  fillShape(g, region, PAPER);
  stroke(g, top, { w: 1.0, op: 0.85, seed, wob: 0.3, kind: "line" });
  hatch(g, region, -0.9, 3.6, (x, y) => y > GY - h * 0.55 + ragged(x, y, 6), seed + 1, 0.55, "h1");
};
const lamp = (g: Gfx) => {
  const x = 1002;
  stroke(g, [[x, GY], [x, 760], [x - 1, 716]], { w: 1.1, op: 0.9, seed: 1300, wob: 0.15, retrace: true, blob: true });
  stroke(g, [[x - 1, 716], [x + 6, 707], [x + 22, 706]], { w: 1.0, op: 0.9, seed: 1301, wob: 0.15 });
  const head: P[] = [[x + 14, 706], [x + 30, 706], [x + 27, 712], [x + 17, 712]];
  fillShape(g, head, PAPER); lines(g, head, { w: 0.9, op: 0.9, seed: 1302, wob: 0.06, kind: "detail" }, true);
  hatch(g, head, 0.6, 1.8, () => true, 1303, 0.75, "fill");
};
const terraces = (g: Gfx) => {
  [[1030, 1158], [1158, 1286]].forEach(([x0, x1], i) => {
    const eave = 768, apex = 730, mid = (x0 + x1) / 2, wall = rect(x0 + 8, eave, x1 - 8, GY), roof: P[] = [[x0, eave + 2], [mid, apex], [x1, eave + 2]];
    fillShape(g, [[x0, eave + 2], [mid, apex], [x1, eave + 2], [x1 - 8, GY], [x0 + 8, GY]], PAPER);
    lines(g, roof, { w: 1.15, op: 0.92, seed: 1400 + i * 10, wob: 0.25, retrace: true, blob: true });
    stroke(g, [[x0 + 8, eave + 1], [x0 + 8, GY]], { w: 1.05, op: 0.9, seed: 1401 + i * 10, wob: 0.15 });
    stroke(g, [[x1 - 8, eave + 1], [x1 - 8, GY]], { w: 1.05, op: 0.9, seed: 1402 + i * 10, wob: 0.15 });
    // roof tiles: strokes down the slope, denser on the side away from the light
    for (let q = 1; q < 11; q++) { const u = q / 11, top = lerpP([mid, apex], [x1, eave + 2], u * 0.02), a = lerpP([x0, eave + 2], [x1, eave + 2], u), b = lerpP([mid, apex + 3], a, 0.25); void top; stroke(g, [b, a], { w: 0.7, op: u > 0.5 ? 0.7 : 0.45, seed: 1410 + i * 20 + q, wob: 0.08, kind: "h1" }); }
    // the shadow under the eave, a door and a window
    hatch(g, rect(x0 + 9, eave + 1, x1 - 9, eave + 9), -0.95, 2.8, () => true, 1440 + i, 0.6, "h1");
    const door = rect(mid - 14, GY - 30, mid - 2, GY), win = rect(mid + 8, eave + 16, x1 - 22, eave + 32);
    lines(g, [[mid - 14, GY], [mid - 14, GY - 30], [mid - 2, GY - 30], [mid - 2, GY]], { w: 0.85, op: 0.88, seed: 1450 + i, wob: 0.06, kind: "detail" });
    hatch(g, door, 0.6, 2.4, () => true, 1452 + i, 0.65, "h2");
    lines(g, win, { w: 0.8, op: 0.85, seed: 1455 + i, wob: 0.06, kind: "detail" }, true);
    stroke(g, [[(win[0][0] + win[1][0]) / 2, win[0][1]], [(win[0][0] + win[1][0]) / 2, win[2][1]]], { w: 0.65, op: 0.7, seed: 1457 + i, wob: 0.04, kind: "detail" });
    hatch(g, win, -0.9, 2.6, () => true, 1458 + i, 0.55, "h2");
    void wall;
  });
};
const tower = (g: Gfx) => {
  const x0 = 1408, x1 = 1488, top = 336, d: P = [24, -9], face = rect(x0, top, x1, GY), side: P[] = [[x1, top], [x1 + d[0], top + d[1]], [x1 + d[0], GY + d[1]], [x1, GY]];
  fillShape(g, face, PAPER); fillShape(g, side, PAPER);
  lines(g, [[x0, GY], [x0, top], [x1, top], [x1, GY]], { w: 1.15, op: 0.9, seed: 1500, wob: 0.25, retrace: true, blob: true });
  lines(g, [[x0, top], [x0 + d[0], top + d[1]], [x1 + d[0], top + d[1]], [x1 + d[0], GY + d[1]]], { w: 1.0, op: 0.85, seed: 1501, wob: 0.25 });
  for (let y = top + 18; y < GY - 10; y += 22) lines(g, [[x0, y], [x1, y], [x1 + d[0], y + d[1]]], { w: 0.75, op: 0.7, seed: 1510 + y, wob: 0.1, kind: "detail" });
  hatch(g, side, -0.9, 3.6, () => true, 1560, 0.55, "h1");
  hatch(g, face, 0.6, 5.2, (x, y) => (y - top) % 22 < 6, 1561, 0.45, "h2");
  // the crown: a sunshade frame on the roof
  lines(g, [[x0 + 10, top], [x0 + 10, top - 16], [x1 - 6, top - 16], [x1 - 6, top]], { w: 0.85, op: 0.8, seed: 1570, wob: 0.1, kind: "detail" });
};
const sky = (g: Gfx) => {
  const cloud = (cx: number, cy: number, w: number, seed: number) => { const top = scallops(cx, cy, w / 2, 16, 5, 7, seed); stroke(g, top, { w: 0.95, op: 0.6, seed, wob: 0.35 }); stroke(g, [[cx - w / 2 - 6, cy + 0.5], [cx + w / 2 + 8, cy - 0.5]], { w: 0.8, op: 0.45, seed: seed + 1, wob: 0.3, kind: "detail" }); };
  cloud(1190, 150, 120, 1600); cloud(1450, 196, 90, 1610);
};
const ground = (g: Gfx) => {
  stroke(g, [[150, GY + 1], [520, GY - 1], [900, GY + 1], [1260, GY], [1560, GY + 1]], { w: 1.15, op: 0.9, seed: 1700, wob: 0.4, retrace: true });
  const r = rng(1710);
  for (let i = 0; i < 46; i++) { const x = 160 + i * 31 + r() * 12; if (x > BX0 - 4 && x < BX1 + 4) continue; stroke(g, [[x, GY], [x + 2 + r() * 2, GY - 4 - r() * 4]], { w: 0.7, op: 0.6, seed: 1711 + i, wob: 0.05, kind: "detail" }); }
};

// ---------------------------------------------------------------- birds (live only)
const birds = (g: Gfx, t: number) => {
  for (let i = 0; i < 3; i++) {
    const x = -70 - 46 * i + (W + 240) * t, y = 128 + 16 * i + 9 * Math.sin(Math.PI * 2 * (2 * t + i * 0.23));
    if (x < -30 || x > W + 30) continue; // off the sheet: no mark at all (so t = 0 draws nothing)
    const flap = 0.55 + 0.45 * Math.sin(Math.PI * 2 * (14 * t + i * 0.31)), span = 13 - i * 1.5, lift = 3 + 7 * flap;
    stroke(g, [[x - span, y - lift], [x - span * 0.45, y - lift * 0.35], [x, y]], { w: 1.0, op: 0.85, seed: 1900 + i * 2, wob: 0.05, kind: "detail" });
    stroke(g, [[x, y], [x + span * 0.45, y - lift * 0.35], [x + span, y - lift]], { w: 1.0, op: 0.85, seed: 1901 + i * 2, wob: 0.05, kind: "detail" });
  }
};

// ---------------------------------------------------------------- the plate
export const drawHouseStreet = (ctx: Ctx, _frame: number, env: Env, clock?: Clock, t = 0, layers: "all" | "static" | "live" = "all", boil?: { amount: number; drawing: number }) => {
  BOIL = boil?.amount ?? 0;
  const g = new Gfx(ctx, env, boil ? boil.drawing * 4 : 0, BIRO_M); // Gfx changes the wobble every 4 of its frames: one drawing = 4
  if (clock) (g as Gfx & { clock?: Clock }).clock = clock;
  ctx.setTransform(env.scale, 0, 0, env.scale, 0, 0);
  if (layers !== "live") { ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H); }
  g.group("plain", () => {
    if (layers !== "live") { block(g); tree(g); ground(g); lamp(g); terraces(g); shrub(g, 245, 70, 22, 1800); shrub(g, 668, 56, 18, 1810); shrub(g, 1346, 70, 22, 1820); tower(g); sky(g); }
    if (layers !== "static") { laundry(g, t); birds(g, t); }
  });
};

export const houseStreet: Film = {
  meta: { title: "House street · ballpoint sketch", W, H, fps: 30, bpm: 120, durationFrames: 1 },
  assets: { images: {} },
  shots: [{ id: "houseStreet", start: 0, end: 1, draw: (ctx, f, env) => drawHouseStreet(ctx, f, env) }],
};
