# Build the formula engine for WebAssembly: parsewasm.wasm from the real
# Parser.pas. Needs the wasm32-wasip1 cross compiler (ppcrosswasm32) in the FPC
# tree; build it from the FPC sources with
#   make crossall crossinstall OS_TARGET=wasip1 CPU_TARGET=wasm32
$ErrorActionPreference = 'Stop'

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Where the parser lives. In the monorepo that is 0-foundation\pascal; in the
# published layout it is the pascal-mathparser repository next to this one.
# PARSER_SRC overrides both.
$Mono = Join-Path $Here '..\..\0-foundation\pascal'
$Sibling = Join-Path $Here '..\..\pascal-mathparser\src'
$Src = if ($env:PARSER_SRC) { $env:PARSER_SRC }
       elseif (Test-Path $Mono) { (Resolve-Path $Mono).Path }
       elseif (Test-Path $Sibling) { (Resolve-Path $Sibling).Path }
       else { (Resolve-Path (Join-Path $Here '..\..\..\pascal-mathparser\src')).Path }

# The engine source. In the monorepo it is in the src subfolder; in the published
# repository it sits next to this script.
$Program = Join-Path $Here 'src\parsewasm.pas'
if (-not (Test-Path $Program)) { $Program = Join-Path $Here 'parsewasm.pas' }

$Fpc = if ($env:FPC_EXE) { $env:FPC_EXE } else { 'fpc.exe' }
$Out = Join-Path $Here 'out'
# The finished module goes where the demo page lives.
$Www = Join-Path $Here 'www'
if (-not (Test-Path $Www)) { $Www = (Resolve-Path (Join-Path $Here '..\demo')).Path }

New-Item -ItemType Directory -Force $Out, $Www | Out-Null
Remove-Item "$Out\*" -Recurse -Force -ErrorAction SilentlyContinue

# NOFORMS and NOGRAPHICS are the same headless defines the console build on
# Linux uses: without them Thread.pas pulls in Forms, which wasm neither has nor
# needs. compat provides Messages - the same file the console build outside
# Windows takes.
& $Fpc -Pwasm32 -Twasip1 -Mdelphi -O2 -Sh -Xs -vw- `
    -dNOFORMS -dNOGRAPHICS `
    ("-Fu$Src") ("-Fu$Src\compat") ("-Fi$Src") `
    ("-FU$Out") ("-FE$Out") `
    $Program
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# The wasip1 target writes the library without an extension
Copy-Item (Join-Path $Out 'parsewasm') (Join-Path $Www 'parsewasm.wasm') -Force
$Size = [math]::Round((Get-Item (Join-Path $Www 'parsewasm.wasm')).Length / 1KB)
Write-Host "parsewasm.wasm is ready, $Size KB"
