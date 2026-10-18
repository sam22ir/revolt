# Testing on a real phone (M1)

GDD §11 allows the browser build for M1, so there is no app shell yet. Serve the production build from this machine and open it in Chrome on an Android phone.

## 1. Build and serve

```bash
pnpm preview:lan
```

This builds `apps/client` and serves it on port 4173 on all interfaces (it fails rather than switching ports if 4173 is busy).

## 2. Open it on the phone

**USB (preferred).** The address stays `localhost`, so the local save survives Wi-Fi or IP changes, and you get a console.

1. On the phone, turn on Developer options → USB debugging, then plug it in and accept the prompt.
2. On this machine, run `adb reverse tcp:4173 tcp:4173`.
3. In Chrome on the phone, open `http://localhost:4173`.
4. Optional: on desktop Chrome, open `chrome://inspect` to see the phone's console.

**Wi-Fi (fallback).** Connect the phone to the same network and open `http://<this machine's IP>:4173`. Run `hostname -I` to find the IP. If it doesn't load, check the firewall (`sudo ufw allow 4173`). The save is stored per address, so if the IP changes you start a new base.

## 3. M1 acceptance checklist

| "Done when" (GDD §11) | What to do on the phone |
| --- | --- |
| Isometric base shows the HQ and three producers | Four buildings with level badges; edges and numbers look sharp, not blurry. Tap each building and check that its panel opens. |
| Resources accrue over real time | Watch the counters rise for a minute. |
| …including while the app is closed | Note the food amount, close the tab or swipe Chrome away, wait a few minutes, reopen. Amount = old + rate × time away (capped at storage). |
| Upgrades cost resources and show a countdown | Upgrade the HQ: cost is deducted, countdown appears in the panel and the queue pill. |
| …and complete correctly after an app restart | Start an upgrade, kill Chrome before it ends, reopen after the end time: the level went up and the queue is free. |
| UI works in Arabic (RTL), French and English | Switch language with the top button. Arabic mirrors the layout and the text is shaped correctly. Rotate the phone and check the map still fits and taps still hit. |
| Shared rules have Vitest coverage | `pnpm test` on this machine. |
