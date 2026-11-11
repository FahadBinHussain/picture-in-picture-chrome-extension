# reloads the unpacked picture-in-picture extension INCLUDING manifest.json
# changes. opens the extension's reload.html, which messages the service worker
# to blank its own tab and call chrome.runtime.reload() - the same disk re-load
# path as the edge://extensions reload button. Extensions Reloader
# (start msedge http://reload.extensions) only flips chrome.management.setEnabled
# off/on and never re-reads manifest.json, so it can not pick up version bumps.
# usage: pwsh tools/reload-extension.ps1
#
# no build step - this extension is plain JS loaded unpacked straight from src\.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$target = (Resolve-Path (Join-Path $repoRoot 'src')).Path

# resolve the live extension ID from Edge Secure Preferences by its load path.
# this extension has no manifest "key", so its ID is derived from the src path
# and would change if the folder moves - hence the lookup instead of a constant.
$extId = $null
$prefs = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Secure Preferences"
if (Test-Path -LiteralPath $prefs) {
  try {
    $settings = (Get-Content -LiteralPath $prefs -Raw | ConvertFrom-Json).extensions.settings
    foreach ($prop in $settings.PSObject.Properties) {
      if ($prop.Value.path -and (Resolve-Path $prop.Value.path -ErrorAction SilentlyContinue).Path -eq $target) {
        $extId = $prop.Name
        break
      }
    }
  } catch {}
}

if (-not $extId) {
  throw "Extension is not loaded unpacked in Edge. Load unpacked once at edge://extensions pointing at $target"
}

Start-Process 'msedge' -ArgumentList "chrome-extension://$extId/reload.html"
Write-Host "Reload triggered for $extId" -ForegroundColor Green
