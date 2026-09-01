$ErrorActionPreference = "Stop"

$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { throw "No se encontró signtool.exe. Instala Windows SDK para firmar el instalador." }

$package = Get-Content (Join-Path $PSScriptRoot "..\package.json") -Raw | ConvertFrom-Json
$releaseDir = $package.build.directories.output
$subject = "CN=North Bike POS (Local)"
$cert = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object { $_.Subject -eq $subject -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(30) } |
  Sort-Object NotAfter -Descending | Select-Object -First 1

if (-not $cert) {
  $cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $subject `
    -CertStoreLocation Cert:\CurrentUser\My `
    -NotAfter (Get-Date).AddYears(3)
}

$tempPfx = Join-Path $env:TEMP "northbike-pos-signing.pfx"
$password = [Guid]::NewGuid().ToString("N")
$securePassword = ConvertTo-SecureString $password -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath $tempPfx -Password $securePassword | Out-Null

$files = Get-ChildItem $releaseDir -Recurse -Filter *.exe -File
if (-not $files) { throw "No se encontraron ejecutables en $releaseDir" }
foreach ($file in $files) {
  & $signtool.FullName sign /f $tempPfx /p $password /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $file.FullName
  if ($LASTEXITCODE -ne 0) { throw "No se pudo firmar $($file.FullName)" }
}

$publicCert = Join-Path $releaseDir "North Bike POS Certificate.cer"
Export-Certificate -Cert $cert -FilePath $publicCert | Out-Null
Remove-Item -LiteralPath $tempPfx -Force -ErrorAction SilentlyContinue

Write-Host "Firmados $($files.Count) ejecutables con $subject"
Write-Host "Certificado público para instalar en otra PC: $publicCert"
