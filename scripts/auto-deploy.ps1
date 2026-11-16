# Deploys the app whenever its files change, so fixes go live without a manual `forge deploy`.
# Run once from the skeptic folder and leave the window open:
#   powershell -ExecutionPolicy Bypass -File scripts\auto-deploy.ps1
# It uses your existing `forge login`; no token is stored here. Stop it with Ctrl+C.
# Each change is tested first (npm test); a failing change is not deployed.
# Add -SkipTests to deploy without testing (only if npm test can't run on this computer).
param([switch]$SkipTests)

$watch = @('src', 'manifest.yml', 'package.json')
$last = ''
Write-Host 'Watching src, manifest.yml and package.json. Ctrl+C to stop.'
while ($true) {
  $files = Get-ChildItem -Path $watch -Recurse -File -ErrorAction SilentlyContinue | Sort-Object FullName
  $sig = ($files | ForEach-Object { "$($_.FullName)|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" }) -join ';'
  if ($sig -ne $last) {
    if ($last -ne '') {
      Start-Sleep -Seconds 10   # let a batch of file writes finish
      $files = Get-ChildItem -Path $watch -Recurse -File -ErrorAction SilentlyContinue | Sort-Object FullName
      $sig = ($files | ForEach-Object { "$($_.FullName)|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" }) -join ';'
      Write-Host "`n$(Get-Date -Format T)  Change found: testing..."
      if ($SkipTests) { $code = 0 } else { npm test *> $null; $code = $LASTEXITCODE }
      if ($code -ne 0) {
        Write-Host "$(Get-Date -Format T)  Tests failed: not deployed. Run 'npm test' to see why." -ForegroundColor Red
      } else {
        Write-Host "$(Get-Date -Format T)  Tests passed: deploying..."
        forge deploy --non-interactive -e development
        if ($LASTEXITCODE -eq 0) { Write-Host "$(Get-Date -Format T)  Deployed." -ForegroundColor Green }
        else { Write-Host "$(Get-Date -Format T)  Deploy failed (see above)." -ForegroundColor Red }
      }
    }
    $last = $sig
  }
  Start-Sleep -Seconds 15
}
