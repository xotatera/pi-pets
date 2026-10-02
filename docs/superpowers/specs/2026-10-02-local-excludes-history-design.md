# Local Excludes and Git History Rewrite — Design

## Intent

The owner wants workstation-only scratch logs, imported pet sources and export archives removed from the tracked ignore policy and placed in this repository's local, untracked Git exclude file. The owner also explicitly wants historical tracked ignore-rule text removed, even though a read-only audit found **zero matching artifact paths in reachable Git history**. Preserve all unrelated ignore rules and other tracked content. Do not claim this can erase clones or copies outside this repository.

The approved pet-deletion feature is already committed; the rewrite starts from a clean `main`. There is one branch and no remote. `git-filter-repo` is available. Do not include the exact private rules in this spec or plan, because that would reintroduce the text into newly committed history.

## Current and future ignore policy

- The four private-rule families are the project-root scratch-work directory, root imported-pet directory and two root export-archive patterns. Move the exact active rules from the present tracked ignore file into `.git/info/exclude` locally. Preserve existing workstation-only entries there. Avoid duplicate rules.
- Shared dependency/build/cache/log/credential ignore patterns remain in tracked `.gitignore`. The user-private rules must not remain as active rules or comments in its final version.
- The local exclude file is not portable. Contributor guidance should explain that people who work with private assets must configure their own local excludes and check `git status` before commits; do not publish personal art or archives. The project's npm `files` allowlist stays unchanged.

## History operation

1. Verify a clean worktree, one known branch, no remote, the 33-commit baseline and that no matching private artifacts were ever tracked. Inspect all Git refs, worktree registrations and relevant reflogs. Refuse to proceed if an unexpected ref/worktree or dirty state appears. Avoid printing private filenames/content.
2. Make the tracked policy change and local exclude change; test `git check-ignore` on synthetic names for all moved rules and ensure bundled assets/design docs stay trackable. Commit the tracked change before rewriting, so it too is part of the rewritten history. Verify tests/typecheck/package before the destructive phase.
3. Test the rewrite on a disposable local clone with no external sharing. Use `git-filter-repo` with a path-aware file-info callback to transform only historical `.gitignore` blobs, deleting the exact private rule lines in both their current and previously recorded syntax. Remove now-orphaned private section headings, preserve all other lines in their original order. No global replace-text: it could alter user code, docs or arbitrary blobs. Rewrite all local reachable refs consistently, not just tip content.
4. Verify the disposable clone before touching the original: rule lines absent from every historical `.gitignore`, no unexpected paths changed, expected commit count/content remains, and full tests/typecheck/package pass. If this fails, leave the original untouched and report findings.
5. Rewrite the original with the same tested callback. Compare reachable trees by path and content against the trial result, verify all historical `.gitignore` versions and current excludes. Run full tests/typecheck/package. Only after this verification expire local reflogs and prune unreachable objects; remove the disposable clone and filter-repo scratch/old-object references. This is deliberately irreversible in the local repository. Final check: no old rules reachable or locally recoverable via reflog/unreachable objects; no remote was changed.

## Boundaries and risks

- Commit IDs change from the earliest affected commit forward. Any external references to previous IDs require coordination, even though no remote is currently configured. Never force-push or rewrite a different clone.
- Zero private artifact paths were tracked in reachable history. The operation sanitizes only past ignore-policy text; it does not purport to remove secrets, user files elsewhere, or Git objects in external copies. Stop if discovery contradicts this baseline.
- A cleanup error must not cause loss of the verified rewritten branch: keep the original Git objects until tree/content checks pass. Do not use broad cleanup such as `git clean -fdx` on the working tree.
