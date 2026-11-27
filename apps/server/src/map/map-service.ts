import {
  advance,
  lessonBonus,
  aidOutcome,
  aidPlan,
  backgroundOfServer,
  checkAid,
  DEFAULT_BACKGROUND,
  PROTECTION_RADIUS,
  placeVillages,
  recordHelp,
  startAid,
  trustLevelWith,
  villageDay,
  villageNeed,
  type AidBlockReason,
  type MapVillage,
  type MapVillageView,
  checkMarch,
  checkHarvest,
  fightNpc,
  geographyOf,
  harvestCarry,
  harvestedAt,
  harvestTiming,
  maxHarvestMs,
  zonesOf,
  heroBattleModifier,
  loadoutIds,
  HQ_MOVE_COOLDOWN_MS,
  isGatherOption,
  baseSiteOk,
  isTroops,
  MAP_SIZE,
  MAX_NPC_LEVEL,
  NPC_COUNT_BY_LEVEL,
  NPC_RESPAWN_MS,
  npcLevel,
  placeSites,
  PLACEMENT_SPACING,
  planMarch,
  recallTiming,
  regionsOf,
  rallyTiming,
  RALLY_MAX_PARTICIPANTS,
  resolveRally,
  settleMarch,
  SITE_RESOURCE,
  startMarch,
  strongholdTile,
  targetGone,
  travelMs,
  ZERO_RESOURCES,
  ZERO_TROOPS,
  type AllianceBlockReason,
  type BaseState,
  type BattleReport,
  type HeroId,
  type Geography,
  type HarvestBlockReason,
  type HeroLoadout,
  type LiberationView,
  type MapPoint,
  type MapSite,
  type MapSiteView,
  type MapGeographyWire,
  type MapSnapshot,
  type MarchBlockReason,
  type MarchHeroes,
  type MarchOutcome,
  type MarchState,
  type RallyView,
  type Troops,
  type World,
} from "@revolt/rules";
import { loadBase, saveBase, saveBaseStatement } from "../db/bases.ts";
import type { Db } from "../db/db.ts";
import { awardStatements } from "../db/live.ts";
import { openLiberation } from "../db/liberations.ts";
import { insertReport } from "../db/reports.ts";
import type { MapSql } from "./map-sql.ts";

export type MapEvent =
  | { readonly type: "map_changed" }
  | { readonly type: "report"; readonly accountId: string; readonly report: BattleReport }
  | { readonly type: "base_changed"; readonly accountId: string };

/** A map operation's answer plus what changed, for the host to push to clients. */
export interface MapOp<T> {
  readonly value: T;
  readonly events: readonly MapEvent[];
}

/** Who is calling, as the Worker knows them from D1. The map keeps a copy so its snapshots can show names and alliances. */
export interface MapViewer {
  readonly accountId: string;
  readonly handle: string;
  readonly allianceId: string | null;
  readonly allianceTag: string | null;
}

export type SendMarchReason = MarchBlockReason | "target_gone" | AllianceBlockReason | HarvestBlockReason | AidBlockReason;

/** Why a harvest cannot be called home: not a harvest march, not yet at the site, or its leave is already scheduled. */
export type RecallHarvestReason = "not_harvest" | "not_at_site" | "already_leaving";

export type RecallHarvestResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: RecallHarvestReason; readonly state: BaseState }
  | { readonly ok: false; readonly error: "not_found" };

export type SendMarchResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: SendMarchReason; readonly state: BaseState }
  | { readonly ok: false; readonly error: "not_found" | "conflict" };

export type HqResult = { readonly ok: true; readonly hq: MapPoint } | { readonly ok: false; readonly reason: AllianceBlockReason };

export interface MapServiceDeps {
  readonly sql: MapSql;
  readonly db: Db;
  /** Uniform in [0, 1): placement and battle seeds. */
  readonly random: () => number;
  readonly newId: () => string;
}

/** A march row stuck in `pending` this long (its base write never finished) is checked against the base. */
export const PENDING_TIMEOUT_MS = 30_000;
const CAS_ATTEMPTS = 3;
/** `respawn_at` of a cleared stronghold: never reached by the clock. */
const STRONGHOLD_DOWN = Number.MAX_SAFE_INTEGER;

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value)",
  `CREATE TABLE IF NOT EXISTS map_bases (account_id TEXT PRIMARY KEY, tag TEXT NOT NULL,
     x INTEGER NOT NULL, y INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  // The Worker's last word on who a player is. Written only when it changes.
  `CREATE TABLE IF NOT EXISTS map_players (account_id TEXT PRIMARY KEY, handle TEXT NOT NULL, alliance_id TEXT, alliance_tag TEXT)`,
  // A dead NPC keeps its row until it respawns elsewhere under a new id.
  // `region_id` marks a region's fixed stronghold. A cleared stronghold keeps `respawn_at = STRONGHOLD_DOWN`
  // until its region is freed again, so the roaming-NPC respawn never touches it.
  `CREATE TABLE IF NOT EXISTS npcs (id TEXT PRIMARY KEY, level INTEGER NOT NULL,
     x INTEGER NOT NULL, y INTEGER NOT NULL, respawn_at INTEGER, region_id INTEGER)`,
  // The source of truth for liberations; mirrored to D1 for the Worker (see db/liberations.ts).
  `CREATE TABLE IF NOT EXISTS liberations (region INTEGER NOT NULL, alliance_id TEXT, from_at INTEGER NOT NULL, until_at INTEGER,
     PRIMARY KEY (region, from_at))`,
  `CREATE TABLE IF NOT EXISTS alliance_hqs (alliance_id TEXT PRIMARY KEY, tag TEXT NOT NULL,
     x INTEGER NOT NULL, y INTEGER NOT NULL, moved_at INTEGER NOT NULL)`,
  // status: open → done (fought). A rally's participants are its rows in `marches`.
  `CREATE TABLE IF NOT EXISTS rallies (id TEXT PRIMARY KEY, alliance_id TEXT NOT NULL, leader_handle TEXT NOT NULL,
     npc_id TEXT NOT NULL, npc_level INTEGER NOT NULL, from_x INTEGER NOT NULL, from_y INTEGER NOT NULL,
     to_x INTEGER NOT NULL, to_y INTEGER NOT NULL, gather_until INTEGER NOT NULL, arrive_at INTEGER NOT NULL,
     return_at INTEGER NOT NULL, seed INTEGER NOT NULL, status TEXT NOT NULL)`,
  // phase: pending (base not yet written) → outbound → returning; deleted on return.
  `CREATE TABLE IF NOT EXISTS marches (id TEXT PRIMARY KEY, account_id TEXT NOT NULL,
     npc_id TEXT NOT NULL, npc_level INTEGER NOT NULL,
     from_x INTEGER NOT NULL, from_y INTEGER NOT NULL, to_x INTEGER NOT NULL, to_y INTEGER NOT NULL,
     troops TEXT NOT NULL, seed INTEGER NOT NULL,
     depart_at INTEGER NOT NULL, arrive_at INTEGER NOT NULL, return_at INTEGER NOT NULL, phase TEXT NOT NULL,
     rally_id TEXT)`,
  "CREATE INDEX IF NOT EXISTS marches_account ON marches(account_id)",
];

interface MarchRow {
  readonly id: string;
  readonly account_id: string;
  readonly npc_id: string;
  readonly npc_level: number;
  readonly from_x: number;
  readonly from_y: number;
  readonly to_x: number;
  readonly to_y: number;
  readonly troops: string;
  readonly seed: number;
  readonly depart_at: number;
  readonly arrive_at: number;
  readonly return_at: number;
  /** `at_site`: a harvest march that has arrived and is gathering. Battle marches never use it. */
  readonly phase: "pending" | "outbound" | "at_site" | "returning";
  readonly rally_id: string | null;
  /** JSON of the MarchHeroes snapshot the base holds for this march; null without heroes. */
  readonly heroes: string | null;
  /** The resource site a harvest march holds; null for battle marches. */
  readonly site_id: string | null;
  /** When a harvest march leaves its site (window end, or the recall). Null for battle marches. */
  readonly leave_site_at: number | null;
}

interface RallyRow {
  readonly id: string;
  readonly alliance_id: string;
  readonly leader_handle: string;
  readonly npc_id: string;
  readonly npc_level: number;
  readonly from_x: number;
  readonly from_y: number;
  readonly to_x: number;
  readonly to_y: number;
  readonly gather_until: number;
  readonly arrive_at: number;
  readonly return_at: number;
  readonly seed: number;
  readonly status: "open" | "done";
}

interface NpcRow {
  readonly id: string;
  readonly level: number;
  readonly x: number;
  readonly y: number;
  readonly region_id: number | null;
}

const MAP_CHANGED: MapEvent = { type: "map_changed" };

/** The heroes a march took, as the base snapshotted them at departure (this server wrote it); undefined without heroes. */
const parseMarchHeroes = (raw: string | null): MarchHeroes | undefined => (raw === null ? undefined : (JSON.parse(raw) as MarchHeroes));

const parseTroops = (raw: string): Troops => {
  const parsed: unknown = JSON.parse(raw);
  return isTroops(parsed) ? parsed : ZERO_TROOPS;
};

/**
 * The world map of one server: base positions, NPC targets, alliance HQs, marches and rallies in flight.
 * Runs inside the map's Durable Object (one writer), which serialises calls (see MapHost).
 * Every number comes from `packages/rules`; times are the caller's `now`.
 */
export class MapService {
  /** Resource sites of this map, placed once from the seed. Never stored: `sites()` recomputes them the same way. */
  private sitesCache: readonly MapSite[] | null = null;
  private geographyCache: Geography | null = null;
  private villagesCache: readonly MapVillage[] | null = null;

  constructor(private readonly deps: MapServiceDeps) {
    for (const s of SCHEMA) deps.sql.exec(s);
    // A map created before rallies has no `rally_id` column; add it once.
    const columns = this.rows<{ name: string }>("SELECT name FROM pragma_table_info('marches')").map((c) => c.name);
    if (!columns.includes("rally_id")) deps.sql.exec("ALTER TABLE marches ADD COLUMN rally_id TEXT");
    // A map created before hero marches has no `heroes` column; add it once.
    if (!columns.includes("heroes")) deps.sql.exec("ALTER TABLE marches ADD COLUMN heroes TEXT");
    // A map created before harvests has no `site_id` or `leave_site_at`. A site holds one march row, so deleting the row frees it.
    if (!columns.includes("site_id")) deps.sql.exec("ALTER TABLE marches ADD COLUMN site_id TEXT");
    if (!columns.includes("leave_site_at")) deps.sql.exec("ALTER TABLE marches ADD COLUMN leave_site_at INTEGER");
    // A map created before villages has no `aid` column (the aid march's {village, need, day, cost}, as JSON).
    if (!columns.includes("aid")) deps.sql.exec("ALTER TABLE marches ADD COLUMN aid TEXT");
    // Indexes on migrated columns come after their ALTERs: an older table has neither column yet.
    deps.sql.exec("CREATE INDEX IF NOT EXISTS marches_rally ON marches(rally_id)");
    deps.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS marches_site ON marches(site_id) WHERE site_id IS NOT NULL");
    // A map created before strongholds has no `region_id` column, and holds roaming level-4 NPCs: drop them
    // (a rally already marching on one comes home unharmed, the same as for any vanished target).
    if (!this.rows<{ name: string }>("SELECT name FROM pragma_table_info('npcs')").some((c) => c.name === "region_id")) {
      deps.sql.exec("ALTER TABLE npcs ADD COLUMN region_id INTEGER");
    }
    deps.sql.exec("DELETE FROM npcs WHERE level = ? AND region_id IS NULL", MAX_NPC_LEVEL);
    // A map made at another size (or before sizes were stored, with a world in it) starts again: a new seed and an empty world.
    const madeAt = this.meta("map_size");
    const hasWorld = this.rows("SELECT 1 FROM map_bases UNION ALL SELECT 1 FROM npcs LIMIT 1").length > 0;
    if ((madeAt === null && hasWorld) || (madeAt !== null && Number(madeAt) !== MAP_SIZE)) this.startAfresh();
    this.setMeta("map_size", MAP_SIZE);
    if (this.meta("terrain_seed") === null) this.setMeta("terrain_seed", this.randomU32());
    this.ensureStrongholds();
    this.fillNpcs();
    this.moveMisplaced();
  }

  /**
   * Moves any base or alliance HQ that `baseSiteOk` refuses (placed before the rule, or before it changed) to a free
   * tile. Marches already out keep their timing and the start they were drawn from.
   */
  private moveMisplaced(): void {
    const seed = Number(this.meta("terrain_seed"));
    for (const table of ["map_bases", "alliance_hqs"] as const) {
      const key = table === "map_bases" ? "account_id" : "alliance_id";
      for (const r of this.rows<{ id: string; x: number; y: number }>(`SELECT ${key} AS id, x, y FROM ${table}`)) {
        if (baseSiteOk(seed, r.x, r.y)) continue;
        let at: MapPoint;
        try {
          at = this.freeTile();
        } catch {
          // A full map keeps the old place rather than failing to load.
          continue;
        }
        this.deps.sql.exec(`UPDATE ${table} SET x = ?, y = ? WHERE ${key} = ?`, at.x, at.y, r.id);
      }
    }
  }

  /**
   * Empties the world for a new map: bases (placed again on the next visit), targets, HQs, marches and rallies, and this map's record of
   * liberations; a new terrain seed. Troops out on a march come home through the base's rescue rule. The server-wide liberations in D1
   * are closed on the next settle (D1 is async).
   */
  private startAfresh(): void {
    for (const table of ["map_bases", "npcs", "alliance_hqs", "marches", "rallies", "liberations"]) this.deps.sql.exec(`DELETE FROM ${table}`);
    this.deps.sql.exec("DELETE FROM meta WHERE key = 'terrain_seed'");
    this.setMeta("close_liberations", 1);
    this.sitesCache = null;
    this.geographyCache = null;
  }

  /** The server name shown in snapshots; remembered from the first call that names it. */
  rememberName(name: string): void {
    if (this.meta("name") !== name) this.setMeta("name", name);
  }

  /**
   * Resolves everything due by `now` (never earlier than the last settle): arrivals in arrival order
   * (solo marches and rallies together), then returns, then NPC respawns.
   */
  async settle(now: number): Promise<MapEvent[]> {
    const t = Math.max(now, Number(this.meta("last_settled") ?? 0));
    const events: MapEvent[] = [];
    const server = this.meta("name");
    if (this.meta("close_liberations") !== null && server !== null) {
      // After a fresh map: the old regions' liberations end now (their ids mean other land on the new map).
      await this.deps.db.prepare("UPDATE liberations SET until_at = ? WHERE server = ? AND until_at IS NULL").bind(t, String(server)).run();
      this.deps.sql.exec("DELETE FROM meta WHERE key = 'close_liberations'");
      events.push(MAP_CHANGED);
    }
    for (const row of this.rows<MarchRow>("SELECT * FROM marches WHERE phase = 'pending' AND rally_id IS NULL AND depart_at <= ?", t - PENDING_TIMEOUT_MS)) {
      events.push(...(await this.resolvePending(row)));
    }
    events.push(...(await this.settleHarvests(t)));
    events.push(...(await this.settleAid(t)));
    for (;;) {
      const march = this.rows<MarchRow>("SELECT * FROM marches WHERE phase = 'outbound' AND rally_id IS NULL AND site_id IS NULL AND aid IS NULL AND arrive_at <= ? ORDER BY arrive_at, id LIMIT 1", t)[0];
      const rally = this.rows<RallyRow>("SELECT * FROM rallies WHERE status = 'open' AND arrive_at <= ? ORDER BY arrive_at, id LIMIT 1", t)[0];
      if (march === undefined && rally === undefined) break;
      if (march !== undefined && (rally === undefined || march.arrive_at <= rally.arrive_at)) events.push(...(await this.arrive(march)));
      else if (rally !== undefined) events.push(...(await this.arriveRally(rally, t)));
    }
    const back = this.rows<{ account_id: string }>("DELETE FROM marches WHERE phase = 'returning' AND return_at <= ? RETURNING account_id", t);
    for (const r of back) events.push({ type: "base_changed", accountId: r.account_id }, MAP_CHANGED);
    this.rows("DELETE FROM rallies WHERE status = 'done' AND return_at <= ? RETURNING id", t);
    const respawned = this.rows<NpcRow>("DELETE FROM npcs WHERE region_id IS NULL AND respawn_at IS NOT NULL AND respawn_at <= ? RETURNING id, level, x, y, region_id", t);
    if (respawned.length > 0) {
      this.fillNpcs();
      events.push(MAP_CHANGED);
    }
    this.setMeta("last_settled", t);
    return events;
  }

  /** The map as the viewer sees it. Places their base first if they have none. `withGeography` adds the landmarks (the first load only). */
  view(viewer: MapViewer, now: number, withGeography = false): MapOp<MapSnapshot> {
    const known = this.touchPlayer(viewer);
    const placed = this.ensureBase(viewer, now);
    const snap = this.snapshot(viewer.accountId, now);
    return { value: withGeography ? { ...snap, geography: this.geographyWire() } : snap, events: known || placed.created ? [MAP_CHANGED] : [] };
  }

  /** Records a change of name or alliance for a player (best-effort push from the Worker). */
  setAlliance(viewer: MapViewer): MapOp<null> {
    return { value: null, events: this.touchPlayer(viewer) ? [MAP_CHANGED] : [] };
  }

  snapshot(viewerId: string, now: number): MapSnapshot {
    const mine = this.rows<{ alliance_id: string | null }>("SELECT alliance_id FROM map_players WHERE account_id = ?", viewerId)[0]?.alliance_id ?? null;
    return {
      map: String(this.meta("name") ?? ""),
      terrainSeed: Number(this.meta("terrain_seed")),
      size: MAP_SIZE,
      bases: this.rows<{ account_id: string; tag: string; x: number; y: number; alliance_tag: string | null }>(
        `SELECT b.account_id, COALESCE(p.handle, b.tag) AS tag, b.x, b.y, p.alliance_tag FROM map_bases b
         LEFT JOIN map_players p ON p.account_id = b.account_id ORDER BY b.created_at, b.account_id`,
      ).map((b) => ({ tag: b.tag, x: b.x, y: b.y, mine: b.account_id === viewerId, alliance: b.alliance_tag })),
      npcs: this.rows<NpcRow>("SELECT id, level, x, y, region_id FROM npcs WHERE respawn_at IS NULL ORDER BY id").map((n) => ({
        id: n.id,
        kind: npcLevel(n.level)?.kind ?? "patrol",
        level: n.level,
        x: n.x,
        y: n.y,
        region: n.region_id,
      })),
      // The seed stays on the server until the battle is over.
      marches: this.rows<MarchRow>("SELECT * FROM marches WHERE phase != 'pending' ORDER BY depart_at, id").map((m) => ({
        id: m.id,
        mine: m.account_id === viewerId,
        from: { x: m.from_x, y: m.from_y },
        to: { x: m.to_x, y: m.to_y },
        departAt: m.depart_at,
        arriveAt: m.arrive_at,
        returnAt: m.return_at,
        ...(m.site_id === null || m.leave_site_at === null ? {} : { siteId: m.site_id, leaveSiteAt: m.leave_site_at }),
      })),
      sites: this.sitesView(viewerId),
      villages: this.villagesView(now),
      zones: zonesOf(Number(this.meta("terrain_seed")), MAP_SIZE).map((z) => ({ id: z.id, x: z.x, y: z.y, radius: z.radius })),
      hqs: this.rows<{ alliance_id: string; tag: string; x: number; y: number }>("SELECT alliance_id, tag, x, y FROM alliance_hqs ORDER BY alliance_id").map((h) => ({
        tag: h.tag,
        x: h.x,
        y: h.y,
        mine: h.alliance_id === mine,
      })),
      // Rallies are for the alliance that called them, nobody else.
      rallies: mine === null ? [] : this.rallyViews(mine, viewerId),
      liberations: this.liberationViews(),
      now,
    };
  }

  /**
   * Sends a march from the player's base to an NPC. The march row is written as
   * `pending` before the base, so a crash in between is cleaned up by `settle`. `heroes` is the loadout it takes, if any.
   */
  async sendMarch(viewer: MapViewer, npcId: string, troops: Troops, heroes: HeroLoadout | null, now: number): Promise<MapOp<SendMarchResult>> {
    const events: MapEvent[] = [];
    if (this.touchPlayer(viewer)) events.push(MAP_CHANGED);
    const placed = this.ensureBase(viewer, now);
    if (placed.created) events.push(MAP_CHANGED);
    const stored = await loadBase(this.deps.db, viewer.accountId);
    if (stored === null) return { value: { ok: false, error: "not_found" }, events };
    const npc = this.rows<NpcRow>("SELECT id, level, x, y, region_id FROM npcs WHERE id = ? AND respawn_at IS NULL", npcId)[0];
    const advanced = advance(stored.state, now, this.world());
    if (npc === undefined) return { value: { ok: false, reason: "target_gone", state: advanced }, events };
    if (npcLevel(npc.level)?.rallyOnly === true) return { value: { ok: false, reason: "rally_only", state: advanced }, events };
    const reason = checkMarch(advanced, troops, heroes);
    if (reason !== null) return { value: { ok: false, reason, state: advanced }, events };

    const id = this.deps.newId();
    const timing = planMarch(placed.at, npc, troops, now, lessonBonus(advanced, "march_speed"));
    const march: Omit<MarchState, "outcome"> = { id, target: { npcId: npc.id, level: npc.level, x: npc.x, y: npc.y }, from: placed.at, troops, ...timing };
    this.insertMarchRow(march, viewer.accountId, this.randomU32(), null);
    const result = await this.commitMarch(viewer.accountId, stored, march, now, heroes);
    return { value: result, events: result.ok ? [...events, MAP_CHANGED] : events };
  }

  /**
   * Starts a rally on an NPC for the viewer's alliance. The caller (the Worker) has checked that the viewer is an
   * officer or leader. Troops leave home now, with the rally's final timing: they gather, then march together.
   */
  async startRally(viewer: MapViewer, npcId: string, troops: Troops, gatherMs: number, now: number): Promise<MapOp<SendMarchResult>> {
    const events: MapEvent[] = [];
    if (this.touchPlayer(viewer)) events.push(MAP_CHANGED);
    const placed = this.ensureBase(viewer, now);
    if (placed.created) events.push(MAP_CHANGED);
    const stored = await loadBase(this.deps.db, viewer.accountId);
    if (stored === null) return { value: { ok: false, error: "not_found" }, events };
    const advanced = advance(stored.state, now, this.world());
    const refuse = (reason: SendMarchReason): MapOp<SendMarchResult> => ({ value: { ok: false, reason, state: advanced }, events });
    if (viewer.allianceId === null) return refuse("not_member");
    if (!isGatherOption(gatherMs)) return refuse("bad_gather");
    const npc = this.rows<NpcRow>("SELECT id, level, x, y, region_id FROM npcs WHERE id = ? AND respawn_at IS NULL", npcId)[0];
    if (npc === undefined) return refuse("target_gone");
    const reason = checkMarch(advanced, troops);
    if (reason !== null) return refuse(reason);

    const rallyId = this.deps.newId();
    const timing = rallyTiming(placed.at, npc, now + gatherMs);
    this.deps.sql.exec(
      `INSERT INTO rallies (id, alliance_id, leader_handle, npc_id, npc_level, from_x, from_y, to_x, to_y, gather_until, arrive_at, return_at, seed, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      rallyId, viewer.allianceId, viewer.handle, npc.id, npc.level, placed.at.x, placed.at.y, npc.x, npc.y, timing.departAt, timing.arriveAt, timing.returnAt, this.randomU32(),
    );
    const march: Omit<MarchState, "outcome"> = { id: this.deps.newId(), target: { npcId: npc.id, level: npc.level, x: npc.x, y: npc.y }, from: placed.at, troops, rallyId, ...timing };
    this.insertMarchRow(march, viewer.accountId, 0, rallyId);
    const result = await this.commitMarch(viewer.accountId, stored, march, now, null);
    if (!result.ok) this.deps.sql.exec("DELETE FROM rallies WHERE id = ?", rallyId);
    return { value: result, events: result.ok ? [...events, MAP_CHANGED] : events };
  }

  /** Joins an open rally of the viewer's alliance with `troops`, which leave home now. */
  async joinRally(viewer: MapViewer, rallyId: string, troops: Troops, now: number): Promise<MapOp<SendMarchResult>> {
    const events: MapEvent[] = [];
    if (this.touchPlayer(viewer)) events.push(MAP_CHANGED);
    const placed = this.ensureBase(viewer, now);
    if (placed.created) events.push(MAP_CHANGED);
    const stored = await loadBase(this.deps.db, viewer.accountId);
    if (stored === null) return { value: { ok: false, error: "not_found" }, events };
    const advanced = advance(stored.state, now, this.world());
    const refuse = (reason: SendMarchReason): MapOp<SendMarchResult> => ({ value: { ok: false, reason, state: advanced }, events });
    if (viewer.allianceId === null) return refuse("not_member");
    const rally = this.rows<RallyRow>("SELECT * FROM rallies WHERE id = ? AND alliance_id = ?", rallyId, viewer.allianceId)[0];
    if (rally === undefined) return refuse("rally_gone");
    if (rally.status !== "open" || now >= rally.gather_until) return refuse("rally_closed");
    const count = this.rows<{ n: number }>("SELECT COUNT(*) AS n FROM marches WHERE rally_id = ?", rallyId)[0]?.n ?? 0;
    if (count >= RALLY_MAX_PARTICIPANTS) return refuse("rally_full");
    if (this.rows("SELECT 1 FROM marches WHERE rally_id = ? AND account_id = ?", rallyId, viewer.accountId).length > 0) return refuse("already_in_rally");
    const reason = checkMarch(advanced, troops);
    if (reason !== null) return refuse(reason);

    const march: Omit<MarchState, "outcome"> = {
      id: this.deps.newId(),
      target: { npcId: rally.npc_id, level: rally.npc_level, x: rally.to_x, y: rally.to_y },
      from: placed.at,
      troops,
      rallyId,
      departAt: rally.gather_until,
      arriveAt: rally.arrive_at,
      returnAt: rally.return_at,
    };
    this.insertMarchRow(march, viewer.accountId, 0, rallyId);
    const result = await this.commitMarch(viewer.accountId, stored, march, now, null);
    return { value: result, events: result.ok ? [...events, MAP_CHANGED] : events };
  }

  /**
   * Sends a harvest march from the player's base to a resource site (docs/resource-sites-plan.md). The troops leave now,
   * reach the site, gather until full or until the window ends, and come home with the load. One march holds a site at a time.
   */
  async startHarvest(viewer: MapViewer, siteId: string, troops: Troops, now: number): Promise<MapOp<SendMarchResult>> {
    const events: MapEvent[] = [];
    if (this.touchPlayer(viewer)) events.push(MAP_CHANGED);
    const placed = this.ensureBase(viewer, now);
    if (placed.created) events.push(MAP_CHANGED);
    const stored = await loadBase(this.deps.db, viewer.accountId);
    if (stored === null) return { value: { ok: false, error: "not_found" }, events };
    const advanced = advance(stored.state, now, this.world());
    const refuse = (reason: SendMarchReason): MapOp<SendMarchResult> => ({ value: { ok: false, reason, state: advanced }, events });
    const site = this.visibleSites().find((s) => s.id === siteId);
    if (site === undefined) return refuse("no_such_site");
    const taken = new Set(this.rows<{ site_id: string }>("SELECT site_id FROM marches WHERE site_id IS NOT NULL").map((r) => r.site_id));
    const reason = checkHarvest(advanced, troops, site, taken);
    if (reason !== null) return refuse(reason);

    const leg = travelMs(placed.at, site, troops, lessonBonus(advanced, "march_speed"));
    const timing = harvestTiming(site, harvestCarry(troops, site, lessonBonus(advanced, "porter_carry")), now + leg, leg);
    const march: Omit<MarchState, "outcome"> = {
      id: this.deps.newId(),
      target: { npcId: site.id, level: 0, x: site.x, y: site.y },
      from: placed.at,
      troops,
      siteId: site.id,
      departAt: now,
      arriveAt: timing.arriveAt,
      returnAt: timing.returnAt,
    };
    this.insertMarchRow(march, viewer.accountId, 0, null, timing.leaveSiteAt);
    const result = await this.commitMarch(viewer.accountId, stored, march, now, null);
    return { value: result, events: result.ok ? [...events, MAP_CHANGED] : events };
  }

  /**
   * Brings a harvest march home now: it leaves its site at `now` and is home one leg later. Refused before it has
   * arrived, and once its scheduled leave has passed. The load gathered so far goes to the base with the new return time.
   */
  async recallHarvest(viewer: MapViewer, marchId: string, now: number): Promise<MapOp<RecallHarvestResult>> {
    const events: MapEvent[] = [];
    if (this.touchPlayer(viewer)) events.push(MAP_CHANGED);
    const stored = await loadBase(this.deps.db, viewer.accountId);
    if (stored === null) return { value: { ok: false, error: "not_found" }, events };
    const advanced = advance(stored.state, now, this.world());
    const row = this.rows<MarchRow>("SELECT * FROM marches WHERE id = ? AND account_id = ?", marchId, viewer.accountId)[0];
    if (row === undefined) return { value: { ok: false, error: "not_found" }, events };
    const refuse = (reason: RecallHarvestReason): MapOp<RecallHarvestResult> => ({ value: { ok: false, reason, state: advanced }, events });
    if (row.site_id === null || row.leave_site_at === null) return refuse("not_harvest");
    const site = this.sites().find((s) => s.id === row.site_id);
    const timing = recallTiming(row.arrive_at, now, row.return_at - row.leave_site_at, site === undefined ? undefined : maxHarvestMs(site));
    if (!timing.ok) return refuse(timing.reason);
    if (now >= row.leave_site_at) return refuse("already_leaving");

    const saved = await this.writeHarvest(viewer.accountId, row.id, this.harvestOutcome(row, timing.leaveSiteAt, lessonBonus(advanced, "porter_carry")), timing.returnAt, now);
    this.deps.sql.exec("UPDATE marches SET phase = 'returning', leave_site_at = ?, return_at = ? WHERE id = ?", timing.leaveSiteAt, timing.returnAt, row.id);
    return { value: { ok: true, state: advance(saved ?? advanced, now, this.world()) }, events: [...events, MAP_CHANGED] };
  }

  /**
   * Puts the viewer's alliance HQ on a tile. The Worker has checked that the viewer is the leader. A first
   * placement is free; moving it waits out HQ_MOVE_COOLDOWN_MS.
   */
  setHq(viewer: MapViewer, x: number, y: number, now: number): MapOp<HqResult> {
    if (viewer.allianceId === null || viewer.allianceTag === null) return { value: { ok: false, reason: "not_member" }, events: [] };
    const seed = Number(this.meta("terrain_seed"));
    if (!baseSiteOk(seed, x, y)) return { value: { ok: false, reason: "bad_tile" }, events: [] };
    const current = this.rows<{ moved_at: number }>("SELECT moved_at FROM alliance_hqs WHERE alliance_id = ?", viewer.allianceId)[0];
    if (current !== undefined && now - current.moved_at < HQ_MOVE_COOLDOWN_MS) return { value: { ok: false, reason: "hq_cooldown" }, events: [] };
    const others = [
      ...this.rows<MapPoint>("SELECT x, y FROM map_bases"),
      ...this.rows<MapPoint>("SELECT x, y FROM npcs"),
      ...this.rows<MapPoint>("SELECT x, y FROM alliance_hqs WHERE alliance_id != ?", viewer.allianceId),
      ...this.sites(),
      ...this.villages(),
    ];
    if (others.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= PLACEMENT_SPACING)) return { value: { ok: false, reason: "tile_taken" }, events: [] };
    this.deps.sql.exec(
      `INSERT INTO alliance_hqs (alliance_id, tag, x, y, moved_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (alliance_id) DO UPDATE SET x = excluded.x, y = excluded.y, moved_at = excluded.moved_at`,
      viewer.allianceId, viewer.allianceTag, x, y, now,
    );
    return { value: { ok: true, hq: { x, y } }, events: [MAP_CHANGED] };
  }

  hqOf(allianceId: string): MapPoint | null {
    const r = this.rows<MapPoint>("SELECT x, y FROM alliance_hqs WHERE alliance_id = ?", allianceId)[0];
    return r === undefined ? null : { x: r.x, y: r.y };
  }

  /** Alliances that have an HQ here, so the daily job can drop the ones whose alliance no longer exists. */
  hqAllianceIds(): string[] {
    return this.rows<{ alliance_id: string }>("SELECT alliance_id FROM alliance_hqs ORDER BY alliance_id").map((r) => r.alliance_id);
  }

  /** An alliance ended: its HQ leaves the map and its former members lose the tag. Rallies already out finish as they are. */
  removeAlliance(allianceId: string): MapOp<null> {
    const hq = this.rows("DELETE FROM alliance_hqs WHERE alliance_id = ? RETURNING alliance_id", allianceId).length;
    const players = this.rows("UPDATE map_players SET alliance_id = NULL, alliance_tag = NULL WHERE alliance_id = ? RETURNING account_id", allianceId).length;
    return { value: null, events: hq + players > 0 ? [MAP_CHANGED] : [] };
  }

  /** Drops deleted accounts' bases and marches from the map. */
  removeAccounts(ids: readonly string[]): MapOp<number> {
    let removed = 0;
    for (const id of ids) {
      removed += this.rows("DELETE FROM map_bases WHERE account_id = ? RETURNING account_id", id).length;
      this.deps.sql.exec("DELETE FROM marches WHERE account_id = ?", id);
      this.deps.sql.exec("DELETE FROM map_players WHERE account_id = ?", id);
    }
    this.deps.sql.exec("DELETE FROM rallies WHERE NOT EXISTS (SELECT 1 FROM marches WHERE marches.rally_id = rallies.id)");
    return { value: removed, events: removed > 0 ? [MAP_CHANGED] : [] };
  }

  /**
   * Game time of the next thing to resolve, or null if nothing is pending. Separate small queries rather than one
   * compound SELECT: a Durable Object's SQLite allows far fewer compound terms than Node's does.
   */
  nextDueAt(): number | null {
    const due = (query: string, ...bindings: number[]): number | null => this.rows<{ due: number | null }>(query, ...bindings)[0]?.due ?? null;
    const times = [
      due("SELECT MIN(arrive_at) AS due FROM marches WHERE phase = 'outbound'"),
      due("SELECT MIN(return_at) AS due FROM marches WHERE phase = 'returning'"),
      due("SELECT MIN(depart_at) + ? AS due FROM marches WHERE phase = 'pending' AND rally_id IS NULL", PENDING_TIMEOUT_MS),
      due("SELECT MIN(leave_site_at) AS due FROM marches WHERE site_id IS NOT NULL AND phase IN ('outbound', 'at_site')"),
      due("SELECT MIN(arrive_at) AS due FROM rallies WHERE status = 'open'"),
      due("SELECT MIN(return_at) AS due FROM rallies WHERE status = 'done'"),
      due("SELECT MIN(respawn_at) AS due FROM npcs WHERE region_id IS NULL AND respawn_at IS NOT NULL"),
    ].filter((t): t is number => t !== null);
    return times.length === 0 ? null : Math.min(...times);
  }

  /** Where the viewer's base is, placing it on a free tile first if needed. The handle is its public name. */
  ensureBase(viewer: MapViewer, now: number): { at: MapPoint; created: boolean } {
    const found = this.rows<{ x: number; y: number }>("SELECT x, y FROM map_bases WHERE account_id = ?", viewer.accountId)[0];
    if (found !== undefined) return { at: { x: found.x, y: found.y }, created: false };
    const at = this.freeTile();
    this.deps.sql.exec("INSERT INTO map_bases (account_id, tag, x, y, created_at) VALUES (?, ?, ?, ?, ?)", viewer.accountId, viewer.handle, at.x, at.y, now);
    return { at, created: true };
  }

  /** Stores who the viewer is if that changed; true if it did. One read per call, a write only on change. */
  private touchPlayer(v: MapViewer): boolean {
    const r = this.rows<{ handle: string; alliance_id: string | null; alliance_tag: string | null }>("SELECT handle, alliance_id, alliance_tag FROM map_players WHERE account_id = ?", v.accountId)[0];
    if (r !== undefined && r.handle === v.handle && r.alliance_id === v.allianceId && r.alliance_tag === v.allianceTag) return false;
    this.deps.sql.exec(
      `INSERT INTO map_players (account_id, handle, alliance_id, alliance_tag) VALUES (?, ?, ?, ?)
       ON CONFLICT (account_id) DO UPDATE SET handle = excluded.handle, alliance_id = excluded.alliance_id, alliance_tag = excluded.alliance_tag`,
      v.accountId, v.handle, v.allianceId, v.allianceTag,
    );
    return true;
  }

  private rallyViews(allianceId: string, viewerId: string): RallyView[] {
    return this.rows<RallyRow>("SELECT * FROM rallies WHERE alliance_id = ? AND status = 'open' ORDER BY gather_until, id", allianceId).map((r) => {
      const members = this.rows<{ account_id: string }>("SELECT account_id FROM marches WHERE rally_id = ? AND phase != 'returning'", r.id);
      return {
        id: r.id,
        leader: r.leader_handle,
        target: { npcId: r.npc_id, kind: npcLevel(r.npc_level)?.kind ?? "patrol", level: r.npc_level, x: r.to_x, y: r.to_y },
        gatherUntil: r.gather_until,
        arriveAt: r.arrive_at,
        returnAt: r.return_at,
        participants: members.length,
        maxParticipants: RALLY_MAX_PARTICIPANTS,
        joined: members.some((m) => m.account_id === viewerId),
      };
    });
  }

  private insertMarchRow(m: Omit<MarchState, "outcome">, accountId: string, seed: number, rallyId: string | null, leaveSiteAt: number | null = null): void {
    this.deps.sql.exec(
      `INSERT INTO marches (id, account_id, npc_id, npc_level, from_x, from_y, to_x, to_y, troops, seed, depart_at, arrive_at, return_at, phase, rally_id, site_id, leave_site_at, aid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      m.id, accountId, m.target.npcId, m.target.level, m.from.x, m.from.y, m.target.x, m.target.y, JSON.stringify(m.troops), seed, m.departAt, m.arriveAt, m.returnAt, rallyId,
      m.siteId ?? null, leaveSiteAt, m.aid === undefined ? null : JSON.stringify(m.aid),
    );
  }

  // --- Villages (docs/villages-plan.md) ---------------------------------------------------------------------------------

  /** Every village of the map (see `placeVillages`), cached for the life of this service. */
  private villages(): readonly MapVillage[] {
    if (this.villagesCache === null) this.villagesCache = placeVillages(Number(this.meta("terrain_seed")), this.geography(), this.sites());
    return this.villagesCache;
  }

  /** The villages a player can see and help: not those a base, HQ or NPC stands on (a world older than villages may hold some). */
  private visibleVillages(): MapVillage[] {
    const covered = new Set([...this.rows<MapPoint>("SELECT x, y FROM map_bases"), ...this.rows<MapPoint>("SELECT x, y FROM alliance_hqs"), ...this.rows<MapPoint>("SELECT x, y FROM npcs")].map((p) => `${p.x},${p.y}`));
    return this.villages().filter((v) => !covered.has(`${v.x},${v.y}`));
  }

  /** The village day at `t` on this server (a bare test map counts as the default background). */
  private villageDayAt(t: number): number {
    let bg = DEFAULT_BACKGROUND;
    try {
      bg = backgroundOfServer(String(this.meta("name") ?? ""));
    } catch {
      // an unnamed map
    }
    return villageDay(t, bg);
  }

  private needOf(v: MapVillage, day: number) {
    return villageNeed(Number(this.meta("terrain_seed")), v.id, day);
  }

  private villagesView(now: number): MapVillageView[] {
    const day = this.villageDayAt(now);
    return this.visibleVillages().map((v) => ({ id: v.id, kind: v.kind, x: v.x, y: v.y, need: this.needOf(v, day), day }));
  }

  /**
   * Sends an aid march answering a village's need today: the goods are paid now, the troops walk there (and stay a while for
   * labor), and on arrival the help is credited (`settleAid`). Protection is answered by beating a target near the village instead.
   */
  async sendAid(viewer: MapViewer, villageId: string, troops: Troops, now: number): Promise<MapOp<SendMarchResult>> {
    const events: MapEvent[] = [];
    if (this.touchPlayer(viewer)) events.push(MAP_CHANGED);
    const placed = this.ensureBase(viewer, now);
    if (placed.created) events.push(MAP_CHANGED);
    const stored = await loadBase(this.deps.db, viewer.accountId);
    if (stored === null) return { value: { ok: false, error: "not_found" }, events };
    const advanced = advance(stored.state, now, this.world());
    const refuse = (reason: SendMarchReason): MapOp<SendMarchResult> => ({ value: { ok: false, reason, state: advanced }, events });
    const village = this.visibleVillages().find((v) => v.id === villageId);
    if (village === undefined) return refuse("no_such_village");
    const day = this.villageDayAt(now);
    const need = this.needOf(village, day);
    const marchReason = checkMarch(advanced, troops);
    if (marchReason !== null) return refuse(marchReason);
    const aidReason = checkAid(advanced, village, need, troops, day, now);
    if (aidReason !== null) return refuse(aidReason);
    const { cost, stayMs } = aidPlan(need, trustLevelWith(advanced, village.id, now));
    const leg = travelMs(placed.at, village, troops, lessonBonus(advanced, "march_speed"));
    const march = {
      id: this.deps.newId(),
      target: { npcId: village.id, level: 0, x: village.x, y: village.y },
      from: placed.at,
      troops,
      departAt: now,
      arriveAt: now + leg,
      returnAt: now + leg + stayMs + leg,
      aid: { village: village.id, need, day, cost },
    };
    this.insertMarchRow(march, viewer.accountId, 0, null);
    const result = await this.commitMarch(viewer.accountId, stored, march, now, null, (s) => startAid(s, march, now, this.world()));
    return { value: result, events: result.ok ? [...events, MAP_CHANGED] : events };
  }

  /** Aid marches that have reached their village: the help is credited and the march starts home (after its stay, for labor). */
  private async settleAid(t: number): Promise<MapEvent[]> {
    const rows = this.rows<MarchRow & { aid: string }>("SELECT * FROM marches WHERE aid IS NOT NULL AND phase = 'outbound' AND arrive_at <= ? ORDER BY arrive_at, id", t);
    const events: MapEvent[] = [];
    for (const row of rows) {
      const aid = JSON.parse(row.aid) as NonNullable<MarchState["aid"]>;
      const village = this.villages().find((v) => v.id === aid.village);
      await this.writeBase(row.account_id, (state) => {
        const held = state.marches.find((m) => m.id === row.id);
        if (held === undefined || held.outcome !== null) return null;
        const help = village === undefined ? { state, credited: false } : recordHelp(state, village, aid.day, row.arrive_at);
        return settleMarch(help.state, row.id, aidOutcome(parseTroops(row.troops), aid.cost, help.credited)).state;
      }, row.arrive_at);
      this.deps.sql.exec("UPDATE marches SET phase = 'returning' WHERE id = ?", row.id);
      events.push(MAP_CHANGED, { type: "base_changed", accountId: row.account_id });
    }
    return events;
  }

  /** A victory near a village whose need today is protection answers it for the winner. */
  private async creditProtection(accountId: string, at: MapPoint, t: number): Promise<void> {
    const day = this.villageDayAt(t);
    const near = this.villages().filter((v) => Math.max(Math.abs(v.x - at.x), Math.abs(v.y - at.y)) <= PROTECTION_RADIUS && this.needOf(v, day) === "protection");
    if (near.length === 0) return;
    await this.writeBase(accountId, (state) => {
      let s = state;
      let changed = false;
      for (const v of near) {
        const r = recordHelp(s, v, day, t);
        s = r.state;
        changed = changed || r.credited;
      }
      return changed ? s : null;
    }, t);
  }

  /** Changes the player's base with `change` (null: nothing to do) in a compare-and-set, retried on a lost race. */
  private async writeBase(accountId: string, change: (state: BaseState) => BaseState | null, now: number): Promise<void> {
    const db = this.deps.db;
    for (let i = 0; i < CAS_ATTEMPTS; i++) {
      const stored = await loadBase(db, accountId);
      if (stored === null) return;
      const next = change(stored.state);
      if (next === null) return;
      const [save] = (await db.batch([saveBaseStatement(db, accountId, next, stored.version, now)])) as { meta: { changes: number } }[];
      if (save?.meta.changes === 1) return;
    }
    throw new Error(`base ${accountId} kept changing`);
  }

  /** The sites a player can see and send to: not those a base, HQ or stronghold stands on (live worlds may predate the site rule). */
  private visibleSites(): MapSite[] {
    const covered = new Set(
      [
        ...this.rows<MapPoint>("SELECT x, y FROM map_bases"),
        ...this.rows<MapPoint>("SELECT x, y FROM alliance_hqs"),
        ...this.rows<MapPoint>("SELECT x, y FROM npcs WHERE region_id IS NOT NULL"),
      ].map((p) => `${p.x},${p.y}`),
    );
    return this.sites().filter((s) => !covered.has(`${s.x},${s.y}`));
  }

  /** The visible sites with their holder: `occupied` if any march holds it, `mine` if it is the viewer's. */
  private sitesView(viewerId: string): MapSiteView[] {
    const holders = this.rows<{ site_id: string; account_id: string }>("SELECT site_id, account_id FROM marches WHERE site_id IS NOT NULL");
    return this.visibleSites().map((s) => {
      const holder = holders.find((h) => h.site_id === s.id);
      return { id: s.id, kind: s.kind, level: s.level, x: s.x, y: s.y, occupied: holder !== undefined, mine: holder?.account_id === viewerId, zone: s.zone };
    });
  }

  /** A harvest's outcome as of `leaveAt`: the troops come home whole, carrying what the site gave up by then. */
  private harvestOutcome(row: MarchRow, leaveAt: number, porterBonus: number): MarchOutcome {
    const troops = parseTroops(row.troops);
    const site = this.sites().find((s) => s.id === row.site_id);
    const gained = site === undefined ? 0 : harvestedAt(site, harvestCarry(troops, site, porterBonus), row.arrive_at, leaveAt);
    const loot = site === undefined ? ZERO_RESOURCES : { ...ZERO_RESOURCES, [SITE_RESOURCE[site.kind]]: gained };
    return { result: "victory", survivors: troops, wounded: ZERO_TROOPS, lost: ZERO_TROOPS, loot };
  }

  /**
   * Writes a harvest's outcome onto the base's march (and, on a recall, its new return time) in one compare-and-set.
   * No battle report and no event awards: a harvest is not a fight. Idempotent: a march that already has an outcome is left
   * alone. Null if the base no longer holds the march (its rescue already brought the troops home).
   */
  private async writeHarvest(accountId: string, marchId: string, outcome: MarchOutcome, returnAt: number | null, now: number): Promise<BaseState | null> {
    const db = this.deps.db;
    for (let i = 0; i < CAS_ATTEMPTS; i++) {
      const stored = await loadBase(db, accountId);
      const held = stored?.state.marches.find((m) => m.id === marchId);
      if (stored === null || held === undefined) return null;
      if (held.outcome !== null) return stored.state;
      const state: BaseState = { ...stored.state, marches: stored.state.marches.map((m) => (m.id === marchId ? { ...m, outcome, returnAt: returnAt ?? m.returnAt } : m)) };
      const [save] = (await db.batch([saveBaseStatement(db, accountId, state, stored.version, now)])) as { meta: { changes: number } }[];
      if (save?.meta.changes === 1) return state;
    }
    throw new Error(`harvest ${marchId}: base kept changing`);
  }

  /**
   * Harvest marches: one that has reached its site is marked so; one whose window has ended (or was recalled) hands its
   * load to the base and starts home. Battle marches are not touched here.
   */
  private async settleHarvests(t: number): Promise<MapEvent[]> {
    const arrived = this.rows<{ id: string }>("UPDATE marches SET phase = 'at_site' WHERE site_id IS NOT NULL AND phase = 'outbound' AND arrive_at <= ? RETURNING id", t);
    const leaving = this.rows<MarchRow>("SELECT * FROM marches WHERE site_id IS NOT NULL AND phase = 'at_site' AND leave_site_at <= ? ORDER BY leave_site_at, id", t);
    for (const row of leaving) {
      const leaveAt = row.leave_site_at ?? row.arrive_at;
      // The weavers' carry lesson as the base has it now (lessons are only ever added, never lost).
      const owner = await loadBase(this.deps.db, row.account_id);
      const porterBonus = owner === null ? 0 : lessonBonus(owner.state, "porter_carry");
      await this.writeHarvest(row.account_id, row.id, this.harvestOutcome(row, leaveAt, porterBonus), null, leaveAt);
      this.deps.sql.exec("UPDATE marches SET phase = 'returning' WHERE id = ?", row.id);
    }
    return arrived.length + leaving.length > 0 ? [MAP_CHANGED] : [];
  }

  /** Step two and three of sending: write the march into the base (compare-and-set), then mark the row live. */
  private async commitMarch(
    accountId: string,
    first: { state: BaseState; version: number },
    march: Omit<MarchState, "outcome">,
    now: number,
    heroes: HeroLoadout | null,
    start: (state: BaseState) => { ok: true; state: BaseState } | { ok: false; reason: SendMarchReason; state: BaseState } = (s) => startMarch(s, march, now, this.world(), heroes),
  ): Promise<SendMarchResult> {
    let base = first;
    for (let i = 0; i < CAS_ATTEMPTS; i++) {
      const r = start(base.state);
      if (!r.ok) {
        this.dropMarchRow(march.id);
        return r;
      }
      if (await saveBase(this.deps.db, accountId, r.state, base.version, now)) {
        // The row keeps the same heroes snapshot the base holds, so the battle uses the levels they left with.
        const snapshot = r.state.marches.find((m) => m.id === march.id)?.heroes;
        this.deps.sql.exec("UPDATE marches SET phase = 'outbound', heroes = ? WHERE id = ?", snapshot === undefined ? null : JSON.stringify(snapshot), march.id);
        return { ok: true, state: r.state };
      }
      const again = await loadBase(this.deps.db, accountId);
      if (again === null) break;
      base = again;
    }
    this.dropMarchRow(march.id);
    return { ok: false, error: "conflict" };
  }

  /** Removes a march row, and its rally if that was the rally's only member. */
  private dropMarchRow(id: string): void {
    const row = this.rows<{ rally_id: string | null }>("DELETE FROM marches WHERE id = ? RETURNING rally_id", id)[0];
    if (row?.rally_id != null) this.deps.sql.exec("DELETE FROM rallies WHERE id = ? AND NOT EXISTS (SELECT 1 FROM marches WHERE rally_id = ?)", row.rally_id, row.rally_id);
  }

  private reportFor(
    m: { id: string; arrive_at: number; npc_level: number; to_x: number; to_y: number; heroes: string | null },
    sent: Troops,
    outcome: MarchOutcome,
    battle: ReturnType<typeof fightNpc>["battle"],
    seed: number,
  ): BattleReport {
    const def = npcLevel(m.npc_level);
    const heroes = parseMarchHeroes(m.heroes);
    return {
      id: m.id,
      at: m.arrive_at,
      target: { kind: def?.kind ?? null, level: m.npc_level, x: m.to_x, y: m.to_y },
      result: outcome.result,
      sent,
      survivors: outcome.survivors,
      wounded: outcome.wounded,
      lost: outcome.lost,
      defenders: battle === null || def === null ? ZERO_TROOPS : def.defenders,
      defendersKilled: battle?.defenderKilled ?? ZERO_TROOPS,
      rounds: battle?.rounds.length ?? 0,
      loot: outcome.loot,
      seed: battle === null ? null : seed,
      ...(heroes === undefined ? {} : { heroes: loadoutIds(heroes) }),
    };
  }

  /** A solo battle on arrival: written to the base and the report in D1 first, then the map moves on. */
  private async arrive(row: MarchRow): Promise<MapEvent[]> {
    const troops = parseTroops(row.troops);
    const npc = this.rows<NpcRow>("SELECT id, level, x, y, region_id FROM npcs WHERE id = ? AND respawn_at IS NULL", row.npc_id)[0];
    const modifier = heroBattleModifier(parseMarchHeroes(row.heroes));
    const { outcome, battle } = npc === undefined ? { outcome: targetGone(troops), battle: null } : fightNpc(troops, npc.level, row.seed, modifier);
    const report = this.reportFor(row, troops, outcome, battle, row.seed);
    const delivered = await this.deliverOutcome(row.account_id, row.id, outcome, report, row.arrive_at);
    // The battle is deterministic, so if we crash before this point a retry writes the same result.
    if (npc !== undefined && outcome.result === "victory") {
      this.deps.sql.exec("UPDATE npcs SET respawn_at = ? WHERE id = ?", row.arrive_at + NPC_RESPAWN_MS, npc.id);
      if (delivered) await this.creditProtection(row.account_id, npc, row.arrive_at);
    }
    this.deps.sql.exec("UPDATE marches SET phase = 'returning' WHERE id = ?", row.id);
    const events: MapEvent[] = [MAP_CHANGED];
    if (delivered) events.push({ type: "report", accountId: row.account_id, report }, { type: "base_changed", accountId: row.account_id });
    return events;
  }

  /** A rally's one battle with everyone's troops; each participant gets their exact share and their own report. */
  private async arriveRally(rally: RallyRow, t: number): Promise<MapEvent[]> {
    for (const p of this.rows<MarchRow>("SELECT * FROM marches WHERE rally_id = ? AND phase = 'pending'", rally.id)) await this.resolvePending(p);
    const rows = this.rows<MarchRow>("SELECT * FROM marches WHERE rally_id = ? AND phase = 'outbound' ORDER BY id", rally.id);
    const events: MapEvent[] = [MAP_CHANGED];
    if (rows.length > 0) {
      const parts = rows.map((r) => ({ id: r.id, troops: parseTroops(r.troops) }));
      const npc = this.rows<NpcRow>("SELECT id, level, x, y, region_id FROM npcs WHERE id = ? AND respawn_at IS NULL", rally.npc_id)[0];
      const fought = npc === undefined ? null : resolveRally(parts, npc.level, rally.seed);
      for (const row of rows) {
        const troops = parseTroops(row.troops);
        const outcome = fought?.shares.find((s) => s.id === row.id)?.outcome ?? targetGone(troops);
        const report = this.reportFor({ ...row, arrive_at: rally.arrive_at }, troops, outcome, fought?.battle ?? null, rally.seed);
        if (await this.deliverOutcome(row.account_id, row.id, outcome, report, rally.arrive_at)) {
          events.push({ type: "report", accountId: row.account_id, report }, { type: "base_changed", accountId: row.account_id });
        }
      }
      if (npc !== undefined && fought?.outcome.result === "victory") {
        if (npc.region_id !== null) await this.liberate(npc.region_id, npc.id, rally.alliance_id, t);
        else this.deps.sql.exec("UPDATE npcs SET respawn_at = ? WHERE id = ?", rally.arrive_at + NPC_RESPAWN_MS, npc.id);
      }
    }
    this.deps.sql.exec("UPDATE marches SET phase = 'returning' WHERE rally_id = ? AND phase = 'outbound'", rally.id);
    this.deps.sql.exec("UPDATE rallies SET status = 'done' WHERE id = ?", rally.id);
    return events;
  }

  /**
   * Records the outcome on the player's base and stores the report, in one D1 batch.
   * Idempotent. False if the base or the march is gone (deleted account, or the base's
   * rescue rule already brought the troops home); then nothing is written.
   */
  private async deliverOutcome(accountId: string, marchId: string, outcome: MarchOutcome, report: BattleReport, now: number): Promise<boolean> {
    const db = this.deps.db;
    for (let i = 0; i < CAS_ATTEMPTS; i++) {
      const stored = await loadBase(db, accountId);
      if (stored === null || !stored.state.marches.some((m) => m.id === marchId)) return false;
      const settled = settleMarch(stored.state, marchId, outcome);
      // Event scores and pass XP are award rows keyed by (march, key), INSERT OR IGNORE: a retry or a lost compare-and-set
      // below can run these statements again and they still count once.
      const awards = awardStatements(db, accountId, String(this.meta("name") ?? ""), report);
      if (!settled.changed) {
        await db.batch([insertReport(db, accountId, report), ...awards]);
        return true;
      }
      const [save] = (await db.batch([saveBaseStatement(db, accountId, settled.state, stored.version, now), insertReport(db, accountId, report), ...awards])) as {
        meta: { changes: number };
      }[];
      if (save?.meta.changes === 1) return true;
    }
    throw new Error(`march ${marchId}: base kept changing`);
  }

  /** A pending march whose base write may or may not have happened: keep it if the base has it. */
  private async resolvePending(row: MarchRow): Promise<MapEvent[]> {
    const stored = await loadBase(this.deps.db, row.account_id);
    if (stored !== null && stored.state.marches.some((m) => m.id === row.id)) {
      this.deps.sql.exec("UPDATE marches SET phase = 'outbound' WHERE id = ?", row.id);
      return [MAP_CHANGED];
    }
    this.dropMarchRow(row.id);
    return [];
  }

  private liberationViews(): LiberationView[] {
    return this.rows<{ region: number; alliance_id: string | null; from_at: number; until_at: number | null }>("SELECT region, alliance_id, from_at, until_at FROM liberations ORDER BY from_at, region").map((l) => ({
      region: l.region,
      from: l.from_at,
      until: l.until_at,
      alliance: l.alliance_id === null ? null : (this.rows<{ alliance_tag: string }>("SELECT alliance_tag FROM map_players WHERE alliance_id = ? AND alliance_tag IS NOT NULL LIMIT 1", l.alliance_id)[0]?.alliance_tag ?? null),
    }));
  }

  /** The regions held, as the production rules read them. */
  private world(): World {
    return { liberations: this.rows<{ region: number; from_at: number; until_at: number | null }>("SELECT region, from_at, until_at FROM liberations").map((l) => ({ region: l.region, from: l.from_at, until: l.until_at })) };
  }

  /**
   * Records a cleared stronghold's region as liberated, stamped with `t` (when the map records it, never
   * earlier: bases already settled past `t` must not be paid for time before it). D1 first, so the Worker never
   * lags the map; both writes are idempotent, so a retry after a crash changes nothing.
   */
  private async liberate(region: number, npcId: string, allianceId: string, t: number): Promise<void> {
    await openLiberation(this.deps.db, String(this.meta("name") ?? ""), region, allianceId, t);
    this.deps.sql.exec(
      "INSERT INTO liberations (region, alliance_id, from_at, until_at) SELECT ?, ?, ?, NULL WHERE NOT EXISTS (SELECT 1 FROM liberations WHERE region = ? AND until_at IS NULL)",
      region, allianceId, t, region,
    );
    this.deps.sql.exec("UPDATE npcs SET respawn_at = ? WHERE id = ?", STRONGHOLD_DOWN, npcId);
  }

  /** One level-4 stronghold per region, at the tile `strongholdTile` picks. Idempotent. */
  private ensureStrongholds(): void {
    const seed = Number(this.meta("terrain_seed"));
    for (const { id } of regionsOf(seed)) {
      if (this.rows("SELECT 1 FROM npcs WHERE region_id = ?", id).length > 0) continue;
      const taken = [
        ...this.rows<MapPoint>("SELECT x, y FROM map_bases"),
        ...this.rows<MapPoint>("SELECT x, y FROM npcs"),
        ...this.rows<MapPoint>("SELECT x, y FROM alliance_hqs"),
        ...this.sites(),
      ];
      const at = strongholdTile(seed, id, taken, PLACEMENT_SPACING);
      if (at === null) continue;
      const held = this.rows("SELECT 1 FROM liberations WHERE region = ? AND until_at IS NULL", id).length > 0;
      this.deps.sql.exec("INSERT INTO npcs (id, level, x, y, respawn_at, region_id) VALUES (?, ?, ?, ?, ?, ?)", this.deps.newId(), MAX_NPC_LEVEL, at.x, at.y, held ? STRONGHOLD_DOWN : null, id);
    }
  }

  /** Tops up live roaming NPCs to the target count per level, on free tiles. */
  private fillNpcs(): void {
    // One list for the whole fill (a full map places hundreds), kept up to date as targets go down.
    const taken = this.takenTiles();
    NPC_COUNT_BY_LEVEL.forEach((target, i) => {
      const level = i + 1;
      const have = this.rows<{ n: number }>("SELECT COUNT(*) AS n FROM npcs WHERE level = ? AND region_id IS NULL", level)[0]?.n ?? 0;
      for (let k = have; k < target; k++) {
        const at = this.freeTile(taken);
        taken.push(at);
        this.deps.sql.exec("INSERT INTO npcs (id, level, x, y, respawn_at, region_id) VALUES (?, ?, ?, ?, NULL, NULL)", this.deps.newId(), level, at.x, at.y);
      }
    });
  }

  /** The map's landmarks (`geographyOf`), cached for the life of this service: the road search is the dearest thing on the map. */
  private geography(): Geography {
    if (this.geographyCache === null) this.geographyCache = geographyOf(Number(this.meta("terrain_seed")), MAP_SIZE);
    return this.geographyCache;
  }

  private geographyWire(): MapGeographyWire {
    const flat = (path: readonly MapPoint[]): number[] => path.flatMap((t) => [t.x, t.y]);
    const g = this.geography();
    return { wadis: g.wadis.map(flat), roads: g.roads.map(flat), oases: flat(g.oases) };
  }

  /** Every resource site of the map (see `placeSites`), cached for the life of this service. */
  private sites(): readonly MapSite[] {
    if (this.sitesCache === null) this.sitesCache = placeSites(Number(this.meta("terrain_seed")), this.geography());
    return this.sitesCache;
  }

  /** Every tile something stands on: bases, NPCs, HQs, resource sites and villages. */
  private takenTiles(): MapPoint[] {
    return [
      ...this.rows<MapPoint>("SELECT x, y FROM map_bases"),
      ...this.rows<MapPoint>("SELECT x, y FROM npcs"),
      ...this.rows<MapPoint>("SELECT x, y FROM alliance_hqs"),
      ...this.sites(),
      ...this.villages(),
    ];
  }

  /** A random tile where a base may stand (`baseSiteOk`), at least PLACEMENT_SPACING from anything in `taken` (by default, everything). */
  private freeTile(taken: readonly MapPoint[] = this.takenTiles()): MapPoint {
    const seed = Number(this.meta("terrain_seed"));
    const free = (x: number, y: number, spacing: number): boolean =>
      baseSiteOk(seed, x, y) && taken.every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > spacing);
    for (let i = 0; i < 500; i++) {
      const x = Math.floor(this.deps.random() * MAP_SIZE);
      const y = Math.floor(this.deps.random() * MAP_SIZE);
      if (free(x, y, PLACEMENT_SPACING)) return { x, y };
    }
    // Crowded map: take any tile nobody stands on.
    for (let x = 0; x < MAP_SIZE; x++) for (let y = 0; y < MAP_SIZE; y++) if (free(x, y, 0)) return { x, y };
    throw new Error("map full");
  }

  private randomU32(): number {
    return Math.floor(this.deps.random() * 0x1_0000_0000) >>> 0;
  }

  private rows<T>(query: string, ...bindings: (string | number | null)[]): T[] {
    return this.deps.sql.exec<T>(query, ...bindings);
  }

  private meta(key: string): string | number | null {
    return this.rows<{ value: string | number | null }>("SELECT value FROM meta WHERE key = ?", key)[0]?.value ?? null;
  }

  private setMeta(key: string, value: string | number): void {
    this.deps.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);
  }
}
