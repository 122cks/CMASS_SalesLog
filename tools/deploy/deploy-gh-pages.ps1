<#
Deploy `public/` to GitHub Pages (gh-pages branch) using `git subtree`.

Usage:
  ./deploy-gh-pages.ps1 [-Remote origin] [-BuildDir public]

Notes:
- This script prefers `git subtree push --prefix <buildDir> <remote> gh-pages` which does not modify
  your working branch or index. It requires `git` with subtree support (most modern installations).
- If subtree push fails, the script will exit with a non-zero code and print instructions for a
  fallback orphan-branch deploy that must be run manually (to avoid accidental data loss).
#>

param(
  [string]$Remote = 'origin',
  [string]$BuildDir = 'public'
)

function Run-Git([string[]]$args) {
  Write-Host "git $($args -join ' ')"
  $output = & git @args 2>&1
  $exit = $LASTEXITCODE
  $text = $output -join "`n"
  return @{ ExitCode = $exit; StdOut = $text }
}

# Ensure we're in a git repo
$root = (git rev-parse --show-toplevel) 2>$null
if (!$?) {
  Write-Error "Not inside a git repository. Run this script from the repository root."
  exit 2
}

Write-Host "Deploying '$BuildDir' to remote '$Remote' branch gh-pages..."

# Validate remote
 $rem = Run-Git @('remote','get-url',$Remote)
if ($rem.ExitCode -ne 0) {
  Write-Error "Remote '$Remote' not found. Available remotes:"; Run-Git @('remote','-v') | Out-Null
  exit 3
}

# Ensure build dir exists
if (!(Test-Path -Path $BuildDir)) {
  Write-Error "Build directory '$BuildDir' not found. Make sure your site build output is in this folder.";
  exit 4
}

# Try subtree push (non-destructive)
Write-Host "Trying: git subtree push --prefix $BuildDir $Remote gh-pages"
$res = Run-Git @('subtree','push','--prefix',$BuildDir,$Remote,'gh-pages')
if ($res.ExitCode -eq 0) {
  Write-Host "Success: $BuildDir pushed to $Remote/gh-pages"
  exit 0
}

Write-Warning "`ngit subtree push failed. Output:`n$res.StdOut`n"

Write-Host "Fallback instructions:"
Write-Host "1) Ensure your working tree is clean or stash changes."
Write-Host "2) Create an orphan gh-pages branch, commit the contents of $BuildDir, and push. Example commands (run manually):`n"
Write-Host "   git checkout --orphan gh-pages"
Write-Host "   git rm -rf ."
Write-Host "   robocopy $BuildDir . /E /NFL /NDL /NJH /NJS" 
Write-Host "   echo > .nojekyll"
Write-Host "   git add -A"
Write-Host "   git commit -m 'Deploy to gh-pages'"
Write-Host "   git push -f $Remote gh-pages"
Write-Host "   git checkout -"

Write-Error "Subtree push and automatic fallback both aborted. Please run the fallback steps manually if needed."
exit 5
