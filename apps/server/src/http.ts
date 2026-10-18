import { csv, type Env } from "./env.ts";

export const ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "not_found",
  "conflict",
  "invalid_google_token",
  "google_not_configured",
  "payload_too_large",
  "rate_limited",
  "upgrade_required",
  "forbidden",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  invalid_google_token: 401,
  google_not_configured: 503,
  payload_too_large: 413,
  rate_limited: 429,
  upgrade_required: 426,
  forbidden: 403,
};

export class HttpError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const errorResponse = (code: ErrorCode): Response => json({ error: code }, STATUS[code]);

const MAX_BODY_BYTES = 16 * 1024;

/** Reads a JSON object body. Anything else is a bad request. */
export const readJson = async (req: Request): Promise<Record<string, unknown>> => {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError("payload_too_large");
  if (text.length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError("bad_request");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new HttpError("bad_request");
  return parsed as Record<string, unknown>;
};

/** Adds CORS headers for allowed origins. The API uses bearer tokens, never cookies. */
export const withCors = (req: Request, env: Env, res: Response): Response => {
  const origin = req.headers.get("origin");
  if (origin === null || !csv(env.ALLOWED_ORIGINS).includes(origin)) return res;
  const out = new Response(res.body, res);
  out.headers.set("access-control-allow-origin", origin);
  out.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  out.headers.set("access-control-allow-headers", "authorization, content-type");
  out.headers.set("access-control-max-age", "86400");
  out.headers.append("vary", "origin");
  return out;
};
