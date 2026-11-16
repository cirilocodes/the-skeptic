# Puts The Skeptic's code into your empty public GitHub repo.
# 1. On github.com create a new PUBLIC repo named the-skeptic, with no README, licence or .gitignore.
# 2. From the skeptic folder run (with your repo's address):
#      powershell -ExecutionPolicy Bypass -File scripts\publish-to-github.ps1 https://github.com/YOUR-NAME/the-skeptic.git
# Git signs you in through your browser the first time; nothing is stored in this folder.
# Run it again later to push new changes.
param([Parameter(Mandatory = $true)][string]$RepoUrl)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host 'Git is not installed. Get it from https://git-scm.com/download/win, then run this again.' -ForegroundColor Red
  exit 1
}

if (-not (Test-Path .git)) {
  git init -b main
  git remote add origin $RepoUrl
} else {
  git remote set-url origin $RepoUrl
}

if (-not (git config user.name)) { git config user.name 'Cyril Edem Nii Akakpo' }
if (-not (git config user.email)) { git config user.email 'attivoecyril@gmail.com' }

git add -A
git commit -m "The Skeptic: Forge app and Rovo agent for Codegeist 2026"
if ($LASTEXITCODE -ne 0) { Write-Host 'Nothing new to commit; pushing what is there.' }
git push -u origin main
if ($LASTEXITCODE -eq 0) {
  $web = $RepoUrl -replace '\.git$', ''
  Write-Host ''
  Write-Host 'Pushed. Your links:' -ForegroundColor Green
  Write-Host "  Code:    $web"
  Write-Host "  Privacy: $web/blob/main/PRIVACY.md"
  Write-Host "  Terms:   $web/blob/main/TERMS.md"
} else {
  Write-Host 'Push failed (see above).' -ForegroundColor Red
}
