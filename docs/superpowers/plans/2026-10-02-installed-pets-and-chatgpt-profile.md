# Installed Pets and Linked ChatGPT Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import locally installed pets without navigating files and follow the authoritative ChatGPT pet setting behind Pi's OAuth gate.

**Architecture:** Evidence-backed source adapters feed a bounded spritesheet decoder and the existing managed library. A separate metadata-only auth gate and shared-selection resolver drive a cancellable linked monitor; persistent profile mode remains separate from displayed artwork. Imports and export promotion retain the same exclusive filesystem mutation reservation.

**Tech Stack:** TypeScript, Node.js 22.19+, Pi 1.0.0 APIs, existing node:test/tsx suite, `sharp@0.35.5` for PNG/WebP decoding and PNG slicing. Native prebuilt sharp packages cover macOS/Windows/Linux; load the decoder lazily so unavailable native support cannot break existing Pi pets.

**Spec:** `docs/superpowers/specs/2026-10-02-installed-pets-and-chatgpt-profile-design.md`

## Global Constraints

- No product implementation before Task 1's desktop/shared-setting evidence gate is satisfied. If authoritative selection has no verified local representation, stop and report the blocker; do not substitute CLI-local `tui.pet` or introduce cloud calls.
- Codex App, Codex CLI/legacy avatars and official ChatGPT Desktop are discovery sources. OS-specific availability must be truthful; never claim absent desktop clients work on Linux.
- Read allowlisted pet manifests/artwork and verified selection fields only: no chat history, keychain, credential-file reads, cloud settings calls, app/CLI invocation or missing-art downloads.
- Honor `CODEX_HOME`; desktop roots/keys/format versions come from Task 1's verified contract, never guessed home-directory scans.
- Bound to 256 candidate pets/source, 64 KiB manifests/selection documents, 16 MiB spritesheet input, 16-million decoded pixels, at most 256 source frames; native cell 192×208. Keep current PNG/ZIP byte/digest/path limits.
- Portable schema 2 has seven required Pi state tracks, lengths 1–256, at most 256 total frames; schema 1 and existing original-export imports remain compatible. Native order preserved; Pi's configured timing remains authoritative.
- Qualifying Pi OAuth providers are `openai` and `openai-codex`, independent of the active model. API-key-only/environment auth and another app's login do not qualify. Never resolve tokens to test eligibility.
- One authoritative ChatGPT selection, not per-app precedence and no linked-source picker. Unresolvable mirror disagreement falls back with a warning.
- Reserve `chatgpt-linked`; poll every 5,000 ms only in interactive linked mode. On unavailability retain mode and display Pi/text fallback; manual switch/session/shutdown cancels obsolete reads/results.
- Discovered imports stay managed copies, require normal collision confirmation, never select silently, and retain local-only source protection. Export profile's resolved artwork/Pi fallback only; no profile/provenance/account data in ZIPs.
- Preserve all existing user artwork, source ZIPs and managed entries. Generic fixtures only; private names/artwork/metadata must not enter Git or npm.
- Work on a new feature branch in this repository, preserving native execution preference. Do not merge/push/publish without owner choice. One fresh Codex read-only whole-branch review after verification; no automatic review loop.

## Review Focus

- A stale replica may report a different pet while apps share one real setting: use proven revision semantics or fallback, never choose an app arbitrarily (Tasks 1/5).
- App atomically replaces metadata/artwork during decode: reject an unstable snapshot and never apply an obsolete or mismatched pet (Tasks 4/6).
- A syntactically valid tiny compressed image advertises enormous dimensions or animated frames: reject before large decode/allocation (Task 3).
- Pi's current model is unrelated but qualifying OAuth is still registered, or OAuth disappears mid-read: eligibility must not leak credentials or apply logged-out artwork (Tasks 5/6).
- Export races source import/replacement or targets installed-app storage: all source guards run inside the existing final mutation reservation (Task 7).

## File Map

- `docs/superpowers/references/2026-10-02-pet-source-formats.md`, synthetic `test/fixtures/pet-sources/`: evidence contracts and anonymized format fixtures.
- `src/pet-package.ts`, `src/state.ts`, `src/widget.ts`, corresponding tests: schema 2 and actual track-length indexing.
- `src/sprite-decoder.ts`, `test/sprite-decoder.test.ts`, package files: one bounded decode at a time, validated native tracks, normalized PNGs.
- `src/pet-sources/types.ts`, `paths.ts`, `codex-cli.ts`, `desktop.ts`, `index.ts`, `test/pet-sources.test.ts`: source contracts, OS roots, readers/discovery and snapshots.
- `src/chatgpt-auth.ts`, `src/chatgpt-selection.ts`, corresponding tests: public auth metadata gate and authoritative mirror reconciliation.
- `src/linked-cache.ts`, `src/linked-profile.ts`, `src/library.ts`, corresponding tests: cache, persistent selection union, cancellable monitor.
- `src/pet-commands.ts`, `index.ts`, `README.md`, extension/command/package tests: source picker, profile UX/export and delivery.

---

### Task 1: Verify Source and Shared-Setting Contracts — Hard Gate

**Files:** Create `docs/superpowers/references/2026-10-02-pet-source-formats.md` and synthetic `test/fixtures/pet-sources/` metadata; no product scaffolding/dependencies.

**Interfaces:** Produce documented `SourceContract` facts for each supported OS/client/version: canonical root resolution, exact pet-only manifests/keys, PNG/WebP geometry/animation semantics, authoritative-setting mirror fields, revision/active-account semantics, evidence URL/revision or owner-approved inspection provenance. Include explicit unavailable/unsupported cases, not guessed adapters. Fixtures contain synthetic pet names/images, no real account IDs, tokens, chat data or private artwork.

- [ ] **Step 1: Pin Codex public source revision** and document `pets/<id>/pet.json`, `avatars/<id>/avatar.json`, `cache/tui-pets/v1/assets`, source default tracks and custom track override semantics. Capture default row indices/counts: idle row 0/6, running row 7/6, waiting row 6/6, review row 8/6, failed row 5/8, jumping row 4/5, waving row 3/4; these are verified native defaults, not the old exported manifest's array layout.
- [ ] **Step 2: Obtain desktop format evidence** through bounded public references or owner-approved pet-only inspection on installed official clients. Record exact per-OS roots, format version recognition and selection field meaning. No installed client/usable reference is an evidence blocker, not permission to invent a path. Shared stores may prove multiple clients use the same contract.
- [ ] **Step 3: Verify authoritative selection semantics**: distinguish shared ChatGPT setting mirrors from CLI-local `tui.pet`; establish whether revisions are comparable across mirrors and how unset/disabled state is represented. Do not assume different app selections based on stale cache. If only local per-app preferences are accessible, STOP and ask the owner to revise scope or provide evidence.
- [ ] **Step 4: Write synthetic positive/negative metadata fixtures** matching verified contracts, including supported/unavailable OS cases and stale/conflicting replicas. Record a source-contract matrix with evidence status; each later adapter can target only a verified row. Document real app compatibility separately from synthetic parser tests.
- [ ] **Step 5: Self-check privacy and gate** with `git diff --check` and manual fixture inspection; commit only the evidence document/fixtures as `docs: verify installed pet source contracts`. Continue only when all product paths needed for the approved feature have verified inputs. Partial CLI evidence alone does not clear the linked-profile gate.

### Task 2: Variable-Track Portable Packages and Rendering

**Files:** Modify `src/pet-package.ts`, `src/state.ts`, `src/widget.ts`; extend their tests.

**Interfaces:** Keep `NormalizedPet = { name: string; files: PackageFiles; frames: FrameLibrary }` and `normalizePet()` signatures. Metadata accepts schema 1/2; schema 2 manifest paths are canonical per-state arrays with SHA-256 and variable lengths. Extend `PetController.frame(now: number, counts?: Record<Animation, number>): { animation: Animation; index: number }`, defaulting to current `frameCounts`; widget derives counts from actual frames once on construction.

- [ ] **Step 1: Write RED tests** for schema 2 state tracks of 1/3/9 frames preserving bytes/order through normalize/export/reimport; empty/missing tracks, 257-frame total, noncanonical paths, bad hashes and unsupported versions reject. Assert render index reaches the ninth frame and never exceeds a one-frame track. Existing schema 1 fixed counts and original-export tests stay unchanged.
- [ ] **Step 2: Run `npx tsx --test test/pet-package.test.ts test/state.test.ts test/widget.test.ts`**; expect new assertions to fail because schema 2/cardinality support is missing.
- [ ] **Step 3: Implement the interfaces** retaining current PNG integrity/path/hash checks and schema version on portable output. Infer track counts only for recognized schema 2, never loosen schema 1 validation. No controller recreation on artwork switches.
- [ ] **Step 4: Run `npm test && npm run typecheck`**; expect all existing and new tests green.
- [ ] **Step 5: Commit** `feat: support native pet animation track lengths` with only Task 2 files.

### Task 3: Bounded PNG/WebP Sprite Decoder

**Files:** Create `src/sprite-decoder.ts`, `test/sprite-decoder.test.ts`; modify package files.

**Interfaces:** Export `SpriteDefinition = { name: string; width: 192; height: 208; columns: number; rows: number; tracks: Record<Animation, readonly number[]>; fallbackStates: readonly Animation[] }`; `SpriteDecoder.decode(bytes: Uint8Array, definition: SpriteDefinition, signal?: AbortSignal): Promise<NormalizedPet>`. A shared decoder instance permits one in-flight job, rejects another with retryable busy error and releases its slot on success/failure/cancellation. Source animation parsers in Task 4 produce this definition.

- [ ] **Step 1: Write RED tests** with generated colored PNG/WebP grids: track order and duplicates preserved, transparency intact, seven normalized schema 2 states, optional idle fallbacks disclosed through definition. Reject 16 MiB+1 input, >16-million-pixel headers, animated images, wrong cell/grid geometry, out-of-bounds/noninteger indices, >256 source/normalized frames, unsupported format, malformed/truncated content and canceled/stale jobs. Parallel jobs must not create multiple full decoded bitmaps.
- [ ] **Step 2: Run `npx tsx --test test/sprite-decoder.test.ts`**; expect missing decoder failures.
- [ ] **Step 3: Add pinned runtime `sharp@0.35.5`** and implement lazy import, bounded metadata preflight and static-image decode with `limitInputPixels: 16000000`; allow only PNG/WebP, reject multi-page content. Decode one RGBA bitmap, crop validated indices, encode 192×208 PNGs, produce hashes/metadata schema 2, and validate the result through Task 2. Do not change process-global sharp concurrency settings. Abort/discard outcomes must never leak decoded buffers or hold the slot.
- [ ] **Step 4: Run full suite/typecheck** and inspect npm sharp optional packages for supported macOS/Windows/Linux architectures. Decoder-unavailable tests must leave normal imported/bundled pets usable. No Python/shell program runtime requirement.
- [ ] **Step 5: Commit** `feat: decode bounded installed pet spritesheets`.

### Task 4: Source Discovery, Versioned Readers and Stable Snapshots

**Files:** Create the five `src/pet-sources/` files from File Map and `test/pet-sources.test.ts`.

**Interfaces:** Export `SourceId = 'chatgpt' | 'codex-app' | 'codex-cli'`; `SourceLocation = { path: string; kind: 'file' | 'directory' }`; `InstalledPet = { key: string; source: SourceId; name: string; cached: boolean; locations: readonly SourceLocation[] }`; `PetSnapshot = { fingerprint: string; definition: SpriteDefinition; bytes: Uint8Array; locations: readonly SourceLocation[] }`; `SelectionMirror = { source: SourceId; petKey: string | null; revision?: string; authority: 'chatgpt-shared' }`. `PetSources` supplies `discover(source?: SourceId): Promise<{ pets: InstalledPet[]; unavailable: Partial<Record<SourceId,string>> }>`, `snapshot(key: string, signal?: AbortSignal): Promise<PetSnapshot>`, `mirrors(signal?: AbortSignal): Promise<readonly SelectionMirror[]>`, and `protectedLocations(): readonly SourceLocation[]`. Keys are opaque trusted adapter identifiers, never user-controlled filesystem paths.

- [ ] **Step 1: Write RED tests** from Task 1 fixtures with injected OS/home/env/filesystem roots: honor CODEX_HOME, parse CLI custom/legacy/built-in cache, recognize verified desktop formats, deduplicate shared physical stores without name-only merging, enforce 256 candidates/source and 64 KiB metadata bounds, reject paths outside allowed roots and unsafe links. Unknown versions/uninstalled clients/permissions report source-specific reasons. Swap manifest/artwork during snapshot and assert rejection or retry, not a mixed result.
- [ ] **Step 2: Run `npx tsx --test test/pet-sources.test.ts`**; expect absent discovery/readers to fail.
- [ ] **Step 3: Implement exact evidenced readers**: default native tracks use Task 1's pinned contract; recognized custom tracks validate finite FPS (0 < FPS <=60), indices, loop/fallback references, required idle and bounded total. Optional missing Pi tracks reuse valid idle explicitly, without undocumented aliases/row guesses. Only selection fields proven to mirror ChatGPT receive `authority: 'chatgpt-shared'`; CLI-local selection is excluded. Read allowed metadata/assets only and fingerprint a stable immutable snapshot, using before/after identity/content checks.
- [ ] **Step 4: Run full suite/typecheck**; fixture file-access assertions confirm no chats/auth/config-wide recursion. No real app integration claim from fixture tests alone.
- [ ] **Step 5: Commit** `feat: discover locally installed pet sources`.

### Task 5: OAuth Eligibility and Authoritative Selection Reconciliation

**Files:** Create `src/chatgpt-auth.ts`, `src/chatgpt-selection.ts`, corresponding tests.

**Interfaces:** `hasChatGPTLogin(registry: Pick<ModelRegistry,'getAll'|'isUsingOAuth'|'getProviderAuthStatus'>): boolean`; `resolveSharedSelection(mirrors: readonly SelectionMirror[]): { kind: 'selected'; petKey: string } | { kind: 'unavailable'; reason: 'unset'|'missing'|'inconsistent' }`. Revision comparisons must use only Task 1's verified semantics; no generic lexicographic/date guessing.

- [ ] **Step 1: Write RED tests** for stored qualifying OAuth on either provider, API-key/environment/runtime-only credentials, no login, unrelated active model and login/logout changes. Mirror tests assert one shared selection from consistent replicas, unset/disabled fallback, newest replica only with proven ordering, otherwise inconsistency fallback. CLI-local `tui.pet` never enters resolution; there is no app-priority choice or source picker. Auth mocks throw if token resolution/credential reads are attempted.
- [ ] **Step 2: Run `npx tsx --test test/chatgpt-auth.test.ts test/chatgpt-selection.test.ts`**; expect missing metadata-only gate/resolver failures.
- [ ] **Step 3: Implement interfaces** using allowlisted provider identity and public runtime OAuth/configuration metadata. Do not infer OAuth from provider capability/name alone or refresh/login/probe remotely. Reconciliation consumes only verified shared-setting mirrors from Task 4.
- [ ] **Step 4: Run full suite/typecheck**; all eligibility/reconciliation cases pass without credential/network access.
- [ ] **Step 5: Commit** `feat: gate linked pets on Pi OAuth and shared ChatGPT settings`.

### Task 6: Persistent Linked Mode, Bounded Cache and Cancellable Monitor

**Files:** Create `src/linked-cache.ts`, `src/linked-profile.ts`, tests; modify `src/library.ts` and library tests.

**Interfaces:** Export `PetSelection = { kind: 'pet'; id: string } | { kind: 'chatgpt-linked' }`. Add `PetLibrary.readSelection(): Promise<{ selection: PetSelection; warning?: string }>` and `saveSelection(selection: PetSelection, current?: () => boolean): Promise<void>`; legacy v1 `{id}` reads map to pet selection, v2 persists tagged mode. `loadSelected()` retains its current pet/warning API and adds selection, resolving linked mode initially to Pi without changing saved mode; `select(id)` rejects reserved profile as a real pet and delegates guarded persistence for normal pets.

`LinkedCache(configDir: string)` exposes `get(fingerprint: string): Promise<NormalizedPet|null>` and `put(fingerprint: string, pet: NormalizedPet): Promise<void>` using immutable SHA-256-keyed normalized files under `pi-pets/linked-cache/`. Export `LinkedView = { status: 'active'|'fallback'; reason?: string; fingerprint: string; pet: NormalizedPet|null; locations: readonly SourceLocation[] }`. Export `LinkedMonitorPorts = { sources: PetSources; decoder: SpriteDecoder; cache: LinkedCache; eligible: () => boolean; bundled: () => Promise<NormalizedPet>; generation: () => number; apply: (view: LinkedView) => void; warn: (message: string) => void }`; `new LinkedMonitor(ports: LinkedMonitorPorts)` exposes `start(): void`, `stop(): void`, `refresh(): Promise<void>`. Refresh resolves Task 5's shared selection and Task 4 snapshot, then decodes/caches with Task 3; null pet means Pi text fallback.

- [ ] **Step 1: Write RED tests** for backward-compatible selection, reserved IDs, atomic sync guard/commit, linked-mode retention during fallback, immutable selection file during polling and corruption behavior. Fake timers assert exactly one 5,000 ms monitor, serialized reads, fingerprint cache reuse, changed selection/artwork, OAuth disappearance mid-read, fallback/recovery, canceled generation/manual selection, no late application after stop, and warning deduplication. Null bundled artwork yields text fallback rather than startup rejection.
- [ ] **Step 2: Run targeted linked/library tests**; expect missing persistent mode/cache/monitor behavior to fail.
- [ ] **Step 3: Implement interfaces** preserving synchronous guard-plus-rename selection commit and existing mutation lock semantics. Cache only normalized artwork, validate on load, reject symlink/unsafe roots, omit settings/account/credential data, atomically promote own temporary entries and cap cache to 8 entries/128 MiB with owned-entry eviction; do not delete managed library entries. Start with one immediate refresh, then the 5,000 ms interval. Recheck eligibility/session/refresh revision before apply; skip overlapping polls, never write global selection during refresh, and cancel timers/abort signals on stop. Missing/unstable/ambiguous data resolves Pi and a transition warning, not stale account artwork.
- [ ] **Step 4: Run full suite/typecheck**; both existing selection-race tests and new logout-during-decode cases pass. Corrupt cache entries are disposable and cannot overwrite the reserved fallback.
- [ ] **Step 5: Commit** `feat: persist and monitor the linked ChatGPT pet profile`.

### Task 7: Source Picker, Profile Commands, Lifecycle and Delivery

**Files:** Modify `src/pet-commands.ts`, `index.ts`, `README.md`; extend command/extension/package tests.

**Interfaces:** Extend command runtime to expose persistent `PetSelection` separately from displayed artwork/snapshot. Consume Tasks 3–6 rather than re-reading source formats in UI handlers. `/pet-import-source [chatgpt|codex-app|codex-cli]` chooses detected source/pet; `/pet-switch chatgpt-linked` persists linked mode and starts monitor; normal switches stop it. Lists mark the persistent profile active and describe current resolved name/fallback reason. Profile export consumes the current immutable normalized snapshot or bundled fallback, not a fake managed ID.

- [ ] **Step 1: Write RED tests** for no-path discovery/picker, source argument validation, uncached artwork message, explicit collision cancellation/replacement, managed source protection and no silent switch. Linked mode has no source-picker step; every failure retains it while displaying Pi. Agent state/config/visibility survive updates; hidden widgets keep settings monitoring but no render timer. Non-TUI modes create no monitors/widgets. Export strips profile/private metadata; library AND installed-source protection are rechecked inside final `withMutation()` reservation, including racing replacement/registration and protected app selection/cache destinations.
- [ ] **Step 2: Run command/extension/package tests**; expect missing UX/lifecycle integration to fail.
- [ ] **Step 3: Implement adapter/lifecycle changes**: create one shared decoder/source registry/cache per extension instance; start linked monitor only after interactive context initialization, stop on manual switch/shutdown/reload and guard async source pickers by generation. Protect all known installed-source roots, manifests/assets and Pi linked cache from exports, not only the currently selected source. Import snapshots through `PetLibrary.install()` with directory/file provenance supported by the library; extend provenance kinds only with explicit backward-compatible validation if needed.
- [ ] **Step 4: Update README** with commands, actual supported app versions/OS evidence, five-second sync, Pi-login vs API-key distinction, timing/fallback limitations, no network/app-settings writes, native decoder availability and artwork rights. Run `npm test && npm run typecheck && npm pack --dry-run`; inspect native dependency distribution and ensure no private fixtures/cache/provenance included. Run bounded Pi startup/import/switch/sync/logout-fallback/shutdown smoke checks without model calls. Test real installed clients on available platforms; explicitly report untested platforms, not fixture-proven compatibility.
- [ ] **Step 5: Commit** `feat: import installed pets and expose linked ChatGPT profile`. Record all gates/risks in this plan's ledger; dispatch one fresh read-only Codex whole-branch review with exact-range diff and spec, then use tested focused fixes without an automatic re-review loop. User controls final merge/publication.
