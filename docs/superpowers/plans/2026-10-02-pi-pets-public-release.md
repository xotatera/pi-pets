# Pi Pets Public Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `xotatera/pi-pets` as a public GitHub repository and `@xotatera/pi-pets@0.1.0` as an npm-distributed Pi extension including MIT-licensed bundled Pi artwork.

**Architecture:** Prepare and verify a self-contained source/package first, then independently gate the public GitHub push and immutable npm publication. If registry publishing requires interactive authorization, stop and let the owner finish it locally; never solicit credentials in chat. Verify the registry artifact and a Pi install in isolated settings afterward.

**Tech Stack:** Node.js >=22.19.0, npm, GitHub CLI, Pi package CLI, TypeScript/node:test.

**Spec:** `docs/superpowers/specs/2026-10-02-pi-pets-public-release-design.md`

## Global Constraints

- Owner authorized MIT for original code and **bundled Pi assets**, copyright 2026 `xotatera`. User-imported pets and third-party dependencies are NOT covered by this project's grant.
- GitHub target is public `xotatera/pi-pets`; npm target is scoped `@xotatera/pi-pets@0.1.0` after npm rejected unscoped `pi-pets` as too similar to `pipe-ts` (403). The owner approved this correction. The `pi-package` keyword makes it eligible for Pi's package gallery, not guaranteed listed.
- Before any public push or npm publish, audit all tracked files and actual npm tarball manifest for credentials/private pet assets; stop if unresolved. No screenshots, source ZIPs, auth data or local library contents.
- Do not print/store tokens, OTPs, login URLs or private artwork in chat or tracked files. No changes to owner's Pi settings during smoke testing.
- Publish only after `npm test`, `npm run typecheck`, `npm pack --dry-run`, and dry-run publish/manifest checks pass. An npm version cannot be overwritten; query registry before any retry.
- No unsupported ChatGPT/desktop/cloud/macOS/Windows claims; preserve existing Pi extension/peer dependency contract and bundled assets.
- Keep publication native in one controlled session. No force push, deleting remote repositories, automated credential setup or license inference. Explicitly report any partial GitHub/npm state.

## Review Focus

- `LICENSE` omitted from npm tarball due to `files` allowlist: assert its path and exact copyright in packed file list (Task 1).
- Built-in art missing from tarball: assert package includes `assets/manifest.json` and every tracked `assets/**/*.png` (Task 1).
- Tracked docs/tests accidentally contain private account files/artwork: check all tracked paths and inspect flagged content without printing credentials before first push (Task 2).
- Repo exists or `origin` changes between checks: abort without overwriting or forcing pushes (Task 2).
- Publish times out after registry accepted version: query registry for `@xotatera/pi-pets@0.1.0` before any retry, never attempt a duplicate publish blindly (Task 3).

## File Map

- Create `LICENSE` (standard MIT text, copyright 2026 xotatera).
- Modify `package.json`, `package-lock.json` as required: license and GitHub repository/homepage/bugs metadata; explicitly include license with bundled assets in package allowlist.
- Modify `README.md`, `AGENTS.md`, `CONTRIBUTING.md`: install commands and updated artwork rights guidance; no unsupported source claims.
- No new release-metadata test: owner explicitly declined it. Audit license, package files and bundled assets directly; run existing tests, typecheck and package dry-run.
- External outputs: public GitHub repo and npm registry package; local Git `origin` and optional version tag after successful publish. Temporary Pi install uses an owned `/tmp/` HOME, removed after verification.

---

### Task 1: MIT Licensing and Release Artifact

**Files:** Create `LICENSE`; modify `package.json`, `package-lock.json` if npm changes root metadata, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`. No release-metadata test per owner decision.

**Interfaces:** Produce clean committed package manifest with `license: MIT`, `repository: https://github.com/xotatera/pi-pets` (npm-compatible object or shorthand), `homepage`, `bugs`, original assets and LICENSE in npm files. The initial `pi-pets@0.1.0` identity was superseded by `@xotatera/pi-pets@0.1.0` before successful npm publication.

- [ ] **Step 1: Record missing release metadata**: direct checks of `LICENSE`, `package.json` and README identify the missing license/repository/install details without adding a test file (owner decision).
- [ ] **Step 2: Confirm the baseline**: inspect the current package metadata/pack content and record which release artifacts need correction before modifying them.
- [ ] **Step 3: Add minimal release metadata and docs**: standard MIT LICENSE; metadata/allowlist in package; refresh README, AGENTS, CONTRIBUTING to reflect owner's art grant. Regenerate lock only if needed. Do not add imported artwork or change extension behavior.
- [ ] **Step 4: Run GREEN** `npm test && npm run typecheck && npm pack --dry-run --json`; parse JSON, check LICENSE, `assets/manifest.json` and all tracked bundled PNGs, no private paths; run `npm publish --dry-run --json` and compare file manifest; inspect `git diff --check` and clean staging list.
- [ ] **Step 5: Commit** `chore: license and prepare Pi Pets public package`; record commit SHA, confirm clean worktree. Obtain fresh read-only release audit before public push if review available; handle blocking findings before external side effects.

### Task 2: Public GitHub Repository

**Files:** Git remote configuration only; no tracked edits after Task 1 except reviewed corrections.

**Interfaces:** Public `https://github.com/xotatera/pi-pets` with `main` matching Task 1's approved commit and no extra tracked/private files.

- [ ] **Step 1: Gate**: `git status --porcelain -uall` empty, one `main`, `git remote -v` empty, authenticated `gh api user --jq .login` is `xotatera` (do not run `gh auth status`), `gh repo view xotatera/pi-pets` confirms absent, tracked-file privacy audit passes. If any fails, stop.
- [ ] **Step 2: Create public repo** with `gh repo create xotatera/pi-pets --public --source=. --remote=origin` (no `--push` in same action). Inspect `gh repo view ... --json visibility,url`, verify origin URL and no unexpected repo contents.
- [ ] **Step 3: Push** `git push -u origin main` without force; verify `git ls-remote origin refs/heads/main` equals local HEAD and public repo visibility. If push fails, keep repo and report partial state rather than recreating it.

### Task 3: Publish npm Package and Verify Pi Installation

**Files:** Update `package.json`, `package-lock.json`, `README.md` and this spec/plan to scoped npm identity after 403; optional Git tag `v0.1.0` only after registry success. No product code edits.

**Interfaces:** npm registry package `@xotatera/pi-pets@0.1.0` with same LICENSE/assets as committed source, installable through Pi `npm:` source. The original unscoped publish returned npm 403 even after interactive authentication; do not retry that name. If npm challenge blocks noninteractive publishing, the owner runs publish locally; no OTP/token enters chat.

- [ ] **Step 1: Gate**: `npm whoami` is `xotatera`, GitHub `main` matches local after scoped metadata push, `npm view @xotatera/pi-pets@0.1.0 version` does not find an existing version; rerun test/typecheck/pack and `npm publish --dry-run --json` to inspect exact 0.1.0 contents. Registry 404 is provisional, not a name-policy guarantee.
- [ ] **Step 2: Publish** scoped package with `npm publish --access public`. If npm requests OTP/passkey in an environment this tool cannot handle, instruct owner to run the same command interactively locally; stop until they report completion, never request codes. If command fails ambiguously, query `npm view @xotatera/pi-pets@0.1.0 version dist.tarball` before retrying; if version exists, treat as published and verify instead of retrying.
- [ ] **Step 3: Verify registry and Pi**: confirm `npm view @xotatera/pi-pets@0.1.0` metadata/license, download/install from public registry into an owned temporary HOME via documented `pi install npm:@xotatera/pi-pets@0.1.0` without touching personal settings; inspect installed package has bundled art and license, and cleanup only that temp HOME. Report gallery **eligibility**, not guaranteed indexing.
- [ ] **Step 4: Optionally tag** only after publication and artifact verification: `git tag v0.1.0` at pushed commit, `git push origin v0.1.0`; check remote tag. Final report GitHub URL, npm version, verification evidence, and any residual gallery/artwork visual risks.
