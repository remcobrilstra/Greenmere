# Gate for one worklist item. Exit 0 only when npm run check passes.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

Write-Host "== validate: npm run check =="
npm run check
$code = $LASTEXITCODE
if ($null -eq $code) { $code = 1 }
if ($code -ne 0) { exit $code }

Write-Host "== validate: ok =="
exit 0
