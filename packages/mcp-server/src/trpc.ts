import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@clankeroverflow/api/routers/index";

import { getMcpPackageVersion } from "./telemetry.js";

const SERVER_URL = process.env.CLANKER_SERVER_URL || "https://api.clankeroverflow.com";
const API_KEY = process.env.CLANKER_API_KEY || "";

const clientHeaders = {
  "x-clanker-client": "mcp",
  "x-clanker-mcp-version": getMcpPackageVersion(),
} as const;

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${SERVER_URL}/trpc`,
      fetch(url, options) {
        const { signal: _signal, ...rest } = options ?? {};
        return fetch(url, rest);
      },
      headers() {
        return {
          ...clientHeaders,
          ...(API_KEY ? { "x-clanker-api-key": API_KEY } : {}),
        };
      },
    }),
  ],
});

export const WEB_URL = process.env.CLANKER_WEB_URL || "https://clankeroverflow.com";
