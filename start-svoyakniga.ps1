# Локальный запуск «СвояКнига» на этом компьютере:
# бэкенд отдаёт приложение + API с одного адреса, база — локальный файл
# backend\svoyakniga.db. Запуск: двойной клик по start-svoyakniga.bat.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$indexFile = Join-Path $root 'web\dist-local\index.html'
if (-not (Test-Path $indexFile)) {
  Write-Host 'Building app (one time, ~30 sec)...'
  $env:VITE_SERVER_MODE = 'true'
  Push-Location (Join-Path $root 'web')
  & npx vite build --outDir dist-local
  Pop-Location
}

$py = Join-Path $root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { $py = 'python' }  # запасной вариант: системный python

Write-Host 'Starting SvoyaKniga server...'
Start-Process -FilePath $py -WindowStyle Minimized -ArgumentList @(
  '-m', 'uvicorn', 'app.main:app',
  '--host', '127.0.0.1', '--port', '8011',
  '--app-dir', (Join-Path $root 'backend')
)
Start-Sleep -Seconds 3
Start-Process 'http://localhost:8011'

Write-Host ''
Write-Host 'Otkryto v brauzere: http://localhost:8011'
Write-Host 'Baza dannyh (na vashem kompyutere): backend\svoyakniga.db'
Write-Host 'Chtoby ostanovit server - zakroyte ego svernutoe okno (python).'
Write-Host ''
Read-Host 'Nazhmite Enter chtoby zakryt eto okno'
