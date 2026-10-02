# Single-Root Git History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace local `main` history with one parentless snapshot commit while preserving every tracked file and `.git/info/exclude` byte-for-byte.

**Architecture:** Rehearse a parentless commit/tree snapshot and atomic ref update in an isolated `--no-local` clone. Verify the clone's root commit, tree, tests and packaging, then repeat in this repo with an expected-old-value ref update. Only after original verification expire reflogs and prune unreachable history.

**Tech Stack:** Git (`commit-tree`, `update-ref`, `fsck`, `gc`), Python 3 for bounded assertions, npm.

**Spec:** `docs/superpowers/specs/2026-10-02-single-root-history-design.md`

## Global Constraints

- Supersedes the selective historical `.gitignore` rewrite plan. Do not run `git-filter-repo`; do not delete/reinitialize `.git`.
- Preserve current tracked project snapshot exactly, including docs and file modes. Current tree ID before ref movement must equal final root tree ID.
- Preserve `.git/info/exclude` bytes via before/after SHA-256; do not commit or copy its contents into the disposable clone.
- Stop if dirty, not on `main`, extra refs/tags/remotes/worktrees/alternates are present, or trial validation fails. No worktree for original; use a disposable clone only for rehearsal.
- Move `refs/heads/main` atomically from its expected old tip using `git update-ref`; never leave old history reachable through a backup ref. Keep the trial clone until original validation is complete.
- New commit has zero parents; `git rev-list --all --count` must equal 1. Run `npm test`, `npm run typecheck`, `npm pack --dry-run` in trial and original.
- Expiring reflogs and pruning old objects is irreversible and occurs only after validation. No remote/push/publish; external clones remain unaffected.

## Review Focus

- A local tag, replace ref, linked worktree or remote appears before ref move: abort and leave old history intact (Task 2 preflight).
- Trial clone inherits alternates/depends on original object store: use `--no-local` and assert no alternates (Task 1).
- Snapshot has same files but different modes/content or excludes are lost: compare tree OID and exclude hash before pruning (Tasks 1–2).
- Root ref update races with a new commit: expected-old-value check must fail without changing `main` (Task 2).
- Old tip remains reachable through reflog/hidden refs or survives pruning: audit all refs/reflogs, fsck and `cat-file` before declaring clean (Task 2).

## File Map

- Tracked: this plan is the last intended addition; no product files are edited.
- Original Git metadata: `refs/heads/main`, reflogs and objects rewritten/pruned; `.git/info/exclude` remains unchanged.
- Ignored audit workspace: `.superpowers/sdd/2026-10-02-single-root-history/` records expected tree/tip/exclude hash and trial path; removed only after verification.
- Disposable clone: uniquely owned `/tmp/pi-pets-single-root.*` directory; remove only after original passes.

---

### Task 1: Preflight and Disposable Trial

**Files:** Ignored audit workspace and disposable clone; original Git refs unchanged.

**Interfaces:** Produce validated trial root tree OID equal to original preflight tree OID and record old tip, original commit count, exclude SHA-256, trial path and new trial root; Task 2 consumes these values.

- [ ] **Step 1: Record RED state assertions**: original `git rev-list --all --count` > 1 and `git rev-list --parents -n 1 HEAD` contains a parent; verify clean working tree, exactly one `refs/heads/main`, one worktree, no remote/alternates. Save only SHA IDs and owned temp path in ignored workspace. Hash `.git/info/exclude` without copying contents.
- [ ] **Step 2: Clone** using `git clone --no-local -- <absolute-original-path> <uniquely-created-temp>/repo`; assert clone's `HEAD^{tree}` equals recorded tree and `objects/info/alternates` does not exist. Treat its auto-created `origin` remote as trial-only and remove it before final trial check.
- [ ] **Step 3: Rewrite trial ref**: `tree=$(git rev-parse HEAD^{tree})`, `old=$(git rev-parse HEAD)`, `new=$(printf 'Initialize Pi Pets snapshot\n' | git commit-tree "$tree")`, `git update-ref refs/heads/main "$new" "$old"`. Run assertions for zero parents, same tree, one reachable commit, one ref and clean worktree (GREEN).
- [ ] **Step 4: Verify trial runtime**: `npm ci --ignore-scripts` (trial only), `npm test`, `npm run typecheck`, `npm pack --dry-run`; assert 0 failures and no unexpected private files in package list. On failure STOP; do not touch original ref. Preserve trial clone until original passes.

### Task 2: Original Ref Reset, Validation and Cleanup

**Files:** Original Git metadata, ignored workspace and trial clone. No tracked edits.

**Interfaces:** Consume Task 1's checked trial and preflight hashes; produce exactly one root commit on `main`, same tracked tree and exclude bytes, no reachable or locally dangling old history.

- [ ] **Step 1: Recheck preflight**: clean `main`, exactly one ref/worktree, no remotes/alternates; tip and tree exactly equal Task 1 values, exclude SHA-256 unchanged. If any fails STOP.
- [ ] **Step 2: Atomically move original ref** with the same `commit-tree`/`update-ref <new> <expected-old>` sequence as trial. Assert new `HEAD` is root, tree ID matches Task 1's expected tree, one reachable commit/branch and clean tracked worktree. On validation failure STOP without GC: old objects remain recoverable until cleanup.
- [ ] **Step 3: Validate production snapshot**: hash `.git/info/exclude`, assert synthetic workstation/pet/export patterns are ignored locally and code/docs remain trackable, run `npm test && npm run typecheck && npm pack --dry-run`; compare results/tree against trial. Stop on any mismatch.
- [ ] **Step 4: Prune local old history**: expire all reflogs (`git reflog expire --expire=now --expire-unreachable=now --all`), run `git gc --prune=now`; assert old tip fails `git cat-file -e`, no extra refs/reflogs, `git fsck --full --no-reflogs --unreachable` reports no orphan objects, HEAD remains a single root with original tree, exclude SHA-256 still matches. Remove only the owned disposable clone and this plan's ignored workspace after all checks. Report irreversible local reset and that external copies are untouched.
