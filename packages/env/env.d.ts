/// <reference types="@cloudflare/workers-types" />
import { type server } from "@clankeroverflow/infra/alchemy.run";

// This file infers types for the cloudflare:workers environment from your Alchemy Worker.
// @see https://alchemy.run/concepts/bindings/#type-safe-bindings

export type CloudflareEnv = typeof server.Env & {
  /** Workers KV for solution list/search/detail caching (optional in plain wrangler dev). */
  SOLUTIONS_KV?: KVNamespace;
};

declare global {
  type Env = CloudflareEnv;
}

/** Merges into workers-types `Cloudflare.Env` (type of `import("cloudflare:workers").env`). */
declare namespace Cloudflare {
  interface Env {
    SOLUTIONS_KV?: KVNamespace;
  }
}
