---
name: sync-upstream
description: >-
  Safely merge fluxerapp/fluxer upstream into this Quad4 fork without discarding
  fork changes. Use when the user asks to update from upstream, sync with
  upstream, pull upstream/main, merge fluxerapp, or refresh the fork from
  origin fluxer.
---

# Sync upstream safely

Merge `upstream/main` into local `master` so fork history and fork-owned settings stay intact.

## Preconditions

1. Confirm remotes exist:
   - `origin` → `Quad4-Software/fluxer`
   - `upstream` → `fluxerapp/fluxer`
2. If `upstream` is missing: `git remote add upstream https://github.com/fluxerapp/fluxer.git`
3. Working tree must be clean. If dirty, stash or commit only when the user asks. Do not discard local work.
4. Current branch should be `master` unless the user names another branch.

## Procedure

```bash
git fetch upstream
git rev-list --count HEAD..upstream/main   # incoming
git rev-list --count upstream/main..HEAD   # fork-only commits to keep
git log --oneline HEAD..upstream/main      # summarize for the user if useful
git merge upstream/main -m "Merge upstream/main into master"
```

If already up to date, stop and report that. Do not push unless asked.

## Conflict rules

Resolve conflicts by **keeping fork intent**, then fold in upstream fixes that do not undo that intent.

### Prefer ours (fork)

| Area | Keep |
|------|------|
| `package.json` `packageManager` | `pnpm@11.9.0` (do not downgrade to upstream 10.x) |
| `pnpm-workspace.yaml` | Fork catalog versions and overrides. Do not accept a mangled auto-merge with duplicated keys (`peerDependencyRules`, `patchedDependencies`, `overrides`). If auto-merge duplicates sections, restore from `HEAD` then re-apply only true upstream additions. |
| `pnpm-lock.yaml` | Start from ours. Regenerate with `pnpm install` only if merged package manifests actually changed dependency graphs. |
| CI workflows | Keep fork `on.push.branches: [master]` (and similar) customizations. |
| Quote/style forks | e.g. `packages/errors/src/i18n/locales/en-GB.ts` single-quote style |

### Prefer upstream when intentional

- Upstream **removed** a job or file on purpose (example: Dart SDK validation job removal). Keep fork trigger customizations on the same file, drop the removed job.
- Small string or bugfix on a shared key while keeping fork file structure (example: Slowmode wording).
- New features/files with no fork equivalent: take upstream.

### Never

- `git reset --hard upstream/main`
- `git merge -X theirs upstream/main` as a blanket strategy
- `git checkout --theirs .` or mass `--ours` without reading each conflict
- Rebase of long fork history onto upstream unless the user explicitly requests it
- Force push to `origin`
- Skip pre-commit hooks

## After conflicts

1. Ensure no conflict markers remain: search for `<<<<<<<`, `=======`, `>>>>>>>`
2. `git add` resolved paths
3. Finish with merge commit message `Merge upstream/main into master`
4. If pre-commit needs Rust: toolchain `1.93.0` matches CI (`rustup default 1.93.0` and rustfmt). Do not use `--no-verify`.
5. Verify: `git rev-list --count HEAD..upstream/main` is `0`, and fork-only commit count is still non-zero.
6. Report a short upstream change summary. Push only if asked.

## Quick conflict checklist

```
- [ ] packageManager still pnpm@11.9.0
- [ ] pnpm-workspace.yaml has no duplicated top-level keys
- [ ] CI push-to-master triggers still present where this fork added them
- [ ] Fork-only locale/style files kept, upstream string fixes applied if any
- [ ] Merge commit completed, working tree clean
- [ ] Not pushed unless user requested
```
