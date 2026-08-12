# scripts/stage-clamav.ps1 - monta resources/clamav com o ClamAV (binarios + DLLs + banco de assinaturas)
# Uso: rodar antes do `npm run dist` para que o instalador embuta o ClamAV.
#   - Binarios: C:\Program Files\ClamAV (ou $env:CLAMAV_DIR)
#   - Banco: %LOCALAPPDATA%\ClamAV\database (ou $env:CLAMAV_DATABASE_DIR)
# Exclui .pdb/.lib, include/, certs/, UserManual/ e conf_examples para nao inchar o pacote.
param(
  [string]$Source = $env:CLAMAV_DIR,
  [string]$DatabaseDir = $env:CLAMAV_DATABASE_DIR
)
$ErrorActionPreference = "Stop"

if (-not $Source) { $Source = "C:\Program Files\ClamAV" }
if (-not $DatabaseDir) { $DatabaseDir = Join-Path $env:LOCALAPPDATA "ClamAV\database" }

$appRoot = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $appRoot "resources\clamav"
$destDb = Join-Path $dest "database"

if (-not (Test-Path (Join-Path $Source "clamscan.exe"))) {
  throw "ClamAV nao encontrado em $Source (defina CLAMAV_DIR ou instale o ClamAV)."
}
if (-not (Test-Path (Join-Path $DatabaseDir "daily.cvd"))) {
  throw "Banco do ClamAV nao encontrado em $DatabaseDir (rode freshclam antes)."
}

Write-Host "Copiando binarios ClamAV de $Source -> $dest"
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$keepExe = @("clamscan.exe", "freshclam.exe")
Get-ChildItem -LiteralPath $Source -File | Where-Object {
  if ($_.Extension -eq ".exe") { return $_.Name -in $keepExe }
  $_.Extension -notin @(".pdb", ".lib", ".log")
} | Copy-Item -Destination $dest -Force
if (Test-Path (Join-Path $Source "certs")) {
  Copy-Item -LiteralPath (Join-Path $Source "certs") -Destination $dest -Recurse -Force
}

Write-Host "Copiando banco de assinaturas de $DatabaseDir -> $destDb"
New-Item -ItemType Directory -Path $destDb -Force | Out-Null
Get-ChildItem -LiteralPath $DatabaseDir -File | Copy-Item -Destination $destDb -Force

$total = (Get-ChildItem -LiteralPath $dest -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host "OK - resources/clamav montado ($([math]::Round($total/1MB,1)) MB)."
