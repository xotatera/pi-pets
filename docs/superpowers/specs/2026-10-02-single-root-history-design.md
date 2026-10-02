# Single-Root Git History — Design

## Intent and scope

Replace this repository's entire local reachable Git history with one new parentless commit on `main`. Keep the complete current tracked project snapshot (including existing design/plan documents and this new design/plan), file modes and contents. Preserve `.git/info/exclude` byte-for-byte. This supersedes the earlier selective historical ignore-rule rewrite: **do not run that rewrite**. No repository outside this checkout is changed; old commit IDs in external copies cannot be erased here.

At design time the repository has one local `main` ref, no remote, no linked worktrees, a clean working tree, and 37 commits. The prior private rules already live in `.git/info/exclude`; the tracked ignore file contains only shared rules. No private pet artifacts were found in reachable history. The baseline count will grow when design/plan are committed; preflight must use the actual count, not assume 37.

## Method

Use a parentless commit created from the current `HEAD^{tree}` with `git commit-tree`, not `git switch --orphan` or deletion of `.git`. This preserves the index and worktree exactly. Atomically move `refs/heads/main` from the expected old tip to the new commit with `git update-ref ... <new> <expected-old>`. The new commit has no parents; all older commits become unreachable once old reflogs expire. Do not create a backup ref in the original repository.

Rehearse the same method on an isolated disposable clone before changing the original. For trial and original, compare the tracked tree object ID before and after, check the new commit has zero parents and `git rev-list --all --count` is 1, verify one branch and no remotes or extra refs, run `npm test`, `npm run typecheck` and `npm pack --dry-run`. Validate original `.git/info/exclude` against a pre-operation checksum and check synthetic local ignore behavior. A disposable clone does not inherit local excludes; trial checks tree/tests, not local excludes. If trial or original validation fails, do **not** expire reflogs or prune: stop and report the exact state.

Only after successful original validation, expire all local reflogs, run `git gc --prune=now`, and verify `git fsck --full --no-reflogs --unreachable` has no surviving old objects and the old tip cannot be resolved. Remove the disposable clone and plan scratch only after verification. Do not `git clean -fdx` or remove `.git`; leave existing local configuration and excludes intact. Final state: one root commit on `main`, clean tracked tree, no remote, and unchanged local exclude bytes. Git history outside this checkout and copies stored elsewhere remain outside scope.

## Risks and boundaries

This intentionally destroys access to old local commits after cleanup. Existing commit URLs/SHAs and third-party clones will not point into the new history. Prevent accidental partial erasure by checking all refs, linked worktrees and worktree dirt before moving `main`. Retain the disposable clone until the new root's tree and tests are proven; it provides a temporary recovery copy of earlier commits until cleanup. Remove it at the end, not before. Never push or publish as part of this task.
