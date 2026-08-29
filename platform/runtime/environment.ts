export interface RuntimeEnv {
  DB?: D1Database;
  AUTH_PROVIDER?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  OURA_CLIENT_ID?: string;
  OURA_CLIENT_SECRET?: string;
  OURA_TOKEN_ENCRYPTION_KEY?: string;
  SECURITY_RATE_LIMIT_KEY?: string;
  OWNER_EMAIL_ALLOWLIST?: string;
}

let runtimeEnv: RuntimeEnv | undefined;

export function setRuntimeEnv(env: RuntimeEnv) {
  runtimeEnv = env;
}

export function getRuntimeEnv(): RuntimeEnv {
  if (!runtimeEnv) throw new Error("Worker environment is unavailable");
  return runtimeEnv;
}
