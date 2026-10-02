# Contributing

## Setup and checks

Use Node.js **22.19.0 or newer** and npm. From the repository root:

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm pack --dry-run
```

Review the package dry-run list before publication: only extension code, bundled Pi assets, package metadata and README belong in the package. Python 3 is needed only for development-time legacy asset-extraction tests; normal runtime import/export needs no Python.

## Scope and tests

- Make focused changes with tests covering success, malformed inputs, cancellation and race conditions where applicable. Tests live in `test/`; use synthetic, original artwork and temporary directories rather than copies of private pets.
- Keep the global library's independent imported copies and explicit selection. Duplicate names need confirmation; bundled Pi cannot be replaced. Imports must not select automatically.
- Portable package schema 1 and original-export fixed frame counts remain supported. Schema 2 supports seven variable-length animation tracks; preserve frame order, digests and bounded ZIP behavior. Never loosen path, symlink, image, decompression or resource limits as a side effect of new formats.
- The Linux offline Codex CLI adapter reads documented pet manifests and cached spritesheets only. It does not fetch artwork or follow account/CLI selection. Official desktop apps, ChatGPT cloud pets, linked sync, and macOS/Windows source adapters are not supported by this implementation; do not imply otherwise in docs or tests.
- Keep source provenance local-only and recheck protected export destinations inside the final mutation reservation. Avoid moving user material into bundled `assets/`.

## Privacy and artwork

Do not commit imported pet directories, original export ZIPs, screenshots, user account files, tokens, chat data, or proprietary spritesheets. Check staged files before committing to ensure private material is absent. The checked-in Pi artwork has no documented redistribution grant: resolve rights and a project license before distributing artwork. Do not infer permission from an asset being available locally.

## Before handing off a change

Run the full test suite, typecheck and package dry-run; report results and any unverified platform/visual behavior. Keep `README.md` aligned with the commands and supported platforms. Explain compatibility changes and any source-protection implications in the change description.
