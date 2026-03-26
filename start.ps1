$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=========================================="
Write-Host "  Classroom Relationship Survey Server"
Write-Host "=========================================="
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is not installed."
  Write-Host "Install the LTS version from https://nodejs.org"
  Read-Host "Press Enter to exit"
  exit 1
}

if (-not (Test-Path "data")) {
  New-Item -ItemType Directory -Path "data" | Out-Null
}

$dataDir = if ($env:DATA_DIR) { $env:DATA_DIR } else { Join-Path $PSScriptRoot "data" }
if (-not (Test-Path $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing required packages..."
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "npm install failed."
    Read-Host "Press Enter to exit"
    exit 1
  }
  Write-Host ""
}

$running = $false
try {
  Invoke-WebRequest -UseBasicParsing "http://localhost:3000/" -TimeoutSec 1 | Out-Null
  $running = $true
} catch {
}

if ($running) {
  Write-Host "A server is already running on http://localhost:3000/"
  Write-Host "Opening the browser without starting a second server..."
  Start-Process "http://localhost:3000/"
  Read-Host "Press Enter to close"
  exit 0
}

Start-Process powershell -WindowStyle Hidden -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  'for ($i = 0; $i -lt 20; $i++) { try { Invoke-WebRequest -UseBasicParsing "http://localhost:3000/" -TimeoutSec 1 | Out-Null; Start-Process "http://localhost:3000/"; exit } catch { Start-Sleep -Milliseconds 500 } }; Start-Process "http://localhost:3000/"'
) | Out-Null

Write-Host "Starting server..."
Write-Host "Browser will open after the server responds."
Write-Host "Data directory: $dataDir"
Write-Host ""
node server.js

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Server failed to start."
}

Write-Host ""
Read-Host "Press Enter to close"
