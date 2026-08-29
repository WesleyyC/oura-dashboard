/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { normalizeRequestIdentity } from "../platform/auth/server";
import { setRuntimeEnv } from "../platform/runtime/server";
import {
  enforceRequestRateLimit,
  rateLimitServiceUnavailable,
  secureResponse,
} from "../platform/security/server";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  AUTH_PROVIDER?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  OURA_CLIENT_ID?: string;
  OURA_CLIENT_SECRET?: string;
  OURA_TOKEN_ENCRYPTION_KEY?: string;
  SECURITY_RATE_LIMIT_KEY?: string;
  OWNER_EMAIL_ALLOWLIST?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setRuntimeEnv(env);
    const authenticatedRequest = await normalizeRequestIdentity(request, env);
    const url = new URL(authenticatedRequest.url);
    try {
      const limited = await enforceRequestRateLimit(authenticatedRequest);
      if (limited) return secureResponse(limited, url);
    } catch {
      return secureResponse(rateLimitServiceUnavailable(), url);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(authenticatedRequest, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, authenticatedRequest.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return secureResponse(response, url);
    }

    const response = await handler.fetch(authenticatedRequest, env, ctx);
    return secureResponse(response, url);
  },
};

export default worker;
