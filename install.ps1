# ==============================================================================
#  Portify — 1-Command Installer for Windows (PowerShell)
#  https://github.com/mxskeen/portify
# ==============================================================================

$ErrorActionPreference = "Stop"
$Repo = "mxskeen/portify"

Write-Host ""
Write-Host "    ____             __  _ ____       " -ForegroundColor Cyan
Write-Host "   / __ \____  _____/ /_(_) __/_  __ " -ForegroundColor Cyan
Write-Host "  / /_/ / __ \/ ___/ __/ / /_/ / / / " -ForegroundColor Cyan
Write-Host " / ____/ /_/ / /  / /_/ / __/ /_/ /  " -ForegroundColor Cyan
Write-Host "/_/    \____/_/   \__/_/_/  \__, /   " -ForegroundColor Cyan
Write-Host "                           /____/    " -ForegroundColor Cyan
Write-Host ""
Write-Host "Local Server & Port Dashboard for Developers`n" -ForegroundColor White

Write-Host "→ Checking latest Portify release from GitHub..." -ForegroundColor Cyan

try {
    $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
} catch {
    Write-Error "Failed to check GitHub releases: $_"
    exit 1
}

$Asset = $Release.assets | Where-Object { $_.name -like "*Setup*.exe" } | Select-Object -First 1

if (-not $Asset) {
    Write-Host "Could not automatically find Setup.exe. Opening releases page..." -ForegroundColor Yellow
    Start-Process "https://github.com/$Repo/releases/latest"
    exit 0
}

$InstallerPath = Join-Path $env:TEMP $Asset.name
Write-Host "→ Downloading $($Asset.name)..." -ForegroundColor Cyan

Invoke-WebRequest -Uri $Asset.browser_download_url -OutFile $InstallerPath

Write-Host "`n✓ Download complete! Launching Portify installer..." -ForegroundColor Green
Start-Process -FilePath $InstallerPath
