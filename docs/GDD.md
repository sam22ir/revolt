# Game Design Document

*Code name: **revolt** (working title; final name TBD). Version 0.1 — 18 October 2026.*

This document is the source of truth for design. `docs/original-plan.md` is the earlier brainstorm and is superseded wherever it disagrees.

---

## 1. Vision

A free-to-play mobile MMO strategy game in the genre of *Z Day: Hearts of Heroes* — build a base, gather resources, train troops, recruit heroes, march across a shared world map with an alliance — set in **real anti-colonial revolutions**.

The player is not a warlord conquering neighbors. They are an organizer building a liberation movement against a colonial empire, alongside other players.

### Pillars

1. **Proven genre loop.** Keep the mechanics players of the genre already know. Innovation is in setting and tone, not in reinventing timers.
2. **History with respect.** Settings are real; the treatment is serious. Tragedy is context, never a reward.
3. **Cooperation over predation.** The main enemy is the shared NPC empire. Alliances win together.
4. **Fair to free players.** Money buys time and looks, not unlimited power.
5. **Local first.** Arabic (RTL), French and English from day one; Algerian and Vietnamese players should feel the game was made for them.

---

## 2. Backgrounds

The player picks one background at account creation. It decides their server, story, buildings, units, heroes and art set. **Mechanics are shared** across backgrounds; only names, art, story and balance tables differ.

### 2.1 Algeria (1954–1962) — launch

- **Start:** hidden mountain camp in the Aurès or Kabylie.
- **Structure:** the player's movement grows into a wilaya-style regional organization.
- **NPC enemies:** colonial outposts, patrols, supply convoys, fortified lines.
- **Strategic theme:** holding border supply routes with Tunisia and Morocco.

### 2.2 Vietnam (1945–1954) — milestone 6

- **Start:** jungle base area in Việt Bắc.
- **Structure:** tunnel networks and hidden bases.
- **Logistics:** supplies carried by bicycle and porter columns.
- **Major event:** a large siege campaign modeled on Điện Biên Phủ.

### 2.3 Resources

Four mechanical resources, themed per background:

| Mechanic | Role | Algeria | Vietnam |
|---|---|---|---|
| `food` | Troop upkeep, training | Provisions | Rice |
| `materiel` | Weapons, troop training | Arms | Arms |
| `funds` | Construction, research | Funds | Funds |
| `support` | Gates expansion and hero recruitment; grows from missions and buildings | Popular support | Popular support |

A premium currency (`gems`, themed name TBD) exists for speed-ups and cosmetics only (see §8).

### 2.4 Future backgrounds

Cuban, Indian independence, Mexican revolution and others. Each needs its own server population, so add one only when there are enough players to fill it.

---

## 3. Core loop

```
collect resources → spend on buildings / troops / research
        ↑                                   ↓
   rewards from NPC targets  ←  march heroes + troops on the world map
        ↑                                   ↓
   alliance events & story missions  ←  grow power, unlock regions
```

- **Session (2–5 min):** collect production, start upgrades and training, send a march, claim mission rewards.
- **Day:** finish several timers, do daily missions, contribute to the alliance.
- **Season (weeks):** liberate regions on the server map; server-wide historical campaign events.

---

## 4. Systems

### 4.1 Base and buildings

- Isometric grid base. Buildings are placed on fixed plots at first (free placement later if needed).
- Each building has levels 1..N. Upgrading costs resources and time, and is gated by the HQ level.
- One build queue at first; a second queue unlocks through progression (not only by paying).
- Building set (mechanical id → Algeria name, both TBD in content):
  - `hq` — Command post. Caps all other levels.
  - `farm`, `armory`, `treasury` — produce `food`, `materiel`, `funds`.
  - `storehouse` — raises storage caps and protects part of the stock from raids.
  - `barracks` — trains troops.
  - `infirmary` — heals wounded troops.
  - `academy` — research tree.
  - `hero_hall` — hero recruitment and upgrades.
  - `watchtower` — scouting and incoming-attack warnings.
  - `liaison_office` — alliance features (help speeds up timers).

### 4.2 Production and timers

- **All production and timers are computed from timestamps**, never from ticking counters:
  `amount(now) = min(cap, stored + rate × (now − lastCollected))`.
- Completed timers are resolved lazily when state is read at a given `now`.
- This makes the offline prototype and the future server use the same code.

### 4.3 Troops

- Three basic types in a rock-paper-scissors triangle, plus a support type:
  - `infantry` > `scouts`, `scouts` > `heavy`, `heavy` > `infantry`
  - `porters` (logistics: carry capacity, no combat power)
- Tiers 1–5 unlocked by barracks level and research.
- Training costs resources and time; troops have food upkeep.
- Losses in battle are mostly **wounded** (go to the infirmary), with a small share lost.

### 4.4 Heroes

- Heroes are **inspired by** real roles and people, not named real figures (for now). Real figures may appear in story missions only after historian review.
- Each hero has: rarity, level, 1 command skill + 2–3 passives, and a troop-type specialty.
- Heroes lead marches; a march = 1 lead hero + up to 2 deputies + troops.
- Hero duplicates/shards for upgrades, obtained mostly through play; recruitment draws exist but have published odds and a pity counter.

### 4.5 World map

- Tile grid with coordinates, one map per server (one server = one background, see §5).
- Map contents: player bases, NPC targets with levels (outposts, patrols, convoys, fortified positions), resource sites, alliance HQs, region borders.
- Regions start under colonial control; alliances liberate them by clearing NPC strongholds, and liberated regions give server-wide bonuses.
- Moving across the map uses **marches** with travel time based on distance and troop speed.

### 4.6 Marches and battles

- A march is sent to a target, travels, resolves a battle on arrival, then returns.
- Battles are resolved by a **deterministic** simulation in the shared rules package (seeded random), so the server and client agree and replays are possible.
- Every battle produces a battle report: forces, losses, hero performance, loot.

### 4.7 Alliances

- Create/join, ranks (leader, officers, members), alliance chat, alliance HQ on the map.
- Help: members tap to shorten each other's timers.
- Rallies: several members join one march against a large NPC target.
- Alliance tech and alliance gifts.

### 4.8 Missions and story

- **Story missions:** a chapter-based campaign per background, told with short illustrated scenes (text first; voice narration deferred).
- **Daily/weekly missions:** routine goals for rewards.
- Every story chapter is reviewed against the sensitivity rules (§6).

### 4.9 Events and leaderboards

- Timed server-wide events: e.g. a "supply route" event, convoy hunts, a seasonal historical campaign (Vietnam: the siege campaign).
- Leaderboards: player power, regions liberated, alliance ranking, event score.

---

## 5. Server model (decision: mix)

- **One server per background.** An Algeria server contains only Algerian-background players; same for Vietnam. Players of different backgrounds never fight each other.
- **The main loop is PvE** against the colonial NPC empire, which all players on a server face together.
- **PvP exists only inside a server**, and only in clearly fictional modes:
  - *Training exercises* — opt-in sparring with no permanent losses.
  - *Contested neutral zones* — marked map areas where alliances compete for resource sites. No base burning outside these zones.
- Players compete mainly through leaderboards, liberated territory and event scores.

---

## 6. Historical sensitivity rules

These are hard rules for all content:

- Players **cannot choose the colonial side**.
- Real events such as massacres and torture are treated with respect, as story context, **never as gameplay rewards** or mechanics.
- **Heroes are "inspired by"** real people at launch. Using real named figures as collectible or levelable heroes needs a separate decision and review.
- **Historian review is a release gate:** no story content ships before review.
- Colonial NPCs are an institution and an army, not a people. No content mocks or targets present-day nationalities.

---

## 7. Art and audio

- **Style (approved 19 Oct 2026):** semi-realistic painted isometric 2D, in the register of *Z Day: Hearts of Heroes*: rich warm sunlight, soft shadows, real materials, dense small props, buildings readable by silhouette at phone size. Algeria palette: sand, terracotta, whitewash, olive, rock brown. UI is dark metal with bronze accents, with local motifs and no baked-in text.
- **No faces:** people appear small and without readable faces in art; heroes follow §6.
- **Sources:** art is generated (Nano Banana 2.1 in Google Flow), one building per image at a fixed angle and lighting, on a plain background for cutout, using the approved base-camp scene as the style reference. Check Flow's commercial-use terms and Google Play's AI-content disclosure before release.
- **Budget:** under $500 in year one. Use generated art, free asset packs (Kenney.nl) and code-drawn placeholders. Hire artists only if the budget grows; the first hires would be a building/unit artist, then a hero portrait artist.
- Each background gets its own palette and building skins on the same footprints, so art can be swapped without layout changes.
- **Audio:** free/CC music and SFX packs. ElevenLabs voice narration is **deferred** until there is budget.

---

## 8. Monetization (decision: fair free-to-play)

- **Sell:** battle pass (free + paid tracks), cosmetics (base skins, banners, march skins, hero outfits), speed-ups, and modest value bundles.
- **Power cap:** paid power is limited. Paid speed-ups and resources cannot push a player past the progression gates (HQ level, research) that free players reach through play.
- No paid-only heroes at launch. Draw odds are published, and draws have a pity counter.
- No VIP levels that give large combat bonuses.
- Payments via Google Play Billing through RevenueCat (free tier) at milestone 7.

---

## 9. Language and accessibility

- Arabic (RTL), French and English from milestone 1.
- **Default language follows the device** when it is `ar`, `fr` or `en`; otherwise English. Changeable in settings.
- Numbers and timers are formatted per locale.
- UI must mirror correctly in RTL.

---

## 10. Technical summary

Details and conventions live in `CLAUDE.md`. Summary:

| Layer | Choice |
|---|---|
| Client | Phaser + TypeScript + Vite (versions: see `package.json`) |
| UI text | DOM overlay above the canvas for menus/HUD (proper Arabic shaping and RTL); canvas text only for short map labels |
| Mobile | Capacitor (Android first, iOS later) |
| Shared rules | One TypeScript package used by client and server; pure functions of `(state, now)` |
| Backend (M2+) | Cloudflare: Workers (game actions), D1 (accounts and persistent state), Durable Objects (map regions, alliances, chat via WebSockets; alarms for timers and events), Cron Triggers (daily resets, events) |
| Auth | Guest account per device first; link a Google account to move devices. Self-hosted on Workers + D1: opaque guest tokens plus verified Google ID tokens (`jose`), chosen over Better Auth at M2 (see `docs/server-dev.md`); no paid auth service |
| Tests | Vitest (rules), Playwright (screenshots of the running game) |
| i18n | i18next |
| Analytics/crashes | Firebase (free tier), milestone 7 |
| Payments | RevenueCat (free tier), milestone 7 |

**Server owns all numbers** from milestone 2: the client sends intents (upgrade, train, march), the server validates them with the shared rules and returns the new state.

---

## 11. Milestones

Each milestone is done only when its acceptance criteria pass **on a real Android phone**. Exception: M1 was accepted on emulated phone tests (Playwright, Pixel 7 profile, en/ar/fr); its real-device check happens together with the Capacitor Android shell setup.

### M1 — Single-player prototype
Base screen, resources, buildings, upgrade timers, offline with local save.
- Done when: an isometric base shows the HQ and the three producer buildings; resources accrue over real time, including while the app is closed; upgrades cost resources, show a countdown and complete correctly after an app restart; the UI works in Arabic (RTL), French and English; shared rules have Vitest coverage for production, costs and timers.

### M2 — Accounts and cloud saves
- Done when: a new player gets a guest account automatically and can link a Google account; state is stored server-side; the server computes all resources and timers; signing in with the linked Google account on a second device loads the same base; tampering with local state has no effect.

### M3 — Shared world map
- Done when: two accounts on one server see each other's bases on a scrollable map with coordinates; NPC targets of several levels exist; a march travels, fights a deterministic battle and returns; a battle report is delivered.

### M4 — Alliances
- Done when: players can create/join an alliance, chat in real time, place an alliance HQ, help each other's timers, and launch a rally.

### M5 — Algeria story and heroes
- Done when: the first story chapters are playable, heroes can be recruited, leveled and assigned to marches, and the chapters have passed historian review.
- **Status (M5):** code-complete, NOT accepted. Playable: 3 placeholder chapters, 6 role-only heroes, the `hero_hall` building, heroes on marches and rallies, shard drops. Still open: historian review (`docs/story-review.md`), Arabic review, a real-phone check. Recruitment draws with published odds and a pity counter are deferred; recruitment is deterministic for now (see `docs/server-dev.md`).

### M6 — Vietnam background
- Done when: a new player can choose Vietnam, lands on a Vietnam server with its own buildings, units, heroes and first chapters, with no mixing with Algeria servers.
- **Status (M6):** code-complete, NOT accepted. A new player picks Algeria or Vietnam on first launch (permanent); Vietnam plays on `vietnam-1` with its own names for the shared building, troop and rice ids, its own 6 role-only heroes and 3 placeholder chapters. Still open: historian review of the Vietnam chapters (`docs/story-review.md`), Arabic review, the Vietnamese-language question (GDD §5/§12: `vi` is not in the ar/fr/en set; decide whether a `vi` locale is in scope before accepting M6), real Vietnam art (placeholder sprites are the Algerian ones, `docs/art.md`), a real-phone check.

### M7 — Live features and release
- Done when: events, leaderboards, battle pass and store work end to end; analytics and crash reporting are live; the app passes Google Play review.

---

## 12. Open questions

- [ ] **Game name.** Code name `revolt` until decided. Candidates to consider: *Free Lands*, an Arabic title (e.g. based on *Thawra*). Avoid names that echo current political parties or slogans (e.g. "Liberation Front" ≈ FLN, "Long March").
- [ ] **Scale path:** whether Durable Objects are enough at thousands of players, or a dedicated game server (e.g. Nakama) is needed later.
- [ ] **Art hire trigger:** what budget or player count justifies the first artist.
- [ ] **Premium currency name** and themed names for all buildings and units.
- [ ] **Historian:** who reviews Algeria content, and who reviews Vietnam content.
