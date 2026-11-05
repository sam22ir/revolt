# Resource sites and gathering: plan

Decided with the user (2026-11-05): occupy and accrue; food and materiel only; one gatherer per site, PvE only (contested zones come later, GDD §5). GDD §4.5 only names "resource sites"; this plan adds the numbers as data, to be tuned.

## Design

- **Name:** the mechanic is **harvest**, not "gather" (gather, `gathering` and `gatherTime` already mean the rally wait). Ids: `harvest_start`, `harvest_recall`, march stage `at_site`.
- **Site kinds** (mechanical ids): `farmland` (food), `quarry` (materiel). Levels 1 to 3. Names and art are looked up by id.
- **Placement is a pure function of static inputs only:** terrain seed, geography flags and region centres (`packages/rules`). Never bases, HQs or NPCs, which move and would shift ids. Site id is `kind:index`, stable. Tiles avoid roads, wadis, oases and region centres; about one site per 150 tiles on the 64×64 map; level by a placeholder rule in data (distance from the nearest region centre).
- **Server resolves sites.** `MapSnapshot.sites[]` is sent already resolved (`id, kind, level, x, y, occupied, mine`); `placeSites` is **not** ported to GDScript. The server's `freeTile` (base placement, NPC fill, HQ moves) skips site tiles. A site whose tile already holds a base in a live world is hidden in the view; ids are never renumbered.
- **Occupation lives on the `marches` row** (`site_id`, partial unique index over the active phases), not in a separate table, so every path that deletes a march (pending timeout, rescue grace, cleanup) frees the site. Existing Durable Objects need a guarded `ALTER TABLE` since `CREATE TABLE IF NOT EXISTS` will not add the column.
- **Harvest is a march** with `siteId` instead of an NPC target; no battle, no guards in v1. `arriveAt`/`returnAt` are fixed when the march is sent, as for every march: `leaveSiteAt = arriveAt + min(time to fill carry, SITE_MAX_HARVEST_MS)`, `returnAt = leaveSiteAt + travel`. The march comes home when full, so it does not hold one of the two `MAX_MARCHES` slots for hours. `harvest_recall` sets `leaveSiteAt = now`, `returnAt = now + travel`. Recall while `outbound` is refused (`not_at_site`) in v1.
- **Accrual is a pure function of time:** `harvested(now) = min(carry, ratePerHour(kind, level) × (now − arriveAt) / 1h)`, `carry` = sum of troops × carry (porters count). Never ticked. The load is credited when the march gets home.
- **Access:** an occupied site refuses a second march (`site_taken`). `MAX_MARCHES` still applies.
- **Server owns all numbers:** the client sends `harvest_start{site, troops}` and `harvest_recall{march}` and only previews.
- **Wire and state changes are additive** (optional `siteId`; `target.npcId` keeps compiling) so the Phaser client still typechecks while it exists.
- Not in v1: depletion, respawn, alliance claims, PvP contest, funds and support sites.

## Chunks

1. **Rules and data.** `data/sites.ts` (kinds, levels, rate, density, max harvest), `sites.ts` (`placeSites(seed, geography)`, `harvestedAt`, `harvestTiming`, check reasons). Vitest: placement determinism and exclusions, accrual cap, time going backwards, very long gaps, fill time and max cap.
2. **Server.** Column migration, `map-service` (`startHarvest`, `recallHarvest`, settle, credit on return, `freeTile` skips sites), wire `MapSnapshot.sites[]`, intents. Tests on `node:sqlite`.
3. **Godot data and map layer.** `sites_model.gd` (pure, reads the snapshot), site layer in `world_map.gd` with code-drawn markers (no new art until the licensing TODO in `docs/art.md` is closed), fixtures, GUT tests.
4. **Godot UI.** Tile panel "Harvest" for a free site, march sheet variant (troops, travel time, rate, fill time), marches list stage "At the site" with a Recall button, `en`/`ar`/`fr` keys, tests.
5. **Docs and acceptance.** GDD §4.5 gets the site rules; screenshots of the map in `en` and `ar` with sites, taken in the built-in browser against the mock server.

Each chunk is committed alone and ends with `pnpm test` and `pnpm typecheck` (never two suites at once).

## Open numbers (placeholders, all in `data/sites.ts`)

Rates per hour at levels 1 to 3 (infantry carry 10, porters 60, so 300 food/h fills 20 infantry in about 40 minutes; compare with building production in `data/` before final): farmland 300 / 600 / 1000 food, quarry 200 / 400 / 700 materiel; max harvest 8 h; density 1 per 150 tiles. To be checked against building production in `data/` before they are final.

## Status (2026-11-05)

- Chunks 1 to 3 done and committed on `godot-client`. Chunk 3 was checked in the built-in browser against the mock server at 375×812: farmland sites show as wheat fields with crop rows and a level badge, in `en` and in `ar` (the map does not mirror, the HUD does). A quarry was not seen on screen (the nearest ones are far from the test guest's base); check one when chunk 4 is verified.
- Placeholder level bands give only levels 2 and 3 on the 64×64 map; tune `SITE_LEVEL_BANDS` before the numbers are final.
- Chunk 4 to do: site case in `TileModel.view`, Harvest button, march sheet, Recall button, `MAX_MARCHES` check on the client (harvest marches count in `state.marches`), 404 on a recall that races the return. Arabic and French copy for the new keys awaits the user's review (Arabic "جمع" means "collecting"; the quarry row reads "Harvesting Arms").
