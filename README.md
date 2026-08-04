# Formulas for Pascal - the site

The pages behind [MathParser](https://github.com/pisarev/pascal-mathparser),
including a live demo that runs the real engine in your browser.

The site is live at <https://pisarev.github.io/mathparser-live/>.

Everything here is static. There is no build server, no bundler, and no external
request at runtime: the pages are self-contained files, and the demo computes on
the visitor's own machine.

## What is in here

| | |
|---|---|
| `index.html`, `syntax.html`, `accelerator.html`, `limitations.html` | the built pages |
| `demo/` | the live demo: the plugin panel over the engine compiled to WebAssembly |
| `build/` | the generators that produce the pages |
| `engine/` | Pascal sources for the WebAssembly build of the engine |

## The curves are not drawings

Every curve on the front page is a static SVG path baked from points the parser
computed. `build/export_curves.dpr` is a console program that links the real
parser, samples eighteen curves, and writes `build/data.js`; `build/build.js`
turns those points into paths. Nothing is drawn by hand and nothing is
approximated for looks.

That is also why the point counts in `export_curves.dpr` are part of the picture
rather than a setting. A Maurer rose exists because 361 points are joined by
straight chords: sample it densely and you get an ordinary flower.

## Rebuilding the pages

```bash
cd build
node build.js        # front page
node build_docs.js   # syntax, accelerator, limitations
```

Both write into `build/`; move the four HTML files up one level. To recompute the
curves you need Delphi or FPC and the parser sources:

```bash
dcc64 -U<path-to>/pascal-mathparser/src export_curves.dpr
./export_curves
```

## Rebuilding the engine

`demo/parsewasm.wasm` is the parser compiled for WebAssembly. It needs the FPC
cross compiler for wasm32-wasip1, which is built from the FPC sources:

```bash
make crossall crossinstall OS_TARGET=wasip1 CPU_TARGET=wasm32
```

After that `engine/build_wasm.ps1` produces the module. `engine/parsewasm.pas` is
the whole interface: prepare a formula into a slot, evaluate a slot at a point,
evaluate it over a grid, plus the operator-priority panel used on the front page.

The demo page itself, `demo/index.html`, mirrors the panel from the
[GraphBuilder plugin](https://github.com/pisarev/graphbuilder-npp) and is
published here as a built file.

## Self test

`demo/selftest.html` drives the demo in an iframe and checks what a screenshot
would show. It exists because of a real defect: the dashed tracing line is drawn
from the traced parameter, and in polar mode that parameter is an angle in graph
coordinates, where the Y axis points up, while the canvas has it pointing down.
Getting the sign wrong mirrors the line, and it drifts away from the point it is
supposed to touch.

The test asserts three separate invariants, because the first version of it was
too weak and passed while the defect was present:

- **a traced point has to lie on the dashed line**, checked in all four
  quadrants. With the sign wrong the gap is about 80 pixels; with it right, zero
  to three decimals;
- **the point sits on the ray of its parameter**, checked on a curve whose radius
  never goes negative (`2 + Cos(3 * X)`). An earlier version compared angles
  modulo pi to tolerate a negative radius, and that made it blind to a mirrored
  line, which is the one thing it existed to catch;
- **the line runs along that ray too**. The point is the engine's answer; the
  line is what gets drawn. Only this check looks at the drawing, and only it
  fails if the geometry is mirrored while the engine stays correct.

Readiness and results are read from the page's own data rather than from the
status line: that line is prose and gets translated, and a test that greps it
passes on one copy of the page and hangs on the other.

Open it in a browser after any change to tracing or drawing. Sixteen checks, all
green; flipping the sign of the vertical component in `traceGeometry` turns eight
of them red.

## What the demo can and cannot do

It runs the interpreter. The x86-64 accelerator cannot run in a browser sandbox:
it emits machine code, and a sandbox executes WebAssembly instead. So the demo is
honest about which engine answers, and the accelerator numbers on the pages are
measured natively and stated as measurements.

## License

MIT, see [LICENSE](LICENSE).
