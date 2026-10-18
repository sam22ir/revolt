> **Historical reference — superseded.** These are the original planning notes from 18 Oct 2026. Where they disagree with `docs/GDD.md` (notably: backend is Cloudflare, not Supabase), the GDD wins.

# Revolution Strategy Game — Project Plan

*Working notes from planning session, 18 October 2026*

---

## 1. The Idea

An **online mobile MMO strategy game** in the style of *Z Day: Hearts of Heroes* (KingsGroup), with a different story built on **real historical revolutions**.

Each player chooses a **historical background** when they start. The background shapes their story, buildings, units, heroes and missions.

**Launch backgrounds:**
- **Algerian Revolution (1954–1962)**
- **Vietnamese Revolution (1945–1954)**

**Possible future backgrounds:** the Cuban Revolution, Indian independence, the Mexican Revolution and others.

### Reference game
Z Day: Hearts of Heroes (`com.kingsgroup.ww2`) is a WW2-themed MMO strategy game. Its world map shows:
- Player bases side by side with power and VIP levels
- NPC targets with levels (combat zeppelins, raider bases)
- Alliance HQ, alliance members and alliance chat
- Resource bars (food, oil, steel, gold) and event countdown timers
- Menus: Missions, Alliance, Items, Mail, My Base, Map, Skills, Hunt, Bookmarks, General HQ

We keep the proven mechanics and change the setting, story and identity. No names, art or assets are copied from Z Day.

### Ideas considered along the way
- Other settings: Desert Oasis Wars, Sky Islands, Ancient Empires with lost tech, Ocean After the Flood, Space Frontier
- A modern-day "water wars" version (working title *Thirst Line*): drought in a fictional desert region, water as the core resource, plus a population meter
- **Final choice:** real historical revolution backgrounds

---

## 2. The Backgrounds

### Algeria (1954–1962)
- **Start:** hidden camps in the Aurès or Kabylie mountains
- **Structure:** organize the wilayas
- **Enemies (NPC):** colonial outposts, patrols and supply convoys
- **Strategic theme:** holding the border routes with Tunisia and Morocco for supplies

### Vietnam (1945–1954)
- **Start:** the Việt Bắc jungle base area
- **Structure:** tunnel networks and hidden bases
- **Logistics:** supplies moved by bicycle and porter
- **Major event:** a large campaign modeled on Điện Biên Phủ

### Each background has its own:
- Buildings, units, heroes and story missions
- Map region and visual style

---

## 3. Core Gameplay (Z Day–style)

- **Base building:** upgrade buildings with timers
- **Resources:** produced over time, collected and spent
- **Troops:** train units, which take time and resources
- **Heroes:** recruited, leveled and given skills
- **World map:** scrollable, with coordinates; player bases and NPC targets with levels
- **Marches:** send troops across the map and receive battle reports
- **Alliances:** join or create, chat, alliance HQ, cooperative events
- **Events:** timed server-wide events and rewards
- **Leaderboards:** for players and alliances

---

## 4. Online Design: Who Fights Whom

In Z Day, players attack each other. In this game, an Algerian player attacking a Vietnamese player makes no historical sense. Options:

- **Option A: players vs. empire.** The colonial armies are a powerful shared NPC enemy. Players compete on leaderboards for liberated territory, resources and alliance ranking. PvP happens only in clearly fictional "training exercises" or contested neutral zones.
- **Option B: separate story servers.** Each server follows one revolution's timeline. Big server-wide events recreate key battles that alliances fight together.

*Decision still open: A, B, or a mix.*

---

## 5. Historical Sensitivity Rules

- Players **cannot choose the colonial side**.
- Real events such as massacres and torture are treated with respect: as story context, **never as gameplay rewards**.
- **Heroes:** real figures (e.g. Larbi Ben M'hidi, Didouche Mourad, Võ Nguyên Giáp) could appear. At first it's safer to make heroes "inspired by" real people.
- Get a **historian to review** story content before release.

---

## 6. Tech Stack

**Decision: TypeScript everywhere, built by Claude Code (Opus 5.5).**

Godot and Unity were considered. Phaser + TypeScript was chosen because the whole project is code with no visual editor, so Claude Code can write, run and test everything from the terminal.

| Layer | Choice |
|---|---|
| Game client | **Phaser 3 + TypeScript + Vite** |
| Mobile app | **Capacitor** (Android APK built from the command line; iOS later) |
| Backend | **Supabase**: Auth, Postgres, Realtime, Edge Functions, pg_cron |
| Shared game rules | One TypeScript package used by both client and server |
| Tests | **Vitest** (game rules) + **Playwright** (screenshots of the running game) |
| Languages | **i18next**: Arabic (right-to-left), French, English from day one |
| Payments | Google Play Billing via **RevenueCat** |
| Analytics and crashes | **Firebase** |
| Voice and narration | **ElevenLabs** |
| Version control | **Git** from day one |

### Why this stack fits Claude Code
- **Code only.** Unity and Godot rely on scene editors that you click through.
- **Self-testing.** Claude Code can run the game in a headless browser, screenshot it and fix problems.
- **One language.** The same rules (costs, timers, combat) run on the phone and the server.
- **Error catching.** TypeScript and tests catch mistakes before playtesting.
- **Previews.** Each build can be shared as a link and played in a phone browser.

### Backend rules
- **The server owns all numbers.** Resources and timers are calculated from timestamps on the server, never trusted from the phone (anti-cheat).
- **Game actions** (upgrade, train, attack) go through Edge Functions that validate them.
- **Timers, events and production** run on pg_cron.
- **Later, at scale:** consider **Nakama** (open-source game server with built-in alliances, chat, leaderboards and tournaments) for thousands of players.

### Alternatives considered
- **Godot 4:** free, strong 2D, but editor-based
- **Unity (C#):** industry standard, Asset Store, can do a 3D look, but heavier and editor-based
- **Cocos Creator:** popular for this genre in China, but a smaller community
- **Flutter + Flame:** good menus, but a weak fit for big maps

---

## 7. Build Order (Milestones)

1. **Single-player prototype:** base, resources, buildings, upgrade timers
2. **Supabase:** accounts and cloud saves
3. **Shared world map:** coordinates, player bases, NPC targets, attacks, battle reports
4. **Alliances:** create and join, alliance chat, alliance HQ
5. **Algeria story campaign** and heroes
6. **Vietnam background**
7. Events, leaderboards, payments, Play Store release

Test each milestone on a phone before moving to the next.

---

## 8. Working With Claude Code

- Write a **Game Design Document (GDD)** first.
- Write a **CLAUDE.md** with project rules, folder structure and conventions so every session follows the same plan.
- Build in **small milestones**, and playtest each one.
- **Commit often** in Git so bad changes can be undone.
- Use small, low-cost subagents for searches and simple tasks to save usage.

---

## 9. What Claude Code Can't Fully Do

- **Art:** Claude Code can make placeholder graphics. Plan to buy asset packs (e.g. Kenney.nl and isometric packs) for the prototype, then hire a 2D isometric artist for buildings and units and a portrait artist for heroes. This is where most of the budget goes.
- **Real MMO scale:** thousands of live players need real server capacity, load testing and monitoring.
- **Publishing:** a Google Play developer account, store listing, payments setup and app review.
- **Live operations:** ongoing events, updates, moderation and anti-cheat.

---

## 10. Open Questions

- [ ] Game name
- [ ] PvP model: players vs. empire, separate story servers, or a mix
- [ ] Real historical heroes vs. "inspired by" heroes
- [ ] Default menu language: Arabic, French or English
- [ ] Art style: flat 2D, isometric 2D, or 3D-looking
- [ ] Budget for art and servers
- [ ] Monetization model

---

## 11. Next Steps

1. Write the Game Design Document.
2. Write CLAUDE.md for the repository.
3. Start milestone 1 in Claude Code.
