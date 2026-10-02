# Local Excludes and Git History Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep workstation-only pet/scratch/export ignore rules local and erase their tracked `.gitignore` lines from this repository's reachable history.

**Architecture:** First verify/move ignore rules and commit the shared policy change. Rehearse a path-aware content rewrite on a disposable clone, compare its history and full test results, and only then apply the same callback to the original repository. Prune old local history only after the rewritten branch and tests are verified.

**Tech Stack:** Git, `git-filter-repo` file-info callback, Python 3 for the disposable untracked callback/verification scripts, npm test/typecheck/package checks.

**Spec:** `docs/superpowers/specs/2026-10-02-local-excludes-history-design.md`

## Global Constraints

- The owner explicitly requested a history rewrite, even though a read-only audit found zero matching private artifacts ever tracked in reachable history. Scrub only the prior tracked ignore-rule text, never unrelated tracked code/docs/artwork.
- Do not put the exact private rule lines into this tracked plan, spec, contributor docs or committed scripts. Exact variants derived from current/historical `.gitignore` belong only in an ignored temporary callback under `.superpowers/` and local `.git/info/exclude`.
- Do not rewrite with any unexpected ref, worktree, remote or dirty worktree. Current baseline is one `main` branch, 33 commits before this plan's commit, no remotes; preserve prior pet-deletion work.
- Preserve all other tracked `.gitignore` rules. Local `.git/info/exclude` retains its existing workstation entries and adds the four private rule families once; it is not committed.
- Trial rewrite in a disposable clone before original. Use `--file-info-callback` only for `.gitignore`, `--replace-refs delete-no-add`, `--prune-empty never`, `--prune-degenerate never`; use `--no-gc` on the original to retain old objects until validation. Never global replace-text or a cloud service. Use the same callback file for trial and original.
- Verify all reachable rewritten commits, unchanged non-`.gitignore` trees, current ignore behavior and full `npm test`, `npm run typecheck`, `npm pack --dry-run`. Old objects/reflogs are not pruned until all comparisons pass. Remove the disposable clone when done.
- No push, publish or rewrite outside this checkout. External clones/references to old commit IDs cannot be scrubbed here; report changed IDs and this limit.

## Review Focus

- A second ref or worktree appears after the initial inventory: abort before rewrite rather than leave old reachable rules (Task 3 preflight).
- An untracked local pet ZIP is exposed when rules move: prove synthetic private patterns are ignored by local exclude while tracked assets/docs remain trackable (Task 1).
- An older `.gitignore` uses unanchored rule syntax: trial must scan every historical version, not only current HEAD (Task 2).
- Callback accidentally rewrites another blob or changes line endings: compare every non-target historical tree/file and reject trial (Task 2).
- Old reflog/unreachable objects remain after rewritten branch verification: final fsck and reflog checks must prove local cleanup (Task 3).

## File Map

- Modify `.gitignore`: shared rules only; preserve existing unrelated entries.
- Modify `.git/info/exclude`: local-only private rules (untracked Git metadata).
- Modify `AGENTS.md` and `CONTRIBUTING.md`: disclose local exclude prerequisite and privacy risk without restating exact private rules.
- Create untracked/ignored `.superpowers/history-rewrite/file-info-callback.py` and verification outputs for the single controlled rewrite; remove them after verification.
- Use disposable clone under `/tmp/` with unique owned path, no home mount or cloud access; remove it after successful final verification.

---

### Task 1: Move Rule Ownership Without Rewriting

**Files:** Modify `.gitignore`, `.git/info/exclude`, `AGENTS.md`, `CONTRIBUTING.md`.

**Interfaces:** Produce a committed shared ignore policy and an untracked local exclude that covers root scratch, imported-pet and export artifact families. Do not copy the exact rules into tracked docs.

- [ ] **Step 1: Record RED ignore assertions** with `git check-ignore -v --no-index` for synthetic scratch/import/export names, and a Python assertion that the private lines occur in tracked `.gitignore`. Verify the baseline identifies the tracked rule file. Verify `git status --porcelain -uall` is empty before editing.
- [ ] **Step 2: Edit the four rule families** into `.git/info/exclude`, deduplicating. Remove their tracked rules and orphan headings from `.gitignore`. Adjust `AGENTS.md` and `CONTRIBUTING.md` so a new clone's owners must configure local exclusion before handling private material.
- [ ] **Step 3: Verify GREEN ignore assertions**: the same synthetic names resolve to `.git/info/exclude`, the tracked `.gitignore` lacks the private lines, and bundled assets, package lock, docs and contributor files remain trackable. Run `npm test && npm run typecheck && npm pack --dry-run`; expected all pass. Verify no private files were added to the index.
- [ ] **Step 4: Commit tracked files only** as `chore: move private artifact ignore rules to local exclude`; recheck clean status and that `.git/info/exclude` is untracked.

### Task 2: Rehearse Path-Aware History Rewrite

**Files:** Create ignored `.superpowers/history-rewrite/file-info-callback.py`, trial clone under `/tmp/` and ignored audit summaries. No tracked edits.

**Interfaces:** Callback body for `git filter-repo --file-info-callback FILE` returns `(filename, mode, blob_id)` untouched unless `filename == b'.gitignore'`; for this file, remove exact historic private rule lines and their orphaned headings, then insert rewritten bytes via `value.insert_file_with_contents()`. Preserve other lines/newline style and return original mode. Build exact byte-match set by read-only inspection of historical `.gitignore` revisions; assert each version removes only agreed lines. Do not write targets to tracked files.

- [ ] **Step 1: Inventory history**: record original commit count, refs, worktrees, remote count and per-commit non-target tree SHA mapping in ignored workspace. Ensure zero matching private artifact paths in `git log --all --name-only` and no unexpected refs/untracked files. Derive all anchored/unanchored historic rule variants from `.gitignore` only.
- [ ] **Step 2: Write callback and independent audit** in ignored workspace. Before running filter, audit historical `.gitignore` blobs and assert private lines are present (RED) while unrelated line snapshots are recorded. Unit-test the callback transformation on every historical `.gitignore` blob in memory: private rule bytes gone, unrelated bytes preserved.
- [ ] **Step 3: Create owned disposable clone** using `git clone --no-local` into a unique `/tmp/` directory. Run `git filter-repo --force --file-info-callback FILE --replace-refs delete-no-add --prune-empty never --prune-degenerate never` there. No interaction with origin other than cloning.
- [ ] **Step 4: Verify trial GREEN**: private rule lines absent from every historical `.gitignore`; unchanged non-target blobs/paths and commit count, trial HEAD text policy matches Task 1, and full `npm test && npm run typecheck && npm pack --dry-run` pass in the trial. On any mismatch STOP without modifying original.

### Task 3: Rewrite Original and Remove Old Local Objects

**Files:** Git commit graph/reflogs in this checkout, ignored callback/audit outputs, disposable clone. No new tracked file edits.

**Interfaces:** Consume the validated callback and trial audit from Task 2. Produce one verified rewritten `main` with same non-target file contents/history semantics and local-only private ignore rules. Do not preserve an old-history backup ref in the final repository.

- [ ] **Step 1: Repeat preflight**: clean working tree, exactly one branch `main`, no tags/extra refs, no remotes or linked worktrees, same tip and callback SHA as trial input. Abort if anything changed. Keep trial clone as temporary recovery until original verification completes.
- [ ] **Step 2: Apply identical `git filter-repo` callback** to the original, with `--force --no-gc --replace-refs delete-no-add --prune-empty never --prune-degenerate never`. `--no-gc` is mandatory: the tool otherwise expires reflogs/prunes automatically before verification. Report new tip SHA and commit count without printing private rule text.
- [ ] **Step 3: Verify original against trial**: compare rewritten reachable commit/tree/file identities or content; all historical `.gitignore` files lack private lines; non-target files match, current `git check-ignore` shows local excludes, `npm test && npm run typecheck && npm pack --dry-run` pass. On failure STOP with old objects still recoverable; no cleanup.
- [ ] **Step 4: Irreversible local cleanup**: expire all reflogs with `git reflog expire --expire=now --expire-unreachable=now --all`, run `git gc --prune=now`, inspect `git fsck --full --no-reflogs --unreachable` and current refs for old-history survivors. Remove the owned trial clone and ignored rewrite workspace after verified success. Confirm clean `main`, one ref, no remote, and explicitly report that outside clones may still retain old commit IDs.
