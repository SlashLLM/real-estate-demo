import type { Ctx, Env } from "./core";
import type { Film } from "./film";
import { drawHouseStreet, H, W } from "./houseStreet";

// HOUSE STREET · idle. The finished biro drawing, alive, animated ON THREES like a hand-drawn loop: every
// drawing the lines boil by a hair (each stroke redrawn with a fresh wobble), the laundry on the bamboo poles
// sways two whole cycles and three birds glide across the sky, off the sheet at the seam. Every motion repeats a
// whole number of times over [0, 1), so the last drawing runs straight back into the first. The site plays
// houseDraw once, then loops this; the hand-off is one boil step, the same change the loop makes every 0.1 s.

const N = 180, STEP = 3, BOIL = 0.42;

const draw = (ctx: Ctx, f: number, env: Env) => {
  const d = Math.floor(f / STEP), t = (d * STEP) / N;
  drawHouseStreet(ctx, 0, env, undefined, t, "all", { amount: BOIL, drawing: d });
};

export const houseIdle: Film = {
  meta: { title: "House street · idle", W, H, fps: 30, bpm: 120, durationFrames: N, kind: "loop", raster: "cpu", step: STEP },
  assets: { images: {} },
  shots: [{ id: "idle", start: 0, end: N, draw }],
};
