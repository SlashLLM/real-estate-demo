# Hero doodle source (anidoodle)

The hero's biro drawing of a Singapore street (HDB block, rain tree, terrace houses), drawn entirely in code with
the anidoodle skill (https://github.com/alexgreensh/anidoodle, Apache-2.0). Nothing here is compiled by Next.js;
the site only plays the rendered files in `public/images/doodle/`.

| File | What |
|---|---|
| `houseStreet.ts` | the plate: the finished drawing as a pure function, with an optional drawing clock and idle phase |
| `houseDraw.ts` | the 9 s film of it being drawn (kind "drawing"), ending on the plate |
| `houseIdle.ts` | the 6 s seamless loop (on threes: line boil, laundry sway, birds) whose frame 0 is the plate |
| `BRIEF.md` | the brief: style, shape, composition constraints from the hero layout |

To change it: scaffold an anidoodle project (`node <skill>/engine/tools/scaffold.mjs <dir> --film houseDraw --size 1600x900 --example`),
copy these three modules into `src/canvas-core/`, add a `src/hosts/page-<film>.ts` for each, then:

```bash
node tools/gate.mjs houseDraw && node tools/gate.mjs houseIdle
node tools/render.mjs houseDraw --scale 1.5 --out final/house-draw.mp4
node tools/render.mjs houseIdle --scale 1.5 --out final/house-idle.mp4
node tools/still.mjs houseStreet --scale 1.5 --out final/house-still.png
# web encodes used: x264 -preset slow -tune animation -crf 30 (draw) / -crf 34 (idle), -movflags +faststart -an;
# still: libwebp -quality 88 (2400 px and a 1600 px copy)
```
