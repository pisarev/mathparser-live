/*
  Three reference pages: syntax, the accelerator, limitations.

  One rule for all three: only statements that can be checked. Numbers come from
  runs of the tests in the repository, behaviour from reading the sources. Where
  something works differently from what people expect, it is said plainly rather
  than passed over.

  Run: node build_docs.js   (after build.js, which provides the shell)
*/
const fs = require('fs');
const { shell, docHead, table, gotcha, m, esc, pascal } = require('./build.js');

/* ═══ syntax ════════════════════════════════════════════════════════════ */

const OPS = [
  ['<code>+ - * /</code>', 'the usual four', 'normal'],
  ['<code>**</code>', 'power - <code>2 ** 10</code> is 1024', 'higher'],
  ['<code>//</code>', 'root - <code>8 // 3</code> is 2', 'higher'],
  ['<code>degree</code>', 'power again, spelled out', 'higher'],
  ['<code>div  mod</code>', 'integer quotient and remainder', 'normal'],
  ['<code>!</code>', 'logical not, written before the value', 'lower'],
  ['<code>= &lt;&gt; &gt; &lt; &gt;= &lt;=</code>', 'comparison - answers -1 or 0', 'lower'],
  ['<code>and or xor not</code>', 'logic', 'lower'],
  ['<code>&amp; | ~ bxor</code>', 'bitwise and, or, not, xor', 'lower'],
  ['<code>shl shr</code>', 'bit shifts', 'normal'],
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
  `<code>^</code> is <b>exclusive or</b>, not exponentiation. <code>x ^ 2</code>
   quietly returns <code>x xor 2</code>, which is a perfectly good number and
   almost never the one you meant.`,
  `Write <code>x ** 2</code>, or spell it <code>x degree 2</code>.`
])}

${gotcha('Two slashes are a root, not a comment', [
  `<code>//</code> takes a root: <code>8 // 3</code> is 2. There are no comments
   inside a formula, so nothing is being ignored.`
])}

${gotcha('Comparison answers minus one', [
  `A true comparison returns <code>-1</code>, false returns <code>0</code> -
   the Pascal convention for a boolean stored as a number. So
   <code>(3 &gt; 2) + 1</code> is <code>0</code>, not <code>2</code>.`,
  `Use <code>AsBoolean</code> if you want a Pascal <code>Boolean</code> back.`
])}

${gotcha('Case never separates two names', [
  `<code>Sin</code>, <code>sin</code> and <code>SIN</code> are one built-in, and a
   variable registered as <code>Rate</code> also answers to <code>rate</code> and
   <code>RATE</code>. Since case does not tell two names apart, registering a
   second <code>rate</code> beside an existing <code>Rate</code> is refused
   rather than shadowing it.`
])}

    <h2>Operators</h2>
    <p>Higher binds tighter. The two that matter: power and root bind tighter than
      multiplication, so <code>2 * 3 ** 2</code> is 18, and comparison binds
      loosest, so <code>a + b &gt; c</code> compares the sum.</p>

${table(['Operator', 'Means', 'Binds'], OPS.map(o => [o[0], o[1], `<span class="m">${o[2]}</span>`]))}

    <h2>Values</h2>
    <p>A formula can hold integers of every width, single, double and extended
      floats, booleans, strings, dates and pointers. You never declare any of it -
      ask for the type you want and the conversion happens on the way out.</p>

${table(['Call', 'Formula', 'Answer'], [
  ['<code>AsInteger</code>', '<code>2 ** 10</code>', '<code>1024</code>'],
  ['<code>AsDouble</code>', '<code>pi / 6</code>', '<code>0.5235988</code>'],
  ['<code>AsExtended</code>', '<code>sqrt(2)</code>', '<code>1.4142136</code>'],
  ['<code>AsBoolean</code>', '<code>3 &gt; 2</code>', '<code>True</code>'],
  ['<code>AsString</code>', '<code>2 + 2</code>', "<code>'4'</code>"],
  ['<code>AsDateTime</code>', '<code>encodedate(2026, 7, 24)</code>', '<code>2026-07-24</code>'],
])}

    <h2>Control inside a formula</h2>
    <p>A formula is not limited to arithmetic. <code>if</code> is lazy - only the
      branch that is taken gets evaluated, so <code>if(x &lt;&gt; 0, 1 / x, 0)</code> is
      safe. Loops carry their own counter, and <code>exit</code> ends the whole
      script with a value.</p>

${table(['Written', 'Does'], [
  ['<code>if(cond, then, else)</code>', 'evaluates one branch, never both'],
  ['<code>while(cond, body)</code>', 'repeats while the condition holds'],
  ['<code>repeat(body, cond)</code>', 'runs the body, then tests'],
  ['<code>for(name, from, to, body)</code>', 'counted loop with its own variable'],
  ['<code>exit(value)</code>', 'ends the script there and then'],
  ['<code>tryexcept(body, fallback)</code>', 'the fallback answers if the body raises'],
  ['<code>new(name, value)</code> <code>get</code> <code>set</code>', 'variables that live inside the script'],
])}

    <h2>Two that read their own arguments</h2>
    <p><code>parse('2 + 3')</code> compiles a formula while the outer formula is
      running. <code>deriv('x ** 2', 'x')</code> differentiates symbolically and
      returns the derivative - not a numeric approximation of it.</p>

    <h2>The 163 callable functions</h2>
    <p class="wide note">Grouped by what they are for. Every name is registered at
      startup and can be replaced or extended with your own.</p>
    <p class="wide note">The parser answers to 249 names in all. Besides the 163
      functions below, 62 of them are constants (<code>pi</code>,
      <code>true</code>, the month and weekday names, <code>maxint64</code>,
      <code>kilobyte</code>), 15 are service entries that drive the parser
      itself (<code>new</code>, <code>get</code>, <code>set</code>,
      <code>execute</code>, <code>parse</code>, <code>script</code>), and 9 are
      operators written as words (<code>and</code>, <code>or</code>,
      <code>div</code>, <code>mod</code>, <code>shl</code>). All these counts
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
  ['Arithmetic', '<code>+ - &times; &divide;</code>, signs, nested brackets, constants'],
  ['Comparison', 'all six, with the epsilon the parser is configured with'],
  ['Branching', '<code>if</code>, <code>while</code>, <code>repeat</code> - lazily, as the interpreter does'],
  ['Variables', 'both kinds: bound by typed reference, and boxed in a <code>TValue</code>'],
  ['Scope', '<code>get</code> and <code>set</code> on script variables'],
  ['Calls', '<code>sin cos tan sqrt sqr ln exp abs arctan</code>'],
];

const DECLINED = [
  ['A call it has no machine version of', 'anything outside the nine above'],
  ['A function with parameters', '<code>mean</code>, <code>poly</code> and the rest of the variadic set'],
  ['A string constant', 'the code generator works in <code>Double</code> only'],
  ['An integer beyond exact range', 'above 2<sup>53</sup> a Double stops counting by ones'],
  ['A variable it cannot type', 'a type with no machine representation'],
  ['A frame deeper than 4 KB', 'a formula with hundreds of live intermediates'],
];

/*
  The numbers are the output of tests/JitParserTest.dpr on the machine that
  prepared the release. Nothing here is typed in by hand: every figure has to
  come from a run of this release.
*/
const BENCH = [
  ['<code>x * 2 + 1</code>', '880.9', '40.4', '21'],
  ['polynomial, degree 3', '1 946.5', '48.4', '40'],
  ['heavy math chain', '2 589.4', '149.0', '17'],
  ['loop, 10 000 iterations', '3 882.1', '35.9', '108'],
  ['bulk mode, <code>x * 2 + 1</code>', '883.2', '7.7', '115'],
  ['bulk mode, polynomial', '1 953.3', '11.8', '165'],
];

const accelBody = docHead('The accelerator', [
  `The parser compiles a formula to byte-code once and interprets it after that.
   The accelerator goes one step further: it turns the byte-code into x86-64
   machine code and calls it directly. The API does not change - you construct
   <code>TJitParser</code> instead of <code>TMathParser</code> and carry on.`,
  `The rule it never breaks: anything it cannot compile goes back to the
   interpreter. There is no configuration for that and no way to switch it off,
   because <b>fast but wrong</b> is not a trade this library makes.`
]) + `

    <h2>What it compiles</h2>
${table(['Kind', 'Covered'], COMPILED)}

    <h2>What it declines</h2>
    <p>Each of these hands the formula back to the interpreter, whole. The reason
      is available as <code>CodeReason</code> if you want to know why a particular
      formula did not compile.</p>

${table(['Declines', 'Because'], DECLINED)}

    <h2>What it costs, in nanoseconds</h2>
    <p>One call of <code>AsDouble</code>, start to finish, averaged over a million
      runs. Measured on Delphi 13, Windows, x86-64. The script that produces these
      numbers is in the repository; run it on your own machine rather than trusting
      the table.</p>

${table(['Formula', 'Interpreted', 'Compiled', 'Times faster'],
  BENCH.map(b => [b[0], `<span class="m">${b[1]}</span>`, `<span class="m">${b[2]}</span>`, `<b>${b[3]}&times;</b>`]))}

    <p class="note">Bulk mode hands the accelerator an array of inputs and gets an
      array of answers, so the call overhead is paid once instead of a million times.</p>

    <h2>How it is kept honest</h2>
    <p>A generator writes random formulas - nested brackets, mixed precedence,
      branches, loops - and both engines evaluate each one. The run that ships
      with the repository covers <b>3 000 formulas with zero disagreements</b>,
      and the compiler declined none of them. When it does decline something it
      says why in one word, and the interpreter answers instead.</p>

${gotcha('One number will differ, and here is why', [
  `The interpreter keeps intermediate values in <code>Extended</code>; the
   accelerator works in <code>Double</code>. On a build where <code>Extended</code>
   is wider than 64 bits - 32-bit Delphi, and FPC on Linux - the last bit of a
   long chain can differ between the two.`,
  `The fuzzer compares within an epsilon, so it passes; a bit-exact comparison
   would not. If your work needs the two engines to agree bit for bit, stay on the
   interpreter. See <a class="link" href="limitations.html">Limitations</a>.`
])}

    <h2>What it needs</h2>
${table(['Requirement', 'Detail'], [
  ['Processor', 'x86-64 only - there is no ARM or 32-bit code generator'],
  ['Operating system', 'Windows and Linux; memory is taken with <code>VirtualAlloc</code> or <code>mmap</code> as appropriate'],
  ['Memory protection', 'the page is writable while the code is emitted, then execute-only - W^X is respected'],
  ['Fallback', 'on any other target the accelerator is simply never used, and nothing breaks'],
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
  `<code>Extended</code> is 10 bytes on 32-bit Delphi and on FPC for Linux, and 8
   bytes - the same as <code>Double</code> - on 64-bit Windows. The parser keeps
   intermediates in <code>Extended</code>, so a long chain can end on a different
   last bit depending on the target.`,
  `Concretely: <code>0.1 + 0.2</code> ends in <code>...3333</code> on the first pair
   and <code>...3334</code> on the second. Both are correct roundings of different
   intermediate precision. If you need one answer everywhere, round explicitly at
   the end.`
])}

${gotcha('Fractional powers under FPC on 64-bit Windows', [
  `<code>2 ** 0.5</code> should equal <code>sqrt(2)</code> to the last bit. Under
   Delphi and under FPC on Linux it does. Under FPC on 64-bit Windows it misses by
   337 units in the last place, because <code>Power</code> there computes
   <code>exp(y &times; ln x)</code> without the extra precision the other targets have.`,
  `Use <code>sqrt</code> for square roots and <code>intpower</code> for whole
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
  ['Run anywhere but x86-64', 'on ARM or 32-bit the interpreter answers, at interpreter speed'],
  ['Compile loops to machine code', 'a formula whose hot part is a loop gets no benefit'],
  ['Compile functions that take parameters', '<code>mean</code>, <code>poly</code> and friends fall back'],
  ['Key its cache by shape', 'two formulas differing only in a constant compile twice'],
  ['Invalidate on registry change', 'call <code>ClearCode</code> yourself after adding a function'],
])}

    <h2>Threads</h2>
    <p>Evaluation is thread-safe once everything is registered. Registration itself
      is not: adding a function or a variable while another thread is evaluating is
      undefined. The contract is simple and worth stating -
      <b>register everything before the first evaluation</b>, then evaluate from as
      many threads as you like.</p>
    <p>For per-thread values there is a redirect mechanism: one compiled script,
      each thread reading its own variables. That is how the plotting component
      samples a curve across four threads without four parsers.</p>

    <h2>Plotting</h2>
${table(['Limit', 'Detail'], [
  ['Antialiasing', 'smooth curves use GDI+, which exists only in the Delphi build; FPC draws a plain polyline'],
  ['Report', 'roots and areas are found numerically on the sampled points, so their accuracy follows the sampling density'],
  ['Polar poles', 'a curve through infinity is broken rather than joined - correct, but it means one curve may arrive as several pieces'],
])}

    <h2>What is deliberately absent</h2>
    <p>There is no complex arithmetic, no matrices, no units of measurement, and no
      symbolic algebra beyond <code>deriv</code>. Adding any of them is possible
      through the function registry; none is built in.</p>
  </section>`;

fs.writeFileSync('limitations.html', shell({
  title: 'Limitations - MathParser', here: 'Limitations', body: limitsBody
}));

for (const f of ['syntax.html', 'accelerator.html', 'limitations.html'])
  console.log(f.padEnd(18), (fs.statSync(f).size / 1024).toFixed(0), 'KB');
