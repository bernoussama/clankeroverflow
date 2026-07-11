# TS2307 "Cannot find module" in pnpm workspaces with path aliases

> **Post-run technical correction:** This file preserves the recorded agent
> output below. Its `node`/`node10` statement is inaccurate: legacy Node
> resolution does not support `package.json` `exports`; packages relying on
> `exports` require `node16`, `nodenext`, or `bundler`. Its `.ts` export target
> is suitable only for a bundler or configured TypeScript loader. Stock Node
> consumers should export compiled JavaScript and declarations, for example:
>
> ```json
> {
>   "exports": {
>     ".": {
>       "types": "./dist/index.d.ts",
>       "import": "./dist/index.js"
>     }
>   }
> }
> ```
>
> This correction is additive so the original evaluation transcript remains
> auditable rather than silently rewriting what the evaluated agent produced.

The core issue is almost always **module resolution mode + `exports` map mismatch**, not the `paths` array. This is the single most common reason "works at runtime, `tsc` complains" shows up: `paths` tells TypeScript where to _remap_ an import, but it does nothing if the resolution mode (`moduleResolution`) can't even see the package's `exports`/`main`/`types` fields, or if the `paths` glob doesn't line up with how the package is imported.

Below is a diagnostic order that fixes this in 90% of cases, then concrete config.

---

## 1. Check your `moduleResolution` first (this is the #1 cause)

`paths` only behaves correctly under certain resolution modes:

- `moduleResolution: "node"` (a.k.a. `"node10"`) — the classic. Resolves `exports` **only partially** and needs `paths` for workspace packages. Most legacy setups use this.
- `moduleResolution: "node16"` / `"nodenext"` — respects `exports`/`condition` keys (`types`, `import`, `require`, `default`) strictly. If your package's `exports` doesn't declare a `"types"` condition, TS2307 happens.
- `moduleResolution: "bundler"` — the modern default for app/bundler code. Reads `exports` like nodenext but is more forgiving; great for monorepos where you ship `.ts` source.

If you've set `paths` but still get TS2307, the resolution mode is fighting you. For a modern pnpm monorepo, set this in the base tsconfig:

```jsonc
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": true,
  },
}
```

## 2. Make the workspace package resolvable via `exports` + `workspace:*` dep, not `paths`

The cleanest pattern (and the one that avoids `paths` entirely) is:

**In the importing package's `package.json`**, declare the real dependency:

```jsonc
{
  "dependencies": {
    "@yourscope/db": "workspace:*",
  },
}
```

Then **run `pnpm install`** so pnpm creates the symlink in `node_modules/@yourscope/db -> ../../packages/db`.

**In the target package's `package.json`**, point `exports` at the actual source files:

```jsonc
{
  "name": "@yourscope/db",
  "type": "module",
  "exports": {
    ".": { "default": "./src/index.ts" },
    "./*": { "default": "./src/*.ts" },
  },
}
```

With `moduleResolution: "bundler"` (or `nodenext`), TypeScript resolves `@yourscope/db` through the `node_modules` symlink, reads `exports`, and lands directly on `src/index.ts`. **No `paths` entry needed.** This is why your import works at runtime (the bundler/node does the same thing) and why it _should_ work in `tsc` once resolution mode is right.

## 3. If you must use `paths`, the glob must match the import _exactly_

Two sub-cases — they are NOT interchangeable:

**(a) Importing the package root** (`import { x } from "@yourscope/db"`):

```jsonc
"paths": {
  "@yourscope/db": ["./packages/db/src/index.ts"],
  "@yourscope/db/*": ["./packages/db/src/*"]
}
```

You need both lines. The bare `@yourscope/db` entry handles the root import; `/*` handles subpath imports.

**(b) `paths` does not create the package — `baseUrl` matters.** With `moduleResolution: "node"`, `paths` is resolved relative to `baseUrl` (or the tsconfig dir if `baseUrl` is absent). A wrong `baseUrl` silently makes every path entry miss, producing TS2307 even though the path "looks right."

## 4. `exports` must include a resolvable condition for TypeScript

Under `moduleResolution: "node16"`/`"nodenext"`/`"bundler"`, TS reads `exports` and picks the first matching **condition**. If you only have:

```jsonc
"exports": { ".": { "default": "./dist/index.js" } }
```

and `dist/index.js` doesn't exist yet (you haven't built), TS2307. Two fixes:

- Point at source: `"default": "./src/index.ts"` (preferred in dev), **or**
- Add a `types` condition: `"types": "./dist/index.d.ts"` and build the package first.

This is the classic "works at runtime, breaks in tsc" — runtime uses the dev server/bundler reading source, but `tsc` is told to read `dist` which isn't there.

## 5. Project references composite build (`tsc -b`)

If you use TypeScript project references (`"composite": true` + `"references"`), run `tsc -b` (build mode), **not** `tsc --noEmit` on a single project. Plain `tsc -p` doesn't build referenced projects, so their output `.d.ts` may be stale/absent and you get TS2307 on the referenced package. In package scripts:

```jsonc
"check-types": "tsc -b"
```

## 6. Quick verification checklist

1. `cat node_modules/@yourscope/db/package.json` — does the symlink exist and point at the right folder? If not: `pnpm install`.
2. Does that package.json have an `exports` (or `main` + `types`) entry pointing at a file that **actually exists**?
3. Is `moduleResolution` set to `bundler` or `nodenext` (recommended), or `node` with a correct `paths`+`baseUrl`?
4. Did you add the `workspace:*` dependency in the importer's package.json?
5. If using references: are you running `tsc -b`, and have referenced packages been built?
6. Restart the TS server in your editor (`tsserver` caches `paths`/`exports` aggressively — a stale cache is a frequent false-positive).

---

### Most likely fix for your situation

Since the import works at runtime, your runtime resolver (bundler/node) is reading `exports` or the symlink correctly. For `tsc` to agree, the highest-probability fixes, in order:

1. Set `"moduleResolution": "bundler"` in the base tsconfig (with `"module": "ESNext"`).
2. Ensure the target package's `exports` points at existing files (preferably source `.ts` for a dev-only monorepo).
3. Add `"@yourscope/pkg": "workspace:*"` to the importer's `dependencies` and `pnpm install`.
4. Drop the `paths` entry for workspace packages — it's redundant and often the source of the mismatch. Keep `paths` only for intra-package aliases like `@/*` → `./src/*`.

If after that TS2307 persists, check the `exports` condition order and confirm the file on disk exists at the exact relative path the `exports` value declares.
