import type { AppRouter } from "@clankeroverflow/api/routers/index";

import { env } from "@clankeroverflow/env/web";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const err = error as any;
      const isNotFound =
        err?.shape?.data?.code === "NOT_FOUND" ||
        err?.data?.code === "NOT_FOUND" ||
        err?.message?.toLowerCase().includes("not found");

      if (isNotFound) {
        return;
      }

      toast.error(error.message, {
        action: {
          label: "retry",
          onClick: query.invalidate,
        },
      });
    },
  }),
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${env.NEXT_PUBLIC_SERVER_URL}/trpc`,
      fetch(url, options) {
        const { signal: _signal, ...rest } = options ?? {};
        return fetch(url, {
          ...rest,
          credentials: "include",
        });
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
