#!/usr/bin/env bash
# Publishes a Kadr release to the public binaries-only repository (default gitkalenyuk/kadr).
#
# Usage:
#   scripts/publish.sh [options] VERSION DIST
#
#   VERSION   release version, e.g. 0.1.0-beta.1 or 0.1.0 (a leading "v" is accepted)
#   DIST      folder with the built assets, normally <source repo>/dist/<VERSION>
#
# Options:
#   --dry-run               run every check and print every command, change nothing
#   --source DIR            Kadr source tree (site/, build/brand/, build/legal/, internal/update/pubkey.go);
#                           default: the parent folder of this release repo
#   --repo OWNER/NAME       GitHub repository (default gitkalenyuk/kadr)
#   --notes-file FILE       release notes instead of the CHANGELOG.md section
#   --public-key BASE64     Ed25519 public key to verify latest.json.sig (default: from internal/update/pubkey.go,
#                           else keys/update-signing.ed25519.pub)
#   --allow-missing-media   publish even if README.md references images under assets/ that do not exist yet
#   -h, --help              show this help
#
# Steps (same as scripts/publish.ps1):
#   1. verify assets: Kadr-Setup-<V>-x64.exe, Kadr-<V>-windows-x64-portable.zip, SHA256SUMS.txt, latest.json,
#      latest.json.sig; latest.json version/installer/url/sha256/size; SHA256SUMS.txt; the Ed25519 signature
#      (with OpenSSL 3 when the public key is known)
#   2. release notes from CHANGELOG.md "## [VERSION]" (the "Unreleased" heading is stamped with today's date)
#   3. preflight: own git repo on main with an origin remote, gh logged in, release does not exist yet
#   4. refresh site/ (mirror), assets/logo.svg, LICENSE, THIRD_PARTY_NOTICES.md, keys/update-signing.ed25519.pub
#   5. git commit + git push origin main; gh release create vVERSION <assets> (+ --prerelease for -suffix versions)
#   6. print the URLs
#
# Example:
#   scripts/publish.sh --dry-run 0.1.0-beta.1 ../dist/0.1.0-beta.1

set -euo pipefail

# ---------------------------------------------------------------------------------------------- arguments

DRY_RUN=0
SOURCE=""
REPO="gitkalenyuk/kadr"
NOTES_FILE=""
PUBLIC_KEY=""
ALLOW_MISSING_MEDIA=0
POSITIONAL=()

usage() { sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --source) SOURCE="${2:?--source needs a folder}"; shift ;;
    --repo) REPO="${2:?--repo needs owner/name}"; shift ;;
    --notes-file) NOTES_FILE="${2:?--notes-file needs a file}"; shift ;;
    --public-key) PUBLIC_KEY="${2:?--public-key needs a base64 key}"; shift ;;
    --allow-missing-media) ALLOW_MISSING_MEDIA=1 ;;
    -h|--help) usage; exit 0 ;;
    --) shift; POSITIONAL+=("$@"); break ;;
    -*) echo "unknown option: $1 (see --help)" >&2; exit 2 ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done
if [ ${#POSITIONAL[@]} -ne 2 ]; then usage >&2; exit 2; fi
VERSION="${POSITIONAL[0]#v}"
DIST="${POSITIONAL[1]}"

# ---------------------------------------------------------------------------------------------- helpers

if [ -t 1 ]; then C_CYAN=$'\e[36m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'; C_RED=$'\e[31m'; C_DIM=$'\e[2m'; C_OFF=$'\e[0m'
else C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_DIM=""; C_OFF=""; fi

WARNINGS=()
ERRORS=0
step() { printf '\n%s==> %s%s\n' "$C_CYAN" "$1" "$C_OFF"; }
ok()   { printf '    %sok%s    %s\n' "$C_GREEN" "$C_OFF" "$1"; }
info() { printf '          %s\n' "$1"; }
warn() { WARNINGS+=("$1"); printf '    %sWARN%s  %s\n' "$C_YELLOW" "$C_OFF" "$1"; }
err()  { ERRORS=$((ERRORS + 1)); printf '    %sFAIL%s  %s\n' "$C_RED" "$C_OFF" "$1"; }
die()  { printf '\n%sERROR: %s%s\n' "$C_RED" "$1" "$C_OFF" >&2; exit 1; }
dry()  { printf '    %s[dry-run] %s%s\n' "$C_DIM" "$1" "$C_OFF"; }

# Prints a command with shell quoting.
show_cmd() { local out="" a; for a in "$@"; do out+="$(printf '%q' "$a") "; done; printf '%s' "${out% }"; }

# Runs a command that changes something, or only prints it in dry-run mode.
run() {
  if [ "$DRY_RUN" = 1 ]; then dry "$(show_cmd "$@")"; return 0; fi
  printf '    %s> %s%s\n' "$C_DIM" "$(show_cmd "$@")" "$C_OFF"
  "$@" || die "command failed: $(show_cmd "$@")"
}

have() { command -v "$1" >/dev/null 2>&1; }

sha256_of() {
  if have sha256sum; then sha256sum "$1" | cut -d' ' -f1
  elif have shasum; then shasum -a 256 "$1" | cut -d' ' -f1
  else openssl dgst -sha256 -r "$1" | cut -d' ' -f1; fi
}
size_of() { wc -c < "$1" | tr -d ' \r\n'; }
b64decode() { base64 -d 2>/dev/null || base64 --decode 2>/dev/null || openssl base64 -d -A; }
lower() { tr '[:upper:]' '[:lower:]'; }

# JSON reader: jq, else Python, else Node. Usage: json_get FILE key/sub-key/...  (prints "" when absent)
JSON_TOOL=""
for c in jq python3 python node; do
  if have "$c"; then
    case "$c" in
      jq) JSON_TOOL=jq; break ;;
      node) node -e 'process.exit(0)' >/dev/null 2>&1 && { JSON_TOOL=node; break; } ;;
      *) "$c" -c 'print(1)' >/dev/null 2>&1 && { JSON_TOOL="$c"; break; } ;;
    esac
  fi
done
json_get() {
  local file="$1" path="$2"
  case "$JSON_TOOL" in
    jq) local f; f=$(printf '%s' "$path" | awk -F/ '{for(i=1;i<=NF;i++) printf "[\"%s\"]", $i}')
        jq -r ".${f} // empty | tostring" "$file" ;;
    node) node -e 'const fs=require("fs");let v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
                   for (const k of process.argv[2].split("/")) v=(v&&typeof v==="object")?v[k]:undefined;
                   process.stdout.write(v===undefined||v===null?"":(typeof v==="object"?JSON.stringify(v):String(v)))' "$file" "$path" ;;
    *) "$JSON_TOOL" -c 'import json,sys
v=json.load(open(sys.argv[1],encoding="utf-8"))
for k in sys.argv[2].split("/"):
    v=v.get(k) if isinstance(v,dict) else None
sys.stdout.write("" if v is None else (json.dumps(v) if isinstance(v,(dict,list)) else (str(v).lower() if isinstance(v,bool) else str(v))))' "$file" "$path" ;;
  esac
}
json_valid() {
  case "$JSON_TOOL" in
    jq) jq -e . "$1" >/dev/null 2>&1 ;;
    node) node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$1" >/dev/null 2>&1 ;;
    *) "$JSON_TOOL" -c 'import json,sys; json.load(open(sys.argv[1],encoding="utf-8"))' "$1" >/dev/null 2>&1 ;;
  esac
}

# ---------------------------------------------------------------------------------------------- inputs

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -n "$SOURCE" ] || SOURCE="$ROOT/.."
[ -d "$SOURCE" ] || die "source repo not found: $SOURCE"
SOURCE="$(cd "$SOURCE" && pwd)"
[ -d "$DIST" ] || die "dist folder not found: $DIST"
DIST="$(cd "$DIST" && pwd)"

[[ "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$ ]] ||
  die "VERSION '$VERSION' is not a semantic version like 0.1.0 or 0.1.0-beta.1 (build metadata '+...' is not allowed in tags)"
[[ "$REPO" =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]] || die "--repo must look like owner/name, got '$REPO'"
IS_PRE=0; case "$VERSION" in *-*) IS_PRE=1 ;; esac
TAG="v$VERSION"
OWNER="${REPO%%/*}"; NAME="${REPO#*/}"
INSTALLER="Kadr-Setup-$VERSION-x64.exe"
PORTABLE="Kadr-$VERSION-windows-x64-portable.zip"
ASSETS=("$INSTALLER" "$PORTABLE" "SHA256SUMS.txt" "latest.json" "latest.json.sig")
RELEASES="https://github.com/$REPO/releases"
[ -n "$JSON_TOOL" ] || die "need jq, python or node to read latest.json"

printf '\nKadr publish  %s  ->  %s%s%s\n' "$TAG" "$REPO" "$([ $IS_PRE = 1 ] && echo '  (pre-release)')" "$([ $DRY_RUN = 1 ] && echo '  [DRY RUN]')"
info "release repo: $ROOT"
info "source repo:  $SOURCE"
info "dist:         $DIST"

# ---------------------------------------------------------------------------------------------- 1. assets

step "Checking release assets"
for a in "${ASSETS[@]}"; do
  if [ ! -f "$DIST/$a" ]; then err "missing asset: $a"
  elif [ ! -s "$DIST/$a" ]; then err "empty asset: $a"
  else ok "$(printf '%-45s %12s bytes' "$a" "$(size_of "$DIST/$a")")"; fi
done
for f in "$DIST"/*; do
  [ -f "$f" ] || continue
  b="$(basename "$f")"; known=0
  [ "$b" = notes.md ] && continue   # written by the release tool; app/ is a folder and skipped too
  for a in "${ASSETS[@]}"; do [ "$a" = "$b" ] && known=1; done
  [ $known = 1 ] || warn "not uploaded (unexpected file in dist): $b"
done
[ $ERRORS = 0 ] || die "the dist folder is incomplete; build it with the release tool first"

INSTALLER_SHA="$(sha256_of "$DIST/$INSTALLER" | lower)"
PORTABLE_SHA="$(sha256_of "$DIST/$PORTABLE" | lower)"
INSTALLER_SIZE="$(size_of "$DIST/$INSTALLER")"

step "Checking latest.json"
MANIFEST="$DIST/latest.json"
json_valid "$MANIFEST" || die "latest.json is not valid JSON"
mv="$(json_get "$MANIFEST" version)"; mv="${mv#v}"
if [ "$mv" = "$VERSION" ]; then ok "version $mv"; else err "latest.json version is '$mv', expected '$VERSION'"; fi
channel="$(json_get "$MANIFEST" channel)"
want_channel=stable; [ $IS_PRE = 1 ] && want_channel=beta
if [ "$channel" = "$want_channel" ]; then ok "channel $channel"; else warn "latest.json channel is '$channel' (expected '$want_channel' for this version)"; fi
want_url="$RELEASES/download/$TAG/$INSTALLER"
wi="$(json_get "$MANIFEST" assets/windows-x64/installer)"
wu="$(json_get "$MANIFEST" assets/windows-x64/url)"
wh="$(json_get "$MANIFEST" assets/windows-x64/sha256 | lower)"
ws="$(json_get "$MANIFEST" assets/windows-x64/size)"
if [ -z "$wi$wu$wh$ws" ]; then err "latest.json has no assets.windows-x64 entry"
else
  if [ "$wi" = "$INSTALLER" ]; then ok "installer name"; else err "latest.json installer is '$wi', expected '$INSTALLER'"; fi
  if [ "$wu" = "$want_url" ]; then ok "installer URL $want_url"; else err "latest.json url is '$wu', expected '$want_url'"; fi
  if [ "$wh" = "$INSTALLER_SHA" ]; then ok "installer sha256 $INSTALLER_SHA"; else err "latest.json sha256 '$wh' does not match the installer ($INSTALLER_SHA)"; fi
  if [ "$ws" = "$INSTALLER_SIZE" ]; then ok "installer size $INSTALLER_SIZE"; else err "latest.json size is '$ws', the installer has $INSTALLER_SIZE bytes"; fi
fi
nu="$(json_get "$MANIFEST" notes_url)"
[ "$nu" = "$RELEASES/tag/$TAG" ] || warn "latest.json notes_url is '$nu', expected '$RELEASES/tag/$TAG'"
[ -n "$(json_get "$MANIFEST" notes_markdown | tr -d '[:space:]')" ] || warn "latest.json has empty notes_markdown (the in-app update dialog will show no notes)"

step "Checking SHA256SUMS.txt"
for pair in "$INSTALLER:$INSTALLER_SHA" "$PORTABLE:$PORTABLE_SHA"; do
  n="${pair%%:*}"; h="${pair##*:}"
  line_hash="$(tr -d '\r' < "$DIST/SHA256SUMS.txt" | awk -v n="$n" '{f=$2; sub(/^\*/,"",f); if (f==n) {print tolower($1); exit}}')"
  if [ -z "$line_hash" ]; then err "SHA256SUMS.txt has no line for $n"
  elif [ "$line_hash" != "$h" ]; then err "SHA256SUMS.txt hash for $n does not match the file ($h)"
  else ok "$n"; fi
done

step "Checking latest.json.sig"
TMP="$(mktemp -d 2>/dev/null || mktemp -d -t kadr-publish)"
trap 'rm -rf "$TMP"' EXIT
tr -d ' \r\n' < "$DIST/latest.json.sig" | b64decode > "$TMP/sig.bin" 2>/dev/null || true
sig_len="$(size_of "$TMP/sig.bin")"
SIG_OK=0
if [ "$sig_len" = 64 ]; then ok "base64 Ed25519 signature (64 bytes)"; SIG_OK=1
else err "latest.json.sig does not decode to a 64-byte Ed25519 signature (got $sig_len bytes)"; fi

PUB_SOURCE=""
if [ -n "$PUBLIC_KEY" ]; then PUB_SOURCE="--public-key"
elif [ -f "$SOURCE/internal/update/pubkey.go" ]; then
  k="$(sed -n 's/.*PublicKey[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$SOURCE/internal/update/pubkey.go" | head -n1)"
  if [ -n "$k" ]; then PUBLIC_KEY="$k"; PUB_SOURCE="$SOURCE/internal/update/pubkey.go"
  elif grep -q 'PublicKey' "$SOURCE/internal/update/pubkey.go"; then
    warn "internal/update/pubkey.go has an EMPTY PublicKey: an app built from it is a dev build that never installs updates. Run 'go run ./cmd/releasetool keygen' and rebuild."
  fi
fi
if [ -z "$PUBLIC_KEY" ] && [ -f "$ROOT/keys/update-signing.ed25519.pub" ]; then
  PUBLIC_KEY="$(tr -d ' \r\n' < "$ROOT/keys/update-signing.ed25519.pub")"; PUB_SOURCE="$ROOT/keys/update-signing.ed25519.pub"
fi
PUB_OK=0
if [ -n "$PUBLIC_KEY" ]; then
  printf '%s' "$PUBLIC_KEY" | b64decode > "$TMP/pub.raw" 2>/dev/null || true
  if [ "$(size_of "$TMP/pub.raw")" = 32 ]; then PUB_OK=1
  else err "the public key from $PUB_SOURCE is not a base64 32-byte Ed25519 key"; fi
fi
if [ $PUB_OK = 1 ] && [ $SIG_OK = 1 ] && have openssl && have xxd; then
  { printf '302a300506032b6570032100' | xxd -r -p; cat "$TMP/pub.raw"; } > "$TMP/pub.der"
  if ! openssl pkey -pubin -inform DER -in "$TMP/pub.der" -out "$TMP/pub.pem" 2>"$TMP/ossl.err"; then
    err "openssl could not read the public key: $(cat "$TMP/ossl.err")"
  elif openssl pkeyutl -verify -pubin -inkey "$TMP/pub.pem" -rawin -in "$MANIFEST" -sigfile "$TMP/sig.bin" >/dev/null 2>&1; then
    ok "signature verified with the public key from $PUB_SOURCE"
  else
    err "latest.json.sig does NOT verify with the public key from $PUB_SOURCE. The updater would reject this release."
  fi
elif [ $PUB_OK = 0 ] && [ -z "$PUBLIC_KEY" ]; then
  warn "no public key found: the signature was not verified cryptographically"
elif [ $PUB_OK = 1 ]; then
  warn "OpenSSL 3 and xxd are needed to verify the signature (Git for Windows includes both): not verified cryptographically"
fi

[ $ERRORS = 0 ] || die "$ERRORS asset check(s) failed; fix the build (see FAIL lines above)"

# ---------------------------------------------------------------------------------------------- 2. notes

step "Release notes"
CHANGELOG="$ROOT/CHANGELOG.md"
TMPDIR_PUB="$ROOT/.publish-tmp"
NOTES_OUT="$TMPDIR_PUB/notes-$TAG.md"
STAMP=0
TODAY="$(date -u +%Y-%m-%d)"
if [ -n "$NOTES_FILE" ]; then
  [ -f "$NOTES_FILE" ] || die "notes file not found: $NOTES_FILE"
  cp "$NOTES_FILE" "$TMP/notes.md"
  ok "using $NOTES_FILE"
else
  [ -f "$CHANGELOG" ] || die "CHANGELOG.md not found in $ROOT"
  head_line="$(tr -d '\r' < "$CHANGELOG" | grep -F -m1 "## [$VERSION]" || true)"
  [ -n "$head_line" ] || die "CHANGELOG.md has no section '## [$VERSION]'. Add one (Keep a Changelog format) or pass --notes-file."
  tr -d '\r' < "$CHANGELOG" | awk -v h="## [$VERSION]" '
    index($0, h) == 1 { on = 1; next }
    on && (/^## \[/ || /^\[[^]]+\]:[ \t]*https?:\/\//) { exit }
    on { print }' > "$TMP/notes.md"
  # trim leading/trailing blank lines
  awk 'NF {found=1} found' "$TMP/notes.md" | awk '{ lines[NR]=$0 } NF { last=NR } END { for (i=1;i<=last;i++) print lines[i] }' > "$TMP/notes.trim"
  mv "$TMP/notes.trim" "$TMP/notes.md"
  [ -s "$TMP/notes.md" ] || die "the CHANGELOG.md section '## [$VERSION]' is empty"
  case "$head_line" in *Unreleased*) STAMP=1 ;; esac
  ok "CHANGELOG.md section '$head_line' ($(wc -l < "$TMP/notes.md" | tr -d ' ') lines)"
fi
{
  printf '\n\n---\n\n**Downloads:** `%s` (installer, recommended) or `%s` (portable). ' "$INSTALLER" "$PORTABLE"
  printf 'Check them against `SHA256SUMS.txt`. Installed copies of Kadr update themselves'
  if [ $IS_PRE = 1 ]; then printf ' when the **Beta** channel is selected (Settings \xe2\x86\x92 Updates).\n'
  else printf ' (Settings \xe2\x86\x92 Updates).\n'; fi
} >> "$TMP/notes.md"
[ $STAMP = 1 ] && info "the heading will be stamped: '## [$VERSION] - $TODAY'"

# ---------------------------------------------------------------------------------------------- 3. preflight

step "Preflight (git, gh)"
if ! have git; then [ $DRY_RUN = 1 ] && warn "git not found" || die "git not found"; fi
if ! have gh; then [ $DRY_RUN = 1 ] && warn "GitHub CLI (gh) not found" || die "GitHub CLI (gh) not found: https://cli.github.com"; fi
if have git; then
  # The release repo must be its OWN repository (it may live inside the source tree, which is another repo).
  if ! prefix="$(git -C "$ROOT" rev-parse --show-prefix 2>/dev/null)"; then
    [ $DRY_RUN = 1 ] && warn "$ROOT is not a git repository" || die "$ROOT is not a git repository; run 'git init -b main' there (see scripts/first-time-setup.md)"
  elif [ -n "$prefix" ]; then
    top="$(git -C "$ROOT" rev-parse --show-toplevel)"
    [ $DRY_RUN = 1 ] && warn "$ROOT is not its own git repository (it is inside $top); git steps would be refused" ||
      die "$ROOT is not its own git repository (it is inside $top); run 'git init -b main' there (see scripts/first-time-setup.md)"
  else
    branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
    if [ "$branch" = main ]; then ok "branch main"
    elif [ $DRY_RUN = 1 ]; then warn "current branch is '$branch', expected 'main'"
    else die "the release repo must be on branch 'main' (now '$branch')"; fi
    if origin="$(git -C "$ROOT" remote get-url origin 2>/dev/null)"; then
      case "$origin" in *"$REPO"*) ok "origin $origin" ;; *) warn "origin is $origin, which does not look like $REPO" ;; esac
    elif [ $DRY_RUN = 1 ]; then warn "no 'origin' remote yet (see scripts/first-time-setup.md)"
    else die "no 'origin' remote; see scripts/first-time-setup.md"; fi
  fi
fi
if [ $DRY_RUN = 1 ]; then
  dry "gh auth status; gh release view $TAG --repo $REPO (must not exist)"
else
  gh auth status >/dev/null 2>&1 || die "gh is not logged in; run 'gh auth login'"
  ok "gh authenticated"
  if gh release view "$TAG" --repo "$REPO" --json tagName >/dev/null 2>&1; then
    die "release $TAG already exists in $REPO; bump the version or delete that release first"
  fi
  ok "release $TAG does not exist yet"
fi

# README media referenced under assets/
missing=()
count=0
while IFS= read -r m; do
  [ -n "$m" ] || continue
  count=$((count + 1))
  if [ ! -e "$ROOT/$m" ] && ! { [ "$m" = assets/logo.svg ] && [ -f "$SOURCE/build/brand/logo.svg" ]; }; then missing+=("$m"); fi
done < <(grep -oE '["(]assets/[A-Za-z0-9._/-]+' "$ROOT/README.md" | cut -c2- | sort -u)
if [ ${#missing[@]} -gt 0 ]; then
  msg="README.md references missing media: $(printf '%s, ' "${missing[@]}")"; msg="${msg%, }"
  if [ $ALLOW_MISSING_MEDIA = 1 ] || [ $DRY_RUN = 1 ]; then warn "$msg"; else err "$msg (add them, or pass --allow-missing-media)"; fi
else ok "all README media present ($count)"; fi
[ $ERRORS = 0 ] || die "README media missing (see FAIL lines above)"

# ---------------------------------------------------------------------------------------------- 4. repo content

step "Refreshing repository content from the source tree"
if [ -f "$SOURCE/site/index.html" ]; then
  n="$(find "$SOURCE/site" -type f | wc -l | tr -d ' ')"
  if [ $DRY_RUN = 1 ]; then dry "mirror $SOURCE/site -> $ROOT/site ($n files)"
  else
    mkdir -p "$ROOT/site"
    find "$ROOT/site" -mindepth 1 -delete
    cp -R "$SOURCE/site/." "$ROOT/site/"
    ok "site mirrored ($n files)"
  fi
elif [ -f "$ROOT/site/index.html" ]; then
  warn "no site/index.html in the source tree; keeping the existing site/ of the release repo"
else
  err "no website: neither $SOURCE/site nor $ROOT/site contains index.html (the Pages workflow would fail)"
fi

copy_file() { # src dst kind
  local src="$1" dst="$ROOT/$2" kind="$3"
  if [ ! -f "$src" ]; then
    if [ -f "$dst" ]; then warn "$src not found; keeping the existing $2"; else err "$src not found and $2 does not exist"; fi
    return 0
  fi
  if [ $DRY_RUN = 1 ]; then dry "$kind $src -> $2"; return 0; fi
  mkdir -p "$(dirname "$dst")"
  if [ "$kind" = notices ]; then
    {
      printf '# Third-party notices\n\n'
      printf 'Kadr is built with the open-source components listed below. The same text ships with every installation in '
      printf '`licenses\\THIRD_PARTY_NOTICES.txt`.\n\n````text\n'
      tr -d '\r' < "$src" | awk '{ l[NR] = $0 } NF { last = NR } END { for (i = 1; i <= last; i++) print l[i] }'
      printf '````\n'
    } > "$dst"
  else
    cp "$src" "$dst"
  fi
  ok "$2"
}
copy_file "$SOURCE/build/brand/logo.svg" "assets/logo.svg" copy
copy_file "$SOURCE/build/legal/EULA.txt" "LICENSE" copy
copy_file "$SOURCE/build/legal/THIRD_PARTY_NOTICES.txt" "THIRD_PARTY_NOTICES.md" notices
if [ $PUB_OK = 1 ]; then
  key_dst="$ROOT/keys/update-signing.ed25519.pub"
  key_text="$(base64 < "$TMP/pub.raw" | tr -d '\r\n')"
  if [ -f "$key_dst" ] && [ "$(tr -d '\r\n' < "$key_dst")" = "$key_text" ]; then ok "keys/update-signing.ed25519.pub (unchanged)"
  elif [ $DRY_RUN = 1 ]; then dry "write keys/update-signing.ed25519.pub from $PUB_SOURCE"
  else mkdir -p "$ROOT/keys"; printf '%s\n' "$key_text" > "$key_dst"; ok "keys/update-signing.ed25519.pub"; fi
fi
[ $ERRORS = 0 ] || die "repository content is incomplete (see FAIL lines above)"

# ---------------------------------------------------------------------------------------------- 5. commit, push, release

step "Commit and push"
if [ $STAMP = 1 ]; then
  if [ $DRY_RUN = 1 ]; then dry "stamp CHANGELOG.md heading: ## [$VERSION] - $TODAY"
  else
    awk -v h="## [$VERSION]" -v t="## [$VERSION] - $TODAY" 'index($0, h) == 1 && !done { print t; done = 1; next } { print }' \
      "$CHANGELOG" > "$TMP/CHANGELOG.md" && cp "$TMP/CHANGELOG.md" "$CHANGELOG"
    ok "CHANGELOG.md heading stamped with $TODAY"
  fi
fi
if [ $DRY_RUN = 1 ]; then dry "write release notes to $NOTES_OUT"
else mkdir -p "$TMPDIR_PUB"; cp "$TMP/notes.md" "$NOTES_OUT"; fi

run git -C "$ROOT" add -A
if [ $DRY_RUN = 1 ] || [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
  run git -C "$ROOT" commit -m "Release $TAG"
else
  info "nothing to commit"
fi
run git -C "$ROOT" push origin main

step "Create GitHub release $TAG"
rel=(gh release create "$TAG")
for a in "${ASSETS[@]}"; do rel+=("$DIST/$a"); done
rel+=(--repo "$REPO" --target main --title "Kadr $VERSION" --notes-file "$NOTES_OUT")
if [ $IS_PRE = 1 ]; then rel+=(--prerelease); else rel+=(--latest); fi
run "${rel[@]}"

# ---------------------------------------------------------------------------------------------- 6. summary

step "URLs"
info "Release:        $RELEASES/tag/$TAG"
info "Installer:      $RELEASES/download/$TAG/$INSTALLER"
info "Portable:       $RELEASES/download/$TAG/$PORTABLE"
info "Manifest:       $RELEASES/download/$TAG/latest.json"
if [ $IS_PRE = 1 ]; then info "Updater:        pre-release -> offered to the Beta channel (GitHub API releases list)"
else info "Updater:        $RELEASES/latest/download/latest.json"; fi
info "Website:        https://$(printf '%s' "$OWNER" | lower).github.io/$NAME/  (Pages deploy: https://github.com/$REPO/actions)"
info "Repository:     https://github.com/$REPO"

if [ ${#WARNINGS[@]} -gt 0 ]; then
  printf '\n%s%d warning(s):%s\n' "$C_YELLOW" "${#WARNINGS[@]}" "$C_OFF"
  for w in "${WARNINGS[@]}"; do printf '  %s- %s%s\n' "$C_YELLOW" "$w" "$C_OFF"; done
fi
echo
if [ $DRY_RUN = 1 ]; then printf '%sDry run complete: nothing was changed, committed, pushed or published.%s\n' "$C_GREEN" "$C_OFF"
else printf '%sPublished Kadr %s.%s\n' "$C_GREEN" "$VERSION" "$C_OFF"; fi
