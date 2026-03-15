import { env } from "@clankeroverflow/env/web";
import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_SERVER_URL,
  plugins: [apiKeyClient()],
});
