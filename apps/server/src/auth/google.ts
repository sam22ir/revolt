import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
/** Google issues ID tokens under both forms. */
export const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export const googleRemoteKeys = (): JWTVerifyGetKey => createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

export interface GoogleIdentity {
  readonly sub: string;
  readonly email: string | null;
}

/**
 * Verifies a Google ID token: RS256 signature against Google's keys, issuer,
 * audience (our client IDs) and expiry at the server's `now`. Null if invalid.
 */
export const verifyGoogleIdToken = async (
  idToken: string,
  keys: JWTVerifyGetKey,
  audiences: readonly string[],
  now: number,
): Promise<GoogleIdentity | null> => {
  try {
    const { payload } = await jwtVerify(idToken, keys, {
      issuer: GOOGLE_ISSUERS,
      audience: [...audiences],
      algorithms: ["RS256"],
      currentDate: new Date(now),
      clockTolerance: 30,
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    const email = typeof payload.email === "string" && payload.email_verified === true ? payload.email : null;
    return { sub: payload.sub, email };
  } catch {
    return null;
  }
};
