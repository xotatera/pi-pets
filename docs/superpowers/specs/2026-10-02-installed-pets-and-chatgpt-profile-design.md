# Installed Pets and Linked ChatGPT Profile — design

## Intent and approved behavior

Discover pets already stored by Codex App, Codex CLI (including legacy avatars), and the official ChatGPT Desktop app without requiring manual export or filesystem navigation. Target Pi installations on macOS, Windows and Linux; a source unavailable on an OS is reported as unavailable, not assumed to exist. Reuse readers for compatible ChatGPT pet formats, but discover only bounded, verified storage locations rather than scanning the user's home directory.

There are two modes:

- Import a discovered pet as a managed, independent copy in Pi's existing global library. Local import does not require Pi OAuth and does not change selection automatically.
- Select a special linked profile that follows the single authoritative ChatGPT pet setting. The user explicitly ruled out choosing among separate per-app selections: there is no linked-source picker or per-app preference precedence. App storage supplies artwork and, where verified, a local mirror of the authoritative setting; it does not define competing preferences.

The linked profile activates only when Pi has a qualifying ChatGPT or legacy Codex OAuth login. If login, authoritative selection metadata, or selected artwork is unavailable, display bundled Pi while retaining the linked profile selection. Resume automatically when requirements become available. Check for changes every five seconds. Never change any app settings, read chat history/keychain data, download missing artwork, initiate a login, or probe cloud account settings.

## Evidence and prerequisite gates

Existing runtime: global managed copies, `selection.json`, bounded ZIP/directory normalization, state-independent widget switching, and a shared exclusive reservation for imports/replacements and final export promotion. Those safety properties must remain intact.

Read-only investigation verified public Codex CLI implementation at these sources:

- `https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/model.rs`
- `https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/asset_pack.rs`
- `https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/catalog.rs`
- `https://github.com/openai/codex/blob/main/codex-rs/tui/src/app/pets.rs`

The CLI reads custom `CODEX_HOME/pets/<id>/pet.json` and legacy `CODEX_HOME/avatars/<id>/avatar.json`. Cached built-in artwork is at `CODEX_HOME/cache/tui-pets/v1/assets/`; its public catalog uses WebP spritesheets. The verified custom manifest has `displayName`, `spritesheetPath`, optional `frame` geometry, and animation tracks with frame indices/FPS/loop/fallback. Default grid geometry is 192×208 cells in 8 columns and 9 rows. Source code also writes a CLI-local `tui.pet` preference: that field alone is **not evidence of the authoritative ChatGPT setting**, and must not be substituted for it without verifying a shared-setting contract. Pin source revisions when producing fixtures; mutable upstream main links are research references, not a permanent compatibility guarantee.

The official ChatGPT Desktop and Codex App pet directories and shared-selection cache schema have **not yet been verified**. Before writing either adapter, obtain a bounded, non-secret format reference or owner-approved inspection on an installed official client. Record the app/OS/version, exact pet-only directories/keys, format semantics, and evidence that any selection field mirrors the shared ChatGPT setting. Produce anonymized synthetic fixtures, not copies of account databases, private pet artwork/names, credentials, or chat data. Do not invent platform paths, reinterpret arbitrary app preferences, or claim the complete linked feature works until this gate is met. If no readable local authoritative mirror exists, report that limitation and return to the owner for a design decision; do not silently replace it with CLI-local selection or a cloud API.

Pi 1.0.0 public provider definitions use `openai` for OpenAI/ChatGPT subscription OAuth and `openai-codex` for Codex OAuth. `ModelRegistry.getProviderAuthStatus()` supplies configured/source metadata; `isUsingOAuth(model)` reads the runtime auth type without returning tokens. Implement authentication using those public metadata facilities and verified provider identity, not name matching or credential-file reads. OAuth expiry/revocation cannot be independently validated offline; the gate reflects Pi's current registered OAuth state, not guaranteed server acceptance. API keys, environment keys, and a login in another app do not qualify.

## Source discovery and import UX

Add `/pet-import-source [chatgpt|codex-app|codex-cli]`. With no argument, show detected sources and actionable unavailable reasons; selecting a source shows discovered pets. With an argument, show that source's pet picker directly. Rows identify pet names, built-in/custom category and whether artwork is locally cached. An uncached selection explains how to make it available in its owning app; Pi does not download it.

Adapters own OS-specific root resolution and versioned format recognition. Honor `CODEX_HOME` for CLI storage, defaulting to the documented user Codex directory. Implement desktop roots only after the evidence gate. Shared physical stores may be deduplicated using canonical location plus source identity; do not merge distinct pets solely by display name. Third-party clients/arbitrary directories are outside automatic discovery unless explicitly added through a verified compatible adapter; existing path/ZIP import remains available.

Read only allowlisted pet manifests, referenced artwork and verified pet-selection metadata. Do not recurse into chats, sessions, logs, general databases or credential stores. A referenced asset must remain within its verified source root; reject traversal, unsupported versions, unsafe links and ambiguous metadata. Bound discovery to 256 candidate pets per source and 64 KiB per manifest/selection document. Read artwork with a 16 MiB compressed-byte limit and a 16-million-pixel decoded limit before allocation; at most 256 source frames. Treat permission errors and partially updated files as source-local failures, not an extension crash. Do not run app/CLI commands or load executable content from manifests.

A successful discovered import uses the current library's validation, collision confirmation, atomic promotion, and global storage. Preserve source provenance for the manifest/artwork and owning pet directory so export cannot overwrite the source. Imported copies survive app removal and never select silently. No source URLs/private paths or account identifiers enter portable exports or committed fixtures.

## Spritesheet adaptation

Direct app/CLI pets need a bounded image decoder and spritesheet-to-PNG normalization; the existing requirement for separately exported frames is insufficient. Decode supported PNG/WebP spritesheets from local files only. Validate declared grid geometry, actual dimensions, indices and finite animation metadata before slicing. The supported native frame cell is 192×208; unsupported geometries explain the limit rather than being silently distorted.

Preserve native frame ordering instead of stretching or resampling tracks to the legacy export's fixed counts. Introduce portable normalized metadata schema version 2 for app-derived pets: the same seven Pi states, canonical `<state>/<nn>.png` paths and per-frame hashes, with variable state-track lengths bounded to 1–256 and a total of at most 256 normalized frames. Keep schema version 1 and existing original-export imports backward compatible with their current fixed counts. Renderer/controller state stays separate from package normalization.

Versioned format readers map documented native animation tracks into Pi's seven states. A valid idle track is required; missing optional tracks may explicitly reuse idle frames, with this compatibility fallback disclosed in the import summary. Native loop/FPS metadata is validated but Pi's configured frame period and lifecycle reactions continue to govern playback; do not promise identical native timing. No undocumented row guesses. Normalized frame duplication must remain within the total bound. Source provenance and app-selection/profile metadata are nonportable; exporting the linked profile exports only the currently resolved real pet, or bundled Pi while in fallback, never OAuth/profile data.

## Linked profile and global selection

Reserve ID `chatgpt-linked`, distinct from bundled Pi and imported UUIDs. `/pet-list` and `/pet-switch` expose the profile; describe active artwork separately from persistent selection mode, including why it currently falls back. The profile can remain selected while ineligible; it does not display shared ChatGPT artwork until the Pi OAuth gate succeeds. No source-picker step is introduced.

Evolve global selection with a backward-compatible versioned union for managed/bundled ID versus linked mode. Persist the linked choice atomically rather than rewriting it to bundled Pi on fallback. Import-name collisions cannot replace reserved profiles. Normal imported pets do not follow future app or shared-settings changes.

When linked mode is active, poll eligibility and the verified authoritative local setting every 5,000 ms. Use stable bounded metadata/content fingerprints to avoid repeatedly decoding unchanged spritesheets; decode only selected artwork. If multiple verified mirrors are temporarily inconsistent, they are stale replicas, not competing preferences: use their verified revision semantics to establish freshness, or fall back with an ambiguity warning when freshness cannot be established. Never impose an arbitrary app precedence or let unrelated CLI-local preference choose the pet.

A selection/artwork change replaces frames/name immediately after successful validation, retaining activity, configuration, visibility and widget placement. Guard async reads/decodes with session and selection revisions so obsolete results cannot overwrite a newer manual switch or session. Switching away disposes the linked monitor; shutdown/reload cancels monitoring and rendering timers. Hidden widgets may keep the single bounded 5-second settings monitor while linked mode is selected, but run no image animation timer. No monitor/widget timers in print/JSON/RPC modes.

Warnings are transition-based and deduplicated: login required, source unavailable, unsupported layout, selected asset missing/corrupt, inconsistent mirror, or permission error. On each such condition, resolve bundled Pi; if bundled artwork itself fails, keep the existing readable text fallback. Do not write global selection during background polling. Pi OAuth eligibility is independent of the currently selected model; using another provider does not disable the profile while a qualifying login remains registered.

## Boundaries and architecture

Separate discovery/root resolution, versioned source readers and authoritative-selection reader, bounded sprite decoding, metadata-only auth gate, and cancellable linked-profile resolution from Pi command/UI wiring. Reuse the managed library's exclusive mutation reservation for installed copies and export promotion. Profile polling is read-only to app stores; never hold the library reservation during dialogs or image decoding.

Use temporary immutable snapshots for imported/resolved frame data; tolerate atomic app updates without following arbitrary paths. Cache only normalized artwork/fingerprints under Pi's user configuration directory, never copied app settings databases or credentials. Corrupt cache entries are disposable and do not change the persistent profile selection. Newly added image decoder dependencies must be portable across the three OS targets without requiring Python or shell utilities at runtime; review resource limits and package distribution before choosing the dependency in the plan.

## Verification and completion criteria

- Evidence gate satisfied for each supported desktop adapter and for authoritative shared-setting semantics; unsupported versions explicitly reported. Do not call synthetic fixtures proof of actual app compatibility.
- OS-isolated fixture tests for path resolution, CLI custom/legacy/cached built-ins, desktop formats verified by references, source deduplication, absence, permission errors, traversal/unsafe links, manifest/image bounds and malformed image data.
- Direct import fixtures normalize without touching source bytes; copies survive source removal; existing collision/source-protection/export locking and ZIP round-trip tests remain green.
- Legacy schema 1 plus variable-track schema 2 imports/exports round trip; valid idle fallback mapping is disclosed; invalid indices, counts and geometry reject before decoding/slicing excessive data.
- OAuth metadata matrix covers both allowlisted providers, API-key-only, logged-out, unrelated current model, login/logout changes and stale async reads. No test or runtime code reads app credentials or makes account/download calls.
- Fake-timer tests verify 5-second sync, changed shared selection, disabled/unset pet, fallback and recovery without losing linked mode, immutable selection.json during polling, manual switch cancelling pending decode, session/shutdown cleanup and zero non-TUI timers.
- Mirror inconsistency does not introduce a source picker or choose CLI-local preference; fallback/error evidence is explicit.
- Full suite, strict typecheck, package-content review and bounded Pi import/switch/sync/fallback/shutdown smoke testing. Keep actual visual appearance separate from protocol evidence. Real desktop compatibility remains unverified until exercised with the relevant installed client/OS/version, and must be reported as such.
- User-owned artwork stays private and out of Git/npm. Do not redistribute proprietary app artwork or invent licenses. Existing before-settle abort-outcome limitation remains out of scope.
