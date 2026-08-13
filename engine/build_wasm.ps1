# Building the formula engine into WebAssembly: parsewasm.wasm from the real
# Parser.pas. A wasm32-wasip1 cross-compiler (ppcrosswasm32) is needed in the FPC
# tree; it is built from the FPC sources by the command
#   make crossall crossinstall OS_TARGET=wasip1 CPU_TARGET=wasm32
$ErrorActionPreference = 'Stop'

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

# The parser directory. In the monorepo it is 0-foundation\pascal, in the
# publication it is the neighbouring repository pascal-mathparser. The PARSER_SRC
# variable overrides both.
$Mono = Join-Path $Here '..\..\0-foundation\pascal'
$Sibling = Join-Path $Here '..\..\pascal-mathparser\src'
$Outer = Join-Path $Here '..\..\..\pascal-mathparser\src'

# Several fitting directories at once is not a reason to take whichever turned up
# first, it is a sign that the situation is unclear and a person has to decide.
# Otherwise an unrelated directory next door quietly changes the subject of the
# build: on 11.08.2026 that was measured on the parser gates, a broken published src
# gave zero failures because the neighbour was the thing being built.
if (-not $env:PARSER_SRC) {
    $Found = @($Mono, $Sibling, $Outer) | Where-Object { Test-Path $_ }
    if ($Found.Count -gt 1) {
        Write-Host 'LAYOUT IS AMBIGUOUS: several parser directories fit at once:' -ForegroundColor Red
        $Found | ForEach-Object { Write-Host "  $_" }
        Write-Host '  set PARSER_SRC explicitly - otherwise what is built is unknown'
        exit 1
    }
}
$Src = if ($env:PARSER_SRC) { $env:PARSER_SRC }
       elseif (Test-Path $Mono) { (Resolve-Path $Mono).Path }
       elseif (Test-Path $Sibling) { (Resolve-Path $Sibling).Path }
       else { (Resolve-Path $Outer).Path }

# The source of the engine. In the monorepo it is in the src subdirectory, in the
# published repository it lies next to this script. Both at once is the same
# ambiguity.
$MonoProgram = Join-Path $Here 'src\parsewasm.pas'
$ShipProgram = Join-Path $Here 'parsewasm.pas'
if ((Test-Path $MonoProgram) -and (Test-Path $ShipProgram)) {
    Write-Host "LAYOUT IS AMBIGUOUS: both $MonoProgram and $ShipProgram exist" -ForegroundColor Red
    Write-Host '  remove the extra one - otherwise which engine is built is unknown'
    exit 1
}
$Program = if (Test-Path $MonoProgram) { $MonoProgram } else { $ShipProgram }

$Fpc = if ($env:FPC_EXE) { $env:FPC_EXE } else { 'fpc.exe' }
$Out = Join-Path $Here 'out'
# The finished module is put where the demo page lies.
$Www = Join-Path $Here 'www'
if (-not (Test-Path $Www)) { $Www = (Resolve-Path (Join-Path $Here '..\demo')).Path }

New-Item -ItemType Directory -Force $Out, $Www | Out-Null
Remove-Item "$Out\*" -Recurse -Force -ErrorAction SilentlyContinue

# NOFORMS/NOGRAPHICS are the same headless definitions as in the console build under
# Linux: without them Thread.pas drags in Forms, which is not in wasm and is not
# needed there. compat gives Messages, the same file the console build takes outside
# Windows.
& $Fpc -Pwasm32 -Twasip1 -Mdelphi -O2 -Sh -Xs -vw- `
    -dNOFORMS -dNOGRAPHICS `
    ("-Fu$Src") ("-Fu$Src\compat") ("-Fi$Src") `
    ("-FU$Out") ("-FE$Out") `
    $Program
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# the wasip1 target puts the library out without an extension
Copy-Item (Join-Path $Out 'parsewasm') (Join-Path $Www 'parsewasm.wasm') -Force
$Size = [math]::Round((Get-Item (Join-Path $Www 'parsewasm.wasm')).Length / 1KB)
Write-Host "parsewasm.wasm is ready, $Size KB"
