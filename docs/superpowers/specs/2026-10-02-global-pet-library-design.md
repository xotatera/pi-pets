# Global Pi Pet Library — design

## Intent

Replace the single-pet, destructive import flow with a global managed library. Users can import ZIPs or directories, retain multiple pets, switch immediately, and reuse their selection across all Pi projects and sessions. The user approved managed copies rather than links to source directories. Hyphenated commands remain the convention.

## Current state and preservation

The current importer copies into tracked `assets/`, overwriting the original Pi, and does not update its in-memory frame library. The working tree now contains modified bundled PNGs/manifest from that import plus untracked user-provided ZIPs and `pets/` directories including Pi and other pet exports. Preserve those user files. Before restoring tracked bundled assets from the known original commit `d85a2d7`, stage a verified copy of the currently modified artwork into the managed library; do not silently lose it. The immutable bundled Pi must remain separately selectable and must never be an import destination.

## Storage and selection

Resolve storage relative to Pi's effective user configuration directory, honoring `PI_CODING_AGENT_DIR` rather than assuming only `~/.pi/agent`. Use `<config-dir>/pi-pets/library/<id>/` for each normalized pet, `<config-dir>/pi-pets/selection.json` for the global selected ID, and private temporary staging directories under `<config-dir>/pi-pets/`.

Each imported pet has a filesystem-safe opaque ID, a bounded display name, and metadata identifying its schema version. Untrusted names never become paths. Bundled Pi has a reserved ID and cannot be overwritten. Library listing includes bundled Pi and every valid managed entry; invalid entries produce a warning and are not selectable. Names resolve case-insensitively when unique; ambiguous names require the picker or an exact ID. Duplicate names require user confirmation before replacing an imported pet; declining preserves all existing data. Confirmed replacement retains the target's ID and uses staged promotion/rollback so failed replacement does not destroy its previous version.

Persist selection with an atomic write after validating/loading the target. Switch the current widget immediately, retaining agent state and configuration; dispose the previous renderer/timer before replacement. Future session starts load global selection. If selection is malformed, missing, or refers to an unavailable/corrupt pet, show a warning and use bundled Pi. Configuration remains in its existing session-entry mechanism; this feature changes global pet selection, not configuration scope.

## Import formats and normalization

`/pet-import <path>` accepts a directory or ZIP file. Resolve relative command paths against command context cwd. Support:

1. The extension's existing format: `manifest.json` lists the seven states' ordered relative PNG paths and per-frame SHA-256 digests; PNGs live at `<state>/<nn>.png`.
2. Original exported artwork: `manifest.json` describes spritesheet rows and counts, with separate PNG files under `frames/<state>/<nn>.png`, as in the supplied Pi and original-format pet exports. Verify declared cell dimensions and required row counts against the expected animation contract; verify spritesheet hash when the export declares it. A spritesheet-only package without individual frames is not supported in this release and receives a specific explanation.

The runtime contract remains seven states: idle 6, running 6, waiting 6, review 6, failed 8, jumping 5, waving 4; each frame is 192 × 208. Normalize both formats to a versioned managed package containing metadata, the required PNGs, their ordered paths, and per-frame SHA-256 digests. Unused look directions, previews, and movement variants are not installed. ZIPs may contain the package at the root or inside one enclosing directory; reject ambiguous multiple package roots. Do not require Python or a subprocess for user-facing import/export.

Validate before promoting a staged package. Reject absolute/parent-traversal paths, symlinks, duplicate ZIP entries, unsupported schemas, wrong frame counts/dimensions, invalid PNGs, and digest mismatches. Enforce finite limits: ZIP input 32 MiB, at most 256 entries, at most 64 MiB total uncompressed data, manifest 64 KiB, each required PNG 1 MiB. Use bounded PNG integrity validation for original frames without trusted per-frame hashes, then compute hashes for normalized storage. Never recursively copy unvalidated source files. Delete only staging directories created by this operation; leave source ZIPs/directories untouched. Import adds a pet but does not silently change selection; report its name/ID and how to switch.

## Commands

- `/pet-import <zip-or-directory>`: validate, normalize, install in global library; handle collision confirmation; report actionable errors.
- `/pet-list`: show imported pets plus bundled Pi with names/IDs and the active selection.
- `/pet-switch [name-or-id]`: choose the matching pet or present a picker when no argument is supplied; refresh immediately and persist globally.
- `/pet-export [path]`: create a portable ZIP for the currently selected pet, including metadata and normalized frames. Default to a sanitized pet-name ZIP in context cwd. Confirm before replacing an existing destination; avoid overwriting source/library files.

Existing `/pet`, manual interactions, `/pet-config`, and prompt-only `/pet-create` remain available. Update `/pet-create` instructions to produce a supported original export with individual frames or a normalized package, stage outside the immutable bundled assets, and tell users to import/switch explicitly. Do not add capability detection.

## Architecture and failure boundaries

Separate bounded archive I/O/format normalization, managed library/selection persistence, and Pi command/lifecycle wiring. Reuse frame validation for runtime loading and exports. Keep UI confirmations in the adapter, not filesystem modules. Display the actual selected pet name in the widget instead of hardcoded Pi; state transitions remain independent of the selected artwork. Generation/session guards prevent late async loads from replacing a newer session or selection.

No prompts, tools, or model behavior change except the existing explicitly invoked creation prompt. No automatic external downloads or publication. Handle filesystem permission and malformed-package failures with notifications rather than crashing Pi. Preserve the current selected pet on failed import/switch/export. Global reads/writes across concurrent Pi processes must not silently clobber library entries; use exclusive filesystem reservations for mutations and fail with a retryable message on contention. Selection writes are atomic; the last successful explicit switch wins.

## Verification

Use test-first unit/integration checks for root/wrapped ZIP and directory imports in both formats, bounded invalid inputs, ZIP traversal/symlinks/duplicates/bombs, PNG corruption, duplicate-name cancellation/replacement, atomic rollback, managed copies surviving removal of source, and global selection using isolated config directories. Test that import never alters bundled assets or selects silently; switching updates frames/name without reload while keeping activity/configuration; missing selection falls back safely. Verify export/re-import round trips and overwrite cancellation. Run the complete suite and strict typecheck; inspect package contents for archive dependency inclusion without user archives. Run bounded Pi startup/switch/shutdown smoke tests without model requests; report actual graphics appearance as unverified unless inspected in a compatible terminal.
