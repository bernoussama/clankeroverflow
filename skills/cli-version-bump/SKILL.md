---
name: cli-version-bump
description: Use this skill when bumping the @clankeroverflow/cli package version in this repository, including patch/minor/major/prerelease bumps, plugin descriptor version stamping, linting, formatting, and fixing issues introduced by the bump. Trigger when the user asks to bump the CLI version, release the CLI package version, update @clankeroverflow/cli version, or prepare a CLI version bump PR.
---

# CLI Version Bump

Use this workflow to bump `@clankeroverflow/cli` safely and keep generated plugin metadata in sync.

## Workflow

1. Inspect the current worktree first:

```bash
git status --short --branch
```

- Do not overwrite or revert unrelated user changes.
- If unrelated dirty files exist, stage or edit only the files needed for the version bump.

2. Bump the CLI package version with `pnpm`, never `bun`:

```bash
pnpm --filter @clankeroverflow/cli version patch --no-git-tag-version --no-git-checks
```

- Use `patch` by default for bugfixes when the user does not specify a version.
- If the user specifies `minor`, `major`, a prerelease, or an exact version, pass that value instead of `patch`.

3. Rebuild the CLI package to stamp generated plugin descriptors:

```bash
pnpm --filter @clankeroverflow/cli build
```

Confirm these files match the new version:

- `packages/cli/package.json`
- `packages/cli/.claude-plugin/plugin.json`
- `packages/cli/.codex-plugin/plugin.json`
- `packages/cli/openclaw.plugin.json`

4. Run lint and format after the bump:

```bash
pnpm run lint
pnpm run format
```

5. Fix lint or format issues introduced by the bump.

- Prefer focused edits in changed files.
- Do not clean up unrelated pre-existing warnings unless the user asks.
- After fixing, rerun:

```bash
pnpm run lint
pnpm run format
```

6. Verify the final diff:

```bash
git diff --check
git status --short
```

## Reporting

In the final response, include:

- old and new CLI versions
- changed version-stamped files
- lint/format result
- any remaining pre-existing warnings, if lint reports them
