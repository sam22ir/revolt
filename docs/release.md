# Release checklist (M7): manual steps

M7 is code-complete but **not accepted**. Everything below needs accounts or devices that are not in the repo. Nothing here has been done.

## Billing (Google Play Billing via RevenueCat)
1. Build the Capacitor Android shell (not in the repo yet). Keystore stays outside the repo.
2. Play Console: create the app, an internal testing track, and in-app products whose ids equal the `PRODUCT_SKUS` in `packages/rules/src/data/store.ts`.
3. RevenueCat (free tier): project, link the Play service account, products, license testers.
4. Write `apps/client/src/platform/revenuecat-billing.ts` (now a stub that throws) and select it in `platform/index.ts`.
5. Write `apps/server/src/billing/revenuecat-billing.ts` (verifies receipts; now refuses everything). `wrangler secret put REVENUECAT_SECRET`.
6. Confirm the deployed Worker has no test verifier (`test/live-misc.test.ts` checks) and no `VITE_BILLING_MOCK` in the release build.
7. Declare: no paid-only heroes, no loot boxes (no draws exist yet; if added, publish odds and a pity counter per GDD §8).

## Analytics and crash reporting
1. Firebase project; `google-services.json` kept out of git; implement `platform/firebase-analytics.ts` and a server sink for `Analytics`/`CrashReporter` (`telemetry.ts`).
2. Both are consent-gated on the client (`settings.analytics`, off by default). Have the consent text and privacy policy reviewed (ar, fr, en) before turning any sink on.
3. Events carry names and small counters only; never account ids, handles, emails, receipts.

## Play Console forms
- Data safety: guest account id, optional Google email, analytics and crash data (only if consented), purchase records.
- Privacy policy URL; in-app link to it. Content rating questionnaire (war setting, no depiction of atrocities). Target audience: not for children.
- Historical content note: GDD §6; the historian review gate (`docs/story-review.md`, chapters and event text) must be passed first.
- Permissions list, target API level and 64-bit check, store listing text and screenshots in ar, fr, en (screenshots en and ar from CI `screens/`).

## Before submitting
- Apply D1 migration `0006` and deploy (`docs/deploy.md`).
- Design pass on placeholder numbers: event tiers, pass XP, speed-up cap, bundle sizes.
- Real-phone acceptance (M7 "done when"): events show and pay, boards rank, pass tiers claim, a test purchase completes with a license tester, analytics/crash arrive, RTL checked on every Live tab.

## Rollback
Server: redeploy the previous Worker version (migration 0006 only adds tables; old code ignores them). Client: halt the Play rollout and ship the previous build. Never re-use a store transaction id: redemption is idempotent per transaction.
