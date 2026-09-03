# reloads the unpacked picture-in-picture extension INCLUDING manifest.json changes.
# (same pattern as blindspot tools/reload-extension.ps1: Extensions Reloader
# only toggles management.setEnabled and never re-reads the manifest, so
# manifest bumps used to need a manual edge://extensions click. this opens the
# loader page, which messages bg to blank its tab + self-reload.)
# note: this fork has no pinned manifest `key`, so the id below is derived
# from the folder path - if the folder moves, re-read the id from
# edge://extensions and update it here.
$extId = "jplholakkilmfbhgcplmmppfcfgklhmh"
Start-Process "msedge" -ArgumentList "chrome-extension://$extId/reload.html"
