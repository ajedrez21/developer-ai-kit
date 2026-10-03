#requires -Version 5.1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $root "dist\cli.js"
if (-not (Test-Path $cli)) {
  Write-Error "Compilá el kit primero: npm run build"
}
node $cli @args
