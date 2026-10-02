# Linux Codex CLI Offline Pet Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import already-local Linux Codex CLI pets, legacy avatars and cached built-ins into Pi's managed pet library without manual export.

**Architecture:** A Linux-only Codex source adapter discovers documented CLI manifests/cache entries and snapshots one selected spritesheet. A bounded lazy image decoder normalizes PNG/WebP spritesheets into portable variable-length frame packages, which are installed through the existing library and command collision/export protections. No background sync, desktop app reader, OAuth, account API, cloud download or macOS/Windows path adapter is added.

**Tech Stack:** TypeScript, Node.js 22.19+, Pi 1.0.0 APIs, node:test/tsx, existing fflate archive handling, `sharp@0.35.5` lazily imported for bounded PNG/WebP decoding.

**Spec:** `docs/superpowers/specs/2026-10-02-linux-codex-offline-import-design.md`

## Global Constraints

- Linux-only `codex-cli` source. ChatGPT cloud pets, linked ChatGPT profile, Codex App/ChatGPT Desktop source readers, OAuth/account settings, macOS and Windows contracts are deferred and must not be implemented.
- Read only documented Codex CLI locations: `$CODEX_HOME` or Linux default `~/.codex`; `pets/<id>/pet.json`, `avatars/<id>/avatar.json`, and `cache/tui-pets/v1/assets/<pinned-built-in-file>.webp`.
- Pi must not start Codex, log in, download missing artwork, call internal/cloud account APIs, scan unrelated home directories, read chats/credentials/databases, or follow CLI-local `tui.pet`.
- Bounds: 256 candidates, 64 KiB manifests, 16 MiB compressed spritesheet input, 16 million decoded pixels, <=256 source cells and <=256 normalized frames. Native cell is 192×208; reject unsupported geometry rather than resizing.
- Portable schema 1 remains fixed-count and backward compatible. Add schema 2 with seven states, canonical `<state>/<nn>.png`, SHA-256 per frame, 1–256 frames/state, <=256 total frames.
- Rendering/controller indexing uses actual selected frame counts; artwork replacement must not reset activity/configuration/visibility.
- Imported source files/dirs are local-only provenance, retained on replacement and omitted from portable exports. Export destination protection runs inside the final existing mutation reservation.
- Imported pets do not switch automatically; normal collision confirmation and generation cancellation apply. Fixtures use synthetic artwork only; no private/user pet names/artwork in Git/npm.
- Continue on existing branch `feat/installed-pets-chatgpt-profile`, no worktree. Do not merge/push/publish without owner choice. One fresh read-only whole-branch review after implementation.

## Review Focus

- A malformed manifest points outside `CODEX_HOME` or through a symlink: discovery may list nothing or an unavailable reason, but snapshot/import must reject without reading arbitrary files (Task 3).
- A tiny compressed image advertises huge dimensions or multipage content: decoder rejects before full allocation and leaves other pet features usable (Task 2).
- Variable-length tracks hit old fixed-count assumptions in controller/widget/export: schema 2 import, render indexing and ZIP round-trip must preserve every frame (Task 1).
- Source file changes after picker but before install: snapshot fingerprint/identity checks reject mixed manifest/artwork; no managed copy appears (Task 3/4).
- Export races against source registration or targets an exact cached built-in file: provenance protection is checked inside the final library mutation lock (Task 4).

## File Map

- `src/pet-package.ts`, `src/state.ts`, `src/widget.ts`, tests: schema 2 variable-track packages and actual frame-count rendering.
- `src/sprite-decoder.ts`, `test/sprite-decoder.test.ts`, `package.json`, lockfile: bounded lazy PNG/WebP spritesheet slicing.
- `src/pet-sources/types.ts`, `src/pet-sources/codex-cli.ts`, `src/pet-sources/index.ts`, `test/pet-sources.test.ts`, synthetic fixtures: Linux Codex CLI discovery and immutable snapshots.
- `src/library.ts`, `src/pet-commands.ts`, command/library/source-protection tests, `README.md`: `/pet-import-source codex-cli`, source provenance kinds, export protection and documentation.

---

### Task 1: Schema 2 Variable Tracks and Render Indexing

**Files:** Modify `src/pet-package.ts`, `src/state.ts`, `src/widget.ts`; tests `test/pet-package.test.ts`, `test/state.test.ts`, `test/widget.test.ts`.

**Interfaces:** Keep `NormalizedPet = { name: string; files: PackageFiles; frames: FrameLibrary }` and `normalizePet()`. `metadata.json` schema 2 uses `schemaVersion: 2`; `manifest.json` retains seven state arrays and `sha256` with variable canonical path counts. Extend `PetController.frame(now: number, counts?: Record<Animation, number>)` with default `frameCounts`; widget derives counts from `frames` once.

- [ ] **Step 1: Write failing tests** for schema 2 tracks lengths 1/3/9 preserving order/bytes through normalize/export/reimport; missing/empty state, 257 total frames, noncanonical paths, bad hashes and unsupported versions reject. Add controller/widget tests where a 9-frame state reaches index 8 and a 1-frame state never exceeds 0. Existing schema 1/original tests stay strict.
- [ ] **Step 2: Run RED command** `npx tsx --test test/pet-package.test.ts test/state.test.ts test/widget.test.ts`; expected: new schema 2/count assertions fail because only schema 1 fixed counts exist.
- [ ] **Step 3: Implement minimal code**: parse schema 2 separately from original/schema 1, validate paths/hashes/PNG frames and total bounds, write schema 2 metadata on normalized output only when input was schema 2, and pass optional counts through controller/widget without changing legacy behavior.
- [ ] **Step 4: Run GREEN command** `npm test && npm run typecheck`; expected PASS.
- [ ] **Step 5: Commit** `feat: support variable-length pet frame tracks`.

### Task 2: Bounded Spritesheet Decoder

**Files:** Create `src/sprite-decoder.ts`, `test/sprite-decoder.test.ts`; modify `package.json` and package lockfile.

**Interfaces:** Export `SpriteDefinition = { name: string; cellWidth: 192; cellHeight: 208; columns: number; rows: number; tracks: Record<Animation, readonly number[]>; fallbackStates?: readonly Animation[] }`; `class SpriteDecoder { decode(bytes: Uint8Array, definition: SpriteDefinition, signal?: AbortSignal): Promise<NormalizedPet> }`. One instance allows one in-flight decode, rejects concurrent decodes with `Sprite decoder is busy; retry`, releases on all outcomes, and returns schema 2 normalized packages.

- [ ] **Step 1: Pin/install `sharp@0.35.5` for fixture generation, then write failing tests** using generated synthetic PNG/WebP grids: track order/duplicates/transparency preserved, idle fallback disclosure tolerated, seven schema 2 states produced. Reject input >16 MiB, metadata/pixels >16 million, multipage/animated images, wrong dimensions for grid/cell, unsupported cell size, out-of-bounds or noninteger indices, >256 source/normalized frames, malformed bytes, unsupported format, cancellation and concurrent decode.
- [ ] **Step 2: Run RED command** `npx tsx --test test/sprite-decoder.test.ts`; expected: missing module or failing decoder tests.
- [ ] **Step 3: Implement minimal code**: lazy-import the pinned sharp dependency from Step 1, metadata preflight with `limitInputPixels: 16000000`, allow PNG/WebP only, reject multipage, crop one decoded static sheet into 192×208 PNGs, build schema 2 manifest/hash files, pass through `normalizePet()`, and clear busy flag in `finally`. Do not change global sharp concurrency.
- [ ] **Step 4: Run GREEN command** `npm test && npm run typecheck`; expected PASS and existing package imports still work if decoder is unused.
- [ ] **Step 5: Commit** `feat: decode Codex pet spritesheets safely`.

### Task 3: Linux Codex CLI Source Adapter

**Files:** Create `src/pet-sources/types.ts`, `src/pet-sources/codex-cli.ts`, `src/pet-sources/index.ts`, `test/pet-sources.test.ts`, synthetic fixtures under `test/fixtures/pet-sources/`.

**Interfaces:** Export `SourceId = 'codex-cli'`; `InstalledPet = { key: string; source: SourceId; name: string; category: 'custom'|'legacy'|'built-in'; cached: boolean; unavailable?: string }`; `PetSnapshot = { key: string; source: SourceId; name: string; definition: SpriteDefinition; bytes: Uint8Array; locations: readonly { path: string; kind: 'file'|'directory' }[]; fallbackStates: readonly Animation[] }`; `new CodexCliSources(options: { home: string; env: NodeJS.ProcessEnv; platform?: NodeJS.Platform })` with `discover(): Promise<{ pets: InstalledPet[]; warnings: string[] }>` and `snapshot(key: string, signal?: AbortSignal): Promise<PetSnapshot>`.

- [ ] **Step 1: Write failing tests** for Linux default home and `CODEX_HOME`, custom `pet.json`, legacy `avatar.json`, pinned built-in catalog with cached/missing assets, 256 candidate cap, 64 KiB manifest cap, invalid JSON/unsupported manifest shape/geometry/fps/fallback/index, traversal and symlink rejection, opaque key handling, source replacement between manifest and artwork, and no image decode during discovery. Include default mapping idle 0/6, running 7/6, waiting 6/6, review 8/6, failed 5/8, jumping 4/5, waving 3/4.
- [ ] **Step 2: Run RED command** `npx tsx --test test/pet-sources.test.ts`; expected: missing source adapter failures.
- [ ] **Step 3: Implement minimal code** with documented roots only, pinned built-in filenames, child-only spritesheet resolution, lstat/realpath checks, stable before/after stats/fingerprint for snapshot, custom track parsing, required idle, optional missing Pi states reusing idle with `fallbackStates`, and per-candidate unavailable messages. Do not read `config.toml` or `tui.pet`.
- [ ] **Step 4: Run GREEN command** `npm test && npm run typecheck`; expected PASS.
- [ ] **Step 5: Commit** `feat: discover Linux Codex CLI pets`.

### Task 4: `/pet-import-source` Command, Provenance and Delivery

**Files:** Modify `src/pet-commands.ts`, `src/library.ts`, `README.md`; extend `test/pet-commands.test.ts`, `test/library.test.ts`, `test/source-protection.test.ts`, package tests.

**Interfaces:** Add `PetLibrary.install(pet, replaceId?, sourcePaths?)` support for source records with `kind: 'file' | 'directory' | 'zip'` while reading old metadata. Add `/pet-import-source [codex-cli]`; with unsupported source names, notify the reduced Linux-only scope. Command discovers candidates, lets user pick, snapshots, decodes via shared `SpriteDecoder`, confirms replacement on name collision, installs through library with source locations, and does not switch selection.

- [ ] **Step 1: Write failing tests** for source command argument validation, picker labels/categories/cache state, missing cache message, successful import without auto-switch, duplicate-name cancel/replace, stale generation cancellation, decoder/source error notification, non-TUI no-op, file/directory provenance retained on replacement, export blocked to exact source file and inside source directory inside final mutation lock, old source metadata still readable, and portable export omits provenance.
- [ ] **Step 2: Run RED command** `npx tsx --test test/pet-commands.test.ts test/library.test.ts test/source-protection.test.ts`; expected: `/pet-import-source`/file-provenance failures.
- [ ] **Step 3: Implement minimal code**: create command-scoped Codex source registry and shared decoder, keep dialogs outside mutation lock, register source locations from snapshot, extend provenance validation/backward compatibility, and re-run export destination checks within `withMutation()` as currently done. No linked profile, no OAuth, no timers. Add a bounded Linux-only integration test with a synthetic Codex source and a real library root to exercise candidate snapshot → decode → install → export, not merely mocked picker results.
- [ ] **Step 4: Update README and verify**: document Linux-only import, `CODEX_HOME`, cached built-ins, no downloads/sync/cloud/desktop support, privacy/artwork rights and deferred macOS/Windows. Run `npm test && npm run typecheck && npm pack --dry-run`; inspect pack output for no fixtures/private temp files and sharp dependency packaging. Run a bounded fixture smoke command if practical; otherwise record fixture-only status.
- [ ] **Step 5: Commit** `feat: import offline Codex CLI pets`. Dispatch one fresh read-only whole-branch review with the Linux spec/plan and exact branch diff; fix Critical/Important findings with RED→GREEN tests once, ledger Minor items, then use finishing branch workflow.
