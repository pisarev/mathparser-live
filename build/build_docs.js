/*
  Three reference pages: syntax, the accelerator, limitations.

  One rule for all three: only statements that can be checked. Numbers come from
  runs of the tests in the repository, behaviour from reading the sources. Where
  something works differently from what people expect, it is said plainly rather
  than passed over.

  Run: node build_docs.js   (after build.js, which provides the shell)
*/
const fs = require('fs');
const path = require('path');
const { shell, docHead, table, gotcha, m, esc, fx, fxc, fxIs, fxCall, frag, pascal } = require('./build.js');

/* ═══ syntax ════════════════════════════════════════════════════════════ */

const OPS = [
  ['<code class="frag">+ - * /</code>', 'the usual four', 'normal'],
  ['<code class="frag">**</code>', 'power - ' + fxIs('2 ** 10', '1024'), 'higher'],
  ['<code class="frag">//</code>', 'root - ' + fxIs('8 // 3', '2'), 'higher'],
  ['<code class="frag">degree</code>', 'power again, spelled out', 'higher'],
  ['<code class="frag">div  mod</code>', 'integer quotient and remainder', 'normal'],
  ['<code class="frag">!</code>', 'logical not, written before the value', 'lower'],
  ['<code class="frag">= &lt;&gt; &gt; &lt; &gt;= &lt;=</code>', 'comparison - answers -1 or 0', 'lower'],
  ['<code class="frag">and or xor not</code>', 'logic', 'lower'],
  ['<code class="frag">&amp; | ~ bxor</code>', 'bitwise and, or, not, xor', 'lower'],
  ['<code class="frag">shl shr</code>', 'bit shifts', 'normal'],
];

const FXGROUPS = [
  ['Algebra', 28, 'sqr sqrt int round roundto trunc abs frac ln lg log log2 log10 lnxp1 exp intpower ldexp ceil floor poly factorial deriv sign iszero samevalue ensurerange comparevalue equalsvalue'],
  ['Trigonometry', 26, 'sin cos tan cotan sec csc arcsin arccos arctan arccotan arcsec arccsc sinh cosh tanh cotanh sech csch arcsinh arccosh arctanh arccotanh arcsech arccsch arctan2 hypot'],
  ['Angles', 12, 'radtodeg radtograd radtocycle degtorad degtograd degtocycle gradtorad gradtodeg gradtocycle cycletorad cycletodeg cycletograd'],
  ['Statistics', 12, 'mean sum sumint sumofsquares minvalue maxvalue stddev popnstddev variance popnvariance totalvariance norm'],
  ['Date and time', 66, 'date time datetime year month day hour minute second dayofweek encodedate encodetime encodedatetime yearsbetween monthsbetween daysbetween hoursbetween minutesbetween secondsbetween millisecondsbetween weeksbetween weekoftheyear dayofthemonth dayoftheyear comparedate comparetime comparedatetime samedate sametime samedatetime ...'],
  ['Random', 4, 'random randg randomrange randomfrom'],
  ['Text and parsing', 7, 'strtoint strtointdef strtofloat strtofloatdef strtodate strtotime strtodatetime'],
  ['Control and scope', 8, 'if ifthen while repeat for exit tryexcept tryfinally'],
];

const syntaxBody = docHead('Syntax', [
  `The grammar is small on purpose: you write what you would write on paper, and
   the parser reads it. This page is the whole of it - the operators, the
   163 callable functions, and the half-dozen places where it does something
   other than what you expect.`,
  `Everything below is what the parser actually does, checked against the source
   rather than remembered.`
]) + `

    <h2>What surprises people</h2>
    <p>Four of these have caught every person who has used the library, including
      its author. They are listed first for that reason.</p>

${gotcha('Power is ** - not ^', [
  `<code class="frag">^</code> is <b>exclusive or</b>, not exponentiation. ${fxc('x ^ 2', ['x=5 => 7'])}
   quietly returns ${fxc('x xor 2', ['x=5 => 7'])}, which is a perfectly good number and
   almost never the one you meant.`,
  `Write ${fxc('x ** 2', ['x=5 => 25'])}, or spell it ${fxc('x degree 2', ['x=5 => 25'])}.`
])}

${gotcha('Two slashes are a root, not a comment', [
  `<code class="frag">//</code> takes a root: ${fxIs('8 // 3', '2')}. There are no comments
   inside a formula, so nothing is being ignored.`
])}

${gotcha('Comparison answers minus one', [
  `A true comparison returns <code class="frag">-1</code>, false returns <code class="frag">0</code> -
   the Pascal convention for a boolean stored as a number. So
   ${fxIs('(3 > 2) + 1', '0')}, not ${frag('2')}.`,
  `Use <code class="frag">AsBoolean</code> if you want a Pascal <code class="frag">Boolean</code> back.`
])}

${gotcha('Case never separates two names', [
  `<code class="frag">Sin</code>, <code class="frag">sin</code> and <code class="frag">SIN</code> are one built-in, and a
   variable registered as <code class="frag">Rate</code> also answers to <code class="frag">rate</code> and
   <code class="frag">RATE</code>. Since case does not tell two names apart, registering a
   second <code class="frag">rate</code> beside an existing <code class="frag">Rate</code> is refused
   rather than shadowing it.`
])}

    <h2>Operators</h2>
    <p>Higher binds tighter. The two that matter: power and root bind tighter than
      multiplication, so ${fxIs('2 * 3 ** 2', '18')}, and comparison binds
      loosest, so ${fxc('a + b > c', ['a=1,b=2,c=2 => -1'])} compares the sum.</p>

${table(['Operator', 'Means', 'Binds'], OPS.map(o => [o[0], o[1], `<span class="m">${o[2]}</span>`]))}

    <h2>Values</h2>
    <p>A formula can hold integers of every width, single, double, and extended
      floats, booleans, strings, dates, and pointers. You never declare any of it -
      ask for the type you want and the conversion happens on the way out.</p>

${/*
    The values table is executable documentation, all of it.

    A row has ONE answer: it prints in the cell and the same string goes into
    data-expect, so there is no independent place to edit. There were two fields
    at first, shown and expect, holding the same number twice - two spellings of
    one number drift apart sooner or later, and they drift silently.

    The call name travels into the markup as well, because the page promises more
    than a number: it promises that this very call returns it. While the probe
    checked everything through AsDouble, three rows were held by nobody -
    AsBoolean promises True, which as a number is -1. That is also how it came
    out that the parser has no AsDateTime in any unit: the row named a method
    that does not exist. It is gone from here, and dates stay in the prose above,
    where encodedate still lives.
  */''}
${table(['Call', 'Formula', 'Answer'], [
  { call: 'AsInteger', expr: '2 ** 10', answer: '1024' },
  { call: 'AsDouble', expr: 'pi / 6', answer: '0.5235988' },
  { call: 'AsExtended', expr: 'sqrt(2)', answer: '1.4142136' },
  { call: 'AsBoolean', expr: '3 > 2', answer: 'True' },
  { call: 'AsString', expr: '2 + 2', answer: "'4'" },
].map(r => [frag(r.call), fxCall(r.expr, r.call, r.answer), frag(r.answer)]))}

    <h2>Control inside a formula</h2>
    <p>A formula is not limited to arithmetic. <code class="frag">if</code> is lazy - only the
      branch that is taken gets evaluated, so ${fxc('if(x <> 0, 1 / x, 0)', ['x=2 => 0.5', 'x=0 => 0'])} is
      safe. Loops carry their own counter, and <code class="frag">exit</code> ends the whole
      script with a value.</p>

${table(['Written', 'Does'], [
  ['<code class="frag">if(cond, then, else)</code>', 'evaluates one branch, never both'],
  ['<code class="frag">while(cond, body)</code>', 'repeats while the condition holds'],
  ['<code class="frag">repeat(body, cond)</code>', 'runs the body, then tests'],
  ['<code class="frag">for(name, from, to, body)</code>', 'counted loop with its own variable'],
  ['<code class="frag">exit(value)</code>', 'ends the script there and then'],
  ['<code class="frag">tryexcept(body, fallback)</code>', 'the fallback answers if the body raises'],
  ['<code class="frag">new(name, value)</code> <code class="frag">get</code> <code class="frag">set</code>', 'variables that live inside the script'],
])}

    <h2>Two that read their own arguments</h2>
    <p>${fx('parse("2 + 3")')} compiles a formula while the outer formula is
      running. ${fx('deriv("x ** 2", "x")')} differentiates symbolically and
      returns the derivative - not a numeric approximation of it.</p>

    <h2>The 163 callable functions</h2>
    <p class="wide note">Grouped by what they are for. Every name is registered at
      startup and can be replaced or extended with your own.</p>
    <p class="wide note">The parser answers to 249 names in all. Besides the 163
      functions below, 62 of them are constants (<code class="frag">pi</code>,
      <code class="frag">true</code>, the month and weekday names, <code class="frag">maxint64</code>,
      <code class="frag">kilobyte</code>), 15 are service entries that drive the parser
      itself (<code class="frag">new</code>, <code class="frag">get</code>, <code class="frag">set</code>,
      <code class="frag">execute</code>, <code class="frag">parse</code>, <code class="frag">script</code>), and 9 are
      operators written as words (<code class="frag">and</code>, <code class="frag">or</code>,
      <code class="frag">div</code>, <code class="frag">mod</code>, <code class="frag">shl</code>). All these counts
      come from a probe built against the sources of this release, not from
      memory.</p>

    <div class="fx-groups">
      ${FXGROUPS.map(([name, n, list]) => `<div class="fx-group">
        <h3>${name}<span class="cnt">${n}</span></h3>
        <p class="list">${list}</p>
      </div>`).join('\n      ')}
    </div>

    <h2>Adding your own</h2>
<pre>${pascal('extend')}</pre>
  </section>`;

fs.writeFileSync('syntax.html', shell({
  title: 'Syntax - MathParser', here: 'Syntax', body: syntaxBody
}));

/* ═══ the accelerator ═══════════════════════════════════════════════════ */

const COMPILED = [
  ['Arithmetic', '<code class="frag">+ - &times; &divide;</code>, signs, nested brackets, constants'],
  ['Comparison', 'all six, with the epsilon the parser is configured with'],
  ['Branching', '<code class="frag">if</code>, <code class="frag">while</code>, <code class="frag">repeat</code> - lazily, as the interpreter does'],
  ['Variables', 'both kinds: bound by typed reference, and boxed in a <code class="frag">TValue</code>'],
  ['Scope', '<code class="frag">get</code> and <code class="frag">set</code> on script variables'],
  ['Calls', '<code class="frag">sin cos tan sqrt sqr ln exp abs arctan</code>'],
];

const DECLINED = [
  ['A call it has no machine version of', 'anything outside the nine above'],
  ['A function with parameters', '<code class="frag">mean</code>, <code class="frag">poly</code> and the rest of the variadic set'],
  ['A string constant', 'the code generator works in <code class="frag">Double</code> only'],
  ['An integer beyond exact range', 'above 2<sup>53</sup> a Double stops counting by ones'],
  ['A variable it cannot type', 'a type with no machine representation'],
  ['A frame deeper than 4 KB', 'a formula with hundreds of live intermediates'],
];

/*
  The numbers are the output of tests/JitParserTest.dpr on the machine that
  prepared the release. Nothing here is typed in by hand: every figure has to
  come from a run of this release.
*/
/*
  The benchmark numbers are read from bench.tsv, written by the JitBench and
  JitParserTest runs and merged by tools/release-audit/merge_bench.py.

  There is no copy of them here any more. While there was one, the parser
  README, the accelerator README and this page showed three DIFFERENT runs, and
  each was presented as the current one; the page also promised "averaged over a
  million" while the heavy chain runs half a million times. The repeat count now
  stands in the table itself, row by row.
*/
const BENCH = fs.readFileSync(path.join(__dirname, 'bench.tsv'), 'utf8')
  .split(/\r?\n/)
  .filter(s => s && !s.startsWith('#'))
  .map(s => s.split('\t'))
  .map(([name, base, fast, runs]) => [
    name,
    (+base).toFixed(1),
    (+fast).toFixed(1),
    Math.round(+base / +fast),
    (+runs).toLocaleString('en-US').replace(/,/g, ' '),
  ]);

const accelBody = docHead('The accelerator', [
  `The parser compiles a formula to byte-code once and interprets it after that.
   The accelerator goes one step further: it turns the byte-code into x86-64
   machine code and calls it directly. The API does not change - you construct
   <code class="frag">TJitParser</code> instead of <code class="frag">TMathParser</code> and carry on.`,
  `The rule it never breaks: anything it cannot compile falls to the stage below
   it - the intermediate one, and the interpreter behind that. That fall back is
   not a setting: there is no way to switch it off, because <b>fast but wrong</b>
   is not a trade this library makes.`
]) + `

    <h2>What it compiles</h2>
${table(['Kind', 'Covered'], COMPILED)}

    <h2>What it declines</h2>
    <p>Each of these hands the formula down a stage, whole: to the intermediate
      one, and to the interpreter if that declines it too. The reason
      is available as <code class="frag">CodeReason</code> if you want to know why a particular
      formula did not compile.</p>

${table(['Declines', 'Because'], DECLINED)}

    <h2>What it costs, in nanoseconds</h2>
    <p>Every row compares the same work done twice, with the accelerator and
      without it. What one row measures is not what the next one does, so it is
      worth saying plainly: the first three are a single evaluation of a formula
      that is already parsed - the interpreter walking the script against machine
      code running it; the loop row is one iteration inside a script that loops ten
      thousand times; the bulk rows are one input out of an array handed over in a
      single call, against the same inputs fed one <code class="frag">AsDouble</code> at a
      time.</p>
    <p>Measured on Delphi 13, Windows, x86-64. The number of runs each row was
      averaged over is in the table, because it is not the same for all of them.
      The programs that produce these numbers ship with the repository - run them
      on your own machine rather than trusting the table.</p>

${table(['Formula', 'Interpreted', 'Compiled', 'Times faster', 'Runs'],
  BENCH.map(b => [b[0], `<span class="m">${b[1]}</span>`, `<span class="m">${b[2]}</span>`, `<b>${b[3]}&times;</b>`, `<span class="m">${b[4]}</span>`]))}

    <p class="note">Bulk mode hands the accelerator an array of inputs and gets an
      array of answers, so the call overhead is paid once instead of a million times.</p>

    <h2>How it is kept honest</h2>
    <p>A generator writes random formulas - nested brackets, mixed precedence,
      branches, loops - and both engines evaluate each one. The run that ships
      with the repository covers <b>3 000 formulas with zero disagreements</b>,
      and the compiler declined none of them. When it does decline something it
      says why in one word, and the stage below answers instead.</p>

${gotcha('One number will differ, and here is why', [
  `The interpreter keeps intermediate values in <code class="frag">Extended</code>; the
   accelerator works in <code class="frag">Double</code>. On a build where <code class="frag">Extended</code>
   is wider than 64 bits - 32-bit Delphi, and FPC on Linux - the last bit of a
   long chain can differ between the two.`,
  `The fuzzer compares within an epsilon, so it passes; a bit-exact comparison
   would not. If your work needs the two engines to agree bit for bit, stay on the
   interpreter. See <a class="link" href="limitations.html">Limitations</a>.`
])}

    <h2>What it needs</h2>
${table(['Requirement', 'Detail'], [
  ['Processor', 'x86-64 only - there is no ARM or 32-bit code generator'],
  ['Operating system', 'Windows and Linux; memory is taken with <code class="frag">VirtualAlloc</code> or <code class="frag">mmap</code> as appropriate'],
  ['Memory protection', 'the page is writable while the code is emitted, then read and execute - never both at once, so W^X is respected'],
  ['Fallback', 'on any other target the machine-code stage is skipped and the intermediate one answers, with the interpreter behind it - nothing breaks'],
])}
  </section>`;

fs.writeFileSync('accelerator.html', shell({
  title: 'The accelerator - MathParser', here: 'Accelerator', body: accelBody
}));

/* ═══ limitations ═══════════════════════════════════════════════════════ */

const limitsBody = docHead('Limitations', [
  `Everything on this page is a thing the library does not do, does imperfectly,
   or does in a way that will surprise you. It is here so you find out now rather
   than at two in the morning.`,
  `Where a limit has a workaround, the workaround is given. Where it does not,
   that is said plainly.`
]) + `

    <h2>Numbers</h2>

${gotcha('The last bit depends on how you build', [
  `<code class="frag">Extended</code> is 10 bytes on 32-bit Delphi and on FPC for Linux, and 8
   bytes - the same as <code class="frag">Double</code> - on 64-bit Windows. The parser keeps
   intermediates in <code class="frag">Extended</code>, so a long chain can end on a different
   last bit depending on the target.`,
  `Concretely: ${fx('0.1 + 0.2')} ends in <code class="frag">...3333</code> on the first pair
   and <code class="frag">...3334</code> on the second. Both are correct roundings of different
   intermediate precision. If you need one answer everywhere, round explicitly at
   the end.`
])}

${gotcha('Fractional powers under FPC on 64-bit Windows', [
  `${fx('2 ** 0.5')} should equal ${fx('sqrt(2)')} to the last bit. Under
   Delphi and under FPC on Linux it does. Under FPC on 64-bit Windows it misses by
   337 units in the last place, because <code class="frag">Power</code> there computes
   <code class="frag">exp(y &times; ln x)</code> without the extra precision the other targets have.`,
  `Use <code class="frag">sqrt</code> for square roots and <code class="frag">intpower</code> for whole
   exponents, both of which are exact.`
])}

    <h2>Text</h2>
    <p>Names and string parameters live in a fixed buffer of 4 096 characters.
      Anything longer is truncated silently - no exception, no warning. In
      practice a formula never comes close, but a generated one might. The registry
      also weighs more than it should because of this: roughly 900 KB per parser
      instance with the full function set registered.</p>
    <p class="note">Changing this means moving the registry to dynamic strings and
      a new serialisation format. It is planned, not done.</p>

    <h2>The accelerator</h2>
${table(['Does not', 'Consequence'], [
  // The figure is not repeated here: it was measured once and lives in
  // jit/README.md. A second, different range used to stand here and disagreed
  // with the measured one.
  // A description of the architecture carries no numbers and promises no speed.
  //
  // First there was a second, different range here, and it disagreed with the
  // measured one. Then the number went and the word "faster" stayed, which was
  // worse: a measurement over a checked set turned into a property of ANY script.
  // And the sentence contradicted the three-stage contract - a missing emitter
  // does not mean the interpreter stops answering; it stays the last line.
  ['Run anywhere but x86-64', 'on ARM or 32-bit targets the machine-code stage is skipped; the portable IR is tried next, with the ordinary interpreter as the final fallback. The measured IR figures are in ' + frag('jit/README.md')],
  ['Compile functions that take parameters', '<code class="frag">mean</code>, <code class="frag">poly</code> and friends fall back'],
  ['Key its cache by shape', 'two formulas differing only in a constant compile twice'],
])}

    <h2>Threads</h2>
    <p><b>TMathParser.</b> Evaluation is thread-safe once everything is registered.
      Registration itself is not: adding a function or a variable while another
      thread is evaluating is undefined. The contract is simple and worth stating -
      <b>register everything before the first evaluation</b>, then evaluate from as
      many threads as you like.</p>
    <p><b>TJitParser is different, and the difference matters.</b> The accelerator
      keeps a cache: the text of the last formula, a list of compiled entries and
      the counters beside it, all written on the first sight of a formula and none
      of it under a lock. Two threads meeting a formula the cache has not seen will
      both compile it and both write the list. One accelerating parser therefore
      belongs to one thread.</p>
    <p>To evaluate in parallel, compile the scripts up front on a single thread
      with <code class="frag">CompileScript</code>, then execute them. Executing a prepared
      <code class="frag">TJitScript</code> does not modify it, so one script may run on several
      threads at once - but only as far as everything it reaches allows that: the
      variables it reads have to be safe to read concurrently, and so does every
      function it calls. Both are yours, not the library's.</p>
    <p>The addresses are baked in when the script is built: the redirect chain is
      resolved once, at compile time. So a thread that needs its own variables
      needs its own script, with its own category, compiled separately -
      <code class="frag">Copy</code> the script, redirect the copy, compile that.</p>

    <h2>Plotting</h2>
${table(['Limit', 'Detail'], [
  ['Antialiasing', 'smooth curves use GDI+, which exists only in the Delphi build; FPC draws a plain polyline'],
  ['Report', 'roots and areas are found numerically on the sampled points, so their accuracy follows the sampling density'],
  ['Polar poles', 'a curve through infinity is broken rather than joined - correct, but it means one curve may arrive as several pieces'],
  ['Loop budget in the browser', 'one budget covers a whole sweep, not each point, so an endless loop cannot hold the tab for as many turns as there are points. A formula with an honest loop can spend it partway along, and the remaining points come back as "not a number". The demo says so rather than leaving a silent gap; the plugin has no such limit'],
])}

    <h2>What is deliberately absent</h2>
    <p>There is no complex arithmetic, no matrices, no units of measurement, and no
      symbolic algebra beyond <code class="frag">deriv</code>. Adding any of them is possible
      through the function registry; none is built in.</p>
  </section>`;

fs.writeFileSync('limitations.html', shell({
  title: 'Limitations - MathParser', here: 'Limitations', body: limitsBody
}));

for (const f of ['syntax.html', 'accelerator.html', 'limitations.html'])
  console.log(f.padEnd(18), (fs.statSync(f).size / 1024).toFixed(0), 'KB');
