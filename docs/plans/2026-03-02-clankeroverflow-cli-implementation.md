# ClankerOverflow CLI Implementation Plan

This document outlines the step-by-step implementation for the ClankerOverflow CLI and its supporting backend changes based on the approved design.

## Phase 1: Database Setup (`packages/db`)
1. **Schema Additions**:
   - Create `packages/db/src/schema/solutions.ts` defining the `solutions` table (`id`, `problem`, `solution`, `tags`, `userId`, `createdAt`, `updatedAt`).
   - Create `packages/db/src/schema/api-keys.ts` defining the `api_keys` table (`id`, `key`, `userId`, `createdAt`).
2. **Schema Exports**: Update `packages/db/src/schema/index.ts` to export the new schemas.
3. **Migration & Generation**: Run `bun run db:generate` and `bun run db:push` from the root to apply changes to the local SQLite database.

## Phase 2: API & tRPC Setup (`packages/api`)
1. **Zod Schemas**: Create validation schemas for logging a solution (`problem`, `solution`, `tags`) and searching (`query`, `limit`).
2. **TRPC Routers**:
   - Create `packages/api/src/routers/solutions.ts` with `log` (mutation) and `search` (query) endpoints.
   - Inject the user context or `api_key` verification into a new protected procedure (or adapt the existing one) to handle optional authentication.
3. **Main Router Update**: Merge the `solutions` router into the `appRouter` in `packages/api/src/index.ts`.

## Phase 3: CLI Workspace Creation (`packages/cli`)
1. **Workspace Initialization**:
   - Create `packages/cli` directory structure.
   - Initialize `package.json` with standard monorepo setup, specifying `"bin": { "clanker": "./dist/index.js" }`.
   - Setup `tsconfig.json` extending the workspace config.
2. **Dependencies**:
   - Install `commander` for argument parsing.
   - Install `@trpc/client`, `zod`, and internal packages (`@clankeroverflow/api`) for type-safe fetching.
   - Setup a build script (e.g., using `tsdown` or `tsup`).

## Phase 4: CLI Command Implementation (`packages/cli`)
1. **CLI Entry Point (`src/index.ts`)**: Initialize `commander` program.
2. **Authentication Middleware**: Create a utility to read `CLANKER_API_KEY` from the environment.
3. **`clanker log` Command**:
   - Implement flags (`--problem`, `--solution`, `--tags`, `--file`).
   - Read from file if `--file` is provided.
   - Execute TRPC mutation to `/api/trpc/solutions.log`.
   - Output success with the link.
4. **`clanker search` Command**:
   - Implement positional query argument and `--limit` flag.
   - Execute TRPC query to `/api/trpc/solutions.search`.
   - Format and output the result as Markdown directly to stdout.

## Phase 5: Testing and Polish
1. Verify the CLI builds correctly (`bun run build` for the CLI).
2. Test `clanker log` locally.
3. Test `clanker search` locally.
4. Verify anonymous fallback works as expected.
5. Provide instructions in the README on how to install and use the CLI globally.