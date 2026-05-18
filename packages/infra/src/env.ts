import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config, parse, type DotenvConfigOptions } from "dotenv";

const LOCAL_INFRA_ENV_FILE = "./.env";
const PRODUCTION_INFRA_ENV_FILE = "./.env.production";
const SHARED_ENV_FILES = ["../../apps/web/.env", "../../apps/server/.env"];

type DotenvLoader = (options: DotenvConfigOptions) => ReturnType<typeof config>;
type EnvFileReader = (path: string) => string | null;

export function getInfraEnvFiles(isLocal: boolean): string[] {
  return isLocal ? [LOCAL_INFRA_ENV_FILE, ...SHARED_ENV_FILES] : [PRODUCTION_INFRA_ENV_FILE];
}

function readEnvFile(path: string, read: EnvFileReader): Record<string, string> {
  const contents = read(path);
  return contents ? parse(contents) : {};
}

function readInfraEnvFile(path: string): string | null {
  try {
    return readFileSync(resolve(process.cwd(), path), "utf8");
  } catch {
    return null;
  }
}

function clearShadowedLocalEnvValues(
  selectedEnvPath: string,
  env: NodeJS.ProcessEnv,
  read: EnvFileReader,
): void {
  const localEnv = readEnvFile(LOCAL_INFRA_ENV_FILE, read);
  const selectedEnv = readEnvFile(selectedEnvPath, read);

  for (const [key, selectedValue] of Object.entries(selectedEnv)) {
    const localValue = localEnv[key];
    if (localValue && env[key] === localValue && localValue !== selectedValue) {
      delete env[key];
    }
  }
}

export function loadInfraEnv(
  isLocal: boolean,
  load: DotenvLoader = (options) => config(options),
  env: NodeJS.ProcessEnv = process.env,
  read: EnvFileReader = readInfraEnvFile,
): void {
  const envPaths = getInfraEnvFiles(isLocal);
  const [selectedEnvPath, ...sharedEnvPaths] = envPaths;

  if (!selectedEnvPath) {
    return;
  }

  if (!isLocal) {
    clearShadowedLocalEnvValues(selectedEnvPath, env, read);
  }

  load({ path: selectedEnvPath });

  for (const path of sharedEnvPaths) {
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
    "DATABASE_URL='postgresql://...&channel_binding=require' pnpm run deploy",
  ].join(" ");
}
