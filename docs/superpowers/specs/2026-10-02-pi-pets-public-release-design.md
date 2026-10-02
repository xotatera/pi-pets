# Pi Pets Public Release — Design

## Intent and authorization

Publish Pi Pets as a public GitHub repository and an npm-distributed Pi package eligible for the Pi package gallery. The owner confirms they are authorized to grant downstream reuse and redistribution rights for bundled Pi artwork and chooses MIT for **both code and bundled original Pi assets**, with `xotatera` as copyright holder. This authorization does not extend to user-imported pets or third-party dependencies. Do not copy private artwork, credentials, settings or local source archives into either public channel.

Target GitHub repository: `xotatera/pi-pets`, public. Target npm package: unscoped `pi-pets@0.1.0` (existing package name/version; registry lookup returned not found at design time, subject to race). npm and GitHub read-only account checks returned `xotatera`. Pi's package docs say `pi-package` makes a published npm package **eligible** for its gallery; discovery/listing timing is outside this project. Git-only installation remains an alternative but does not replace requested npm publication.

## Package and documentation

Add standard MIT `LICENSE` with copyright 2026 xotatera. Declare `license: "MIT"` in `package.json`, add canonical `repository`, `homepage` and `bugs` metadata for the public repository, and keep `pi.extensions` targeting `./index.ts`, Node.js >=22.19.0, runtime dependencies (`fflate`, `sharp`), host-provided Pi peer dependencies and `pi-package` keyword unchanged. Preserve `assets/` in the package allowlist and include `LICENSE` explicitly or via npm's mandatory-file rule; inspect `npm pack --dry-run` for every bundled Pi frame, manifest and license. Update README, `AGENTS.md` and `CONTRIBUTING.md` to replace now-stale rights-unresolved language: MIT covers repository code and bundled original Pi art, not imported pets. README should provide npm/git Pi installation commands with exact package/repo names. Do not claim linked ChatGPT/desktop/cloud discovery works or that gallery indexing is guaranteed.

A public-source audit must inspect *tracked* GitHub files and the npm tarball list for private paths/material before any push. Local `.git/info/exclude`, `.biomem`, `.ws.toml`, user artwork, Codex/ChatGPT data and authentication files remain outside tracked history and package. Do not print credentials or registry tokens; no generated fixtures with third-party artwork. Run `npm test`, `npm run typecheck` and `npm pack --dry-run` after metadata/doc changes, with fresh outputs.

## Release sequence and verification

1. Add licensing/metadata/docs, inspect tracked-file privacy and npm contents, run tests/typecheck/pack and commit. No public side effect before these pass.
2. Confirm public repository name does not already exist and GitHub authenticated identity is `xotatera`; create `xotatera/pi-pets` public and push `main` without force. Verify public `main` points to expected commit. Do not push unpublished source ZIPs or local-only files.
3. Confirm npm identity `xotatera` and package name/version availability; run `npm publish --dry-run`, inspect packed assets/LICENSE, then publish `pi-pets@0.1.0` publicly. Registry versions are immutable; if an interactive OTP/passkey challenge is required, let the owner complete it in their own terminal without posting codes/tokens, then verify registry state. Do not retry a potentially successful publish blindly.
4. Check registry metadata and installability via Pi's documented `npm:` source, using a temporary isolated HOME/settings rather than modifying the owner's Pi configuration. Optionally add a Git tag matching the published version only after registry success and with a non-force push; do not create a release with inconsistent package contents.

## Failure boundaries

- If public-source or rights audit fails, stop before repository creation or npm publication. If GitHub creation/push succeeds but npm publish is blocked, report the repository URL and exact unpublished state; do not claim gallery presence.
- If publish returns an ambiguous failure, query registry before retrying. If publication succeeds but installation verification fails, do not republish the same version; report failure and prepare a later version instead.
- Public GitHub and npm distribution cannot be undone simply by deleting local files. Neither route changes unrelated external clones or the owner's Pi settings. No `npm login`/2FA secrets are requested in chat.
