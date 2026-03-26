$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "Stopping server on port 3000..."

$pid = $null
$match = netstat -ano | Select-String ":3000" | Select-Object -First 1
if ($match) {
  $parts = ($match.ToString() -split "\s+") | Where-Object { $_ }
  if ($parts.Count -gt 0) {
    $pid = $parts[-1]
  }
}

if (-not $pid) {
  Write-Host "No server is running on port 3000."
  Write-Host ""
  Read-Host "Press Enter to close"
  exit 0
}

try {
  Stop-Process -Id $pid -Force -ErrorAction Stop
  Write-Host "Server process $pid stopped."
} catch {
  Write-Host "Failed to stop process $pid."
  Write-Host $_.Exception.Message
}

Write-Host ""
Read-Host "Press Enter to close"
