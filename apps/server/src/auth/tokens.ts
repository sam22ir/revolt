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

/** Extracts the token from `Authorization: Bearer <token>`. */
export const bearerToken = (req: Request): string | null => {
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(req.headers.get("authorization") ?? "");
  return m?.[1] ?? null;
};
