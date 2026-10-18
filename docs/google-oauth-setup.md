# Google sign-in setup

Only you can create the Google OAuth client, and nothing secret goes into the repo. Until it exists, Google sign-in is off in normal builds, and local development and tests use a mock issuer (`docs/server-dev.md`).

The server only verifies Google **ID tokens**. That needs the client **ID** (public), not a client secret, so no secret is created or stored.

## 1. Create the OAuth clients

1. Open the [Google Cloud console](https://console.cloud.google.com/), create a project (free), and open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name and support email, and add the scopes `openid`, `email` and `profile`. These are non-sensitive scopes and don't need Google's verification review.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.** Add the authorized JavaScript origins you will use, for example `http://localhost:5173`, `http://localhost:4173` and later the production web origin. Copy the **client ID** (ends in `.apps.googleusercontent.com`). This is the web client ID.
3. For the Android app (when the Capacitor shell exists): create another OAuth client ID of type **Android** with the package name and the SHA-1 of the signing key (`./gradlew signingReport`). The Android app does not send this ID to the server: with Credential Manager the ID token's `aud` is the **web** client ID, and the Android client appears only in `azp`.

## 2. Configure

- Server: set `GOOGLE_CLIENT_IDS` to the web client ID in `apps/server/wrangler.jsonc` (it is public; a comma-separated list is accepted). Locally you can put it in `apps/server/.dev.vars` instead, which git ignores.
- Web client: build with `VITE_GOOGLE_CLIENT_ID=<web client ID>`. The account panel then shows Google's own sign-in button.
- Android: Google blocks its sign-in pages inside WebViews, so the web button won't work in the Capacitor app. When the shell is set up, use a Capacitor plugin that calls Android Credential Manager and returns an ID token, configured with the web client ID as the server client ID, and pass the token to the same `POST /v1/auth/google`. The server needs no change.

## 3. Check

1. `pnpm --filter @revolt/server dev` with `GOOGLE_CLIENT_IDS` set, and the client with `VITE_GOOGLE_CLIENT_ID` set.
2. Open the game, tap **Account**, sign in with Google: the panel shows the Google email.
3. In a private window (a second "device"), sign in with the same Google account: the same base loads.

If sign-in fails with `invalid_google_token`, the usual cause is a client ID mismatch between the client build and `GOOGLE_CLIENT_IDS`.
