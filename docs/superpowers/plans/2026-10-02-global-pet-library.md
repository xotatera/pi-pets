# Global Pi Pet Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely import multiple pets from ZIPs/directories, switch instantly, and remember the selection globally without overwriting bundled Pi.

**Architecture:** A bounded archive adapter feeds a format normalizer; a managed filesystem library owns installation and atomic selection. Pi commands own confirmations, notifications, and widget updates. Keep rendering/activity state independent of archive I/O.

**Tech Stack:** TypeScript, Node.js 22.19+, Pi 1.0.0 APIs, `fflate@0.8.3` for streaming ZIP I/O, Node crypto/zlib for bounded PNG verification, existing tsx/node:test suite.

**Spec:** `docs/superpowers/specs/2026-10-02-global-pet-library-design.md`

## Global Constraints

- Preserve user-provided ZIP archives, all untracked `pets/`, and currently modified artwork before restoring bundled assets from `d85a2d7`.
- Store managed copies under `<config-dir>/pi-pets/library/<id>/`; global selection in `<config-dir>/pi-pets/selection.json`; resolve config-dir using Pi's exported `getAgentDir()`.
- Reserved bundled ID `bundled-pi` is always selectable and never an import/replacement destination. Imported IDs are opaque UUIDs; names are display data only.
- ZIP input 32 MiB; at most 256 entries; at most 64 MiB total uncompressed data; manifest 64 KiB; each required PNG 1 MiB. Enforce limits while streaming, not after unbounded inflation.
- Seven states and counts: idle 6, running 6, waiting 6, review 6, failed 8, jumping 5, waving 4. Every frame is 192 × 208.
- Support normalized format and original exports with individual `frames/` PNGs; no spritesheet-only extraction in this release; reject ambiguous package roots.
- No Python or subprocess needed for user-facing import/export. No automatic networking or capability detection.
- Import never selects silently. Switch loads valid frames before persisting; failed operations preserve current pet. Selection writes atomic; last successful switch wins.
- No automatic merge, publication, or user-file deletion. Commit specific code/docs paths, not user artwork archives or backups.

## Review Focus

- A compressed ZIP lies about output sizes: reject during decompression before excessive allocation (Task 1).
- Two sessions import the same display name concurrently: only one reservation succeeds; no silent replacement (Task 3).
- Session changes while a picker/load is pending: late result must not update the new session's widget (Task 4).
- Importing from inside the managed library or exporting into it must not clobber the source (Tasks 3/4).
- Modified bundled artwork differs from the supplied archive: preserve the actual working copy, not a guessed reconstruction, before restoration (Task 5).

## File Map

- `src/archive.ts`, `test/archive.test.ts`: bounded ZIP/directory reader and ZIP writer.
- `src/pet-package.ts`, `test/pet-package.test.ts`: supported schemas, PNG integrity, normalization and metadata.
- `src/library.ts`, `test/library.test.ts`: managed copies, name/ID resolution, transactional installs, selection.
- `src/pet-commands.ts`, `test/pet-commands.test.ts`: library commands and confirmation flow.
- Modify `src/assets.ts`, `index.ts`, `src/widget.ts`, existing tests: shared validation, lifecycle integration and actual pet label.
- Modify `package.json`, `package-lock.json`, `README.md`: archive dependency and usage.
- Restore `assets/` only after verified preservation in Task 5.

---

### Task 1: Bounded Archive Adapter

**Files:** Create `src/archive.ts`, `test/archive.test.ts`; modify package files.

**Interfaces:** Export `PackageFiles = Map<string, Uint8Array>`; `readPackageFiles(source: string): Promise<PackageFiles>` returns paths relative to the sole package root. Export `writePackageZip(files: PackageFiles): Promise<Uint8Array>` for portable exports. Errors have actionable messages; no filesystem extraction for ZIP reads.

- [ ] **Step 1: Write failing tests**: assert ZIP root/wrapped root and equivalent directories return identical required file bytes; reject parent/absolute paths, symlinks, duplicate entries, two manifest roots, unsupported compression, entry-count limit and oversized declared/actual inflation. Handcraft forged size fixtures independently of the implementation. Directory reads reject symlink ancestors and enforce matching file/count bounds.
- [ ] **Step 2: Run `npx tsx --test test/archive.test.ts`**; expect missing-feature failures, not fixture mistakes.
- [ ] **Step 3: Implement the interfaces** using fflate's streaming `Unzip` API; preflight central-directory paths/attributes and counts, enforce actual inflated-byte budgets in output callbacks, reject unsafe names before materializing data. Directory adapter collects only bounded package files; neither adapter copies to source/bundled paths. Add pinned runtime dependency `fflate@0.8.3`; keep Pi packages host-provided peers.
- [ ] **Step 4: Run `npm test && npm run typecheck`**; record existing baseline failures caused by changed artwork separately, never mask them.
- [ ] **Step 5: Commit** `src/archive.ts`, its tests and package files as `feat: add bounded ZIP and directory pet I/O`.

### Task 2: Package Normalizer and PNG Validation

**Files:** Create `src/pet-package.ts`, `test/pet-package.test.ts`; modify `src/assets.ts` and relevant tests.

**Interfaces:** Consume `PackageFiles`. Export `NormalizedPet = { name: string; files: PackageFiles; frames: FrameLibrary }`; `normalizePet(files: PackageFiles, fallbackName: string): Promise<NormalizedPet>`. Export `packageMetadata = { schemaVersion: 1, name: string }` via `metadata.json`. Output manifest keeps existing ordered-path and SHA-256 format; reuse `FrameLibrary` and state counts from assets.ts. No library ID in portable metadata.

- [ ] **Step 1: Write failing tests**: literal fixtures for original export rows/counts and normalized packages; assert seven animations and expected frame ordering, same PNG bytes, bounded display name, digests and metadata round trip. Reject unsupported metadata versions, wrong dimensions/counts, bad declared spritesheet hash, missing spritesheet when declared, spritesheet-only packages with a specific error, invalid CRC/chunk boundaries, and corrupt IDAT data. A generated SHA alone is not validation of an original PNG.
- [ ] **Step 2: Run `npx tsx --test test/pet-package.test.ts`**; expect failure for missing normalization/integrity behavior.
- [ ] **Step 3: Implement normalization**: validate PNG chunk bounds/CRCs and bounded zlib image data for the fixed RGBA/RGB-compatible 192×208 frame contract; reject malformed compression/filter structure. Verify original manifest's atlas digest when declared. Normalize only required frames; retain no previews/unvalidated extras. Preserve legacy normalized imports with no metadata by using fallbackName. Adapt runtime loader to shared validation without removing path/symlink safety.
- [ ] **Step 4: Run full suite and typecheck**; normalized export fixtures and corruption tests pass.
- [ ] **Step 5: Commit** `feat: normalize original and portable pet packages`.

### Task 3: Global Library and Selection

**Files:** Create `src/library.ts`, `test/library.test.ts`.

**Interfaces:** Consume `NormalizedPet`, `normalizePet`, `readPackageFiles`, `writePackageZip`. Export `PetInfo = { id: string; name: string; bundled: boolean }` and `LoadedPet = PetInfo & { frames: FrameLibrary }`. Export `PetLibrary` constructed with `(configDir: string, bundledDir: string)`; methods `list(): Promise<{ pets: PetInfo[]; warnings: string[] }>`, `install(pet: NormalizedPet, replaceId?: string): Promise<PetInfo>`, `load(id: string): Promise<LoadedPet>`, `loadSelected(): Promise<{ pet: LoadedPet; warning?: string }>`, `select(id: string): Promise<LoadedPet>`, `exportFiles(id: string): Promise<PackageFiles>`. Reject duplicate display names without explicit replaceId; adapter handles confirmation before calling replacement.

- [ ] **Step 1: Write failing tests** with temp config roots: import Pi and a sample pet coexist; bundled reserved ID immutable; source removal has no effect; case-insensitive duplicates rejected; replacement cancellation leaves old data; confirmed replacement retains ID. Concurrent mutation rejects contention with retryable error; inject promotion/write failure and assert rollback. Atomic selection survives new library instances; corrupt/missing selection falls back with warning; corrupt imported entries skipped. Paths cannot escape root and library symlinks rejected.
- [ ] **Step 2: Run `npx tsx --test test/library.test.ts`**; expect missing-library behavior failures.
- [ ] **Step 3: Implement the methods** using UUID directories, private staging, bounded metadata, exclusive mutation reservation, rollback backups owned by the operation and atomic selection rename. Install validated bytes, never recursive-copy the source. Avoid deletion of unowned paths; library export builds a verified portable package. Clean up own lock/staging in finally; fail retryably on lock contention rather than guessing stale ownership.
- [ ] **Step 4: Run full suite and typecheck**; all library tests pass.
- [ ] **Step 5: Commit** `feat: persist managed pet library and global selection`.

### Task 4: Commands, Immediate Switching, and Lifecycle

**Files:** Create `src/pet-commands.ts`, `test/pet-commands.test.ts`; modify `index.ts`, `src/widget.ts`, command/extension/widget tests.

**Interfaces:** Consume `PetLibrary` and archive/normalizer methods. Export `registerPetCommands(pi: ExtensionAPI, library: PetLibrary, runtime: { current(): LoadedPet | undefined; apply(pet: LoadedPet): void; generation(): number }): void`. Commands use their supplied context cwd/UI. `apply` replaces frames/name/widget but preserves controller/config/visibility. Add optional final `name = 'Pi'` widget argument so existing callers remain compatible.

- [ ] **Step 1: Write failing tests**: import ZIP/directory success adds without selecting; duplicate confirmation declines safely; list marks active pet; switch unique case-insensitive name, exact ID and no-arg picker; ambiguity not guessed. Assert frames/name change immediately and existing activity/config remain; startup honors PI_CODING_AGENT_DIR globally; session/shutdown race drops late results. Export selected pet ZIP reimports identically; overwrite decline writes nothing; destination inside bundled/library storage refused. Creation prompt states supported package format and capability conditions without inspecting models/tools.
- [ ] **Step 2: Run targeted adapter tests** `npx tsx --test test/pet-commands.test.ts test/extension.test.ts test/widget.test.ts`; expect missing command/state behavior failures.
- [ ] **Step 3: Implement adapter** and replace destructive import/export registrations. Session starts use `getAgentDir()` and `loadSelected`; warnings via ctx.ui.notify. Snapshot generation before dialogs/I/O and recheck before UI/state application and explicit selection. Library locks recheck duplicate conditions when promoting. Catch errors as actionable notifications. Export writes temporary ZIP in destination directory then promotes with overwrite confirmation; refuse paths in managed/bundled storage. Do not recreate the controller on a pet switch.
- [ ] **Step 4: Run `npm test && npm run typecheck`**; command names stay hyphenated and non-TUI paths create no widget/timer.
- [ ] **Step 5: Commit** `feat: add pet library commands and instant switching`.

### Task 5: Preserve User Artwork, Restore Pi, and Verify Delivery

**Files:** Modify tracked `assets/`, `README.md`, packaging tests if needed; migration evidence in this plan's ignored progress ledger.

**Interfaces:** Use Task 3's library to install a validated snapshot of currently modified assets before restoration; do not select it automatically. Use original metadata/name from user export only when its frame hashes match the current files; otherwise name the preserved copy `Recovered imported pet`. Existing names require normal collision handling, not silent replacement.

- [ ] **Step 1: Write failing preservation test**: snapshot a modified bundled directory into temp managed library, simulate restore and verify preserved frame bytes remain unchanged; baseline bundled Pi at reserved ID remains available. Test abort of restore when preservation verification fails.
- [ ] **Step 2: Run preservation test**; expect missing preservation workflow failure.
- [ ] **Step 3: Preserve actual working assets** to an independently verified non-source copy, install into actual managed library, record ID/path/digests. Only after verifying it, restore tracked assets from `d85a2d7`; never git-restore untracked `pets/` or ZIPs. Document global library location, formats/limits, picker, ZIP exports, selection scope and corruption fallback. Keep unknown artwork rights disclaimer.
- [ ] **Step 4: Run `npm test && npm run typecheck && npm pack --dry-run`**; all pass and package contains ZIP dependency configuration plus immutable Pi, not user archives/library. Verify original-format ZIP and directory import using isolated config dir, switch/export/re-import, then a bounded Pi PTY startup/switch/shutdown without model calls. Report visual appearance unverified unless actually inspected. Verify user archive hashes unchanged and only intended paths staged.
- [ ] **Step 5: Commit** restored assets/docs/tests as `fix: preserve imported artwork and restore immutable Pi bundle`; final independent whole-branch review and integration remain user-controlled.
