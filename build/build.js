/*
  Builds the showcase. The whole site is five pages: the showcase from here, three
  reference pages from build_docs.js and the "where to start" page from
  build_start.js.

  They all share one style sheet (_css.txt), so an edit to the style changes the
  whole site at once. The curves on the showcase are static SVG paths built from
  points computed by the engine (data.js): the graphics are there without a single
  line of script, the script only reveals them.

  To run: node build.js
*/
const fs = require('fs');
const path = require('path');
// The samples on the page are the files the matrix builds and runs.
// The code of the showcase used to live only here, and for years it held variables
// that come from nowhere: no compiler ever saw that text.
// Now there is a single source.
//
// The directory is searched for rather than set: in the monorepo it is
// 0-foundation, in the published layout it is a neighbouring clone of the parser
// repository, where the same files sit in samples/docs. While the path was a single
// monorepo one, the documented command node build.js fell over on a clean clone at
// the very first read.
const SAMPLES = [
  path.join(__dirname, '..', '..', 'pascal-mathparser', 'samples', 'docs'),
  path.join(__dirname, '..', '..', '0-foundation', 'samples', 'docs')
].find(fs.existsSync);
if (!SAMPLES) {
  throw new Error('samples not found: clone pascal-mathparser next to this ' +
    'repository (see README, "Rebuilding the pages")');
}

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

// Without a second argument the whole program goes to the page. With 'show' it is
// the stretch between the markers { show } and { show done }: the same program,
// only an extract, because the first screen is no place for thirty lines.
function pascal(name, part) {
  const raw = fs.readFileSync(path.join(SAMPLES, name + '.dpr'), 'utf8').replace(/\r\n/g, '\n');
  let code = raw;
  if (part === 'show') {
    const open = raw.indexOf('{ show }');
    const close = raw.indexOf('{ show done }');
    if (open < 0 || close < 0) throw new Error(name + ': no display markers');
    code = raw.slice(open + '{ show }'.length, close);
  }
  /*
    The copyright frame does not go to the start of a sample.

    In the monorepo it is not there, while in the published sources it is required,
    put in place by the release. Because of that a page built IN THE REPOSITORY by
    the same generator showed a sample starting with six lines of the frame, while
    the deployed page started with the program itself. A reader who rebuilt the site
    by the README got something other than what the site shows, and nobody checked
    that difference.
*/
  const bar = (l) => /^\s*\{\s*\*{10,}\s*\}\s*$/.test(l);
  const lines = code.split('\n');
  if (lines.length && bar(lines[0].replace(/^\ufeff/, ''))) {
    const end = lines.findIndex((l, i) => i > 0 && bar(l));
    if (end > 0) code = lines.slice(end + 1).join('\n');
  }

  // The service labels of a sample ({ expect: ... }, { needs: ... }, the show
  // markers) are for the matrix rather than the reader: they do not go to the page.
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
  The style sheet goes to the page without comments.

  The comments in _css.txt explain layout decisions and are written in Russian, as
  everything here is. A built page is a published file, and it must hold neither
  comments nor Russian text. They used to travel inside <style> and stay unnoticed:
  the detector looked at visible text rather than at markup.

  The source itself is not touched, the cutting happens only while building.
*/
const CSS = fs.readFileSync('_css.txt', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/[ \t]+$/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// A formula the reader will type into the parser. It is marked apart from everything
// else set in a monospaced font, because that place holds a mixture of everything:
// operator signs, method names, dates, pieces of syntax. Telling a formula from
// those by guesswork is impossible, and a classifier would itself become a new weak
// spot. What is marked gets taken out by the release check and run through the real
// parser, so a published sample cannot turn out to be something the parser rejects.
// That is exactly what happened with parse('2 + 3'): the parser does not take single
// quotes, and the page was printing them.
/*
  An expected value is optional, and these are different statements:
    fx('sqrt(2)')        proves only that it runs;
    fx('8 // 3', '2')    proves that it runs AND that the result matches.
  The second is needed everywhere the page prints a particular answer next to it.
  The probe reads data-expect and compares it with what the parser gave, to the
  precision the answer is written with: the page promises "0.5235988", so the
  comparison has to go to the seventh digit.
*/
const fx = (s, expect) => expect === undefined
  ? `<code class="formula">${esc(s)}</code>`
  : `<code class="formula" data-expect="${esc(expect)}">${esc(s)}</code>`;

/*
  A formula and its published answer come from ONE source.

  The review named the next hole before I fell into it: if the expected value is
  written twice, in the visible text and in the metadata, the validator will know 2
  while the author changes the visible answer to 3, and nobody will notice. So there
  is one argument and two outputs.
*/
const fxIs = (s, expect) => `${fx(s, expect)} is ${esc(expect)}`;

/*
  The same, but the answer stands inside a phrase rather than right after the
  formula. The place for the answer is marked with %.

    fxSays('1 + 2 = 3', '-1', ' compares the sum and answers %')

  The form was needed because fxIs closed only those sentences where the answer
  comes immediately after. In two places on the main page the answer was written
  into prose, and there the number still lived twice: the review saw it during a
  demonstration before it had a chance to diverge. The hole is the same one: what is
  visible and what is checked have to share a source, wherever the visible part
  stands.

  The space and the punctuation belong to the phrase rather than to the helper: the
  first attempt inserted a space itself and quietly ate the comma in a sentence that
  had read "..., and the value flips to 1".
*/
const fxSays = (s, expect, phrase) =>
  `${fx(s, expect)}${phrase.split('%').join(esc(expect))}`;

/*
  A formula whose answer is published as the result of a PARTICULAR call.

  The table of values promises not merely a number but that AsInteger or AsBoolean
  is what returns it. While the markup carried a bare data-expect, the probe checked
  everything through AsDouble, and three rows of the table were held by nobody:
  AsBoolean promises "True", which as a number is -1; AsString promises "'4'";
  AsDateTime promised a date. Replacing True with False would have passed green.

  The name of the call travels in the markup next to the answer, and the probe calls
  EXACTLY IT. That is also how it turned out that the parser has no AsDateTime at
  all: a row of the table named a method that does not exist.
*/
const fxCall = (s, call, answer) =>
  `<code class="formula" data-call="${esc(call)}" data-expect="${esc(answer)}">${esc(s)}</code>`;

/*
  A piece of syntax: a name, an operator, a path, a call. Not a formula, nobody
  computes it.

  There are two helpers for a reason. The review of 09.08.2026 showed that runnable
  formulas were hiding in an unnamed <code> and went past the formula latch in
  silence: coverage depended on whether the author remembered to mark it. The mark
  is now required, and an unnamed <code> brings the build down, see typed() below.
*/
const frag = s => `<code class="frag">${esc(s)}</code>`;

/*
  A formula that needs context. The cases are a list of "bindings => expected":
    fxc('x ** 2', ['x=5 => 25'])
    fxc('if(x <> 0, 1 / x, 0)', ['x=2 => 0.5', 'x=0 => 0'])
  The formula probe reads them and runs EVERY one. An empty list is forbidden by the
  contract: the latch will not accept a tag without cases.
*/
const fxc = (s, cases) =>
  `<code class="formula-context" data-cases="${esc(cases.join('; '))}">${esc(s)}</code>`;

/*
  A latch inside the build itself. It catches before the page reaches the release,
  and it catches for whoever edits the generator rather than for whoever reads the
  report afterwards.
*/
/*
  There are exactly three forms of the opening tag, and what is checked is THE
  EQUALITY OF COUNTS, not the presence of an attribute. The first attempt looked for
  class= at all, and a typo went straight through: <code class="frga"> suited the
  latch while the formula probe did not see it, because that is not formula. The
  hole "the author forgot to mark it" closed, the hole "the author made a typo"
  opened.

  The form of comparison is deliberately blunt. Parsing by attributes would let
  through both <code class="formula" class="frga"> and any accidental attributes to
  come. If a fourth class is ever needed, that will be a deliberate change of the
  contract here rather than a quiet widening of the markup.
*/
const CODE_FORMS = [
  '<code class="formula">',
  '<code class="frag">',
];

/*
  The fourth allowed form is a formula WITH an expected value. It is not a fourth
  TYPE: its fate is the same as that of formula, only a machine expectation has been
  added. An empty data-expect is forbidden: an empty promise is worse than a missing
  one.
*/
const EXPECT_FORM = /<code class="formula" data-expect="[^"]+">/g;

/*
  The third form comes with required cases. For a formula that needs context one
  class is not enough: x ** 2 without a binding is not taken by the parser at all
  ("Unknown element: x"), and the probe will honestly reject it. So the cases travel
  TOGETHER with the statement, right in the markup, and a tag without them is not
  valid.

  One case would prove computability but not the published statement. if(x <> 0,
  1/x, 0) is declared to be lazy: x=2 gives 0.5, while x=0 gives 0 and does NOT give
  an exception. The first case without the second proves nothing about laziness.
*/
const CONTEXT_FORM = /<code class="formula-context" data-cases="[^"]+">/g;

/*
  The fifth form is a formula with the NAME OF THE CALL and an answer. The type is
  still formula; what has been added is which call produced the published answer,
  because the table of values promises not a number in general but the result of
  AsBoolean or AsString.
*/
const CALL_FORM = /<code class="formula" data-call="[^"]+" data-expect="[^"]+">/g;

function typed(html, where) {
  const all = (html.match(/<code\b/g) || []).length;
  let good = (html.match(CONTEXT_FORM) || []).length
           + (html.match(EXPECT_FORM) || []).length
           + (html.match(CALL_FORM) || []).length;
  for (const form of CODE_FORMS) good += html.split(form).length - 1;
  if (all !== good) {
    throw new Error(
      `${where}: ${all} <code> tags in all, ${good} of them by the contract. ` +
      `Allowed exactly: ${CODE_FORMS.join(' ')} ` +
      '<code class="formula-context" data-cases="x=5 => 7">');
  }
  return html;
}

/* ─── curve geometry ────────────────────────────────────────────────────── */

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
    A polar curve is scaled equally on both axes: otherwise a circle becomes an
    ellipse. A y=f(x) graph is scaled independently on each axis: its axes are in
    different units anyway, and stretching it across the whole plate is a choice of
    window rather than a distortion.
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
  return typed(`<!doctype html>
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
    <div><a href="https://github.com/pisarev/pascal-mathparser">Source on GitHub</a>
      &middot; <a href="index.html#releases">Releases</a></div>
  </footer>

</div>
${opts.script || ''}
</body>
</html>`, opts.title);
}

// The header of a reference page: the title on the left, the introduction on the right.
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
  ['Data',        'paste a table or a csv - the two columns become points on the canvas'],
  ['Regression',  'fit a formula to those points: line, polynomial, exponential, power, log'],
  ['Coordinates', 'cartesian and polar, switched without retyping'],
  ['Finds',       'intersections between curves, minima and maxima, values under the cursor'],
  ['Report',      'roots, breaks, monotone stretches, area and mean - computed, not guessed'],
  ['Bookmarks',   'ten slots for the whole state, kept between sessions'],
  ['Themes',      'follows the editor, light and dark'],
];

/*
  Screenshots of a fit: two frames of the LIVE demo, taken off the real engine.

  Words cannot show this - a person will not guess that the panel can compute
  from points until he sees it. Hence the order: first the picture, then the
  caption saying what exactly happened in it.

  The numbers in the captions are the real output of the panel on this data, not
  round values "for the example". Anyone can check them: the tables are given.
*/
const FITS = `
      <div class="fits">
        <figure>
          <img src="fit-kepler.png" alt="Six planets as points and the fitted power law over them"
               width="2360" height="1560" loading="lazy">
          <figcaption><b>Six rows of a table, and out comes a law of nature.</b>
            Orbital radius against period for the planets from Mercury to Saturn -
            the numbers an astronomy textbook gives. A power fit answers
            <code class="formula">1.00029 * Exp(1.499715 * Ln(X))</code>: an exponent of 1.4997 and
            a factor of 1.0003. That exponent is Kepler's third law, which took him
            years of observation. Nothing was told to the panel except the six
            pairs of numbers.
            <span class="try">Copy the table, paste it into the panel, pick
            <b>power</b> in the row that appears:</span></figcaption>
          <pre class="data">radius;period
0.387;0.241
0.723;0.615
1.000;1.000
1.524;1.881
5.203;11.862
9.537;29.457</pre>
        </figure>
        <figure>
          <img src="fit-throw.png" alt="Eleven measured points and the parabola fitted through them"
               width="2360" height="1560" loading="lazy">
          <figcaption><b>Eleven measurements of a throw, and the parabola behind them.</b>
            A polynomial of the second degree answers
            <code class="formula">-0.495688 * X * X + 4.972331 * X + 0.014685</code> with
            R^2 = 0.9997. The caveat sits beside the answer rather than in the
            documentation: R^2 grows with the number of coefficients by itself, so
            a higher degree would fit better and mean less.
            <span class="try">Same table, same two steps - pick
            <b>polynomial 2</b> this time:</span></figcaption>
          <pre class="data">x;height
0;0.0
1;4.5
2;8.1
3;10.4
4;11.9
5;12.4
6;12.0
7;10.6
8;8.2
9;4.6
10;0.1</pre>
        </figure>
      </div>`;

const METHODS = [
  ["AsInteger('2 ** 10')", '1024'],
  ["AsDouble('pi / 6')", '0.5235988'],
  ["AsBoolean('3 &gt; 2')", 'True'],
  ["AsExtended('sqrt(2)')", '1.4142136'],
  ["AsString('2 + 2')", "'4'"],
  ["AsDateTime('encodedate(2026, 7, 24)')", '2026-07-24'],
];

/*
  The release log. A new release is added AT THE TOP as a single entry: date, tag
  and the added / fixed lists. An empty list simply is not printed. It is kept here
  rather than in a separate file so that the entry is made in the same place where
  the page is built.
*/
const RELEASES = [
  {
    tag: 'v1.3.2', date: '19 August 2026', title: 'The panel opens again',
    link: 'https://github.com/pisarev/graphbuilder-npp/releases/tag/v1.3.2',
    added: [],
    fixed: [
      'The 1.3.1 plugin crashed Notepad++ the moment the panel was opened, and the download has been removed. A record that the plugin hands to the editor was laid out four bytes short of what the editor expects, so the editor read the module name from the wrong place and dereferenced whatever was there. The record is a C structure, and the directive that keeps it C-compatible was cancelled by a later one; on FPC 3.3.1 the two agree, on the 3.2.2 the README asks for they do not. 1.3.1 was the first release built with the compiler the README names, which is why the fault surfaced there.',
    ],
  },
  
  {
    tag: 'v1.3.1', date: '19 August 2026', title: 'The recipe runs on a machine that is not mine',
    link: 'https://github.com/pisarev/graphbuilder-npp/releases/tag/v1.3.1',
    added: [],
    fixed: [
      'The Delphi build looked for the compiler in one fixed folder and only ever found RAD Studio 13. It reads the installed versions from the registry now, so 11 Alexandria and newer build as the README says. Set BDS_BIN to pin a particular installation.',
      'The build and install scripts asked for pwsh. PowerShell 7 ships with no Windows at all, so the recipe stopped on its first command for anyone who had not installed it separately. The scripts run under the PowerShell that comes with Windows, and the instructions say powershell now, with the execution-policy switch that a downloaded script needs.',
      'The Notepad++ plugin opened with different settings depending on which of the two builds you installed: the zoom step was 0.5 in the Delphi build against 0.1 in the Lazarus one, and six other numbers differed with it. Both builds now carry the same defaults and seed them into the component before anything saved is read.',
    ],
  },

  {
    tag: 'v1.3.0', date: '17 August 2026', title: 'A table becomes points, and the points become a formula',
    link: 'https://github.com/pisarev/graphbuilder-npp/releases/tag/v1.3.0',
    added: [
      'A selection in the editor is plotted while you are making it. Select a pair of columns in a csv and the points appear on the canvas at once; the next selection replaces them, so nothing piles up. Alt+Shift+G keeps what is shown for good, as an ordinary row of the list.',
      'Text with numbers becomes a series of points. The separator is worked out from the data - a semicolon, a tab, a comma, a space - and a decimal comma is not mistaken for one. A header row names the series. Points are drawn as points, not joined by a line: a line between measurements would draw values where nothing was measured.',
      'A formula is fitted to those points: a straight line, a polynomial of the second to the fifth degree, exponential, power or logarithmic. The result is an ordinary formula string, so everything already there works on it - tracing, extrema, intersections, the report, bookmarks, the share link.',
      'The caveats stand beside the answer rather than in the documentation. R^2 grows with the number of coefficients by itself; the exponential, power and logarithmic fits are computed through logarithms, so it is the deviation of the logarithms that is least; least squares is sensitive to outliers.',
      'Undo. Ctrl+Z, or the button next to the bin, takes back the last destructive action - clearing the panel, removing a curve or a series, a fit. Twenty steps, and the tooltip names what will be undone.',
      'The panel says why it is empty. Without the WebView2 runtime it used to stay blank with no explanation; now it names the reason and what to do about it.',
    ],
    fixed: [
      'The colour you picked is the colour the curve is drawn in. While "a colour of its own for every formula" was set, the chosen colour was not used at all, and the control looked as though it worked. Picking a colour now turns that mark off, and the switch for it stands in plain sight.',
      'A bookmark slot stays occupied after you restore from it, and you can return to the same bookmark as many times as you like. Restoring used to free the slot, so click after click went remember - restore - remember. Ctrl+click writes over a slot, Shift+click clears it, and both gestures are written in the tooltip.',
      'Printing puts the whole report on paper, not the part that happened to be visible. The report lived in a scrolling window and was clipped along with the scrollbar; the graph is printed too, on a page of its own.',
      'Clear stands at the end of the button row, behind a separator, with undo before it. It used to sit between Print and Report - three neighbours, two of which show something and the third wiped the list without a question. It now clears the whole panel, series included, and the caption says so.',
      'A formula whose values run off to infinity no longer brings the browser demo down. X // Sin (X) beside other curves made the build fail outright: near the zeros of the sine the chord between neighbouring nodes came out infinite, and the search for touches let it through - both of its gates compare on "greater", and infinity on the right lets everything past. The plugin was never affected: there the intersections are computed by the engine, and in the browser they are written again in JavaScript.',
    ],
  },
  {
    tag: 'v1.2.1', date: '16 August 2026', title: 'An extremum is a property of the function, not of the sampling',
    link: 'https://github.com/pisarev/pascal-crossgraph/releases/tag/v1.2.1',
    added: [],
    fixed: [
      'The extremum marked on a curve was the nearest computed point rather than the extremum itself. Three things followed from that, and a reader of the plugin noticed all three: for y = x*x the answer was not zero and did not agree with the value the report printed; the mark moved when the window or the quality changed, because the grid of computed points moved with them; and raising the accuracy brought the answer closer without ever reaching it. The vertex of the drawn polyline now only opens the search - the extremum itself is found on the function, by ternary search inside the bracket the vertex gives. Measured on a shifted parabola, a shifted sine and a cusp: the answer lands within about a hundred-millionth, and it is the same answer at two different zooms.',
      'A parabola tested at a symmetric window passed while all of this was broken, because zero fell exactly on a grid point and the right answer came out by alignment rather than by calculation. The checks that guard this now put the extremum deliberately off the grid, and ask for the same answer at two zooms rather than one.',
      'The build button carried a word next to its icon. The word is gone; the button keeps its name for the tooltip and for a screen reader. In a docked panel this also takes pressure off the width of the row, and a row that wraps is what used to make the panel rebuild itself.',
    ],
  },
  
  {
    tag: 'v1.2.0', date: '15 August 2026', title: 'The libraries build on older Delphi',
    link: 'https://github.com/pisarev/pascal-mathparser/releases/tag/v1.2.0',
    added: [
      'The parser and the plotting engine build on Delphi 10.2 Tokyo through 13; the plugin builds on 11 Alexandria through 13. Every version in that range is a real installation rather than an expectation: before a release each one compiles the units one at a time, and the range printed in the README moves only when that run agrees. The plugin stops at 11 for a reason that is not in our code - it reaches WebView2 through a unit Embarcadero began shipping in the RTL with that version, and on 10.2 through 10.4 the unit is simply absent.',
    ],
    fixed: [
      'A version test stopped the build on every Delphi up to and including 11. One unit chose between two shapes of an iterator callback by testing a Free Pascal version constant, and the test sat inside a branch Delphi never takes. That is not as safe as it looks: Delphi evaluates the expression regardless of the branch, meets a constant it has never heard of, and stops. The choice is made by generation symbols now, which either exist or do not and need nothing evaluated to find out.',
      'An array literal bound to the wrong type on Delphi before 12. Until that version the dynamic string array and the generic array of string are two distinct types rather than one, so a literal passed to a parameter taken by reference bound to the type the call did not want. The two calls in the parser and one declaration in the plugin build their array in a variable now.',
      'The token handed back by GdiplusStartup changed type in the RTL between 10.3 and 10.4, from a plain unsigned long to a pointer-sized one. It is taken by reference, so the mismatch was an error rather than a warning, and the plotting engine would not build on the two older versions. The variable is declared by a numeric test on the compiler version now.',
      'A form knows its own pixels per inch, but that property is protected until Delphi 11, and the dark-theme code read it directly. An accessor class opens it, and the one line now works on every version without a version test of any kind.',
      'A conditional symbol with a dot in its name does not ask what it appears to ask. Delphi cuts the name at the dot, so the symbols naming the point releases of the 10 line all resolve to the same thing and answer yes as far back as 10 Seattle. Measured on a 10.2 installation, all three of them answer yes. Tests that have to tell those versions apart use the numeric compiler version instead.',
    ],
  },
  
  {
    tag: 'v1.1.2', date: '15 August 2026', title: 'The component survives being dropped on a form',
    link: 'https://github.com/pisarev/pascal-mathparser/releases/tag/v1.1.2',
    added: [],
    fixed: [
      'Dropped on a form under Free Pascal, the graph component could take the application down with it. The component drives itself from a precise timer, and the two compilers give that timer different lives: under Delphi it is a window timer whose handler runs in the main thread, under Free Pascal the same class runs a thread of its own and calls the handler there. So the handler painted from a worker thread while the main thread painted the same control, and the pen cache of the LCL does not survive that. Measured before the fix: six crashes in ten runs; after it: none in a hundred and fifteen. The handlers no longer do the work - each posts a message to its own window and the work happens in the main thread. The contract of the timer is now written down in the header of its unit, so the next reader does not have to discover it from a crash.',
      'The component came up black on a form under Lazarus. Under the LCL the default colour of a control is not a colour at all but an instruction to ask the environment for one, and an off-screen bitmap has no environment to ask: the request resolved to black, while the same line under Delphi produced the ordinary window colour. The buffer is filled with a resolved colour now, and the two fonts the component owns are given explicit defaults instead of inheriting the same uncertainty.',
      'The packages compiled and then did nothing: the components never reached the palette. Three things were missing at once - none of the packages declared itself usable at design time, eight units registered components without saying so in the package description, and the parser package declared no dependencies at all, so the IDE would not rebuild without the unit that provides the registration interface. Any one of them alone leaves the same symptom, so all three are fixed together. Checked the only way that means anything: by installing the packages into an IDE and placing a component on a form with the mouse.',
      'Pasting into the formula list did nothing in the Delphi build of the plugin. The panel is a page inside the plugin, and text pasted from the clipboard has to travel from the host to that page; the host recognised only its own saved state and dropped everything else on the floor. Both builds now decide the same way - the clipboard either holds a saved state, which is decoded and checked before it is trusted, or it holds plain text, which is handed to the page as text. The two builds are fed the same nine cases and required to answer identically, in either direction.',
      'A step of the mouse wheel could be lost. The flag saying which way to zoom was written by the main thread and read - and cleared - by the timer thread, so a click that landed between the reading and the clearing vanished without a trace. Both ends are in the main thread now.',
      'A unit the plugin needs was missing from the published composition, so the Delphi build could not be built from a fresh clone at all. The same class of omission had happened once before with another unit, and the warning about it was written down in the very file where it happened again. It is now caught by a check rather than by a reader.',
    ],
  },
  
  {
    tag: 'v1.1.1', date: '14 August 2026', title: 'The docked panel stops redrawing itself',
    link: 'https://github.com/pisarev/pascal-mathparser/releases/tag/v1.1.1',
    added: [],
    fixed: [
      'Docked in a side panel, the plugin redrew its picture about twice a second while nobody touched it. The status line at the bottom has little room in a narrow panel, so its text wrapped: "ready" took one line, the report about the points took two. That changed the height of the bottom bar, the canvas lost and regained the same 64 pixels, the size observer read it as a real resize and asked for a rebuild, and the rebuild changed the text back. Measured on a docked panel: 36 rebuilds in 20 seconds of an untouched window, 437 ms of computation each. Now none, while a real resize still rebuilds. The status line keeps to one line and holds a fixed share of the row, so nothing it displays can move the layout. A floating window is wide enough that the wrap never happens, which is why the report named the docked panel and not the floating one.',
      'The component that does the computing kept a window on screen underneath the page and painted nothing into it. Every time the container resized the panel, that window was told to repaint and left standing whatever had been there. Measured: seven such repaints for six resizes of a docked panel, not one of them drawing a pixel. It is off the screen now while the page draws; the computation is untouched, and results still arrive in that window from the worker threads.',
      'The graph component painted outside the normal repaint cycle. An invalidation called the painting routine directly, which left the window still invalid, so the system sent a real repaint afterwards and the picture was drawn twice with the background erased in between; results from the worker threads went to the screen the same way, out of turn; and the tracing line was drawn over the buffer rather than into it, so it vanished at the next repaint. Now an invalidation marks the window and the system repaints once, the tracing line lives in the buffer, and the control declares itself opaque - it covers every pixel it owns, so erasing the background under it was only a flash.',
      'A docking panel whose window was recreated stayed registered with Notepad++ under the old handle, and the editor had nothing live to put back into the dock. Registration now happens on every window creation, as the modeless registration already did. Three docking notifications that were declared and never handled - dropped after dragging, switched in, switched off - are handled as well.',
    ],
  },
  
  {
    tag: 'v1.1.0', date: '10 August 2026', title: 'Thirty-two bits, a package that asks for nothing, and a defect the accelerator hid',
    link: 'https://github.com/pisarev/pascal-mathparser/releases/tag/v1.1.0',
    added: [
      'Thirty-two bits, on both compilers. Windows i386 joins win64 and linux64, and the whole battery runs there: sixteen test programs on Free Pascal 3.2.2, the documentation samples, the packages themselves. It is a separate installation of the compiler rather than a switch, because Free Pascal will not target i386 from a host whose Extended is a Double - and on Win64 it is.',
      'The Lazarus packages no longer ask for the LCL. They are built with NOFORMS and NOGRAPHICS, so a console program links against them with nothing else in its uses clause - no Interfaces, no widgetset. Delphi is untouched by this: it builds from the sources, where neither define is set. Two features step aside for it, and the README says which and how to get them back.',
      'Project files for the eight documentation samples. Open any of them in Lazarus and build - that is the whole recipe. They were written earlier but never reached a release: the slicer did not carry the extension, so the files existed and travelled nowhere.',
    ],
    fixed: [
      'The accelerator got the order wrong when a function call stood on the right of a division. Reading the right operand consumed the rest of the term instead of one step, so 6 / cos(x) / 16 was evaluated as 6 / (cos(x) / 16), and x / sqr(y) * y as x / (sqr(y) * y). Only a call was affected - with a variable or a constant there the fold stayed left to right, which is why it hid. On x86-64 the emitter takes such formulas and the emitter is right, so the wrong answers surfaced only where there is no emitter. Checked by comparing three thousand random formulas against the interpreter on every target: zero disagreements.',
      'The differential check that should have caught it was comparing nothing. It skipped every formula the accelerator declined, and off x86-64 that is every formula there is - the check reported three thousand compared and zero disagreements while comparing none of them. It now reads the level off the interpreter counter, and the floor it guards is a real number again.',
      'The value record was a different size on 32 bits: twenty bytes instead of twenty-four, with the payload four bytes in rather than eight. The compiled script format carries that record verbatim, so a script built on 64 bits would not have loaded on 32. The directive that was supposed to keep the layout identical sets a limit on alignment, not a size, and on i386 nothing in the record asked for eight. It is now padded out by hand, and the layout is the same everywhere.',
      'The package used to hand a unit of its own to anyone who installed it, under a name the system already uses. On Windows Messages comes from the runtime, and ours stood in front of it; the LCL does not survive that, and a project that used both stopped with a message naming a unit it could see. The stand-in is now added only where the system has no such unit at all.',
      'Installing the accelerator package rebuilt forty-one units of the parser into a second directory of its own. The two sets of compiled units then disagreed, and a sample that used both stopped on a unit that was lying right there. The accelerator now uses what the parser package built, as it was always meant to: six units instead of forty-seven.',
    ],
  },
  {
    // The v1.0.9 tag does not exist yet: remove this line in the same pass that puts the
    // tag in place.
    pending: true,
    tag: 'v1.0.9', date: '8 August 2026', title: 'The stable compiler builds all of it, and what an outside reading found',
    link: 'https://github.com/pisarev/pascal-mathparser/releases/tag/v1.0.9',
    added: [],
    fixed: [
      'The plotting engine needed a compiler that is not released yet. It sorted points with an anonymous comparer, and function references arrived in Free Pascal 3.3.1, so a normal install - the stable 3.2.2 - stopped with a syntax error in the middle of a file nobody had touched. The sort is now written out by hand in the same unit, which keeps that unit free of anything but the RTL, as its own header promises. Checked by building and running on 3.2.2: 149 checks and a 200-run stress pass',
      'A second thing blocked the same compiler, and the version gate in the build script had been hiding it: the engine counted compiled scripts with AtomicIncrement, which 3.2.2 does not have. It uses InterlockedIncrement now, as the parser already did. The gate is gone, and the script says which compiler it found instead of refusing to try',
      'None of the three Lazarus packages could be built by Lazarus itself - on Linux or on Windows, and before any of this as well. The build scripts pass unit paths on the command line and so never read the package description, which is why they stayed green. Three things were wrong in it: the tag was written UnitOutputDir where Lazarus reads UnitOutputDirectory and silently ignores anything else, so compiled units landed beside the sources and Lazarus then refused with "ambiguous unit"; three units the parser package needs were not listed in it at all; and the plotting component pulled in the Windows and Messages units on Free Pascal, so on Linux it did not compile at any version. All three are fixed, and a check now builds every package with lazbuild before a release goes out',
      'A compiled script outliving the parser that made it read freed memory. CompileScript hands the object to you, and the parser kept no note of it: when the parser went, the object was left holding a pointer to it. Ready read the generation of the parser through that pointer, and 1.0.8 had added a second read on the execution path itself - and the owner was only the first of several references, since the check on redirect assumptions reads the parser table and the executor holds pointers to methods of its objects. So the contract is now written down instead of patched: a compiled script is bound to the parser that built it. It may outlive the parser to be held, inspected and freed; it may not be evaluated afterwards. Ready goes out, Reason says the parser that compiled this script is gone, and Execute raises EJitOrphan - a refusal you can test for, in place of a read of freed memory',
      'TGraphEngine.Parser could be replaced while the workers were evaluating. The setter edited the table of the old parser, freed it when it owned it, and only then handed the new one to the threads - with no check that they had stopped, against the rule the parser itself publishes. It now stops them and waits',
      'The plugin lost the first formula when the panel had not finished starting. It was remembered as sent before it was sent, and the panel drops what arrives too early, so the same formula was never offered again. The panel now holds a formula that arrives too early and hands it over itself once the page is up, and the plugin counts a formula as taken the moment the panel has either delivered it or accepted it for delivery. Only a new value is offered again',
      'ExecuteMany had two different meanings for False and three descriptions of them, no two alike. A short output array left the caller data untouched; a formula that did not parse left "not a number" behind. Now there is one meaning: before anything else the call fills every element it could have written with "not a number", so False says nothing in that range can be trusted. A formula the code generator turns down is not a refusal at all - it is evaluated the ordinary way and answers True. The bulk example checks its result now, which the surrounding text had been demanding of the reader while the example itself did not',
      'The same file said in one place that scripts with a redirect category are not compiled, and in another that the accelerator resolves the redirect chain while building. The second is what the code does',
      'The site promised one compiled script serving every thread. Each thread needs its own copy, redirected at its own variables - the address is resolved once, when the script is built, and a compiled script cannot pick two',
      'The README of the plotting component presented the browser demo as this engine compiled to WebAssembly. Only the parser is compiled there; the drawing, the intersections and the extrema are written again in JavaScript',
      'Four settings in the browser demo looked like they worked and were read by no one: sampling accuracy, computation time, intersection search time and search depth. They are connected in the native panel and not in the browser, so the browser no longer shows them',
      'The loop budget in the browser covers a whole sweep rather than each point - deliberately, or an endless loop would hold the tab for as many turns as there are points. Running out of it was indistinguishable from a place where the function has no value: both arrived as gaps. It says so now, and the limitations page finally mentions the budget at all',
      'The README claimed the battery runs everything under Delphi on both word sizes. Two targets do; the rest are 64-bit, which is where the code generator lives',
      'install.ps1 installed the Delphi build while the release ships the Lazarus one, into a folder of a different name. It installs what ships now, and takes -Delphi for the other',
      'The plugin explained the absence of a 32-bit build by saying Notepad++ is 64-bit. It is not only that - there are 32-bit and ARM64 editions; they are simply not supported',
      'TFormulaData exposed a field spelled Corrent while the property beside it is Correct. Correct is now available on the record as well, over the same byte',
    ],
  },
  {
    tag: 'v1.0.8', date: '7 August 2026', title: 'Three ways into an evaluation, and the mask now covers all of them',
    link: 'https://github.com/pisarev/pascal-mathparser/releases/tag/v1.0.8',
    added: [],
    fixed: [
      'Compiled code ran without the parser\'s exception mask. Compile a script with CompileScript and run the compiled object - which is what the accelerator documentation recommends for evaluating from several threads - and division by zero raised where the library promises infinity. Two of the three ways into an evaluation had been covered in 1.0.7; this was the third, and the one the documentation points at',
      'A parser evaluated from inside another parser ignored its own ExceptionMask. The test for "is this the outermost evaluation" asked whether any frame existed in the thread rather than whether the mask differed from its own, so a nested parser silently inherited the mask of whoever called it',
      'Arming a loop guard inside another one switched off the outer cancellation. A nested ArmLoopGuard without a flag of its own wrote nil over the flag that was there, so an owner asking the work to stop went unheard for the whole of the inner run. Budgets may be replaced by an inner run; cancellation may not',
      'ExceptionMask was documented as yours to narrow and declared protected, which put it out of reach of the code that was supposed to narrow it. It is public now',
      'Looking a name up in the parser tables converted the string to lower case twice per lookup, once for the hash and once for the comparison. Same string, same result, two trips to the memory manager. Deriv went from fourteen allocations per call to eleven and from 4.05 to 3.40 microseconds',
    ],
  },
  {
    tag: 'v1.0.7', date: '7 August 2026', title: 'Three pieces of thread state that belonged to somebody else',
    link: 'https://github.com/pisarev/pascal-mathparser/releases/tag/v1.0.7',
    added: [
      'ArmLoopGuard and DisarmLoopGuard arm the loop guard in a pair, and disarming puts back whatever was there before. The guard lives in thread variables, but a run does not: a budget that ran out is recorded as a negative number and used to outlive the run that spent it. Whatever came next in that thread inherited the refusal - a different parser, a later button press, code that never armed a guard at all - and was stopped on an honest ten turn loop. Arming nests too, so a formula that calls Parse may set a budget of its own',
    ],
    fixed: [
      'The floating point exception mask was installed by the parser constructor, so it belonged to the thread that happened to create the object. Evaluate on a shared parser from a worker thread - the arrangement the plotting component uses - and division by zero raised EZeroDivide instead of answering infinity. In the other direction, a living parser held the mask for the whole program, and neighbouring code in the same thread quietly stopped getting its own exceptions. An evaluation now installs the mask and hands the caller\'s back, and the accelerator does the same around machine code. If you share one parser between threads, or if your program narrows the mask for its own arithmetic, this is the release that makes the documented behaviour true for you',
      'The lock around Deriv and Parse was one lock for every parser in the process. Four threads with four unrelated parsers queued up behind each other on any formula containing a derivative. It is now a lock per parser, and Parse holds it only while it compiles: running the compiled script under the lock meant holding it across arbitrary user code, which is how deadlocks are made',
      'The plotting engine has never built on Free Pascal 3.2.2 and cannot: a geometry dependency sorts points with an anonymous comparer, and function references arrived in 3.3.1. The parser next door does build with 3.2.2. Both facts are now stated - in the crossgraph README, and by the Linux build script, which says so instead of stopping with a syntax error in the middle of a file you did not write',
    ],
  },
  {
    tag: 'v1.0.6', date: '7 August 2026', title: 'A hidden button is hidden for real',
    link: 'https://github.com/pisarev/graphbuilder-npp/releases/tag/v1.0.6',
    added: [],
    fixed: [
      'The two buttons that send the report into the editor still showed up in the live demo, where there is no editor to send anything to. 1.0.5 taught the page to ask the host first, and the host answers correctly - but the buttons were being hidden with the hidden attribute alone, and that attribute is only a display:none from the browser stylesheet. The panel sets display:grid on its buttons, which wins. Measured on the published demo: hidden was true and the button was still thirty pixels wide',
      'And underneath that, a second one it had been hiding. The panel asks the host whether there is an editor, and the Lazarus host answered in the same reply it uses to hand back the previous session - so whenever the panel opened with work in it, which is nearly always, the answer never arrived at all. It was invisible while the buttons were showing anyway. The greeting is now its own message and goes out first',
    ],
  },
  {
    tag: 'v1.0.5', date: '7 August 2026', title: 'The library builds with Free Pascal 3.2.2 again, and the Linux matrix says so',
    link: 'https://github.com/pisarev/pascal-mathparser/releases/tag/v1.0.5',
    added: [
      'Free Pascal 3.2.2 builds the library again. Function references arrived in 3.3.1, so on 3.2.2 the iterator callbacks are method pointers instead - you pass a method where you would otherwise pass an anonymous function, and nothing else changes',
      'Nine functions 3.2.2 lacks in its Math unit - ArcCot, ArcCotH, ArcCsc, ArcCscH, ArcSec, ArcSecH, CotH, CscH, SecH - travel with the library, taken verbatim from the 3.3.1 runtime so the values agree to the last bit',
      'MathFamilyTest guards that whole family by contract rather than by a table of numbers: a reciprocal multiplied by its base is one, an inverse returns the argument of the direct function, and ArcCotan answers in the branch it promises',
      'The README says what the matrices run, including which two units ask for the LCL and how to switch them off',
    ],
    fixed: [
      'Two accelerator tests and the thread-safety sample died on Linux before reaching their first line: on Unix the thread driver has to be the FIRST unit, and Classes standing ahead of it was enough to break that',
      'A test compared a bound against Double(High(NativeInt)), which reinterprets the bits rather than converting the value - 0x7FFFFFFFFFFFFFFF read as a number is NaN. The comparison was silently against garbage wherever the compiler took the cast literally',
      'The accelerator now says why it declined machine code even when the interpreter picked the work up, so the contract about wide Extended can be checked at all',
      'The Linux test script looks for the widgetset folder instead of naming one, so a Lazarus built with gtk2 no longer reports a missing Interfaces unit',
    ],
  },
  {
    tag: 'v1.0.4', date: '8 August 2026', title: 'The plugin reads the formula under the mouse, and sends the report back into the editor',
    link: 'https://github.com/pisarev/graphbuilder-npp/releases/tag/v1.0.4',
    added: [
      'The build that ships - the Lazarus one - picks the formula up from the editor: point at a line and the curve appears, select an expression and the selection wins over the line. Only the Delphi build did that before, and the Delphi build is not what ships',
      'The report travels back the other way: one button opens it in a new tab, another drops it at the caret',
      'It leaves as Markdown with the curve embedded as SVG - text, so it survives in a text editor, and still a drawn curve wherever Markdown is rendered',
      'The panel keeps one slot for whatever the editor offers, so pointing around a file does not fill the list with formulas nobody asked for',
      'The line under the cursor is compiled by a parser the plugin keeps for that alone, in the thread the editor calls from: compiling on the parser that is drawing the graph is outside the documented thread-safe subset',
    ],
    fixed: [
      'The README said to select an expression and press Alt+G, which was never how it worked: the formula is taken from under the mouse pointer, and Alt+G only opens the panel',
    ],
  },
  {
    tag: 'v1.0.3', date: '7 August 2026', title: 'An Exit reaches the evaluation it belongs to, and the thread-safety contract stops overpromising',
    link: 'https://github.com/pisarev/pascal-mathparser/releases/tag/v1.0.3',
    added: [
      'A routing test suite for Exit: recursion, a chain through one foreign parser, a chain through two, an Exit owned by the parser in the middle, the legacy constructor inside and outside an evaluation',
      'A README section that states the thread-safety contract in full, including the one rule the previous text left out: every simultaneously active evaluation needs script storage of its own',
      'The plugin carries version information and unpacks the way Plugins Admin expects, so it can be listed in the Notepad++ plugin catalogue',
    ],
    fixed: [
      'A parser standing between an Exit and the evaluation it belongs to swallowed it: with A calling B and B calling back into A, the Exit raised in A ended up as the result of B, and A quietly finished a different sum. The exception now carries its owner, and only the evaluation it names may take it',
      'Looking for the enclosing evaluation moved off the path of an ordinary formula: it is asked only when an exception actually appears',
      'The package descriptions said "Copyright Yuriy Pisarev" where the repository is MIT, and carried a version unrelated to the product',
    ],
  },
  {
    tag: 'v1.0.2', date: '6 August 2026', title: 'One parser, many threads: Exit belongs to its own evaluation',
    link: 'https://github.com/pisarev/pascal-mathparser/releases/tag/v1.0.2',
    added: [
      'A thread-safety test that pins down who owns an Exit: parallel roots, recursion, two parsers in one thread, a notification that starts its own evaluation',
      'The loop guards are documented: a README section with a compiled-and-run example, and the exact scope - guards belong to the thread and are set at the root of an evaluation',
    ],
    fixed: [
      'Exit inside a formula answered to the thread scheduler: the nesting depth lived in a field shared by every thread using the parser, so a parallel Exit escaped as an exception and a lost update could leave Exit broken until another race repaired it - the depth now lives in a frame on the stack of the call',
      'Exit inside brackets now ends the whole evaluation in both evaluation modes: 99 + (Exit(42)) is 42 everywhere, where the evaluate-up-front mode used to answer 141',
      'The plugin archive is reproducible: repacking the same content gives the same checksum',
    ],
  },
  {
    tag: 'v1.0.1', date: '5 August 2026', title: 'Interruptible loops and per-system formula sheets',
    link: 'https://github.com/pisarev/graphbuilder-npp/releases/tag/v1.0.1',
    added: [
      'A loop guard: a break flag and a turn budget, both off by default - a formula that never ends becomes a formula error, not a frozen tab or a killed worker thread',
      'Unwind descriptions for generated x86-64 code on Windows: an exception thrown through it reaches the handler instead of taking the process down',
    ],
    fixed: [
      'A deadlock on the first parse from a worker thread: the smart cache sent a synchronous window message across threads',
      'Each coordinate system keeps a formula sheet of its own, the way the classic window always did, and a deliberately emptied sheet survives a reload',
      'The intersection finder merged genuinely distinct neighbouring crossings as duplicates and silenced a fast curve as an indistinguishable stretch',
      'Bulk evaluation fills the answers or says it did not; a formula the accelerator declines falls back to the ordinary parser',
      'The plugin archive shrank from 9.6 MB to 1.4 MB: debug information no longer ships inside the library',
    ],
  },
  {
    tag: 'v1.0.0', date: '4 August 2026', title: 'First public release',
    link: 'https://github.com/pisarev/graphbuilder-npp/releases/tag/v1.0.0',
    added: [
      'MathParser: parser, flat bytecode, interpreter, shape cache, 163 callable functions',
      'The accelerator: x86-64 machine code with an automatic fall back to the interpreter',
      'CrossGraph: a plotting engine and a visual component for Delphi and Lazarus',
      'A plugin for Notepad++, built with Lazarus and Free Pascal - <a href="https://github.com/pisarev/graphbuilder-npp/releases/latest">ready to download</a>',
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
        <a class="btn hollow" href="https://github.com/pisarev/pascal-mathparser">Source on GitHub</a>
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
      <p class="undercode">Excerpt from <code class="frag">samples/docs/swap.dpr</code>: both
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
      tree: raise <b>*</b> above <b>/</b> and ${fx('12 / 3 * 2')} turns from 8 into 2
     - the bracketed line is the parser's own decompiler reporting the tree it
      actually built. <b>Coverage</b> is the second knob: how far a raised or lowered
      priority reaches. Comparison ships as <i>lower&nbsp;+&nbsp;total</i>, which is why
      ${fxSays('1 + 2 = 3', '-1', ' compares the sum and answers %')}, the parser's
      <i>true</i>. Switch <code class="frag">=</code> to <i>local</i> and it binds neighbours only:
      the same line now evaluates as
      ${fxSays('1 + (2 = 3)', '1', ', and the value flips to %.')}
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
          adaptive density, intersections, and extrema found rather than guessed, polar
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
        <p class="intro">Numbers work as well as formulas, and this part is worth
          spelling out because nothing on screen announces it. Paste a table into
          the panel - two columns, any of the usual separators - and the pairs
          become points on the canvas. A row appears for them beside the
          formulas, and in that row you pick a fit: a straight line, a polynomial
          of the second to the fifth degree, exponential, power or logarithmic.
          The fitted formula is laid over the points with its R^2 and the caveats
          that belong beside it. It is an ordinary formula from then on, so
          everything else works on it - tracing, extrema, intersections, the
          report.</p>
      </div>
    </div>
    <div class="body">
      <a class="plate shot" href="demo/">
        <span class="label">Live</span>
        <span class="t">Open the panel</span>
        <span class="d">The engine loads into your browser and computes as you
          type. Paste a table and it fits a formula to your points. Nothing is
          sent anywhere.</span>
      </a>
      <div class="feats">
        ${TOOL.map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
      </div>
      ${FITS}
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
    ${RELEASES.filter(r => !r.pending).map(r => `<article class="rel">
      <div class="when">
        <a class="tag" href="${r.link}">${r.tag}</a>
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
module.exports = { shell, docHead, table, gotcha, m, esc, fx, fxc, fxIs, fxSays, fxCall, frag, typed, plate, PEN, byKey, pascal};
