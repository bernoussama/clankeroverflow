import { config, type DotenvConfigOptions } from "dotenv";

const SHARED_ENV_FILES = ["../../apps/web/.env", "../../apps/server/.env"];

export function getInfraEnvFiles(isLocal: boolean): string[] {
  return [isLocal ? "./.env" : "./.env.production", ...SHARED_ENV_FILES];
}

export function loadInfraEnv(
  isLocal: boolean,
  load = (options: DotenvConfigOptions) => config(options),
): void {
  for (const path of getInfraEnvFiles(isLocal)) {
    load({ path });
  }
}

export function getDatabaseUrlErrorMessage(isLocal: boolean): string {
  if (isLocal) {
    return "Environment variable DATABASE_URL is not set. Set it in packages/infra/.env for local infra commands.";
  }

  return [
    "Environment variable DATABASE_URL is not set.",
    "For Cloudflare deploys, set it in packages/infra/.env.production",
    "or quote the inline value so shell separators do not break it:",
    "DATABASE_URL='postgresql://...&channel_binding=require' bun run deploy",
  ].join(" ");
}
