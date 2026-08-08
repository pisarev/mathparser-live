/*
  The "Start here" page: what to do with the sources you downloaded.

  The philosophy is the parser's own: a person should not have to understand the
  thing before getting an answer out of it. So the page is arranged not by the
  layers of the library but by what a person wants to do - and every scenario is
  carried through to commands that can be copied.

  The rule of the page: a command that is not here in a verified form does not
  get onto it. Everything about the parser is exercised by the build matrix;
  everything about the plugin and the plotting engine comes from their own build
  scripts.

  Run: node build_start.js   (after build.js, which provides the shell)
*/
const fs = require('fs');
const { shell, docHead, table, gotcha, pascal } = require('./build.js');

/* ─── small markup helpers ──────────────────────────────────────────────── */

// A step of a scenario: number, heading, body. The numbers are assigned
// automatically, so inserting a step in the middle does not force the rest to
// be renumbered.
const steps = (items) => `    <ol class="steps">
${items.map(([title, body]) => `      <li>
        <h4>${title}</h4>
        ${body}
      </li>`).join('\n')}
    </ol>`;

const shellBlock = (lines) =>
  `<pre class="sh">${lines.map((l) => (l.startsWith('#')
    ? `<span class="cm">${l}</span>`
    : l)).join('\n')}</pre>`;

/* ─── the tracks ────────────────────────────────────────────────────────── */

const TRACKS = [
  ['Delphi', 'delphi', 'A package that installs into the palette, or two paths in the project.'],
  ['Lazarus', 'lazarus', 'Ready-made packages, opened and compiled from the IDE.'],
  ['Linux and FPC', 'fpc', 'The compiler and nothing else: no LCL, no LazUtils.'],
  ['The browser', 'web', 'The engine compiled to WebAssembly, computing on the machine of whoever opens the page.'],
];

const startBody = docHead('Start here', [
  `You have the sources. This page is what to do with them - from the first
   program that prints a number, to the plugin built from scratch, to the engine
   embedded in a project you already have.`,
  `Every command here is one that runs. The parser side is compiled and executed
   by the build matrix on four targets; the plugin and the demo come from their
   own build scripts.`
]) + `

    <h2>Pick your way in</h2>
    <div class="deeper">
      ${TRACKS.map(([name, id, note]) => `<a href="#${id}"><div class="t">${name}</div><div class="d">${note}</div></a>`).join('\n      ')}
    </div>

    <h2 id="first">The first program</h2>
    <p>Nothing to install, nothing to register. Two paths on the command line and
      a file with nine lines in it.</p>

<pre>${pascal('hero')}</pre>

${steps([
  ['Unpack the sources anywhere',
   `<p>The library is plain Pascal: no build step, no generated headers, no
      package manager. Say it lives in <code>C:\\lib\\pascal-mathparser</code>.</p>`],
  ['Point the compiler at two folders',
   `<p><code>src</code> is the parser, <code>jit</code> is the accelerator. The
      second is optional - leave it out and the interpreter answers.</p>`],
  ['Compile and run',
   shellBlock([
     '# from the folder that holds the sample',
     'cd samples/docs',
     '',
     '# Delphi',
     'dcc64 -U C:\\lib\\pascal-mathparser\\src hero.dpr',
     'hero.exe',
     '',
     '# Free Pascal on Windows',
     'fpc -MDelphi -Fu/lib/pascal-mathparser/src hero.dpr',
     './hero',
   ])],
])}

    <p class="undercode">It prints <b>4</b>. That file is
      <code>samples/docs/hero.dpr</code> in the repository, and the build matrix
      compiles and runs it on every target before a release, so it cannot rot.</p>

${gotcha('On FPC outside Windows, add one folder', [
  `<code>src/compat</code> holds a stand-in for a unit that only exists on
   Windows. With it the library needs nothing but the RTL - no LCL, no LazUtils,
   no Lazarus at all:`,
  `<code>fpc -MDelphi -dNOFORMS -dNOGRAPHICS -Fu.../src/compat -Fu.../src -Fi.../src hero.dpr</code>
   <br>The set is the one the Linux matrix uses in
   <code>tests/build_parser_linux.sh</code>, not a shortened version of it.`
])}

    <h2 id="delphi">Delphi: into a project you already have</h2>
    <p>Two ways. The first puts the components in the palette and is what most
      people want; the second is three lines in the project options and leaves
      the IDE untouched.</p>

    <h3>With the palette</h3>
${steps([
  ['Build the two runtime packages first',
   `<p><code>packages/delphi/crosspascal_parser.dpk</code>, then
      <code>crosspascal_parserjit.dpk</code>. Open each and use
      <b>Project, Build</b>. The design-time package requires both, and the IDE
      does not build them for you: installing without them stops at
      <code>E2202 Required package 'crosspascal_parser' not found</code>.</p>`],
  ['Open the design-time package',
   `<p><code>packages/delphi/crosspascal_parser_dsgn.dpk</code>. It contains the
      registration unit and nothing else.</p>`],
  ['Press Install',
   `<p>A palette page named <b>CrossPascal</b> appears with the parser, the
      calculator, the value list and the threads. Drop <code>TMathParser</code>
      on a form and it works from the Object Inspector.</p>`],
  ['Add the library path once',
   `<p>Tools, Options, Library, Library path - add <code>src</code> and
      <code>jit</code>. Without it the IDE finds the components but the compiler
      does not find the units.</p>`],
])}

    <h3>Without the palette</h3>
    <p>Project, Options, Delphi Compiler, Search path: add <code>src</code>, and
      <code>jit</code> if you want the accelerator. Then create the parser in
      code as the samples do. Nothing is installed into the IDE, which is the
      point when the project is built on a machine you do not control.</p>

${gotcha('The handle type, once', [
  `Registering your own function needs a handle variable, and its type must be
   <code>TFunctionHandle</code> from <code>ParseTypes</code> - not the plain
   <code>NativeInt</code>. On Delphi 12 and later the library defines its own
   <code>NativeInt</code>, the <code>var</code> parameter refuses the system one,
   and the compiler says only that no overload matches.`
])}

    <h2 id="lazarus">Lazarus: the same, with packages</h2>
${steps([
  ['Open the package',
   `<p>Package, Open package file, then
      <code>packages/lazarus/crosspascal_parser.lpk</code>. Compile it.</p>`],
  ['Add the accelerator if you want it',
   `<p><code>crosspascal_parserjit.lpk</code>, same way. It depends on the first
      package, so open them in that order.</p>`],
  ['Use in a project',
   `<p>Package, Open recent, then <b>Use, Add to project</b>. Installing into the
      IDE is only needed for the palette.</p>`],
])}

    <h2 id="fpc">Linux and FPC: no Lazarus at all</h2>
    <p>This used to require LazUtils for a single call. It no longer does: the
      library needs the RTL and nothing else. A console program on Ubuntu:</p>

${shellBlock([
  '# one file, no project, no Lazarus',
  'fpc -MDelphi -O2 -dNOFORMS -dNOGRAPHICS \\',
  '    -Fu~/pascal-mathparser/src/compat \\',
  '    -Fu~/pascal-mathparser/src \\',
  '    -Fu~/pascal-mathparser/jit \\',
  '    hero.dpr',
  './hero',
])}

    <p>The two defines switch off the parts that would otherwise pull in a
      widgetset: forms and graphics. A console program uses neither.</p>

${table(['What you get', 'Where'], [
  ['The interpreter', 'everywhere, including 32-bit and wasm'],
  ['The IR executor', 'everywhere the JIT layer is compiled in'],
  ['x86-64 machine code', 'x86-64 only; elsewhere the tier below answers'],
])}

    <h2 id="plugin">Building GraphBuilder, the Notepad++ plugin</h2>
    <p>The plugin is the parser and the plotting engine behind a panel. It builds
      from either compiler.</p>

    <h3>Lazarus</h3>
${shellBlock([
  '# from the plugin repository',
  'pwsh -File build-lazarus.ps1',
  '',
  '# and put it where Notepad++ looks for plugins',
  'pwsh -File install.ps1',
])}
    <p>This is the build that ships. It wants the parser and the plotting engine
      cloned beside the plugin, because the project file names them by relative
      path, and it wants <code>WEBVIEW4DELPHI</code> pointing at a checkout of
      that library - the script registers its Lazarus package itself.</p>

    <h3>Delphi</h3>
${shellBlock([
  '# from the plugin repository',
  'pwsh -File build.ps1',
  '',
  '# and put it where Notepad++ looks for plugins',
  'pwsh -File install.ps1 -Delphi',
])}
    <p>The same sources through the other compiler; the switch is what tells the
      installer which of the two to take. It picks up the parser, the accelerator
      and the plotting engine from their folders, and no packages need to be
      installed for it. Both scripts build x64 and only x64: that is what this
      plugin supports. Notepad++ itself also ships 32-bit and ARM64 builds, and
      neither of them will load this one.</p>

    <h2 id="web">Embedding the web version</h2>
    <p>The demo on this site is not a video and not a screenshot: it is the real
      parser compiled to WebAssembly, computing in your browser. The same three
      files drop into any page.</p>

${steps([
  ['Take three files',
   `<p><code>parsewasm.wasm</code> - the engine; <code>wasmhost.js</code> - the
      bridge; and the page that talks to it. They sit next to each other and are
      loaded as static files. No server code is involved.</p>`],
  ['Serve them over http',
   `<p>WebAssembly is fetched, so <code>file://</code> will not do. Any static
      server works:</p>
      ${shellBlock(['python -m http.server 8080'])}`],
  ['Or rebuild the engine yourself',
   `<p>Needs the FPC cross compiler for <code>wasm32-wasip1</code>, built from
      the FPC sources. The two commands run in different folders, so each says
      where it starts:</p>
      ${shellBlock([
        '# in a checkout of the FPC sources',
        'make crossall crossinstall OS_TARGET=wasip1 CPU_TARGET=wasm32',
      ])}
      ${shellBlock([
        '# in a checkout of this repository',
        'pwsh -File engine/build_wasm.ps1',
      ])}`],
])}

${gotcha('What the browser cannot do', [
  `The x86-64 accelerator does not run in a sandbox: it emits machine code, and a
   browser executes WebAssembly instead. The demo therefore runs the interpreter,
   and the speed figures on this site are measured natively and stated as such.`
])}

    <h2 id="vcl">Embedding the plotting component</h2>
    <p>The panel you see in the plugin is a component. It takes formulas as text
      and draws them; the parser underneath is the same one.</p>

${steps([
  ['Add the paths',
   `<p>The plotting engine lives beside the parser. Add its folder to the search
      path along with <code>src</code>; on Lazarus open
      <code>crosspascal_graph.lpk</code> instead.</p>`],
  ['Drop the component on a form',
   `<p>With the design-time package installed it is on the <b>CrossPascal</b>
      palette page. Without it, create the component in code - it is an ordinary
      <code>TCustomControl</code> descendant.</p>`],
  ['Give it formulas',
   `<p>The component owns the parser, samples the curve across threads and draws
      the result. Redirection is what makes the threads safe: every worker gets
      its own copy of the script, redirected at its own variables.</p>`],
])}

    <p class="undercode">On FPC the drawing goes through the LCL canvas, so a
      project with the plotting component does need Lazarus - unlike the parser
      alone, which does not.</p>

    <h2>Where to look next</h2>
    <div class="deeper">
      <a href="syntax.html"><div class="t">Syntax</div><div class="d">Operators, the 163 callable functions, and the parts that surprise people.</div></a>
      <a href="accelerator.html"><div class="t">The accelerator</div><div class="d">What it compiles, what it declines, and what that costs.</div></a>
      <a href="limitations.html"><div class="t">Limitations</div><div class="d">Stated plainly, including the ones that are not going away.</div></a>
      <a href="demo/"><div class="t">The live demo</div><div class="d">The engine in your browser, with the plugin panel around it.</div></a>
    </div>
  </section>`;

fs.writeFileSync('start.html', shell({
  title: 'Start here - MathParser', here: 'Start', body: startBody
}));

console.log('start.html'.padEnd(18), (fs.statSync('start.html').size / 1024).toFixed(0), 'KB');
