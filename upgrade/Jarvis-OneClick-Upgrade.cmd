@echo off
setlocal
title Jarvis One-Click Upgrade
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p='%~f0';$c=Get-Content -Raw -LiteralPath $p;$m='### POWERSHELL ###';$i=$c.IndexOf($m);if($i -lt 0){throw 'Updater payload missing'};Invoke-Expression ($c.Substring($i+$m.Length))"
exit /b %errorlevel%
### POWERSHELL ###
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework

$repo = 'bigzsorzs-sketch/jarvis-windows-v0.1'
$api = "https://api.github.com/repos/$repo/releases/latest"
$headers = @{ 'User-Agent' = 'Jarvis-OneClick-Upgrader'; 'Accept' = 'application/vnd.github+json' }

function Show-Info([string]$message) {
  [System.Windows.MessageBox]::Show($message,'Jarvis Upgrade','OK','Information') | Out-Null
}
function Show-ErrorBox([string]$message) {
  [System.Windows.MessageBox]::Show($message,'Jarvis Upgrade','OK','Error') | Out-Null
}

try {
  $release = Invoke-RestMethod -Uri $api -Headers $headers
  $installerAsset = $release.assets | Where-Object { $_.name -match '^Jarvis-Setup-\d+\.\d+\.\d+-x64\.exe$' } | Select-Object -First 1
  if (-not $installerAsset) { throw 'Nem található stabil Jarvis Windows telepítő a legújabb GitHub kiadásban.' }

  $checksumAsset = $release.assets | Where-Object { $_.name -eq ($installerAsset.name + '.sha256') } | Select-Object -First 1
  if (-not $checksumAsset) { throw 'A telepítő SHA-256 ellenőrző fájlja hiányzik. Biztonsági okból a frissítés leállt.' }

  $work = Join-Path $env:TEMP ("Jarvis-Upgrade-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  $installer = Join-Path $work $installerAsset.name
  $checksumFile = "$installer.sha256"

  Invoke-WebRequest -Uri $installerAsset.browser_download_url -OutFile $installer -Headers $headers
  Invoke-WebRequest -Uri $checksumAsset.browser_download_url -OutFile $checksumFile -Headers $headers

  $checksumText = Get-Content -LiteralPath $checksumFile -Raw
  $m = [regex]::Match($checksumText,'[A-Fa-f0-9]{64}')
  if (-not $m.Success) { throw 'Érvénytelen SHA-256 fájl.' }
  $expected = $m.Value.ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
    throw 'A letöltött telepítő ellenőrző összege nem egyezik. A fájl nem kerül telepítésre.'
  }

  Get-Process -Name 'Jarvis' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 800

  $stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
  $backupRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "Jarvis Backups\$stamp"
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

  $dataCandidates = @(
    (Join-Path $env:APPDATA 'Jarvis'),
    (Join-Path $env:APPDATA 'jarvis-desktop'),
    (Join-Path $env:LOCALAPPDATA 'Jarvis')
  ) | Select-Object -Unique

  foreach ($dir in $dataCandidates) {
    if (Test-Path -LiteralPath $dir) {
      $name = Split-Path $dir -Leaf
      Copy-Item -LiteralPath $dir -Destination (Join-Path $backupRoot $name) -Recurse -Force
    }
  }

  $p = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "A Jarvis telepítő hibakóddal állt le: $($p.ExitCode)" }

  $appCandidates = @(
    (Join-Path $env:ProgramFiles 'Jarvis\Jarvis.exe'),
    (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Jarvis\Jarvis.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Jarvis\Jarvis.exe')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  if ($appCandidates.Count -gt 0) {
    Start-Process -FilePath $appCandidates[0]
  }

  $nl = [Environment]::NewLine
  Show-Info ("A Jarvis frissítése elkészült." + $nl + $nl + "Verzió: " + $release.tag_name + $nl + "Biztonsági mentés: " + $backupRoot)
}
catch {
  $nl = [Environment]::NewLine
  Show-ErrorBox ("A frissítés nem sikerült." + $nl + $nl + $_.Exception.Message)
  exit 1
}
