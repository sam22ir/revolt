const base64url = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** A fresh 256-bit bearer token. Only its hash is stored. */
export const newToken = (): string => base64url(crypto.getRandomValues(new Uint8Array(32)));

export const hashToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

/** Extracts the token from `Authorization: Bearer <token>`. */
export const bearerToken = (req: Request): string | null => {
  const m = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "");
  return m?.[1] !== undefined && TOKEN.test(m[1]) ? m[1] : null;
};

/**
 * Browsers cannot set headers on a WebSocket, so the map socket offers the token as a
 * subprotocol: `Sec-WebSocket-Protocol: revolt.v1, auth.<token>`. This keeps it out of URLs and logs.
 */
export const protocolToken = (req: Request): string | null => {
  for (const p of (req.headers.get("sec-websocket-protocol") ?? "").split(",")) {
    const v = p.trim();
    if (v.startsWith("auth.") && TOKEN.test(v.slice(5))) return v.slice(5);
  }
  return null;
};
