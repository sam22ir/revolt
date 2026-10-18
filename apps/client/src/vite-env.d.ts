/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game API origin. Defaults to port 8787 on the page's host (local `wrangler dev`). */
  readonly VITE_API_URL?: string;
  /** Google *web* client ID. Enables "Sign in with Google" (see docs/google-oauth-setup.md). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** "1" uses the local mock Google issuer of the e2e Worker instead of Google. Never in a release build. */
  readonly VITE_GOOGLE_MOCK?: string;
}
