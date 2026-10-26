#Requires -Version 5.1
<#
.SYNOPSIS
  Runs the Playwright suite against a healthy local FastAPI + Next.js pair.

.DESCRIPTION
  Starts the API from backend/.venv when nothing is listening on the health
  endpoint, then runs `npx playwright test`. Playwright's webServer entries start
  the frontend when needed. Only an API process started by this script is stopped
  at the end; an already-running backend is left alone.

.PARAMETER Headed
  Run Chromium with a visible window.

.PARAMETER Grep
  Only run tests whose full title matches this regular expression.

.EXAMPLE
  .\scripts\e2e.ps1

.EXAMPLE
  .\scripts\e2e.ps1 -Headed -Grep "checkout|admin"
#>
[CmdletBinding()]
param(
  [switch]$Headed,
  [string]$Grep
)

$ErrorActionPreference = "Stop"

$frontendRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $frontendRoot
$backendRoot = Join-Path $repositoryRoot "backend"
$python = Join-Path $backendRoot ".venv\Scripts\python.exe"
$apiOrigin = if ($env:E2E_API_ORIGIN) { $env:E2E_API_ORIGIN.TrimEnd("/") } else { "http://localhost:8000" }
$healthUrl = "$apiOrigin/healthz"
$canAutoStart = $apiOrigin -match '^https?://(localhost|127\.0\.0\.1):8000$'

function Test-ApiHealth {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
  } catch {
    return $false
  }
}

$backendProcess = $null
$exitCode = 0

try {
  if (Test-ApiHealth) {
    Write-Host "Using the FastAPI already running at $healthUrl" -ForegroundColor DarkGray
  } else {
    if (-not $canAutoStart) {
      throw "FastAPI is not reachable at $healthUrl. This script only auto-starts a local instance on port 8000; start the configured API or unset E2E_API_ORIGIN."
    }
    if (-not (Test-Path -LiteralPath $python)) {
      throw "Python venv not found at '$python'. Run the repository setup script first (see the root README)."
    }
    if (-not (Test-Path -LiteralPath $backendRoot)) {
      throw "Backend directory not found at '$backendRoot'."
    }

    $logDir = Join-Path $frontendRoot "test-results"
    $stdoutLog = Join-Path $logDir "backend-e2e.log"
    $stderrLog = Join-Path $logDir "backend-e2e.err.log"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    Write-Host "Starting FastAPI from $backendRoot ..." -ForegroundColor Cyan
    $backendProcess = Start-Process `
      -FilePath $python `
      -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
      -WorkingDirectory $backendRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog `
      -PassThru

    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
      if ($backendProcess.HasExited) {
        $tail = if (Test-Path -LiteralPath $stderrLog) {
          (Get-Content -LiteralPath $stderrLog -Tail 30) -join [Environment]::NewLine
        } else {
          "(no stderr log)"
        }
        throw "FastAPI exited before becoming healthy.`n$tail"
      }
      if (Test-ApiHealth) { break }
      Start-Sleep -Milliseconds 500
    }

    if (-not (Test-ApiHealth)) {
      throw "FastAPI did not become healthy within 60 seconds. See '$stderrLog'."
    }
    Write-Host "FastAPI is healthy at $healthUrl" -ForegroundColor Green
  }

  $playwrightArgs = @("playwright", "test")
  if ($Headed) { $playwrightArgs += "--headed" }
  if ($Grep) { $playwrightArgs += @("--grep", $Grep) }

  Write-Host ("Running: npx " + ($playwrightArgs -join " ")) -ForegroundColor Cyan
  Push-Location $frontendRoot
  try {
    & npx @playwrightArgs
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  if ($backendProcess -and -not $backendProcess.HasExited) {
    Write-Host "Stopping the FastAPI process started by this script (PID $($backendProcess.Id)) ..." -ForegroundColor DarkGray
    Stop-Process -Id $backendProcess.Id -Force
    $backendProcess.WaitForExit(5000) | Out-Null
  }
}

exit $exitCode
