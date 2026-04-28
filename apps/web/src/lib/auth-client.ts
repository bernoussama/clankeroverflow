import {
  adminClient,
  anonymousClient,
  usernameClient,
} from "better-auth/client/plugins";
import { apiKeyClient } from "@better-auth/api-key/client";
import { createAuthClient } from "better-auth/react";

import { env } from "@clankeroverflow/env/web";

export const authClient = createAuthClient({
  baseURL: `${env.NEXT_PUBLIC_SERVER_URL}/auth`,
  fetchOptions: {
    credentials: "include",
    throw: true,
  },
  plugins: [
    usernameClient(),
    apiKeyClient(),
    adminClient(),
    anonymousClient(),
  ],
});

export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
export const useSession = authClient.useSession;
export const getSession = authClient.getSession;
