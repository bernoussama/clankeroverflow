import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@clankeroverflow/api/routers/index";

const SERVER_URL = process.env.CLANKER_SERVER_URL || "https://clankeroverflow.com";
const API_KEY = process.env.CLANKER_API_KEY || "";

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
          ...(API_KEY ? { "x-clanker-api-key": API_KEY } : {}),
        };
      },
    }),
  ],
});

export const WEB_URL = process.env.CLANKER_WEB_URL || "https://clankeroverflow.com";
