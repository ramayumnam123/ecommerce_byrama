# scripts/setup.ps1 — Windows one-shot setup (docs/09 §2)
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "== e-commerce setup ==" -ForegroundColor Cyan

# 1. env files
if (-not (Test-Path "$root\backend\.env")) {
    Copy-Item "$root\backend\.env.example" "$root\backend\.env"
    Write-Host "Created backend\.env — edit DATABASE_URL / JWT_SECRET before first run."
}

# 2. python venv + deps
Push-Location "$root\backend"
if (-not (Test-Path ".venv")) { python -m venv .venv }
& "$root\backend\.venv\Scripts\python.exe" -m pip install --upgrade pip
& "$root\backend\.venv\Scripts\python.exe" -m pip install -r requirements.txt
Pop-Location

# 3. frontend deps
Push-Location "$root\frontend"
if (Test-Path package.json) {
    npm install
}
Pop-Location

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "  1) Start Postgres+Redis: docker compose up -d  (or use a local install)"
Write-Host "  2) Migrate:  cd backend; ..\backend\.venv\Scripts\alembic upgrade head"
Write-Host "  3) Run API:  ..\backend\.venv\Scripts\uvicorn app.main:app --reload"
Write-Host "     Swagger:  http://localhost:8000/docs"
if (Test-Path "$root\frontend\package.json") {
    Write-Host "  4) Run FE:   cd frontend; npm run dev  ->  http://localhost:3000"
}
