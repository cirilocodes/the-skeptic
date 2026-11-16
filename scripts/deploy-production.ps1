# Deploys The Skeptic to the production environment, which is the build the installation link gives out.
# Run once from the skeptic folder:
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1
# It uses your existing `forge login`; no token is stored here.
# The tests run first; a failing build is not deployed.
param([switch]$SkipTests)

if (-not $SkipTests) {
  Write-Host 'Running the tests...'
  npm test
  if ($LASTEXITCODE -ne 0) { Write-Host 'Tests failed: not deployed.' -ForegroundColor Red; exit 1 }
}

Write-Host 'Deploying to production...'
forge deploy --non-interactive -e production
if ($LASTEXITCODE -ne 0) { Write-Host 'Production deploy failed (see above).' -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host 'Production is deployed. Environments now:' -ForegroundColor Green
forge environments list
