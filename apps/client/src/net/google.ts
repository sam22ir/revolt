import { currentLanguage, t } from "../i18n/i18n.ts";
import { el } from "../ui/dom.ts";

/**
 * Where a Google ID token comes from. The server only ever sees the ID token
 * and verifies it itself; no client secret exists anywhere.
 * - "gis": Google Identity Services button (web). Android will use a native
 *   Credential Manager plugin instead (see docs/google-oauth-setup.md).
 * - "mock": the local e2e Worker's fake issuer, for development and tests.
 */
export interface GoogleSignIn {
  /** Renders the sign-in control into `container` and calls `onIdToken` when the player signs in. */
  readonly mount: (container: HTMLElement, label: string, onIdToken: (idToken: string) => void, onError: () => void) => void;
}

const mockSignIn = (apiUrl: string): GoogleSignIn => ({
  mount: (container, label, onIdToken, onError) => {
    const field = el("label", "account-field");
    field.append(el("span", undefined, t("account.mockEmail")));
    const input = el("input");
    input.type = "email";
    input.placeholder = t("account.mockEmailPlaceholder");
    input.dataset.testid = "mock-google-email";
    input.dir = "ltr";
    field.append(input);
    const button = el("button", "upgrade-btn", label);
    button.type = "button";
    button.dataset.testid = "google-sign-in";
    button.addEventListener("click", () => {
      const email = input.value.trim();
      if (email.length === 0) return;
      const q = new URLSearchParams({ sub: `mock:${email}`, email });
      void fetch(`${apiUrl}/__test/google-token?${q.toString()}`)
        .then((r) => r.json() as Promise<{ idToken: string }>)
        .then((r) => onIdToken(r.idToken), onError);
    });
    container.append(field, button);
  },
});

interface GoogleIdApi {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (parent: HTMLElement, o: Record<string, unknown>) => void;
}

let gisScript: Promise<GoogleIdApi> | null = null;
const loadGis = (): Promise<GoogleIdApi> =>
  (gisScript ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      const api = (window as unknown as { google?: { accounts?: { id?: GoogleIdApi } } }).google?.accounts?.id;
      if (api === undefined) reject(new Error("GIS missing"));
      else resolve(api);
    };
    s.onerror = () => reject(new Error("GIS failed to load"));
    document.head.append(s);
  }));

const gisSignIn = (clientId: string): GoogleSignIn => ({
  mount: (container, _label, onIdToken) => {
    const slot = el("div", "account-gis");
    container.append(slot);
    void loadGis().then((gis) => {
      gis.initialize({ client_id: clientId, callback: (r) => onIdToken(r.credential) });
      // Google draws and translates its own button.
      gis.renderButton(slot, { type: "standard", theme: "outline", size: "large", locale: currentLanguage() });
    });
  },
});

/** The configured Google sign-in, or null when this build has none. */
export const googleSignIn = (apiUrl: string): GoogleSignIn | null => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (clientId !== undefined && clientId.length > 0) return gisSignIn(clientId);
  if (import.meta.env.VITE_GOOGLE_MOCK === "1") return mockSignIn(apiUrl);
  return null;
};
