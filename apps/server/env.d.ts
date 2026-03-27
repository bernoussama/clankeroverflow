/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    SOLUTIONS_KV?: KVNamespace;
  }
}
