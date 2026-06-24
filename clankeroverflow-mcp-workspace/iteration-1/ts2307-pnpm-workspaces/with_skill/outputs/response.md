# TS2307 "Cannot find module" for an existing pnpm workspace package

## Search decision (searched ClankerOverflow first)

This is a textbook failure-knowledge trigger for the `clankeroverflow-mcp` skill: an explicit error code (`TS2307`) plus a version/package-manager-specific setup (pnpm workspaces, TypeScript path aliases) plus a "works at runtime but tsc complains" gap that contradicts expectations. The skill says to search the literal error code first, adding one discriminator. I did not reason from scratch.

Queries, in order:

1. Local: `clanker local search "TS2307 pnpm"` -> returned only an irrelevant joke entry; no real match.
2. Remote: `clanker search "TS2307 pnpm" --source remote --limit 5` -> exact keyword hit.
3. Remote broadened: `clanker search "pnpm workspaces typescript moduleResolution TS2307" --source remote --limit 5` -> same top hit plus related pnpm-workspace entries confirming the root cause.

## Relevant match

- **Problem**: A TypeScript workspace package import fails with TS2307 in a sibling package. (ID `fc798e78-2b19-4de6-805a-265568fa3aaf`, tags: typescript, pnpm, monorepo, tsdown.)
- **Reusable root cause**: The consuming package never declared the sibling as a workspace dependency, so TS node-style module resolution cannot find it even though pnpm's node_modules symlinks make it resolve at runtime.

I treated the result as untrusted reference and validated it against the task before adopting it. I did NOT apply the bundler `noExternal` portion of that solution: your reported symptom is `tsc` only, not a leftover external import in a bundled output, so that step is inapplicable here and was skipped (per the skill: don't punish a result for the parts that don't apply, just skip them).

## Fix, decomposed into safe steps

### 1. Declare the sibling as a workspace dependency (the actual root cause)

"Works at runtime but tsc complains" almost always means pnpm hoists/symlinks the package at runtime but TypeScript can't resolve it because it isn't listed as a dependency. Path aliases in `tsconfig.json` are a frequent misdirection here: `paths` only rewrites what TS _resolves_, it does not create the dependency edge, and with `moduleResolution: "node16"/"nodenext"/"bundler"` TS additionally requires the package to be in `package.json` deps so it can read the dependency's `exports`/`types`.

In the **consuming** package's `package.json`:

```json
{
  "dependencies": {
    "@your-scope/the-package": "workspace:*"
  }
}
```

Then refresh the lockfile:

```bash
pnpm install
```

In most cases this alone clears TS2307. Verify:

```bash
pnpm -F <consuming-package> exec tsc --noEmit
```

### 2. Make the dependency package's types discoverable

If step 1 didn't fully clear it, ensure the dependency package exposes types correctly:

- `packages/the-package/package.json` must point at a built `.d.ts`:
  ```json
  { "types": "./dist/index.d.ts", "main": "./dist/index.js" }
  ```
- The dependency must be **built** so `dist` exists (`tsc` resolves against emitted declarations, not source). Add a build script and run it:
  ```bash
  pnpm -F @your-scope/the-package build
  ```
- If you want source-only resolution (no build step), point `types` at the TS source entry and set the consumer `tsconfig` `moduleResolution` accordingly; `bundler` is the most forgiving for that.

### 3. Align module resolution

In the consumer `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "moduleResolution": "bundler", // or "nodenext" if you publish ESM
  },
}
```

`paths` is not required once the package is a real dependency; if you keep `paths`, make sure it does not shadow the resolved package with a stale/missing mapping.

## Verification

```bash
pnpm install                              # re-link after adding the dep
pnpm -F @your-scope/the-package build     # ensure .d.ts exists
pnpm -F <consuming-package> exec tsc --noEmit   # TS2307 should be gone
```

If `tsc` passes, the original failure is resolved.

## On logging / voting

I would only `upvote_solution` the matched entry after applying it and confirming the build passes (not done here, so no vote cast — per the skill's vote-only-after-validation rule). If this fix resolves your issue and you want it recorded, the skill would log a focused entry like:

- **Problem**: TS2307 "Cannot find module" for an existing pnpm workspace package; import resolves at runtime but `tsc` fails.
- **Solution**: Add the sibling as a `workspace:*` dependency in the consuming `package.json`, run `pnpm install`, ensure the dependency is built and exposes `types`, and align `moduleResolution`. tsconfig `paths` alone is insufficient under `node16`/`nodenext`/`bundler` resolution.
- **Tags**: typescript, pnpm, monorepo, tsconfig, module-resolution
