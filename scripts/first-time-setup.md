# First-time setup of the public repository `gitkalenyuk/kadr`

This is a one-time runbook for the integrator. It turns the local `release-repo/` folder into the public,
**binaries-only** GitHub repository with releases, a README and the GitHub Pages site. No source code is ever pushed
here.

All commands run in **PowerShell** from the source tree root (`owncapcutapi\`) unless noted otherwise. They need
[GitHub CLI](https://cli.github.com) logged in as **gitkalenyuk**.

> Nothing in this file has been executed yet. Do each step deliberately, after the owner has confirmed the release.

---

## 0. Prerequisites

```powershell
gh auth status                       # must show the gitkalenyuk account
gh auth refresh -s workflow          # pushing .github/workflows/* needs the "workflow" scope
git -C release-repo log --oneline    # the local repo already has an initial commit on "main"
git -C release-repo status           # must be clean
```

`release-repo\` is its **own** git repository nested in the source tree. The source repo ignores it
(`/release-repo/` in its `.gitignore`), so its files never end up in the source history, and vice versa.

Back up the update-signing key **now**: `%APPDATA%\Kadr-release\signing.key`. Without it you can never ship an
update that installed copies accept. Store it offline, in a password manager or on an encrypted drive, and never in a
repository.

## 1. Fill in the content that does not exist yet

| Item | Where | Status / how |
|---|---|---|
| Logo | `assets/logo.svg` | Copied from `build/brand/logo.svg`. `publish` refreshes it on every release |
| EULA | `LICENSE` | Copied from `build/legal/EULA.txt`. **It is a template: the owner must review it** (publisher name, governing law, contact) |
| Third-party notices | `THIRD_PARTY_NOTICES.md` | Generated from `build/legal/THIRD_PARTY_NOTICES.txt` (the release tool regenerates that file on every build, and `publish` refreshes this copy). **It is a template too: the owner must review it** |
| Update public key | `keys/update-signing.ed25519.pub` | Copied from `internal/update/pubkey.go`. `publish` keeps it in sync and verifies `latest.json.sig` against it |
| Website | `site/` | Copied by `publish` from `site/` of the source tree (see step 2) |
| README media | `assets/*` | **Must be made.** See the table below |

### README media to drop into `assets/`

| File | Content | Format |
|---|---|---|
| `assets/screenshot-editor.png` | The full editor with a real project open: library, player showing a nice frame, inspector, a busy timeline with text, stickers, a transition badge and captions | PNG, 2400×1500 or 1920×1200, at most 1.5 MB (use `oxipng`/`pngquant`) |
| `assets/demo-agent.gif` | Split screen: Claude Desktop (or Claude Code) on one side, Kadr on the other. The agent creates a 9:16 project, imports clips, runs `captions_auto` and `preview_contact_sheet`, and clips appear live on the timeline | GIF or animated WebP, 960 px wide, 10–15 fps, 8–15 s, at most 5 MB |
| `assets/demo-editing.gif` | Manual editing: split with `Ctrl+B`, drag a transition onto a cut, apply a text template, move a clip on the canvas | Same as above |
| `assets/demo-captions.gif` | Auto captions with the word-highlight style playing over a talking-head clip | Same as above |
| `assets/contact-sheet-transitions.png` | A grid of transition mid-frames rendered by the engine (`preview.contact_sheet` on a project with one transition per cut). The site team's renders in `site/` can be reused | PNG, 1600 px wide, at most 1.5 MB |
| `assets/social-preview.png` | Repository social card: logo, "Kadr: the video editor your AI agent can drive", a UI crop | PNG, **1280×640**, under 1 MB (used in step 7, not referenced by the README) |

Tools: [ScreenToGif](https://www.screentogif.com/) or ShareX for recordings, then `ffmpeg` to resize:
`ffmpeg -i in.mp4 -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" out.gif`.

GitHub does not play `.mp4` files from repository paths in a README. If you want a real video instead of a GIF, edit
`README.md` on github.com, drag the MP4 into the editor to get a `https://github.com/user-attachments/assets/…` URL,
and put that URL on its own line in place of the `<img>`.

`publish` refuses to publish while README media are missing, unless you pass `-AllowMissingMedia` /
`--allow-missing-media`.

## 2. Put the website in place before the first push

The Pages workflow fails when `site/index.html` is missing, so copy the site into the release repo and commit it:

```powershell
robocopy site release-repo\site /MIR /NFL /NDL /NJH /NJS   # exit codes 0-7 mean success
Copy-Item build\brand\logo.svg release-repo\assets\logo.svg
git -C release-repo add -A
git -C release-repo commit -m "Add website"
```

## 3. Create the repository on GitHub (empty)

```powershell
gh repo create gitkalenyuk/kadr --public `
  --description "Kadr: a CapCut-style video editor for Windows where every action is an API call (REST, MCP for AI agents, CLI). Releases, docs and website. Freeware." `
  --homepage "https://gitkalenyuk.github.io/kadr/" `
  --disable-wiki
```

Then add the topics, which GitHub uses for search and discovery (20 at most):

```powershell
gh repo edit gitkalenyuk/kadr --add-topic "video-editor,video-editing,capcut-alternative,ai-agents,mcp,model-context-protocol,claude,llm-tools,rest-api,openapi,automation,windows,desktop-app,whisper,auto-captions,subtitles,ffmpeg,freeware"
```

Repository features: Discussions on (the issue chooser links to them), no Projects, auto-delete merged branches:

```powershell
gh repo edit gitkalenyuk/kadr --enable-discussions --enable-projects=false --delete-branch-on-merge
```

## 4. Enable GitHub Pages (source: GitHub Actions)

```powershell
gh api -X POST repos/gitkalenyuk/kadr/pages -f build_type=workflow
# If Pages already exists, switch it to Actions instead:
#   gh api -X PUT repos/gitkalenyuk/kadr/pages -f build_type=workflow
```

If GitHub rejects the call because the repository is still empty, do step 5 first and then repeat this step.

## 5. Connect and push

```powershell
git -C release-repo remote add origin https://github.com/gitkalenyuk/kadr.git
git -C release-repo push -u origin main
```

The push starts **Deploy site to GitHub Pages** (`.github/workflows/pages.yml`). Watch it:

```powershell
gh run list --repo gitkalenyuk/kadr --workflow pages.yml --limit 1
gh run watch --repo gitkalenyuk/kadr            # pick the run
gh api repos/gitkalenyuk/kadr/pages --jq .html_url   # → https://gitkalenyuk.github.io/kadr/
```

If the first run failed because Pages was not enabled yet, re-run it after step 4:
`gh workflow run pages.yml --repo gitkalenyuk/kadr`.

## 6. Security, labels and protection

Private vulnerability reporting, which `SECURITY.md` and the issue chooser link to:

```powershell
gh api -X PUT repos/gitkalenyuk/kadr/private-vulnerability-reporting
```

Labels used by the issue forms (`bug` and `enhancement` exist by default):

```powershell
gh label create triage  --repo gitkalenyuk/kadr --color FBCA04 --description "Needs a first look"
gh label create api     --repo gitkalenyuk/kadr --color 5319E7 --description "REST API, MCP, kadrctl"
gh label create updater --repo gitkalenyuk/kadr --color 0E8A16 --description "Installer and auto-update"
```

Protect `main`: no force pushes, no deletion, linear history. Direct pushes by the owner (used by `publish`) stay
allowed:

```powershell
@'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
'@ | gh api -X PUT repos/gitkalenyuk/kadr/branches/main/protection --input -
```

Protect release tags, so a published `v*` tag can't be moved or deleted by accident (disable the ruleset temporarily
if you ever must delete a broken release):

```powershell
@'
{
  "name": "Release tags are immutable",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [ { "type": "deletion" }, { "type": "non_fast_forward" }, { "type": "update" } ]
}
'@ | gh api -X POST repos/gitkalenyuk/kadr/rulesets --input -
```

Optional hardening: allow only GitHub-authored actions (the Pages workflow uses only `actions/*`):

```powershell
gh api -X PUT repos/gitkalenyuk/kadr/actions/permissions -F enabled=true -f allowed_actions=selected
gh api -X PUT repos/gitkalenyuk/kadr/actions/permissions/selected-actions -F github_owned_allowed=true -F verified_allowed=false
```

## 7. Manual settings in the web UI

These have no API, so set them on github.com:

1. **Social preview:** *Settings → General → Social preview → Edit → Upload an image*, using `assets/social-preview.png`
   (1280×640).
2. **About box** (gear icon next to *About* on the repo page): check that the website is set. Tick **Releases**, untick
   **Packages**, and keep **Deployments** to show the Pages deployment.
3. **Discussions:** create the categories *Q&A*, *Show and tell* and *Agent recipes*.
4. Optional: *Settings → General → Releases → Enable release immutability* (if offered), so published assets can't be
   replaced.

## 8. Publish the first release (0.1.0-beta.1, pre-release)

Build the release with the installer team's tool (`task release VERSION=0.1.0-beta.1`). It writes
`dist\0.1.0-beta.1\` with the installer, the portable zip, `SHA256SUMS.txt`, `latest.json`, `latest.json.sig` and
`notes.md`. Then:

```powershell
cd release-repo
.\scripts\publish.ps1 -Version 0.1.0-beta.1 -Dist ..\dist\0.1.0-beta.1 -DryRun   # read every line, fix every FAIL/WARN
.\scripts\publish.ps1 -Version 0.1.0-beta.1 -Dist ..\dist\0.1.0-beta.1
```

From Git Bash: `scripts/publish.sh --dry-run 0.1.0-beta.1 ../dist/0.1.0-beta.1`, then the same without `--dry-run`.

`publish` verifies the assets and the Ed25519 signature, stamps the `CHANGELOG.md` date, mirrors the site, commits,
runs `git push origin main` and `gh release create v0.1.0-beta.1 … --prerelease`, then prints the URLs.

## 9. Check after publishing

- [ ] The release page shows **Pre-release** with 5 assets, and the notes render correctly.
- [ ] `https://gitkalenyuk.github.io/kadr/` is up to date. Its download button finds the pre-release (while only
      pre-releases exist, `releases/latest` returns 404, so the site and the updater must use the releases list).
- [ ] The README badges show `v0.1.0-beta.1` (shields.io caches for a few minutes).
- [ ] Download the installer on a clean Windows VM, go through SmartScreen and run the installer. On first launch,
      check the FFmpeg download offer.
- [ ] An older build on the **Beta** channel finds, downloads, verifies and installs the update.
- [ ] The manifest is reachable:
      `curl.exe -sL https://github.com/gitkalenyuk/kadr/releases/download/v0.1.0-beta.1/latest.json`
- [ ] Issue forms work: *Issues → New issue* shows Bug report, Feature request and the links.

## Later releases

1. Add a `## [X.Y.Z] - Unreleased` section at the top of `CHANGELOG.md` (the release tool reads it for
   `latest.json`, and `publish` reads it for the GitHub release).
2. `task release VERSION=X.Y.Z`.
3. `.\scripts\publish.ps1 -Version X.Y.Z -Dist ..\dist\X.Y.Z -DryRun`, then without `-DryRun`.

Final versions (no `-suffix`) are marked **Latest** and become the stable channel's
`releases/latest/download/latest.json`.
