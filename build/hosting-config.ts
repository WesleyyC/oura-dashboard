import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const LOCAL_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

export interface HostingConfig {
  d1: string;
  r2: string | null;
}

export async function loadHostingConfig(
  root = process.cwd(),
): Promise<HostingConfig> {
  let source: string;
  try {
    source = await readFile(resolve(root, ".openai", "hosting.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { d1: "DB", r2: null };
    }
    throw new Error("Hosting configuration could not be read");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Hosting configuration is invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Hosting configuration is invalid");
  }
  const value = parsed as Record<string, unknown>;
  if (
    typeof value.d1 !== "string" ||
    !isBindingName(value.d1) ||
    !(value.r2 === null || typeof value.r2 === "string" && isBindingName(value.r2))
  ) {
    throw new Error("Hosting configuration is invalid");
  }
  return { d1: value.d1, r2: value.r2 };
}

export function localBindingConfigFor(config: HostingConfig) {
  return {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    d1_databases: [
      {
        binding: config.d1,
        database_name: "local-oura-dashboard",
        database_id: LOCAL_DATABASE_ID,
      },
    ],
    r2_buckets: config.r2
      ? [
          {
            binding: config.r2,
            bucket_name: "local-oura-dashboard",
          },
        ]
      : [],
  };
}

export async function cloudflarePluginConfigFor(
  root = process.cwd(),
): Promise<ReturnType<typeof localBindingConfigFor> | undefined> {
  try {
    const metadata = await stat(resolve(root, "wrangler.jsonc"));
    if (!metadata.isFile()) {
      throw new Error("Wrangler configuration is not a regular file");
    }
    // The Cloudflare Vite plugin reads the operator's Wrangler file itself.
    // Passing a config object here would replace its production bindings.
    return undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return localBindingConfigFor(await loadHostingConfig(root));
}

function isBindingName(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}
