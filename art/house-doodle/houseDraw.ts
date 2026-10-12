import type { Ctx, Env } from "./core";
import type { Film } from "./film";
import { drawHouseStreet, H, W, type Clock, type Kind } from "./houseStreet";

// HOUSE STREET · drawn in biro. The ballpoint plate (houseStreet.ts), watched being made, for the hero.
//
// ORDER (a ballpoint cannot take a mark back, so the sketcher builds up):
//   1. construction: the ground run out, the block's box and centre line, the crown's curve, barely pressed;
//   2. contours: the block first (it is the subject), then the tree, the ground, the street, the tower, the sky;
//   3. detail: doors, grilles, kitchen windows, pillars, laundry, grass, the lamp head;
//   4. tone, first direction wherever there is shade; 5. the cross direction where it is darker;
//   6. the third direction in the void deck and the lamp head: the deepest darks, last.
//   A beat between passes: the hand sits back before the next layer.
// PACE. Within a pass marks go in the plate's paint order; a mark's time is 4 + length^0.85 frame-units, so
//   long strokes travel fast and short fiddly ones slowly, never quicker than a few frames each.
// The hold is the finished plate, byte for byte, and frame 0 of the idle loop (houseIdle) is the same picture.

const N = 270, HOLD = 30;
const CUES: [Kind, number, number, number][] = [
  ["build", 0, 15, 4],
  ["line", 15, 110, 6],
  ["detail", 115, 165, 4],
  ["h1", 170, 210, 3],
  ["h2", 215, 230, 3],
  ["fill", 235, 240, 3],
];
(() => { // the grid checker, at load
  const bad: string[] = []; let prev = 0;
  CUES.forEach(([k, a, b, d]) => { if (a % 5 || b % 5) bad.push(`${k} off the 5-frame grid`); if (a < prev || b <= a) bad.push(`${k} out of order`); if (b - a < d) bad.push(`${k} shorter than one mark`); prev = b; });
  if (prev > N - HOLD) bad.push("drawing runs into the hold"); if (N % 15) bad.push("duration off the beat grid");
  if (bad.length) throw new Error("houseDraw cues: " + bad.join("; "));
})();

type Sched = { s: Float64Array; d: Float64Array };
// one [start, duration] per mark, from a recording pass (a clock that answers 0 draws nothing but counts)
const schedule = (env: Env, ctx: Ctx): Sched => {
  const key = "hsDraw:sched"; let S = env.cache.get(key) as Sched | undefined; if (S) return S;
  const marks: [Kind, number][] = []; drawHouseStreet(ctx, 0, env, (k, l) => (marks.push([k, l]), 0));
  const s = new Float64Array(marks.length), d = new Float64Array(marks.length);
  CUES.forEach(([kind, a, b, dmin]) => {
    const idx = marks.map((m, i) => (m[0] === kind ? i : -1)).filter((i) => i >= 0), cost = idx.map((i) => 4 + Math.pow(marks[i][1], 0.85)), total = cost.reduce((x, y) => x + y, 0) || 1, span = b - a;
    // starts spread by cost so the FIRST mark starts on the cue and the LAST ends on the next one: no frozen frames between passes
    const denom = total - (cost[cost.length - 1] ?? 0) || 1;
    let acc = 0; idx.forEach((i, j) => { const dur = Math.min(span, Math.max(dmin, (span * cost[j]) / total)); s[i] = a + (span - dur) * Math.min(1, acc / denom); d[i] = dur; acc += cost[j]; });
  });
  S = { s, d }; env.cache.set(key, S); return S;
};
const at = (S: Sched, f: number): Clock => { let i = 0; return () => { const p = (f - S.s[i]) / S.d[i]; i++; return p >= 1 ? 1 : p <= 0 ? 0 : p; }; };

const draw = (ctx: Ctx, f: number, env: Env) => {
  if (f < N - HOLD) return drawHouseStreet(ctx, 0, env, at(schedule(env, ctx), f));
  // the hold: the finished plate, drawn once per scale, then its exact pixels copied
  const key = `hsDraw:done:${env.scale}`, img = env.cache.get(key) as ImageData | undefined, w = Math.round(env.W * env.scale), h = Math.round(env.H * env.scale);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (img) return ctx.putImageData(img, 0, 0);
  drawHouseStreet(ctx, 0, env); ctx.setTransform(1, 0, 0, 1, 0, 0); env.cache.set(key, ctx.getImageData(0, 0, w, h));
};

export const houseDraw: Film = {
  meta: { title: "House street · drawn in biro", W, H, fps: 30, bpm: 120, durationFrames: N, kind: "drawing", raster: "cpu", holds: [[N - HOLD, N, "the finished drawing"]], poster: N - 1 },
  assets: { images: {} },
  shots: [{ id: "draw", start: 0, end: N, draw }],
};
