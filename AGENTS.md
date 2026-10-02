# Working on Pi Pets

Pi Pets is a TypeScript extension for the Pi terminal agent. Read `README.md` for commands and supported imports. `index.ts` registers the extension; `src/` contains state/rendering, package/archive validation, global library and offline Codex CLI source discovery. `test/` uses Node's test runner via `tsx`. `assets/` contains bundled Pi artwork; `docs/superpowers/` holds design decisions and plans.

## Safety boundaries

- Keep bundled Pi assets separate from user-imported pets. Never overwrite or commit user artwork, source ZIPs, credentials, app data, or local pet-library contents.
- Offline discovery is **Linux Codex CLI only** (`$CODEX_HOME` or `~/.codex`). Do not claim desktop-app, cloud, linked-profile, macOS or Windows discovery works. Do not inspect account stores, call internal APIs or download missing artwork.
- Existing ZIP/directory import and Codex spritesheet conversion must preserve size, path, symlink, PNG, hash, and collision checks. Keep local-only source provenance out of exports and protect source destinations inside the final library mutation reservation.
- `/pet-create` prompts for image-generation conditions; it does not detect capabilities or select/import artwork automatically.
- The repository's original code and bundled Pi artwork are MIT-licensed (© 2026 xotatera). This does not cover user-imported pets or third-party artwork; never include another person's artwork in examples/fixtures.

## Changes and verification

- Add focused tests for behavior changes; use original synthetic spritesheets in tests. Preserve normalized schema 1 and original-export compatibility when modifying schema 2.
- Run `npm test`, `npm run typecheck`, and `npm pack --dry-run` before claiming a change is ready. Inspect package contents for private files. Node.js >=22.19.0 is required.
- `.gitignore` contains shared build/credential rules. Before creating scratch work or importing private pets/exports in a fresh clone, configure `.git/info/exclude` for your local-only paths (including `.biomem` and `.ws.toml`) and inspect `git status --short` before staging. Local exclude rules are not shared with contributors.
