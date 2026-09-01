$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$package = Get-Content (Join-Path $repo "package.json") -Raw | ConvertFrom-Json
$releaseDir = $package.build.directories.output

& (Join-Path $PSScriptRoot "ensure-signing-certificate.ps1")
if ($LASTEXITCODE -ne 0) { throw "No se pudo preparar el certificado de firma." }

Push-Location $repo
try {
  & (Join-Path $repo "node_modules\.bin\vite.cmd") build
  if ($LASTEXITCODE -ne 0) { throw "Falló la compilación web." }
  & (Join-Path $repo "node_modules\.bin\electron-builder.cmd")
  if ($LASTEXITCODE -ne 0) { throw "Falló la creación del instalador." }
} finally {
  Pop-Location
}

$cert = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object { $_.Subject -eq "CN=North Bike POS (Local)" -and $_.HasPrivateKey } |
  Sort-Object NotAfter -Descending | Select-Object -First 1
$publicCert = Join-Path $releaseDir "North Bike POS Certificate.cer"
Export-Certificate -Cert $cert -FilePath $publicCert | Out-Null
Write-Host "Instalador firmado y certificado público guardado en: $releaseDir"
