/*
  Builds the offline site out of four pages: the showcase and three reference
  pages.

  They share one stylesheet (_css.txt), so a change to the style changes the
  whole site at once. The curves on the showcase are static SVG paths built from
  points the engine computed (data.js): the graphics are visible without a line
  of script, and the script only brings them in.

  Run: node build.js
*/
const fs = require('fs');
const path = require('path');
// The samples on the page are files the build matrix compiles and runs
// (samples/docs). The code on the showcase used to live here and nowhere else,
// and for years it contained variables that came from nowhere: no compiler ever
// saw that text. Now there is one source.
const SAMPLES = path.join(__dirname, '..', '..', '0-foundation', 'samples', 'docs');

function highlight(code) {
  const KW = /\b(program|library|unit|uses|var|const|type|begin|end|try|finally|except|for|to|downto|do|while|repeat|until|if|then|else|function|procedure|class|record|nil|not|and|or|div|mod)\b/g;
  let t = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const holes = [];
  const stash = (s) => { holes.push(s); return '\u0001' + (holes.length - 1) + '\u0001'; };
  t = t.replace(/'[^']*'/g, (m) => stash('<span class="st">' + m + '</span>'));
  t = t.replace(/\{\$[^}]*\}/g, (m) => stash('<span class="dir">' + m + '</span>'));
  t = t.replace(/\/\/[^\n]*/g, (m) => stash('<span class="cm">' + m + '</span>'));
  t = t.replace(/\{[^}]*\}/g, (m) => stash('<span class="cm">' + m + '</span>'));
  t = t.replace(KW, '<span class="kw">$1</span>');
  return t.replace(/\u0001(\d+)\u0001/g, (m, i) => holes[+i]);
}

// Without the second argument the whole program goes onto the page. With 'show'
// it is the part between the { show } and { show done } markers: the same
// program, only an excerpt, because the first screen is no place for thirty
// lines.
function pascal(name, part) {
  const raw = fs.readFileSync(path.join(SAMPLES, name + '.dpr'), 'utf8').replace(/\r\n/g, '\n');
  let code = raw;
  if (part === 'show') {
    const open = raw.indexOf('{ show }');
    const close = raw.indexOf('{ show done }');
    if (open < 0 || close < 0) throw new Error(name + ': no show markers');
    code = raw.slice(open + '{ show }'.length, close);
  }
  // The service markers of a sample ({ expect: ... }, { needs: ... }, the show
  // markers) are for the build matrix, not the reader: they do not go onto the
  // page.
  code = code.split('\n')
    .filter((l) => !/\{\s*(expect:|needs:|show\b)/.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (part === 'show') code = code.replace(/^ {2}/gm, '');
  return highlight(code);
}


global.window = {};
require('./data.js');
const CURVES = window.CURVES;
const byKey = k => CURVES.find(c => c.key === k);
/*
  The stylesheet goes onto the page without its comments.

  The comments in _css.txt explain layout decisions. A built page is a published
  file, and there is no place in it for comments. They used to end up inside
  <style> and go unnoticed: the detector looked at visible text rather than at
  the markup.

  The source itself is untouched - the stripping happens only while building.
*/
const CSS = fs.readFileSync('_css.txt', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/[ \t]+$/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* ─── the geometry of the curves ────────────────────────────────────────── */

function toPath(curve, boxW, boxH, pad, maxPts, uniform) {
  const segs = curve.data.segs || [];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const s of segs) for (let k = 0; k < s.length; k += 2) {
    const x = s[k], y = s[k + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (minX > maxX) return { d: '', length: 0, points: 0 };

  /*
    A polar curve is scaled equally on both axes: otherwise a circle turns into
    an ellipse. A y=f(x) plot is scaled on each axis independently: its axes are
    in different units anyway, and stretching it across the whole plate is not a
    distortion but a choice of window.
  */
  const innerW = boxW - 2 * pad, innerH = boxH - 2 * pad;
  const spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
  const [sx, sy] = uniform
    ? [Math.min(innerW / spanX, innerH / spanY), Math.min(innerW / spanX, innerH / spanY)]
    : [innerW / spanX, innerH / spanY];
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const mapX = x => pad + innerW / 2 + (x - cx) * sx;
  const mapY = y => pad + innerH / 2 - (y - cy) * sy;

  const total = segs.reduce((n, s) => n + s.length / 2, 0);
  const stride = Math.max(1, Math.ceil(total / (maxPts || 2000)));

  let d = '', length = 0, points = 0, px = 0, py = 0, started;
  for (const s of segs) {
    started = false;
    for (let k = 0; k < s.length; k += 2 * stride) {
      const X = mapX(s[k]), Y = mapY(s[k + 1]);
      if (!started) { d += `M${X.toFixed(2)} ${Y.toFixed(2)}`; started = true; }
      else { d += `L${X.toFixed(2)} ${Y.toFixed(2)}`; length += Math.hypot(X - px, Y - py); }
      px = X; py = Y; points++;
    }
  }
  return { d, length: Math.ceil(length), points };
}

function gridLines(boxW, boxH, step) {
  let g = '';
  for (let v = step; v < boxW; v += step) g += `<line x1="${v}" y1="0" x2="${v}" y2="${boxH}"/>`;
  for (let v = step; v < boxH; v += step) g += `<line x1="0" y1="${v}" x2="${boxW}" y2="${v}"/>`;
  return g;
}

function plate(curve, pen, opts) {
  opts = opts || {};
  const boxH = 100, boxW = Math.round(100 * (opts.ratio || 1));
  const { d, length, points } = toPath(curve, boxW, boxH, opts.pad || 9, opts.maxPts, curve.polar);
  return {
    markup:
      `<svg viewBox="0 0 ${boxW} ${boxH}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
        `<g class="mm">${gridLines(boxW, boxH, opts.gridStep || 10)}</g>` +
        `<path class="trace" d="${d}" fill="none" stroke="${pen}" stroke-width="${opts.width || 0.55}" ` +
          `stroke-linejoin="round" stroke-linecap="round" style="--len:${length}"/>` +
      `</svg>`,
    length, points
  };
}

const PEN = { blue: 'var(--pen-blue)', red: 'var(--pen-red)', green: 'var(--pen-green)',
              violet: 'var(--pen-violet)', amber: 'var(--pen-amber)' };

/* ─── the shell ─────────────────────────────────────────────────────────── */

const NAV = [
  ['start.html', 'Start'],
  ['index.html#core', 'Parser'],
  ['index.html#plotting', 'Plotting'],
  ['index.html#tool', 'Plugin'],
  ['demo/', 'Demo'],
  ['syntax.html', 'Syntax'],
  ['accelerator.html', 'Accelerator'],
  ['limitations.html', 'Limitations'],
  ['index.html#releases', 'Releases'],
];

function shell(opts) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>
${CSS}
</style>
</head>
<body>
<div class="sheet">

  <header class="masthead">
    <div class="wordmark"><a href="index.html">Formulas <i>for</i> <b>Pascal</b></a></div>
    <nav class="label">
      ${NAV.map(([href, text]) =>
        `<a href="${href}"${opts.here === text ? ' aria-current="page"' : ''}>${text}</a>`).join('\n      ')}
    </nav>
  </header>
  <hr class="rule">

${opts.body}

  <hr class="rule">

  <footer class="label">
    <div>MIT licensed &middot; Delphi &amp; Free Pascal &middot; Windows &amp; Linux</div>
    <div>Draft preview - not published</div>
  </footer>

</div>
${opts.script || ''}
</body>
</html>`;
}

// The head of a reference page: the title on the left, the introduction on the right.
function docHead(title, paras) {
  return `  <section class="doc">
    <div class="doc-head">
      <div>
        <p class="label">Reference</p>
        <h1>${title}</h1>
      </div>
      <div>${paras.map(p => `<p class="sub">${p}</p>`).join('\n        ')}</div>
    </div>`;
}

const table = (head, rows) => `    <div class="tw"><table>
      <thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
      ${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n      ')}
      </tbody>
    </table></div>`;

const gotcha = (kicker, paras) =>
  `    <div class="gotcha"><span class="k">${kicker}</span>${paras.map(p => `<p>${p}</p>`).join('')}</div>`;

const m = t => `<span class="m">${esc(t)}</span>`;

/* ═══ page 1: the showcase ══════════════════════════════════════════════ */

const HERO = { key: 'maurer-6-71', pen: PEN.blue, note: '361 points, joined by chords' };
const GALLERY = [
  { key: 'butterfly',     pen: PEN.violet, note: 'Temple Fay, 1989 &middot; 24&pi;' },
  { key: 'rose-moire',    pen: PEN.amber,  note: 'k = 31/30 &middot; interference' },
  { key: 'weierstrass',   pen: PEN.green,  note: 'continuous, nowhere smooth' },
  { key: 'maurer-12-163', pen: PEN.red,    note: 'n = 12, d = 163' },
  { key: 'log-spiral',    pen: PEN.blue,   note: 'spira mirabilis' },
  { key: 'wave-packet',   pen: PEN.violet, note: 'beats &middot; sin x &middot; sin 16x' },
];
const BAND = { key: 'takagi', pen: PEN.green, ratio: 4, note: 'self-similar &middot; built from floor' };

const STACK = [
  { no: 'I',   name: 'MathParser',   what: 'parser, byte-code, interpreter, JIT',
    dep: 'no dependencies beyond the RTL', anchor: '#core' },
  { no: 'II',  name: 'CrossGraph',   what: 'plotting component for VCL and LCL',
    dep: 'builds on I', anchor: '#plotting' },
  { no: 'III', name: 'GraphBuilder', what: 'the plugin you can install today',
    dep: 'builds on II', anchor: '#tool' },
];

const TOOL = [
  ['Formulas',    'as many as you like, each toggled and coloured on its own'],
  ['Coordinates', 'cartesian and polar, switched without retyping'],
  ['Finds',       'intersections between curves, minima and maxima, values under the cursor'],
  ['Report',      'roots, breaks, monotone stretches, area and mean - computed, not guessed'],
  ['Bookmarks',   'ten slots for the whole state, kept between sessions'],
  ['Themes',      'follows the editor, light and dark'],
];

const METHODS = [
  ["AsInteger('2 ** 10')", '1024'],
  ["AsDouble('pi / 6')", '0.5235988'],
  ["AsBoolean('3 &gt; 2')", 'True'],
  ["AsExtended('sqrt(2)')", '1.4142136'],
  ["AsString('2 + 2')", "'4'"],
  ["AsDateTime('encodedate(2026, 7, 24)')", '2026-07-24'],
];

/*
  The release log. A new release is added AT THE TOP as a single entry: the date,
  the label and the added / fixed lists. An empty list is simply not printed. It
  is kept here rather than in a separate file so that the entry is written in the
  same place where the page is built.
*/
const RELEASES = [
  {
    tag: 'r20260726', date: '26 July 2026', title: 'First public release',
    added: [
      'MathParser: parser, flat bytecode, interpreter, shape cache, 163 callable functions',
      'The accelerator: x86-64 machine code with an automatic fall back to the interpreter',
      'A live demo that runs the real engine in the browser, compiled to WebAssembly',
      'Reference pages for syntax, the accelerator and the limitations',
      'Build matrix across Delphi win32 and win64, FPC on Windows and Linux',
    ],
    fixed: [],
  },
];

const FACTS = [
  ['163', 'callable functions, from <span class="i">sin</span> to <span class="i">weeksbetween</span>'],
  ['4', 'build targets, one source'],
  ['3 000', 'fuzzed formulas &middot; zero disagreement'],
  ['108&times;', 'the interpreter, inside a script loop'],
];

const heroCurve = byKey(HERO.key);
const hero = plate(heroCurve, HERO.pen, { pad: 9, width: 0.42, maxPts: 4000, gridStep: 12.5 });
const bandCurve = byKey(BAND.key);
const band = plate(bandCurve, BAND.pen, { pad: 7, width: 0.42, maxPts: 4200, ratio: 4, gridStep: 12.5 });
const plates = GALLERY.map(g => {
  const c = byKey(g.key);
  return { ...plate(c, g.pen, { pad: 9, width: 0.5, maxPts: 2600 }), text: c.text, note: g.note };
});

const indexBody = `  <section class="hero">
    <div class="hero-copy">
      <p class="label eyebrow">Delphi &amp; Free Pascal &middot; Windows &amp; Linux &middot; MIT</p>
      <h1>Type a formula.<br>Get a <em>number</em>.</h1>
      <p class="lead">An expression parser that reads what you write and answers in the
        type you asked for. No grammar to learn, no visitor to implement, and for a
        single answer nothing to create or free.</p>
      <pre class="oneliner">${pascal('hero')}</pre>
      <p class="undercode">That is the whole program: it prints 4. The matrix
        compiles and runs it, so this listing cannot drift from what works.</p>
      <div class="actions">
        <a class="btn solid" href="demo/">Try it live</a>
        <a class="btn hollow" href="#start">Quick start</a>
        <a class="btn hollow" href="#">Source on GitHub</a>
      </div>
    </div>
    <figure class="plate" style="margin:0">
      ${hero.markup}
      <figcaption class="caption">
        <span class="fx">${esc(heroCurve.text)}</span>
        <span class="no">${HERO.note}</span>
      </figcaption>
    </figure>
  </section>

  <hr class="rule">

  <section class="facts">
    ${FACTS.map(([n, d]) => `<div class="fact"><span class="n">${n}</span><span class="d">${d}</span></div>`).join('')}
  </section>

  <hr class="rule">

  <section class="stack">
    <div class="head">
      <h2>Three layers, and you can take any of them.</h2>
      <p class="label">each builds on the one below</p>
    </div>
    <div class="bom">
      ${STACK.map(l => `<a href="${l.anchor}"><span class="no">${l.no}</span><span class="name">${l.name}</span><span class="what">${l.what}</span><span class="dep">${l.dep}</span></a>`).join('')}
    </div>
  </section>

  <hr class="rule">

  <section class="methods" id="core">
    <div class="head">
      <div>
        <p class="layer"><span class="num">LAYER I</span> <span class="label">MathParser</span></p>
        <h2>Ask for the type you want.</h2>
      </div>
      <p class="label">One call &middot; no configuration</p>
    </div>
    <div class="rows">
      ${METHODS.map(([call, val]) => {
        const mm = call.match(/^(\w+)([\s\S]*)$/);
        return `<div class="row"><span class="call">Parser.<b>${mm[1]}</b>${mm[2]}</span><span class="dots"></span><span class="val">${val}</span></div>`;
      }).join('')}
    </div>

    <div class="swap">
<pre>${pascal('swap', 'show')}</pre>
      <p class="undercode">Excerpt from <code>samples/docs/swap.dpr</code>: both
        halves print the same 5.00, and the matrix runs the file to prove it.</p>
      <p class="said">One word, and the hot path becomes machine code. Everything
        else - the formulas, the variables, the calls - stays exactly as it
        was. Whatever the compiler declines, it hands back to the interpreter without
        saying a word, so the answer is never <b>fast but wrong</b>.
        <a class="link" href="accelerator.html">How it works</a>.</p>
    </div>

    <div class="prio" id="priority">
      <div class="bar">
        <span class="label">Priorities are data</span>
        <input id="prF" value="12 / 3 * 2" spellcheck="false" autocomplete="off"
          aria-label="formula to parse">
        <span class="pres" id="prPres">
          <span class="label">try</span>
          <button type="button">12 / 3 * 2</button>
          <button type="button">1 + 2 = 3</button>
          <button type="button">Sin(Pi / 2) * 3</button>
        </span>
      </div>
      <button class="btn hollow boot" id="prBoot">Run it live - loads the engine, ~1 MB</button>
      <div class="chips" id="prChips" hidden></div>
      <div class="rows" id="prOut" hidden>
        <div class="row"><span class="k">reads as</span><span class="v" id="prTree">-</span></div>
        <div class="row"><span class="k">value</span><span class="v" id="prVal">-</span></div>
      </div>
    </div>
    <p class="said">Operators here are registered functions whose precedence is a
      <b>value, not grammar</b>. Flip one and the same characters parse into a different
      tree: raise <b>*</b> above <b>/</b> and <code>12 / 3 * 2</code> turns from 8 into 2
     - the bracketed line is the parser's own decompiler reporting the tree it
      actually built. <b>Coverage</b> is the second knob: how far a raised or lowered
      priority reaches. Comparison ships as <i>lower&nbsp;+&nbsp;total</i>, which is why
      <code>1 + 2 = 3</code> compares the sum and answers -1, the parser's
      <i>true</i>. Switch <code>=</code> to <i>local</i> and it binds neighbours only:
      the same line now evaluates as <code>1 + (2 = 3)</code>, and the value flips to 1.
      The engine is the real parser, compiled to WebAssembly. Plus and minus have no
      knobs at all - they are how a script joins its items, not functions.
      Reload the page to reset.</p>
  </section>

  <hr class="rule">

  <section class="atlas" id="plotting">
    <div class="head">
      <div class="head-l">
        <p class="layer"><span class="num">LAYER II</span> <span class="label">CrossGraph</span></p>
        <h2>Give it a range, and you have a picture.</h2>
      </div>
      <div class="head-r">
        <p>Every point on this page came out of the parser - one formula, sampled
          across its parameter. Turning those numbers into a line is a loop you already
          know how to write; a ready-made component for VCL and LCL is a separate
          package. What matters here is that the values are right: poles left open,
          undefined stretches skipped, and the captions are the formulas exactly as
          they were parsed.</p>
        <p>The component adds what a plot actually needs: curves sampled across threads,
          adaptive density, intersections and extrema found rather than guessed, polar
          and cartesian on the same canvas.</p>
      </div>
    </div>
    <div class="grid">
      ${plates.map(p => `<figure class="plate" style="margin:0">${p.markup}<figcaption class="caption"><span class="fx">${esc(p.text)}</span><span class="no">${p.note}</span></figcaption></figure>`).join('')}
    </div>

    <figure class="plate band">
      ${band.markup}
      <figcaption class="caption">
        <span class="fx">${esc(bandCurve.text)}</span>
        <span class="no">${BAND.note}</span>
      </figcaption>
    </figure>
  </section>

  <hr class="rule">

  <section class="tool" id="tool">
    <div class="head">
      <div class="head-l">
        <p class="layer"><span class="num">LAYER III</span> <span class="label">GraphBuilder</span></p>
        <h2>And here it is, doing the job.</h2>
      </div>
      <div class="head-r">
        <p class="intro">A panel inside Notepad++: type a formula, press build, read the
          answer off the canvas. Nothing above is hidden from you - the plugin is
          the component, and the component is the parser. It is built twice, by
          Delphi and by Lazarus/FPC, from one set of sources and behind one
          interface; the binary on the release page is the FPC one, so a free
          toolchain is enough to reproduce it.</p>
        <p class="intro">It also runs <a class="link" href="demo/">right here in your
          browser</a> - the same panel on the same engine, compiled to
          WebAssembly. What the demo computes is what the plugin computes; only the
          x86-64 accelerator stays native.</p>
      </div>
    </div>
    <div class="body">
      <a class="plate shot" href="demo/">
        <span class="label">Live</span>
        <span class="t">Open the panel</span>
        <span class="d">The engine loads into your browser and computes as you
          type. Nothing is sent anywhere.</span>
      </a>
      <div class="feats">
        ${TOOL.map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
      </div>
    </div>
  </section>

  <hr class="rule">

  <section class="start" id="start">
    <div>
      <p class="label">Three ways in</p>
      <h2>Quick start</h2>
<pre>${pascal('quickstart', 'show')}</pre>
    </div>
    <div id="deeper">
      <p class="label">Put it in your project</p>
      <h2>Start here</h2>
      <div class="deeper">
        <a href="start.html#delphi"><div class="t">Delphi</div><div class="d">A package that installs into the palette, or two paths in the project.</div></a>
        <a href="start.html#lazarus"><div class="t">Lazarus</div><div class="d">Ready-made packages, opened and compiled from the IDE.</div></a>
        <a href="start.html#fpc"><div class="t">Linux and FPC</div><div class="d">The compiler and nothing else: no LCL, no LazUtils.</div></a>
        <a href="start.html#web"><div class="t">A web page</div><div class="d">Three static files: the engine in WebAssembly and the bridge to it.</div></a>
      </div>
      <p class="undercode"><a class="link" href="start.html">The whole guide</a>:
        the first program, both IDEs, Ubuntu, building the plugin, and embedding
        the plotting component into a project you already have.</p>

      <p class="label">Reference</p>
      <h2>Go deeper</h2>
      <div class="deeper">
        <a href="syntax.html"><div class="t">Syntax</div><div class="d">Operators, 163 callable functions, and the parts that surprise people.</div></a>
        <a href="accelerator.html"><div class="t">The accelerator</div><div class="d">What it compiles, what it declines, and what that costs.</div></a>
        <a href="limitations.html"><div class="t">Limitations</div><div class="d">An honest list of what it does not do - yet.</div></a>
      </div>
    </div>
  </section>

  <hr class="rule">

  <section class="log" id="releases">
    <div class="head">
      <h2>Releases</h2>
      <p class="label">newest first</p>
    </div>
    ${RELEASES.map(r => `<article class="rel">
      <div class="when">
        <span class="tag">${r.tag}</span>
        <span class="date">${r.date}</span>
      </div>
      <div class="what">
        <h3>${r.title}</h3>
        ${r.added.length ? `<p class="kind">Added</p><ul>${r.added.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
        ${r.fixed.length ? `<p class="kind">Fixed</p><ul>${r.fixed.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      </div>
    </article>`).join('')}
  </section>`;

const indexScript = `<script>
document.documentElement.classList.add('js');
(() => {
  const plates = [...document.querySelectorAll('.plate')];
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    plates.forEach(p => p.classList.add('drawn')); return;
  }
  const hero = plates[0];
  hero.style.setProperty('--dur', '4.2s');
  requestAnimationFrame(() => hero.classList.add('drawn'));
  const rest = plates.slice(1);
  const io = new IntersectionObserver((es, obs) => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      const i = rest.indexOf(e.target);
      e.target.style.setProperty('--dur', '2.6s');
      setTimeout(() => e.target.classList.add('drawn'), Math.max(0, i % 3) * 130);
      obs.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  rest.forEach(p => io.observe(p));
  // A guard: what the page says must not depend on who is watching.
  setTimeout(() => plates.forEach(p => p.classList.add('drawn')), 3000);
})();

/* The priority panel: the real engine in WebAssembly, loaded on demand. */
(() => {
  const $ = id => document.getElementById(id);
  const boot = $("prBoot");
  if (!boot) return;
  let eng = null, slot = -1;
  const enc = new TextEncoder(), dec = new TextDecoder();

  // A minimal WASI shim: no files, only a clock and random bytes.
  const wasiShim = getMem => {
    const NOSUP = 58, BADF = 8, OK = 0;
    const view = () => new DataView(getMem().buffer);
    const zero2 = (a, b) => { const v = view(); v.setUint32(a, 0, true); v.setUint32(b, 0, true); return OK; };
    return {
      args_get: () => OK, args_sizes_get: zero2,
      environ_get: () => OK, environ_sizes_get: zero2,
      clock_time_get: (i, p, out) => { view().setBigUint64(out, BigInt(Math.round(performance.now() * 1e6)), true); return OK; },
      fd_close: () => BADF, fd_fdstat_get: () => BADF, fd_filestat_get: () => BADF,
      fd_filestat_set_size: () => BADF, fd_filestat_set_times: () => BADF,
      fd_prestat_get: () => BADF, fd_prestat_dir_name: () => BADF,
      fd_read: () => BADF, fd_readdir: () => BADF, fd_seek: () => BADF, fd_tell: () => BADF,
      fd_write: (fd, io, n, w) => { view().setUint32(w, 0, true); return OK; },
      path_create_directory: () => NOSUP, path_filestat_get: () => NOSUP,
      path_filestat_set_times: () => NOSUP, path_open: () => NOSUP,
      path_readlink: () => NOSUP, path_remove_directory: () => NOSUP,
      path_rename: () => NOSUP, path_unlink_file: () => NOSUP,
      poll_oneoff: () => NOSUP,
      proc_exit: c => { throw new Error("exit " + c); },
      random_get: (p, n) => { crypto.getRandomValues(new Uint8Array(getMem().buffer, p, n)); return OK; }
    };
  };

  const put = s => {
    const b = enc.encode(s), p = eng.walloc(b.length);
    new Uint8Array(eng.memory.buffer, p, b.length).set(b);
    return [p, b.length];
  };
  const take = (fn, cap) => {
    cap = cap || 2048;
    const p = eng.walloc(cap), n = fn(p, cap);
    const s = dec.decode(new Uint8Array(eng.memory.buffer, p, n));
    eng.wfree(p);
    return s;
  };

  function refresh() {
    if (slot >= 0) { eng.drop(slot); slot = -1; }
    const [p, n] = put($("prF").value);
    slot = eng.prepare(p, n);
    eng.wfree(p);
    const tree = $("prTree"), val = $("prVal");
    if (slot < 0) {
      tree.textContent = take((b, c) => eng.note(b, c)) || "parse error";
      tree.classList.add("err");
      val.textContent = "-";
      $("prChips").innerHTML = "";
      return;
    }
    tree.classList.remove("err");
    drawChips(JSON.parse(take((b, c) => eng.ops(slot, b, c)) || "[]"));
    tree.textContent = take((b, c) => eng.unparse(slot, b, c)) || "-";
    const v = eng.evalat(slot, 0);
    val.textContent = Number.isFinite(v) ? String(Math.round(v * 1e9) / 1e9) : "not a finite number";
  }

  function drawChips(ops) {
    const box = $("prChips");
    box.innerHTML = "";
    if (!ops.length) {
      const note = document.createElement("span");
      note.className = "label";
      note.textContent = "no adjustable operators here - plus and minus are structure, not functions";
      box.appendChild(note);
      return;
    }
    ops.forEach(o => {
      const chip = document.createElement("div");
      chip.className = "chip";
      const op = document.createElement("span");
      op.className = "op";
      op.textContent = o.n;
      chip.appendChild(op);
      // Two knobs, as in the original sample: priority and its coverage.
      // Each carries a caption, so the groups read without documentation.
      const seg = (cls, caption, hint, names, current, apply, what) => {
        const knob = document.createElement("span");
        knob.className = "knob";
        const cap = document.createElement("span");
        cap.className = "k";
        cap.textContent = caption;
        cap.title = hint;
        const wrap = document.createElement("span");
        wrap.className = cls;
        names.forEach((name, i) => {
          const b = document.createElement("button");
          b.textContent = name;
          b.setAttribute("aria-pressed", String(current === i));
          b.title = "Set " + o.n + " " + what + " to " + name;
          b.onclick = () => { apply(i); refresh(); };
          wrap.appendChild(b);
        });
        knob.appendChild(cap);
        knob.appendChild(wrap);
        return knob;
      };
      chip.appendChild(seg("lvl", "priority",
        "How tightly " + o.n + " binds: lower, same, or higher than the others",
        ["lower", "normal", "higher"], o.p, i => eng.opset(o.h, i, o.c), "priority"));
      chip.appendChild(seg("lvl cov", "coverage",
        "How far a non-normal priority reaches: local grabs the neighbours, total the whole expression",
        ["local", "total"], o.c, i => eng.opset(o.h, o.p, i), "coverage"));
      box.appendChild(chip);
    });
  }

  let timer = 0;
  boot.onclick = async () => {
    boot.disabled = true;
    boot.textContent = "loading the engine...";
    try {
      let mem;
      const imports = { wasi_snapshot_preview1: wasiShim(() => mem) };
      const { instance } = await WebAssembly.instantiateStreaming(fetch("demo/parsewasm.wasm"), imports);
      eng = instance.exports;
      mem = eng.memory;
      eng._initialize();
      boot.hidden = true;
      $("prChips").hidden = false;
      $("prOut").hidden = false;
      refresh();
      $("prF").addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, 350);
      });
    } catch (e) {
      boot.textContent = "engine failed to load: " + e.message;
    }
  };

  // Samples: a click puts the formula in the field and recomputes if the engine is up.
  $("prPres").addEventListener("click", e => {
    if (e.target.tagName !== "BUTTON") return;
    $("prF").value = e.target.textContent;
    if (eng) refresh();
  });
})();
</script>`;

fs.writeFileSync('index.html', shell({
  title: 'Formulas for Pascal - read, and drawn',
  here: 'Parser', body: indexBody, script: indexScript
}));

console.log('index.html        ', (fs.statSync('index.html').size / 1024).toFixed(0), 'KB');
module.exports = { shell, docHead, table, gotcha, m, esc, plate, PEN, byKey, pascal};
