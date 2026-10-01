<#
.SYNOPSIS
  Publishes a Kadr release to the public binaries-only repository (default gitkalenyuk/kadr).

.DESCRIPTION
  Given VERSION and the dist\<VERSION>\ folder produced by the installer team's release tool
  (`task release VERSION=x.y.z` / `go run ./cmd/releasetool ...`), this script:

    1. verifies that every release asset exists and is consistent:
         Kadr-Setup-<V>-x64.exe, Kadr-<V>-windows-x64-portable.zip, SHA256SUMS.txt, latest.json, latest.json.sig
       - latest.json "version" equals VERSION, its installer name / URL / sha256 / size match the real file
       - SHA256SUMS.txt matches the installer and the zip
       - latest.json.sig is a base64 Ed25519 signature (64 bytes) and, when the public key and OpenSSL are
         available, verifies against latest.json (exactly what the in-app updater will check)
    2. extracts the release notes for VERSION from CHANGELOG.md (or uses -NotesFile) and stamps the release date
    3. refreshes the public repo content from the source tree: site\ (mirror), assets\logo.svg,
       LICENSE (EULA), THIRD_PARTY_NOTICES.md, keys\update-signing.ed25519.pub
    4. commits and pushes the release repo (git push origin main) -> GitHub Pages redeploys the site
    5. creates the GitHub release vVERSION with all assets (gh release create), marked as pre-release when VERSION
       has a suffix such as -beta.1
    6. prints the URLs

  Use -DryRun first: it runs every check and prints every command it would run, without changing anything.

.PARAMETER Version
  Release version, e.g. 0.1.0-beta.1 or 0.1.0 (a leading "v" is accepted).

.PARAMETER Dist
  Folder with the built assets, normally <source repo>\dist\<VERSION>.

.PARAMETER SourceRepo
  The Kadr source tree (where site\, build\brand\, build\legal\ and internal\update\pubkey.go live).
  Default: the parent folder of this release repo.

.PARAMETER Repo
  GitHub repository "owner/name". Default: gitkalenyuk/kadr.

.PARAMETER NotesFile
  Markdown file to use as release notes instead of the CHANGELOG.md section.

.PARAMETER PublicKey
  Base64 Ed25519 public key to verify latest.json.sig. Default: read from internal\update\pubkey.go of the source
  tree, else keys\update-signing.ed25519.pub of this repo.

.PARAMETER AllowMissingMedia
  Publish even when README.md references images under assets\ that do not exist yet.

.PARAMETER DryRun
  Only check and print what would be done.

.EXAMPLE
  .\scripts\publish.ps1 -Version 0.1.0-beta.1 -Dist ..\dist\0.1.0-beta.1 -DryRun

.EXAMPLE
  .\scripts\publish.ps1 -Version 0.1.0-beta.1 -Dist C:\src\kadr\dist\0.1.0-beta.1
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$Dist,
  [string]$SourceRepo = "",
  [string]$Repo = "gitkalenyuk/kadr",
  [string]$NotesFile = "",
  [string]$PublicKey = "",
  [switch]$AllowMissingMedia,
  [switch]$DryRun
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------------------------- helpers

$script:Warnings = New-Object System.Collections.Generic.List[string]
$script:Errors = New-Object System.Collections.Generic.List[string]

function Write-Step([string]$msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg) { Write-Host "    ok    $msg" -ForegroundColor Green }
function Write-Info([string]$msg) { Write-Host "          $msg" }
function Add-Warn([string]$msg) { $script:Warnings.Add($msg); Write-Host "    WARN  $msg" -ForegroundColor Yellow }
function Add-Err([string]$msg) { $script:Errors.Add($msg); Write-Host "    FAIL  $msg" -ForegroundColor Red }
function Stop-Publish([string]$msg) { Write-Host ""; Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

function Format-Arg([string]$a) { if ($a -match '[\s"]') { return '"' + ($a -replace '"', '\"') + '"' } return $a }
function Format-Cmd([string]$exe, [string[]]$argv) { return (@($exe) + ($argv | ForEach-Object { Format-Arg $_ })) -join ' ' }

# Runs a native command, or only prints it in dry-run mode.
function Invoke-Native([string]$exe, [string[]]$argv, [string]$cwd = "") {
  $shown = Format-Cmd $exe $argv
  if ($cwd) { $shown = "(in $cwd) $shown" }
  if ($DryRun) { Write-Host "    [dry-run] $shown" -ForegroundColor DarkGray; return }
  Write-Host "    > $shown" -ForegroundColor DarkGray
  if ($cwd) { Push-Location $cwd }
  try {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { Stop-Publish "command failed (exit $LASTEXITCODE): $shown" }
  } finally { if ($cwd) { Pop-Location } }
}

# Runs a read-only native command and returns its output + exit code (also in dry-run mode).
function Get-Native([string]$exe, [string[]]$argv) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { $out = & $exe @argv 2>&1 | Out-String; $code = $LASTEXITCODE }
  finally { $ErrorActionPreference = $prev }
  return [pscustomobject]@{ Output = $out.Trim(); Code = $code }
}

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Read-Utf8([string]$path) { return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) }
function Write-Utf8([string]$path, [string]$text) { [System.IO.File]::WriteAllText($path, $text, $Utf8NoBom) }
function Get-Sha256([string]$path) { return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }

function Find-Exe([string]$name, [string[]]$fallbacks = @()) {
  $cmd = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) { return $cmd.Path }
  foreach ($f in $fallbacks) { if (Test-Path -LiteralPath $f) { return $f } }
  return $null
}

# Property of a JSON object, or $null when it is absent (StrictMode-safe).
function Get-Prop($obj, [string]$name) {
  if ($null -eq $obj) { return $null }
  $p = $obj.PSObject.Properties[$name]
  if ($p) { return $p.Value } else { return $null }
}

$Arrow = [string][char]0x2192

# ---------------------------------------------------------------------------------------------- inputs

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $SourceRepo) { $SourceRepo = Join-Path $RepoRoot ".." }
if (-not (Test-Path -LiteralPath $SourceRepo)) { Stop-Publish "source repo not found: $SourceRepo" }
$SourceRepo = (Resolve-Path -LiteralPath $SourceRepo).Path

$Version = $Version.Trim()
if ($Version.StartsWith("v")) { $Version = $Version.Substring(1) }
if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$') {
  Stop-Publish "VERSION '$Version' is not a semantic version like 0.1.0 or 0.1.0-beta.1 (build metadata '+...' is not allowed in tags)"
}
$IsPrerelease = $Version.Contains("-")
$Tag = "v$Version"
if ($Repo -notmatch '^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$') { Stop-Publish "-Repo must look like owner/name, got '$Repo'" }
$Owner, $RepoName = $Repo.Split("/")

if (-not (Test-Path -LiteralPath $Dist -PathType Container)) { Stop-Publish "dist folder not found: $Dist" }
$Dist = (Resolve-Path -LiteralPath $Dist).Path

$Installer = "Kadr-Setup-$Version-x64.exe"
$Portable = "Kadr-$Version-windows-x64-portable.zip"
$AssetNames = @($Installer, $Portable, "SHA256SUMS.txt", "latest.json", "latest.json.sig")
$ReleaseBase = "https://github.com/$Repo/releases"

Write-Host ""
Write-Host "Kadr publish  $Tag  ->  $Repo$(if ($IsPrerelease) { '  (pre-release)' })$(if ($DryRun) { '  [DRY RUN]' })" -ForegroundColor White
Write-Info "release repo: $RepoRoot"
Write-Info "source repo:  $SourceRepo"
Write-Info "dist:         $Dist"

# ---------------------------------------------------------------------------------------------- 1. assets

Write-Step "Checking release assets"
$AssetPaths = @{}
foreach ($name in $AssetNames) {
  $p = Join-Path $Dist $name
  if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { Add-Err "missing asset: $name"; continue }
  $len = (Get-Item -LiteralPath $p).Length
  if ($len -eq 0) { Add-Err "empty asset: $name"; continue }
  $AssetPaths[$name] = $p
  Write-Ok ("{0,-45} {1,12} bytes" -f $name, $len)
}
# notes.md (written by the release tool) and the app\ folder are build by-products and are not uploaded.
$extra = Get-ChildItem -LiteralPath $Dist -File | Where-Object { $AssetNames -notcontains $_.Name -and $_.Name -ne "notes.md" }
foreach ($f in $extra) { Add-Warn "not uploaded (unexpected file in dist): $($f.Name)" }
if ($script:Errors.Count -gt 0) { Stop-Publish "the dist folder is incomplete; build it with the release tool first" }

$InstallerHash = Get-Sha256 $AssetPaths[$Installer]
$PortableHash = Get-Sha256 $AssetPaths[$Portable]
$InstallerSize = (Get-Item -LiteralPath $AssetPaths[$Installer]).Length

# latest.json
Write-Step "Checking latest.json"
try { $Manifest = Read-Utf8 $AssetPaths["latest.json"] | ConvertFrom-Json } catch { Stop-Publish "latest.json is not valid JSON: $($_.Exception.Message)" }
$mv = "$(Get-Prop $Manifest 'version')".Trim()
if ($mv.StartsWith("v")) { $mv = $mv.Substring(1) }
if ($mv -ne $Version) { Add-Err "latest.json version is '$mv', expected '$Version'" } else { Write-Ok "version $mv" }

$channel = "$(Get-Prop $Manifest 'channel')"
$wantChannel = $(if ($IsPrerelease) { "beta" } else { "stable" })
if ($channel -ne $wantChannel) { Add-Warn "latest.json channel is '$channel' (expected '$wantChannel' for this version)" } else { Write-Ok "channel $channel" }

$win = Get-Prop (Get-Prop $Manifest 'assets') 'windows-x64'
if (-not $win) { Add-Err "latest.json has no assets.windows-x64 entry" }
else {
  $wantUrl = "$ReleaseBase/download/$Tag/$Installer"
  $wi = "$(Get-Prop $win 'installer')"; $wu = "$(Get-Prop $win 'url')"; $wh = "$(Get-Prop $win 'sha256')".ToLowerInvariant(); $ws = "$(Get-Prop $win 'size')"
  if ($wi -ne $Installer) { Add-Err "latest.json installer is '$wi', expected '$Installer'" } else { Write-Ok "installer name" }
  if ($wu -ne $wantUrl) { Add-Err "latest.json url is '$wu', expected '$wantUrl'" } else { Write-Ok "installer URL $wantUrl" }
  if ($wh -ne $InstallerHash) { Add-Err "latest.json sha256 '$wh' does not match the installer ($InstallerHash)" } else { Write-Ok "installer sha256 $InstallerHash" }
  if ($ws -ne "$InstallerSize") { Add-Err "latest.json size is '$ws', the installer has $InstallerSize bytes" } else { Write-Ok "installer size $InstallerSize" }
}
$wantNotesUrl = "$ReleaseBase/tag/$Tag"
$nu = "$(Get-Prop $Manifest 'notes_url')"
if ($nu -ne $wantNotesUrl) { Add-Warn "latest.json notes_url is '$nu', expected '$wantNotesUrl'" }
if (-not "$(Get-Prop $Manifest 'notes_markdown')".Trim()) {
  Add-Warn "latest.json has empty notes_markdown (the in-app update dialog will show no notes)"
}

# SHA256SUMS.txt
Write-Step "Checking SHA256SUMS.txt"
$sums = @{}
foreach ($line in (Read-Utf8 $AssetPaths["SHA256SUMS.txt"]) -split "`r?`n") {
  if ($line -match '^\s*([0-9a-fA-F]{64})\s+\*?(.+?)\s*$') { $sums[$Matches[2]] = $Matches[1].ToLowerInvariant() }
}
foreach ($pair in @(@($Installer, $InstallerHash), @($Portable, $PortableHash))) {
  $n = $pair[0]; $h = $pair[1]
  if (-not $sums.ContainsKey($n)) { Add-Err "SHA256SUMS.txt has no line for $n" }
  elseif ($sums[$n] -ne $h) { Add-Err "SHA256SUMS.txt hash for $n does not match the file ($h)" }
  else { Write-Ok "$n" }
}

# latest.json.sig
Write-Step "Checking latest.json.sig"
$sigText = (Read-Utf8 $AssetPaths["latest.json.sig"]).Trim()
$sigBytes = $null
try { $sigBytes = [Convert]::FromBase64String($sigText) } catch { Add-Err "latest.json.sig is not base64" }
if ($sigBytes -and $sigBytes.Length -ne 64) { Add-Err "latest.json.sig decodes to $($sigBytes.Length) bytes; an Ed25519 signature has 64" }
elseif ($sigBytes) { Write-Ok "base64 Ed25519 signature (64 bytes)" }

$pubSource = ""
if (-not $PublicKey) {
  $pubGo = Join-Path $SourceRepo "internal\update\pubkey.go"
  if (Test-Path -LiteralPath $pubGo) {
    $m = [regex]::Match((Read-Utf8 $pubGo), 'PublicKey\s*=\s*"([^"]*)"')
    if ($m.Success -and $m.Groups[1].Value) { $PublicKey = $m.Groups[1].Value; $pubSource = $pubGo }
    elseif ($m.Success) { Add-Warn "internal\update\pubkey.go has an EMPTY PublicKey: an app built from it is a dev build that never installs updates. Run 'go run ./cmd/releasetool keygen' and rebuild." }
  }
}
if (-not $PublicKey) {
  $pubFile = Join-Path $RepoRoot "keys\update-signing.ed25519.pub"
  if (Test-Path -LiteralPath $pubFile) { $PublicKey = (Read-Utf8 $pubFile).Trim(); $pubSource = $pubFile }
} elseif (-not $pubSource) { $pubSource = "-PublicKey" }

$pubBytes = $null
if ($PublicKey) {
  try { $pubBytes = [Convert]::FromBase64String($PublicKey.Trim()) } catch { Add-Err "the public key from $pubSource is not base64" }
  if ($pubBytes -and $pubBytes.Length -ne 32) { Add-Err "the public key from $pubSource has $($pubBytes.Length) bytes; an Ed25519 public key has 32"; $pubBytes = $null }
}
$openssl = Find-Exe "openssl" @("$env:ProgramFiles\Git\usr\bin\openssl.exe", "$env:ProgramFiles\Git\mingw64\bin\openssl.exe")
if ($pubBytes -and $sigBytes -and $sigBytes.Length -eq 64 -and $openssl) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("kadr-publish-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $prefix = [byte[]](0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00)
    [System.IO.File]::WriteAllBytes((Join-Path $tmp "pub.der"), [byte[]]($prefix + $pubBytes))
    [System.IO.File]::WriteAllBytes((Join-Path $tmp "sig.bin"), $sigBytes)
    $r1 = Get-Native $openssl @("pkey", "-pubin", "-inform", "DER", "-in", (Join-Path $tmp "pub.der"), "-out", (Join-Path $tmp "pub.pem"))
    if ($r1.Code -ne 0) { Add-Err "openssl could not read the public key: $($r1.Output)" }
    else {
      $r2 = Get-Native $openssl @("pkeyutl", "-verify", "-pubin", "-inkey", (Join-Path $tmp "pub.pem"), "-rawin",
        "-in", $AssetPaths["latest.json"], "-sigfile", (Join-Path $tmp "sig.bin"))
      if ($r2.Code -eq 0) { Write-Ok "signature verified with the public key from $pubSource" }
      else { Add-Err "latest.json.sig does NOT verify with the public key from $pubSource. The updater would reject this release." }
    }
  } finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
} elseif (-not $pubBytes) {
  Add-Warn "no public key found: the signature was not verified cryptographically"
} elseif (-not $openssl) {
  Add-Warn "OpenSSL 3 not found (install Git for Windows): the signature was not verified cryptographically"
}

if ($script:Errors.Count -gt 0) { Stop-Publish "$($script:Errors.Count) asset check(s) failed; fix the build (see FAIL lines above)" }

# ---------------------------------------------------------------------------------------------- 2. notes

Write-Step "Release notes"
$Changelog = Join-Path $RepoRoot "CHANGELOG.md"
$TmpDir = Join-Path $RepoRoot ".publish-tmp"
$NotesOut = Join-Path $TmpDir "notes-$Tag.md"
$StampChangelog = $false
if ($NotesFile) {
  if (-not (Test-Path -LiteralPath $NotesFile)) { Stop-Publish "notes file not found: $NotesFile" }
  $NotesText = Read-Utf8 $NotesFile
  Write-Ok "using $NotesFile"
} else {
  if (-not (Test-Path -LiteralPath $Changelog)) { Stop-Publish "CHANGELOG.md not found in $RepoRoot" }
  $lines = (Read-Utf8 $Changelog) -split "`r?`n"
  $head = "## [$Version]"
  $start = -1
  for ($i = 0; $i -lt $lines.Length; $i++) { if ($lines[$i].StartsWith($head)) { $start = $i; break } }
  if ($start -lt 0) { Stop-Publish "CHANGELOG.md has no section '$head'. Add one (Keep a Changelog format) or pass -NotesFile." }
  $body = New-Object System.Collections.Generic.List[string]
  for ($i = $start + 1; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^## \[' -or $lines[$i] -match '^\[[^\]]+\]:\s*https?://') { break }
    $body.Add($lines[$i])
  }
  $NotesText = ($body -join "`n").Trim()
  if (-not $NotesText) { Stop-Publish "the CHANGELOG.md section '$head' is empty" }
  $StampChangelog = $lines[$start] -match 'Unreleased'
  Write-Ok "CHANGELOG.md section '$($lines[$start])' ($($body.Count) lines)"
}
$NotesText += "`n`n---`n`n**Downloads:** ``$Installer`` (installer, recommended) or ``$Portable`` (portable). " +
  "Check them against ``SHA256SUMS.txt``. Installed copies of Kadr update themselves" +
  $(if ($IsPrerelease) { " when the **Beta** channel is selected (Settings $Arrow Updates)." } else { " (Settings $Arrow Updates)." }) + "`n"
$Today = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
if ($StampChangelog) { Write-Info "the heading will be stamped: '## [$Version] - $Today'" }

# ---------------------------------------------------------------------------------------------- 3. preflight

Write-Step "Preflight (git, gh)"
$git = Find-Exe "git"
$gh = Find-Exe "gh"
if (-not $git) { if ($DryRun) { Add-Warn "git not found" } else { Stop-Publish "git not found" } }
if (-not $gh) { if ($DryRun) { Add-Warn "GitHub CLI (gh) not found" } else { Stop-Publish "GitHub CLI (gh) not found: https://cli.github.com" } }

if ($git) {
  # The release repo must be its OWN repository (it may live inside the source tree, which is another repo).
  $top = Get-Native $git @("-C", $RepoRoot, "rev-parse", "--show-toplevel")
  $isOwnRepo = $false
  if ($top.Code -eq 0) {
    $topPath = [System.IO.Path]::GetFullPath($top.Output.Replace('/', '\')).TrimEnd('\')
    $isOwnRepo = $topPath -ieq $RepoRoot.TrimEnd('\')
  }
  if (-not $isOwnRepo) {
    $why = $(if ($top.Code -eq 0) { "it is inside the repository $($top.Output)" } else { "it is not a git repository" })
    if ($DryRun) { Add-Warn "$RepoRoot is not its own git repository ($why); git steps would be refused" }
    else { Stop-Publish "$RepoRoot is not its own git repository ($why); run 'git init -b main' there (see scripts/first-time-setup.md)" }
  }
  else {
    $branch = (Get-Native $git @("-C", $RepoRoot, "rev-parse", "--abbrev-ref", "HEAD")).Output
    if ($branch -ne "main") { if ($DryRun) { Add-Warn "current branch is '$branch', expected 'main'" } else { Stop-Publish "the release repo must be on branch 'main' (now '$branch')" } }
    else { Write-Ok "branch main" }
    $origin = Get-Native $git @("-C", $RepoRoot, "remote", "get-url", "origin")
    if ($origin.Code -ne 0) { if ($DryRun) { Add-Warn "no 'origin' remote yet (see scripts/first-time-setup.md)" } else { Stop-Publish "no 'origin' remote; see scripts/first-time-setup.md" } }
    elseif ($origin.Output -notmatch [regex]::Escape($Repo)) { Add-Warn "origin is $($origin.Output), which does not look like $Repo" }
    else { Write-Ok "origin $($origin.Output)" }
  }
}
if ($gh -and -not $DryRun) {
  $auth = Get-Native $gh @("auth", "status")
  if ($auth.Code -ne 0) { Stop-Publish "gh is not logged in; run 'gh auth login'" }
  Write-Ok "gh authenticated"
  $exists = Get-Native $gh @("release", "view", $Tag, "--repo", $Repo, "--json", "tagName")
  if ($exists.Code -eq 0) { Stop-Publish "release $Tag already exists in $Repo; bump the version or delete that release first" }
  Write-Ok "release $Tag does not exist yet"
} elseif ($DryRun) {
  Write-Host "    [dry-run] gh auth status; gh release view $Tag --repo $Repo (must not exist)" -ForegroundColor DarkGray
}

# README media referenced under assets/
$readme = Read-Utf8 (Join-Path $RepoRoot "README.md")
$media = [regex]::Matches($readme, '(?<=["(])assets/[A-Za-z0-9._/-]+') | ForEach-Object { $_.Value } | Sort-Object -Unique
$missingMedia = @($media | Where-Object {
    $rel = $_ -replace '/', '\'
    -not (Test-Path -LiteralPath (Join-Path $RepoRoot $rel)) -and
    -not ($rel -eq "assets\logo.svg" -and (Test-Path -LiteralPath (Join-Path $SourceRepo "build\brand\logo.svg")))
  })
if ($missingMedia.Count -gt 0) {
  $msg = "README.md references missing media: " + ($missingMedia -join ", ")
  if ($AllowMissingMedia -or $DryRun) { Add-Warn $msg } else { Add-Err "$msg (add them, or pass -AllowMissingMedia)" }
} else { Write-Ok "all README media present ($($media.Count))" }
if ($script:Errors.Count -gt 0) { Stop-Publish "README media missing (see FAIL lines above)" }

# ---------------------------------------------------------------------------------------------- 4. repo content

Write-Step "Refreshing repository content from the source tree"
$SiteSrc = Join-Path $SourceRepo "site"
$SiteDst = Join-Path $RepoRoot "site"
if (Test-Path -LiteralPath (Join-Path $SiteSrc "index.html")) {
  $n = (Get-ChildItem -LiteralPath $SiteSrc -Recurse -File).Count
  if ($DryRun) { Write-Host "    [dry-run] mirror $SiteSrc -> $SiteDst ($n files)" -ForegroundColor DarkGray }
  else {
    if (Test-Path -LiteralPath $SiteDst) { Get-ChildItem -LiteralPath $SiteDst -Force | Remove-Item -Recurse -Force }
    else { New-Item -ItemType Directory -Path $SiteDst | Out-Null }
    Copy-Item -Path (Join-Path $SiteSrc "*") -Destination $SiteDst -Recurse -Force
    Write-Ok "site mirrored ($n files)"
  }
} elseif (Test-Path -LiteralPath (Join-Path $SiteDst "index.html")) {
  Add-Warn "no site\index.html in the source tree; keeping the existing site\ of the release repo"
} else {
  Add-Err "no website: neither $SiteSrc nor $SiteDst contains index.html (the Pages workflow would fail)"
}

# Single files: source path -> destination path (relative to the release repo)
$copies = @(
  @{ Src = (Join-Path $SourceRepo "build\brand\logo.svg"); Dst = "assets\logo.svg"; Kind = "copy" },
  @{ Src = (Join-Path $SourceRepo "build\legal\EULA.txt"); Dst = "LICENSE"; Kind = "copy" },
  @{ Src = (Join-Path $SourceRepo "build\legal\THIRD_PARTY_NOTICES.txt"); Dst = "THIRD_PARTY_NOTICES.md"; Kind = "notices" }
)
foreach ($c in $copies) {
  $dst = Join-Path $RepoRoot $c.Dst
  if (-not (Test-Path -LiteralPath $c.Src)) {
    if (Test-Path -LiteralPath $dst) { Add-Warn "$($c.Src) not found; keeping the existing $($c.Dst)" }
    else { Add-Err "$($c.Src) not found and $($c.Dst) does not exist" }
    continue
  }
  if ($DryRun) { Write-Host "    [dry-run] $($c.Kind) $($c.Src) -> $($c.Dst)" -ForegroundColor DarkGray; continue }
  New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
  if ($c.Kind -eq "notices") {
    $txt = (Read-Utf8 $c.Src).TrimEnd()
    $md = "# Third-party notices`n`n" +
      "Kadr is built with the open-source components listed below. The same text ships with every installation in " +
      "``licenses\THIRD_PARTY_NOTICES.txt``.`n`n" + '````text' + "`n" + $txt + "`n" + '````' + "`n"
    Write-Utf8 $dst $md
  } else { Copy-Item -LiteralPath $c.Src -Destination $dst -Force }
  Write-Ok "$($c.Dst)"
}
if ($pubBytes) {
  $keyDst = Join-Path $RepoRoot "keys\update-signing.ed25519.pub"
  $keyText = [Convert]::ToBase64String($pubBytes) + "`n"
  if ((Test-Path -LiteralPath $keyDst) -and ((Read-Utf8 $keyDst) -eq $keyText)) { Write-Ok "keys\update-signing.ed25519.pub (unchanged)" }
  elseif ($DryRun) { Write-Host "    [dry-run] write keys\update-signing.ed25519.pub from $pubSource" -ForegroundColor DarkGray }
  else { New-Item -ItemType Directory -Path (Split-Path $keyDst) -Force | Out-Null; Write-Utf8 $keyDst $keyText; Write-Ok "keys\update-signing.ed25519.pub" }
}

if ($script:Errors.Count -gt 0) { Stop-Publish "repository content is incomplete (see FAIL lines above)" }

# ---------------------------------------------------------------------------------------------- 5. commit, push, release

Write-Step "Commit and push"
if ($StampChangelog -and -not $DryRun) {
  $cl = Read-Utf8 $Changelog
  $cl = [regex]::Replace($cl, '(?m)^## \[' + [regex]::Escape($Version) + '\][^\r\n]*', "## [$Version] - $Today")
  Write-Utf8 $Changelog $cl
  Write-Ok "CHANGELOG.md heading stamped with $Today"
} elseif ($StampChangelog) {
  Write-Host "    [dry-run] stamp CHANGELOG.md heading: ## [$Version] - $Today" -ForegroundColor DarkGray
}
if (-not $DryRun) {
  New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null
  Write-Utf8 $NotesOut $NotesText
} else {
  Write-Host "    [dry-run] write release notes to $NotesOut" -ForegroundColor DarkGray
}

$gitExe = $(if ($git) { $git } else { "git" })
Invoke-Native $gitExe @("-C", $RepoRoot, "add", "-A")
$hasChanges = $true
if (-not $DryRun) {
  $st = Get-Native $gitExe @("-C", $RepoRoot, "status", "--porcelain")
  $hasChanges = [bool]$st.Output
}
if ($hasChanges) { Invoke-Native $gitExe @("-C", $RepoRoot, "commit", "-m", "Release $Tag") }
else { Write-Info "nothing to commit" }
Invoke-Native $gitExe @("-C", $RepoRoot, "push", "origin", "main")

Write-Step "Create GitHub release $Tag"
$ghExe = $(if ($gh) { $gh } else { "gh" })
$relArgs = @("release", "create", $Tag) + ($AssetNames | ForEach-Object { Join-Path $Dist $_ }) +
  @("--repo", $Repo, "--target", "main", "--title", "Kadr $Version", "--notes-file", $NotesOut)
if ($IsPrerelease) { $relArgs += "--prerelease" } else { $relArgs += "--latest" }
Invoke-Native $ghExe $relArgs

# ---------------------------------------------------------------------------------------------- 6. summary

Write-Step "URLs"
Write-Info "Release:        $ReleaseBase/tag/$Tag"
Write-Info "Installer:      $ReleaseBase/download/$Tag/$Installer"
Write-Info "Portable:       $ReleaseBase/download/$Tag/$Portable"
Write-Info "Manifest:       $ReleaseBase/download/$Tag/latest.json"
if ($IsPrerelease) {
  Write-Info "Updater:        pre-release -> offered to the Beta channel (GitHub API releases list)"
} else {
  Write-Info "Updater:        $ReleaseBase/latest/download/latest.json"
}
Write-Info "Website:        https://$($Owner.ToLowerInvariant()).github.io/$RepoName/  (Pages deploy: https://github.com/$Repo/actions)"
Write-Info "Repository:     https://github.com/$Repo"

if ($script:Warnings.Count -gt 0) {
  Write-Host ""
  Write-Host "$($script:Warnings.Count) warning(s):" -ForegroundColor Yellow
  $script:Warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}
Write-Host ""
if ($DryRun) { Write-Host "Dry run complete: nothing was changed, committed, pushed or published." -ForegroundColor Green }
else { Write-Host "Published Kadr $Version." -ForegroundColor Green }
