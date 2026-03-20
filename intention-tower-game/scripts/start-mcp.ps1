$ErrorActionPreference = 'Stop'

function Stop-PortOwner([int]$Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conn) { return }
  $pids = $conn | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Host "[start:mcp] killed PID $procId on port $Port"
    } catch {
      Write-Host "[start:mcp] failed to kill PID $procId on port ${Port}: $($_.Exception.Message)"
    }
  }
}

# Clean stale listeners that frequently break tauri+mcp startup.
Stop-PortOwner -Port 1420
Stop-PortOwner -Port 9222

# Clean stale app/build workers that may hold cargo artifact lock.
Get-Process intention-tower-game,cargo,rustc -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    Stop-Process -Id $_.Id -Force -ErrorAction Stop
    Write-Host "[start:mcp] killed process $($_.ProcessName) ($($_.Id))"
  } catch {
    Write-Host "[start:mcp] failed to kill process $($_.ProcessName) ($($_.Id)): $($_.Exception.Message)"
  }
}

# Small delay helps Windows release socket/file handles.
Start-Sleep -Milliseconds 300

pnpm run tauri -- dev --features test-server -- -- --test-mode
