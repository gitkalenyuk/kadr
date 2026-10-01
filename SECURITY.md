# Security policy

## Supported versions

Security fixes are released for:

| Version | Supported |
|---|---|
| The latest **stable** release | Yes |
| The latest **pre-release** (beta) | Yes |
| Anything older | No. Please update (**Settings → Updates → Check now**) |

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report them privately through GitHub:
**[Security → Report a vulnerability](https://github.com/gitkalenyuk/kadr/security/advisories/new)**.

Please include:

- the Kadr version (**Settings → About**) and your Windows version;
- what an attacker can do, and the conditions it requires (local user, another app on the same PC, a malicious
  project or media file, a malicious update server, and so on);
- steps to reproduce, or a proof of concept;
- whether the issue is already public.

What to expect:

- an acknowledgement within **5 working days**;
- an assessment and a planned fix date within **14 days** for confirmed issues;
- a fixed release delivered through the auto-updater, with a GitHub security advisory that credits you (unless you
  prefer not to be named).

Kadr is a free project, so there is no bug bounty. We are grateful for every responsible report.

### In scope

- The Kadr desktop app, `kadr-server.exe`, `kadr-mcp.exe`, `kadrctl.exe`, the installer and the uninstaller
- The auto-updater and the release signing scheme described below
- The local REST/WebSocket API: authentication, origin checks, path handling and the import of untrusted
  project or media files
- The website at <https://gitkalenyuk.github.io/kadr/>

### Out of scope

- Vulnerabilities in FFmpeg, Python packages, Whisper or matting models, or other third-party software you
  installed yourself. Please report those upstream. Tell us if Kadr makes them exploitable.
- Attacks that require an administrator, or full control of the user's account, on the machine running Kadr
- Windows SmartScreen warnings about unsigned installers. This is a known limitation (see below).
- Actions an AI agent performs through MCP after the user connected it. Agents act with the user's permissions by
  design.

## How updates are protected

Kadr updates itself from the releases of this repository. Every release contains:

| Asset | Purpose |
|---|---|
| `Kadr-Setup-X.Y.Z-x64.exe` | The installer |
| `Kadr-X.Y.Z-windows-x64-portable.zip` | The portable build |
| `SHA256SUMS.txt` | SHA-256 hashes of the installer and the zip |
| `latest.json` | Update manifest: version, channel, release notes, minimum supported version, and the installer's URL, **SHA-256** and size |
| `latest.json.sig` | Base64 **Ed25519** signature of the exact bytes of `latest.json` |

The updater:

1. downloads `latest.json` and `latest.json.sig` over HTTPS from GitHub (stable channel:
   `releases/latest/download/…`; the beta channel also considers pre-releases from the GitHub releases API);
2. **verifies the Ed25519 signature** with the public key compiled into Kadr, and rejects the manifest if it does
   not verify;
3. ignores versions that are not newer than the installed one;
4. downloads the installer and **verifies its SHA-256** against the signed manifest, rejecting any mismatch;
5. only then runs the installer silently (`/VERYSILENT … /RELAUNCH`). The installer upgrades in place and keeps user
   data.

The private signing key never leaves the maintainer's release machine and is never stored in any repository.
Builds made without the public key (development builds) never install updates: they only offer a link to the
download page.

> **Known limitation.** The installer and the executables are not yet signed with an Authenticode certificate, so
> SmartScreen may warn on first download. The update path does not rely on Authenticode: it relies on the Ed25519
> signature and SHA-256 above. Authenticode signing is on the roadmap.

## How the FFmpeg download is protected

Kadr does not ship FFmpeg. When you choose **Download now** on first launch (`tools.install_ffmpeg`), Kadr downloads
the BtbN GPL build of FFmpeg 7.1 for Windows x64 over HTTPS from GitHub. It checks the archive's SHA-256 against the
`checksums.sha256` file of the same BtbN release and deletes the download on any mismatch. It then extracts only
`ffmpeg.exe` and `ffprobe.exe` into `%LOCALAPPDATA%\Kadr\tools\ffmpeg\bin`. If you prefer, install FFmpeg yourself
and choose its folder instead (`tools.set_ffmpeg_dir`).

## Verifying a release by hand

### Hashes

```powershell
Get-FileHash .\Kadr-Setup-0.1.0-beta.1-x64.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

The two hashes must be identical.

### Manifest signature

The Ed25519 public key (base64 of the raw 32-byte key) is published in this repository as
[`keys/update-signing.ed25519.pub`](keys/update-signing.ed25519.pub) once the first signed release is out. With
OpenSSL 3 (included with Git for Windows) in Git Bash:

```bash
# 1. Convert the raw public key into a PEM file (the hex is the fixed DER prefix for Ed25519 public keys)
{ printf '302a300506032b6570032100' | xxd -r -p; base64 -d < update-signing.ed25519.pub; } > kadr-pub.der
openssl pkey -pubin -inform DER -in kadr-pub.der -out kadr-pub.pem

# 2. Decode the signature and verify it against the exact latest.json bytes
base64 -d < latest.json.sig > latest.json.sig.bin
openssl pkeyutl -verify -pubin -inkey kadr-pub.pem -rawin -in latest.json -sigfile latest.json.sig.bin
# → "Signature Verified Successfully"
```

Then check that the `sha256` of the installer in `latest.json` matches the file you downloaded.

## The local API

- The API listens on **`127.0.0.1:7777`** (loopback only). Change it with `KADR_ADDR`.
- Every request needs the token from **`%APPDATA%\Kadr\api-token`**, a random 192-bit value created on first
  run inside your user profile. Send it as `Authorization: Bearer <token>`. WebSocket clients, which cannot set
  headers, pass it as `?token=`.
- Cross-origin requests are accepted from loopback origins only.
- To revoke every client's access, delete `api-token` and restart Kadr. A new token is generated, and `kadr-mcp` and
  `kadrctl` pick it up automatically.
- `kadr-mcp.exe` talks only to this local API. An MCP client connected to it can do anything the editor can, including
  deleting projects, so connect only agents you trust.
