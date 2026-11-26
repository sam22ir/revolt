# A bigger map and contested zones: plan

Decided with the user (2026-11-26):

- The map grows from 64×64 to **192×192** (9× the area). A running world is not carried over: test and mock servers start a **fresh map**.
- **Contested zones** (GDD §5): a few marked neutral areas, spread over the map, with **very rich** resource sites. Alliances fight over them.
- **Who fights:** anyone not in the holder's alliance may march on a site someone is harvesting; the battle decides who holds it. Allies never fight each other. No base burning anywhere (GDD §5, §6).
- **Loot:** the winner takes **half** the load the beaten column has gathered and holds the site; the beaten column goes home with what is left and its survivors.
- **Richness:** zone sites are level 4–5 with 3–5× the rates outside; zones also hold **funds** sites (funds come from nowhere else on the map); a column may stay up to **12 h** in a zone (8 h outside).

## Part A: the 192×192 map

Order inside Part A: **measure first, switch last.** A2 is profiled and fixed with the rules still at 64 (`map_shot.gd` takes a size), and the
server constant flips only once a 192 map builds fast, so every commit stays usable. Godot fixtures stay at 64 (the functions take `size`).

### A1. Rules and server (data first, flipped last)

- `MAP_SIZE` 192, `REGION_CELL` 32 (36 regions). NPC counts become a density (per 4096 tiles) so they scale with the map. Site density stays per tile.
- The Godot map fixtures encode a region as one hex digit; switch to two characters.
- A fresh map: the map Durable Object name changes (`algeria-1` → `algeria-2`), so old rows are never read. The mock starts clean.
- Vitest: placement, regions, strongholds, the edge margin, the crowded-map path at the new size.

### A2. Godot: build only what is near

Measured at 64×64: 1.1 s to build the map headless on this machine; 9× that is too slow on a phone.

- Profile `WorldMap.build` stage by stage at 192 first, then fix the worst (likely the road search per region pair, and the route grid).
  Fixes in order of preference: the server sends roads, wadis and oases with the first map (as it already resolves sites); a cache in
  `user://` keyed by seed, size and version; chunked props. No threads (the web export has none).
- On the server, geography and sites are computed once per Durable Object, not per request (Workers CPU limits).
- Props are drawn per **chunk** (32×32 tiles) near the camera, with a cap or a simpler look when zoomed far out.
- The ground field textures stay at or under 1024 px a side (lower `DETAIL` for big maps).
- Target: the map shows in under 3 s here; panning never stalls a frame for long.
- Map shots at 192 for seeds 1954 and 12345; the minimap and Find still work.

### A3. The old Phaser client

It still typechecks against `packages/rules`; keep it compiling, nothing more.

## Part B: contested zones

### B1. Rules

- `zonesOf(seed)`: about **4 zones** of radius 5, a pure function of the seed, placed apart from each other, off the map's edges and off region sites. `zoneAt(x, y)`.
- No bases or alliance HQs inside a zone or within 2 tiles of it (`baseSiteOk`).
- Zone sites: `farmland`, `quarry` and a new funds kind (id `depot`, a supply depot), levels 4–5, rates in `data/sites.ts`, max harvest 12 h. Outside zones nothing changes.
- `checkSiteAttack` and `resolveSiteBattle(attacker, holder, seed, at)`: the existing deterministic battle (checked first that it can fight
  one player's troops and heroes against another's; a new function if it is shaped round NPCs); the winner holds; half the holder's load
  (as of the battle) goes to the winner, counted against the winner's carry (the excess is lost); survivors on both sides. Vitest with
  the timestamp edge cases.
- Alliances are checked **at arrival**, not when sent: two players with no alliance are never allies; an ally holding the site at arrival
  turns the march back unharmed; a site free at arrival is a plain harvest.
- No NPCs or strongholds inside zones (`fillNpcs`, `freeTile`). Rallies on zone sites are out of scope.
- Open (ask the user before the data): a harvest leaves when its carry is full, so a faster rate alone only shortens the trip. "Very
  rich" needs more load: a carry multiplier inside zones, or a load cap that does not depend on carry.

### B2. Server

- A march on a held zone site from a non-ally is an attack march. On arrival it fights whoever holds the site then (several attackers resolve in arrival order); the holder's march is rewritten (returning, survivors, half load), the attacker's becomes the holder (`at_site`, its own harvest timing from the battle).
- Battle reports for both sides, with additive wire fields (the report view expects NPC fields); leaderboard and event hooks as for NPC battles.
- `node:sqlite` tests for races: the holder leaving as the attacker arrives, two attackers, a recall during the fight.

### B3. Godot

- Zones drawn on the ground (a marked border and a tint, never red: red is colonial land) and on the minimap; level 4–5 and depot sites
  as bigger Blender pieces.
- A fight over a site shows dust only: smoke and muzzle flashes stay for colonial targets (GDD §6). Wording is neutral and fictional
  (contest, drive off), and the user reviews the Arabic.
- Tile panel: who holds the site, Attack for non-allies, Harvest when free; march sheet attack mode with a preview.
- Reports for site battles. Strings in en, ar and fr.
- Screenshots in en and ar in the built-in browser.

### B4. Docs

GDD §4.5 and §5 get the zone rules; balance numbers stay placeholders in `data/` until tuned.

## Order

A1 → A2 → (A3 alongside) → B1 → B2 → B3 → B4. Each step is committed alone, with `pnpm test`, `pnpm typecheck` and the Godot tests passing.
