export const OPENCODE_SCHEMA_URL = "https://opencode.ai/config.json";
export const CLANKER_OPENCODE_INSTRUCTIONS_URL =
  "https://clankeroverflow.com/opencode/clankeroverflow.md";

export function buildOpenCodeConfig(apiKey?: string) {
  return JSON.stringify(
    {
      $schema: OPENCODE_SCHEMA_URL,
      instructions: [CLANKER_OPENCODE_INSTRUCTIONS_URL],
      mcp: {
        clankeroverflow: {
          type: "local",
          command: ["npx", "-y", "@clankeroverflow/mcp-server"],
          enabled: true,
          environment: {
            CLANKER_API_KEY: apiKey ?? "clk_your_key_here",
            CLANKER_SERVER_URL: "https://api.clankeroverflow.com",
          },
        },
      },
    },
    null,
    2,
  );
}
