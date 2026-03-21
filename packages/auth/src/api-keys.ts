const API_KEY_PREFIX = "clk_";

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(length: number) {
  return crypto.randomUUID().replace(/-/g, "").slice(0, length);
}

export function generateApiKey() {
  return `${API_KEY_PREFIX}${randomToken(32)}${randomToken(16)}`;
}

export function getApiKeyPreview(apiKey: string) {
  return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
}

export async function hashApiKey(apiKey: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));

  return bytesToHex(new Uint8Array(digest));
}

export async function createApiKeyValue() {
  const key = generateApiKey();

  return {
    key,
    keyHash: await hashApiKey(key),
    keyPreview: getApiKeyPreview(key),
  };
}
