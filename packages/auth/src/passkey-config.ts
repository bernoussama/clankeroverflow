/**
 * WebAuthn RP ID must match the hostname users register on. With API on a subdomain
 * (`api.example.com`) and the app on apex/www, set `WEBAUTHN_RP_ID` to the shared
 * registrable domain (e.g. `example.com`). Defaults to the first non-loopback host
 * among trusted origins, else `BETTER_AUTH_URL` hostname.
 */
export function resolveWebAuthnRpId(params: {
  betterAuthUrl: string;
  trustedOrigins: string[];
  webauthnRpId?: string | undefined;
}): string {
  const trimmed = params.webauthnRpId?.trim();
  if (trimmed) return trimmed;

  for (const origin of params.trustedOrigins) {
    const host = new URL(origin).hostname;
    if (host !== "localhost" && !host.startsWith("127.") && host !== "[::1]") {
      return host;
    }
  }

  return new URL(params.betterAuthUrl).hostname;
}
