# Pi Pets

An animated companion for the **Pi terminal agent**. Bundled Pi is an original coral, blue, and gold mascot. Import other pets into a global library, switch instantly, and keep your selection across projects.

## Install

Install the published Pi package (Node.js 22.19.0+):

```sh
pi install npm:pi-pets@0.1.0
```

Alternatively install from Git, or try the local checkout:

```sh
pi install git:github.com/xotatera/pi-pets
pi --extension ./index.ts
```

Run `/reload` after installation or updates. The widget stays above the editor by default; `/pet` toggles it.

## Pet library commands

```text
/pet-import /path/to/pet-export.zip
/pet-import /path/to/pet-directory
/pet-import-source
/pet-import-source codex-cli
/pet-list
/pet-switch
/pet-switch Pi
/pet-switch <name-or-id>
/pet-delete [name-or-id]
/pet-export /path/to/my-pet.zip
```

- **Import** validates and stores a managed copy; it does not switch automatically. Moving/removing the source afterward is safe. Duplicate imported names require confirmation before replacement; bundled Pi cannot be replaced.
- **Offline Codex CLI import (Linux only):** `/pet-import-source` opens a picker of CLI custom pets (`$CODEX_HOME/pets`), legacy avatars (`$CODEX_HOME/avatars`) and built-ins whose artwork is cached under `$CODEX_HOME/cache/tui-pets/v1/assets`. `$CODEX_HOME` defaults to `~/.codex`. Uncached built-ins appear but cannot be imported until Codex caches them. Pi does not start Codex or download artwork. Importing does not follow the CLI's selected pet; use `/pet-switch` afterward. ChatGPT cloud pets, official desktop-app stores, linked profile/sync, macOS and Windows source discovery are not supported yet.
- **Switch** accepts an exact ID or a unique case-insensitive name. No argument opens a picker. It refreshes immediately without `/reload` and preserves current activity/configuration.
- **Delete** removes a managed pet by exact ID or unique name; no argument opens a picker. Confirmation is required. Bundled Pi cannot be deleted, and original imported files are never removed. If the deleted pet was selected, Pi becomes the global selection before its managed copy is removed.
- **Export** writes the selected pet as a portable ZIP. Without a path, it uses a safe pet-name filename in the current project. Existing destinations require confirmation. Library/bundled storage and recorded import sources are protected even when overwrite is confirmed.

Storage is global under `~/.pi/agent/pi-pets/` (or `$PI_CODING_AGENT_DIR/pi-pets/`):

- `library/<id>/` — separate validated pet copies
- `selection.json` — selected pet, shared across projects/sessions

Imported entries also retain local-only `source.json` provenance so exports cannot overwrite their source ZIPs, referenced spritesheets, or files inside their source directories. Replacements retain that source history. Source paths are never included in exported ZIPs. Legacy entries without provenance need re-importing from the original source to register this protection.

Bundled Pi stays in the extension's assets and is always selectable. Missing/corrupt selection falls back to Pi with a warning. Imports/replacements and final export promotion share an exclusive reservation. Concurrent operations report a retryable library-busy error rather than overwriting another session's work or bypassing source protection.

## Supported imports

Directories and ZIPs may use either:

1. **Original export:** `manifest.json` with `sprite_version: 2`, animation rows/counts and 192×208 cell dimensions, plus individual PNGs at `frames/<state>/<nn>.png`. A declared spritesheet must be present and match its declared SHA-256.
2. **Portable normalized package:** `manifest.json` with ordered frame paths and per-frame SHA-256 digests, PNGs at `<state>/<nn>.png`, and optional `metadata.json` (`schemaVersion: 1` or `2`, display `name`). Version 1 keeps the fixed counts below; version 2 supports 1–256 frames per state and at most 256 total frames.

ZIPs can have files at the root or in one enclosing folder. For `/pet-import`, spritesheet-only packages are not supported: export individual frames too. `/pet-import-source` instead converts already-local Codex CLI PNG/WebP spritesheets into canonical portable frames. The original source is never changed.

Version 1 and original-export required states/counts: idle 6, running 6, waiting 6, review 6, failed 8, jumping 5, waving 4. Version 2 requires all seven states but permits variable-length tracks. Each frame must be a valid 192×208 noninterlaced 8-bit RGB/RGBA PNG. Import checks dimensions, PNG CRC/compression integrity, frame order and hashes; paths, symlinks and ambiguous package roots are rejected.

Limits: ZIP input 32 MiB, 258 entries (up to 256 frames plus manifest and metadata), 64 MiB total uncompressed data, 64 KiB manifest, 1 MiB per required frame. Offline Codex source discovery is bounded to 256 candidates, 64 KiB per manifest, 16 MiB compressed spritesheet, 16 million decoded pixels and 256 source cells. Standard unencrypted stored/deflate ZIPs are supported, not ZIP64 or multipart archives. User-facing import/export needs no Python, external program or model call.

## Interactions and configuration

| Command | Action |
| --- | --- |
| `/pet` | Toggle visibility |
| `/pet-wave` | Wave |
| `/pet-jump` | Jump |
| `/pet-feed` | Feed notification and jump |
| `/pet-play` | Play notification and wave |
| `/pet-config` | Speed, height, placement, default visibility, reaction durations |
| `/pet-create [description]` | Confirm conditions, then send the current model a creation prompt |

Configuration is stored in **Pi session entries**, not globally. Global persistence applies to the pet library and selection. `/pet-create` does not inspect capabilities: its prompt requires image input and an image-generation capable model or loaded image-generation tool. Generated artwork must be staged outside bundled/library storage, approved, imported, and explicitly selected.

Between turns the pet idles. It runs during work, briefly reviews successful tools, waits for blocking extension dialogs, reacts to failures, and jumps on completed runs without recorded tool errors. Overlapping tools and continuations preserve activity/error state. Pi 1.0.0 does not expose a final abort-aware outcome for cancellation during a before-settle handler; that edge case can still show a completion reaction.

## Terminal support

- **Kitty-compatible graphics:** Kitty, Ghostty, WezTerm; animated PNGs via Pi's image component.
- **iTerm2:** inline images in regular screen, compact text in fullscreen to avoid unsupported placement cleanup.
- **Other terminals, missing art, very narrow layouts:** readable pet-name/state fallback. Multiplexers may affect Pi's capability detection.
- Print/JSON/RPC modes create no widget or animation timer.

The widget does not capture keyboard input or alter prompts/tools. Animation defaults to 5 FPS and stops on hide, shutdown and reload. Graphical appearance depends on the terminal; protocol smoke testing is not visual verification.

## Development

Node.js 22.19+, npm, and Python 3 for the development-only legacy extraction tests:

```sh
npm install --ignore-scripts
npm test
npm run typecheck
npm pack --dry-run
```

To regenerate **bundled Pi** frames, place the original `Pi-export.zip` in the project root and run `npm run assets:extract`. Regeneration needs Python 3; runtime import/export does not. The `sharp` decoder is lazily loaded only for offline Codex import; a missing native binary does not break existing bundled/managed pets. Private imported pet ZIPs/directories and source fixtures must not be committed or published.

## Artwork and rights

Bundled Pi uses coral `#F09082`, blue `#4D9ABF`, and gold `#F1BE58`. The original code and bundled Pi artwork in this repository are licensed under MIT; see [LICENSE](LICENSE). This grant does **not** cover other people's artwork or pets you import. Imported artwork remains user-managed and is not included in the published package; respect its authors' rights.
