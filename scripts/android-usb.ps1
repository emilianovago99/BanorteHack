param([string]$Device)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adbPath = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adbPath)) { throw 'Instala Android SDK Platform Tools o configura ANDROID_HOME.' }
if (-not $Device) {
    $connected = @(& $adbPath devices | Select-String '^\S+\s+device$' | ForEach-Object { ($_.Line -split '\s+')[0] })
    if ($connected.Count -ne 1) { throw 'Conecta un teléfono autorizado por USB o indica -Device SERIAL.' }
    $Device = $connected[0]
}
& $adbPath -s $Device reverse tcp:3001 tcp:3001
if ($LASTEXITCODE -ne 0) { throw 'No se pudo conectar la API mediante USB.' }
& $adbPath -s $Device reverse tcp:8081 tcp:8081
if ($LASTEXITCODE -ne 0) { throw 'No se pudo conectar Metro mediante USB.' }
Write-Host 'USB conectado. Mantén la API (3001), IA (8000) y Metro (8081) encendidos.'
Write-Host 'Desde la raíz: npm run dev:mobile. Para compilar: npm run android --workspace @banortehack/mobile.'
