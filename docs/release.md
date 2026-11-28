# Release checklist (M7): manual steps

M7 is code-complete but **not accepted**. The code for billing and crash reporting is in the repo; the steps below need accounts or devices that are not.

## Billing (Google Play Billing via RevenueCat)
Built: the Worker's verifier (`apps/server/src/billing/revenuecat-billing.ts`) posts the Play purchase token to RevenueCat's `POST /v1/receipts` and grants only when RevenueCat lists the sku from the Play store. The Godot client (`apps/godot/scripts/platform/billing.gd`, `purchase_flow.gd`) buys through the official Godot Play Billing plugin, sends `{sku, provider: "google", receipt: <purchase token>}` to `/v1/store/redeem`, and consumes the purchase only after the server granted it. Outages keep the purchase and retry at the next start-up; refusals are never consumed, so Google refunds them after three days. Still to do by hand:
1. Godot: Project > Install Android Build Template (the Android preset now uses a Gradle build, which both plugins need). The `apps/godot/android/` folder it creates stays out of git.
2. Install the Play Billing plugin from https://github.com/godot-sdk-integrations/godot-google-play-billing (release for Godot 4.2+) into `apps/godot/addons/GodotGooglePlayBilling/` and enable it under Project Settings > Plugins. Check that its client script is at `addons/GodotGooglePlayBilling/BillingClient.gd` (`Billing.PLUGIN_CLIENT`); fix the constant if the release names it differently.
3. Play Console: the app, an internal testing track, and one-time in-app products whose ids equal the `PRODUCT_SKUS` in `packages/rules/src/data/store.ts`. License testers.
4. RevenueCat (free tier): project, Play app, link the Play service account, the same product ids.
5. `wrangler secret put REVENUECAT_SECRET` (the RevenueCat **secret** API key). For the internal test track only, set the var `BILLING_ALLOW_SANDBOX=1` so license-tester purchases count; never on the production Worker.
6. Confirm the deployed Worker has no test verifier (`test/live-misc.test.ts` checks).
7. Declare: no paid-only heroes, no loot boxes (no draws exist yet; if added, publish odds and a pity counter per GDD §8).
8. The Godot store page (`scripts/store/`, the round button in the base's bottom corner) sells only when `Billing.available()` and the server says `canRedeem`; otherwise it shows the offers with Buy off and says why.

## Crash reporting (Sentry)
Built: `apps/godot/scripts/platform/crash_reporting.gd` starts Sentry's Godot SDK only when the player turned crash reports on (Settings > About > Privacy switch, which explains what is sent before turning on; off by default, saved in `user://settings.cfg`). Auto-init is off in `project.godot`; no user, account id or guest tag is attached and default PII stays off. Still to do by hand:
1. Sentry account (free tier) and a Godot project; copy its DSN.
2. Install the SDK from https://github.com/getsentry/sentry-godot/releases into `apps/godot/addons/sentry/` (keep the folder name). It needs the Gradle build from Billing step 1.
3. Set Project Settings > `revolt/crash/sentry_dsn` to the DSN in the release build only. Keep `sentry/options/auto_init` off (a test checks it).
4. On the phone: check that nothing is sent with the switch off, and that a test error arrives with it on.
5. Server errors (`telemetry.ts`) still go nowhere in production; a Sentry sink for the Worker is a follow-up.
6. Analytics events are not wired; the switch's text already covers "usage" so the same choice can gate them later. Have the consent text and privacy policy reviewed (ar, fr, en) before release.

## Play Console forms
- Data safety: guest account id, optional Google email, analytics and crash data (only if consented), purchase records.
- Privacy policy URL; in-app link to it. Content rating questionnaire (war setting, no depiction of atrocities). Target audience: not for children.
- Historical content note: GDD §6; the historian review gate (`docs/story-review.md`, chapters and event text) must be passed first.
- Permissions list, target API level and 64-bit check, store listing text and screenshots in ar, fr, en (screenshots en and ar from CI `screens/`).

## Before submitting
- Apply D1 migration `0006` and deploy (`docs/deploy.md`).
- Design pass on placeholder numbers: event tiers, pass XP, speed-up cap, bundle sizes.
- Real-phone acceptance (M7 "done when"): events show and pay, boards rank, pass tiers claim, a test purchase completes with a license tester, crash reports arrive only with the switch on, RTL checked on every Live tab.

## Rollback
Server: redeploy the previous Worker version (migration 0006 only adds tables; old code ignores them). Client: halt the Play rollout and ship the previous build. Never re-use a store transaction id: redemption is idempotent per transaction.
