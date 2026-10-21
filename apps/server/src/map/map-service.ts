import {
  advance,
  checkMarch,
  fightNpc,
  heroBattleModifier,
  loadoutIds,
  HQ_MOVE_COOLDOWN_MS,
  isGatherOption,
  isOnMap,
  isTroops,
  MAP_SIZE,
  NPC_COUNT_BY_LEVEL,
  NPC_RESPAWN_MS,
  npcLevel,
  PLACEMENT_SPACING,
  planMarch,
  rallyTiming,
  RALLY_MAX_PARTICIPANTS,
  resolveRally,
  settleMarch,
  startMarch,
  targetGone,
  terrainAt,
  ZERO_TROOPS,
  type AllianceBlockReason,
  type BaseState,
  type BattleReport,
  type HeroId,
  type HeroLoadout,
  type MapPoint,
  type MapSnapshot,
  type MarchBlockReason,
  type MarchHeroes,
  type MarchOutcome,
  type MarchState,
  type RallyView,
  type Troops,
} from "@revolt/rules";
import { loadBase, saveBase, saveBaseStatement } from "../db/bases.ts";
import type { Db } from "../db/db.ts";
import { awardStatements } from "../db/live.ts";
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

export type SendMarchReason = MarchBlockReason | "target_gone" | AllianceBlockReason;

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

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value)",
  `CREATE TABLE IF NOT EXISTS map_bases (account_id TEXT PRIMARY KEY, tag TEXT NOT NULL,
     x INTEGER NOT NULL, y INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  // The Worker's last word on who a player is. Written only when it changes.
  `CREATE TABLE IF NOT EXISTS map_players (account_id TEXT PRIMARY KEY, handle TEXT NOT NULL, alliance_id TEXT, alliance_tag TEXT)`,
  // A dead NPC keeps its row until it respawns elsewhere under a new id.
  `CREATE TABLE IF NOT EXISTS npcs (id TEXT PRIMARY KEY, level INTEGER NOT NULL,
     x INTEGER NOT NULL, y INTEGER NOT NULL, respawn_at INTEGER)`,
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
  "CREATE INDEX IF NOT EXISTS marches_rally ON marches(rally_id)",
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
  readonly phase: "pending" | "outbound" | "returning";
  readonly rally_id: string | null;
  /** JSON of the MarchHeroes snapshot the base holds for this march; null without heroes. */
  readonly heroes: string | null;
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
  constructor(private readonly deps: MapServiceDeps) {
    for (const s of SCHEMA) deps.sql.exec(s);
    // A map created before rallies has no `rally_id` column; add it once.
    const columns = this.rows<{ name: string }>("SELECT name FROM pragma_table_info('marches')").map((c) => c.name);
    if (!columns.includes("rally_id")) deps.sql.exec("ALTER TABLE marches ADD COLUMN rally_id TEXT");
    // A map created before hero marches has no `heroes` column; add it once.
    if (!columns.includes("heroes")) deps.sql.exec("ALTER TABLE marches ADD COLUMN heroes TEXT");
    if (this.meta("terrain_seed") === null) this.setMeta("terrain_seed", this.randomU32());
    this.fillNpcs();
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
    for (const row of this.rows<MarchRow>("SELECT * FROM marches WHERE phase = 'pending' AND rally_id IS NULL AND depart_at <= ?", t - PENDING_TIMEOUT_MS)) {
      events.push(...(await this.resolvePending(row)));
    }
    for (;;) {
      const march = this.rows<MarchRow>("SELECT * FROM marches WHERE phase = 'outbound' AND rally_id IS NULL AND arrive_at <= ? ORDER BY arrive_at, id LIMIT 1", t)[0];
      const rally = this.rows<RallyRow>("SELECT * FROM rallies WHERE status = 'open' AND arrive_at <= ? ORDER BY arrive_at, id LIMIT 1", t)[0];
      if (march === undefined && rally === undefined) break;
      if (march !== undefined && (rally === undefined || march.arrive_at <= rally.arrive_at)) events.push(...(await this.arrive(march)));
      else if (rally !== undefined) events.push(...(await this.arriveRally(rally)));
    }
    const back = this.rows<{ account_id: string }>("DELETE FROM marches WHERE phase = 'returning' AND return_at <= ? RETURNING account_id", t);
    for (const r of back) events.push({ type: "base_changed", accountId: r.account_id }, MAP_CHANGED);
    this.rows("DELETE FROM rallies WHERE status = 'done' AND return_at <= ? RETURNING id", t);
    const respawned = this.rows<NpcRow>("DELETE FROM npcs WHERE respawn_at IS NOT NULL AND respawn_at <= ? RETURNING id, level, x, y", t);
    if (respawned.length > 0) {
      this.fillNpcs();
      events.push(MAP_CHANGED);
    }
    this.setMeta("last_settled", t);
    return events;
  }

  /** The map as the viewer sees it. Places their base first if they have none. */
  view(viewer: MapViewer, now: number): MapOp<MapSnapshot> {
    const known = this.touchPlayer(viewer);
    const placed = this.ensureBase(viewer, now);
    return { value: this.snapshot(viewer.accountId, now), events: known || placed.created ? [MAP_CHANGED] : [] };
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
      npcs: this.rows<NpcRow>("SELECT id, level, x, y FROM npcs WHERE respawn_at IS NULL ORDER BY id").map((n) => ({
        id: n.id,
        kind: npcLevel(n.level)?.kind ?? "patrol",
        level: n.level,
        x: n.x,
        y: n.y,
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
      })),
      hqs: this.rows<{ alliance_id: string; tag: string; x: number; y: number }>("SELECT alliance_id, tag, x, y FROM alliance_hqs ORDER BY alliance_id").map((h) => ({
        tag: h.tag,
        x: h.x,
        y: h.y,
        mine: h.alliance_id === mine,
      })),
      // Rallies are for the alliance that called them, nobody else.
      rallies: mine === null ? [] : this.rallyViews(mine, viewerId),
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
    const npc = this.rows<NpcRow>("SELECT id, level, x, y FROM npcs WHERE id = ? AND respawn_at IS NULL", npcId)[0];
    const advanced = advance(stored.state, now);
    if (npc === undefined) return { value: { ok: false, reason: "target_gone", state: advanced }, events };
    if (npcLevel(npc.level)?.rallyOnly === true) return { value: { ok: false, reason: "rally_only", state: advanced }, events };
    const reason = checkMarch(advanced, troops, heroes);
    if (reason !== null) return { value: { ok: false, reason, state: advanced }, events };

    const id = this.deps.newId();
    const timing = planMarch(placed.at, npc, troops, now);
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
    const advanced = advance(stored.state, now);
    const refuse = (reason: SendMarchReason): MapOp<SendMarchResult> => ({ value: { ok: false, reason, state: advanced }, events });
    if (viewer.allianceId === null) return refuse("not_member");
    if (!isGatherOption(gatherMs)) return refuse("bad_gather");
    const npc = this.rows<NpcRow>("SELECT id, level, x, y FROM npcs WHERE id = ? AND respawn_at IS NULL", npcId)[0];
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
    const advanced = advance(stored.state, now);
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
   * Puts the viewer's alliance HQ on a tile. The Worker has checked that the viewer is the leader. A first
   * placement is free; moving it waits out HQ_MOVE_COOLDOWN_MS.
   */
  setHq(viewer: MapViewer, x: number, y: number, now: number): MapOp<HqResult> {
    if (viewer.allianceId === null || viewer.allianceTag === null) return { value: { ok: false, reason: "not_member" }, events: [] };
    const seed = Number(this.meta("terrain_seed"));
    if (!isOnMap(x, y) || terrainAt(seed, x, y) === "mountain") return { value: { ok: false, reason: "bad_tile" }, events: [] };
    const current = this.rows<{ moved_at: number }>("SELECT moved_at FROM alliance_hqs WHERE alliance_id = ?", viewer.allianceId)[0];
    if (current !== undefined && now - current.moved_at < HQ_MOVE_COOLDOWN_MS) return { value: { ok: false, reason: "hq_cooldown" }, events: [] };
    const others = [
      ...this.rows<MapPoint>("SELECT x, y FROM map_bases"),
      ...this.rows<MapPoint>("SELECT x, y FROM npcs"),
      ...this.rows<MapPoint>("SELECT x, y FROM alliance_hqs WHERE alliance_id != ?", viewer.allianceId),
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
      due("SELECT MIN(arrive_at) AS due FROM rallies WHERE status = 'open'"),
      due("SELECT MIN(return_at) AS due FROM rallies WHERE status = 'done'"),
      due("SELECT MIN(respawn_at) AS due FROM npcs WHERE respawn_at IS NOT NULL"),
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

  private insertMarchRow(m: Omit<MarchState, "outcome">, accountId: string, seed: number, rallyId: string | null): void {
    this.deps.sql.exec(
      `INSERT INTO marches (id, account_id, npc_id, npc_level, from_x, from_y, to_x, to_y, troops, seed, depart_at, arrive_at, return_at, phase, rally_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      m.id, accountId, m.target.npcId, m.target.level, m.from.x, m.from.y, m.target.x, m.target.y, JSON.stringify(m.troops), seed, m.departAt, m.arriveAt, m.returnAt, rallyId,
    );
  }

  /** Step two and three of sending: write the march into the base (compare-and-set), then mark the row live. */
  private async commitMarch(
    accountId: string,
    first: { state: BaseState; version: number },
    march: Omit<MarchState, "outcome">,
    now: number,
    heroes: HeroLoadout | null,
  ): Promise<SendMarchResult> {
    let base = first;
    for (let i = 0; i < CAS_ATTEMPTS; i++) {
      const r = startMarch(base.state, march, now, heroes);
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
    const npc = this.rows<NpcRow>("SELECT id, level, x, y FROM npcs WHERE id = ? AND respawn_at IS NULL", row.npc_id)[0];
    const modifier = heroBattleModifier(parseMarchHeroes(row.heroes));
    const { outcome, battle } = npc === undefined ? { outcome: targetGone(troops), battle: null } : fightNpc(troops, npc.level, row.seed, modifier);
    const report = this.reportFor(row, troops, outcome, battle, row.seed);
    const delivered = await this.deliverOutcome(row.account_id, row.id, outcome, report, row.arrive_at);
    // The battle is deterministic, so if we crash before this point a retry writes the same result.
    if (npc !== undefined && outcome.result === "victory") {
      this.deps.sql.exec("UPDATE npcs SET respawn_at = ? WHERE id = ?", row.arrive_at + NPC_RESPAWN_MS, npc.id);
    }
    this.deps.sql.exec("UPDATE marches SET phase = 'returning' WHERE id = ?", row.id);
    const events: MapEvent[] = [MAP_CHANGED];
    if (delivered) events.push({ type: "report", accountId: row.account_id, report }, { type: "base_changed", accountId: row.account_id });
    return events;
  }

  /** A rally's one battle with everyone's troops; each participant gets their exact share and their own report. */
  private async arriveRally(rally: RallyRow): Promise<MapEvent[]> {
    for (const p of this.rows<MarchRow>("SELECT * FROM marches WHERE rally_id = ? AND phase = 'pending'", rally.id)) await this.resolvePending(p);
    const rows = this.rows<MarchRow>("SELECT * FROM marches WHERE rally_id = ? AND phase = 'outbound' ORDER BY id", rally.id);
    const events: MapEvent[] = [MAP_CHANGED];
    if (rows.length > 0) {
      const parts = rows.map((r) => ({ id: r.id, troops: parseTroops(r.troops) }));
      const npc = this.rows<NpcRow>("SELECT id, level, x, y FROM npcs WHERE id = ? AND respawn_at IS NULL", rally.npc_id)[0];
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
        this.deps.sql.exec("UPDATE npcs SET respawn_at = ? WHERE id = ?", rally.arrive_at + NPC_RESPAWN_MS, npc.id);
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

  /** Tops up live NPCs to the target count per level, on free tiles. */
  private fillNpcs(): void {
    NPC_COUNT_BY_LEVEL.forEach((target, i) => {
      const level = i + 1;
      const have = this.rows<{ n: number }>("SELECT COUNT(*) AS n FROM npcs WHERE level = ?", level)[0]?.n ?? 0;
      for (let k = have; k < target; k++) {
        const at = this.freeTile();
        this.deps.sql.exec("INSERT INTO npcs (id, level, x, y, respawn_at) VALUES (?, ?, ?, ?, NULL)", this.deps.newId(), level, at.x, at.y);
      }
    });
  }

  /** A random tile away from mountains and at least PLACEMENT_SPACING from any base, NPC or HQ. */
  private freeTile(): MapPoint {
    const seed = Number(this.meta("terrain_seed"));
    const taken = [
      ...this.rows<MapPoint>("SELECT x, y FROM map_bases"),
      ...this.rows<MapPoint>("SELECT x, y FROM npcs"),
      ...this.rows<MapPoint>("SELECT x, y FROM alliance_hqs"),
    ];
    const free = (x: number, y: number, spacing: number): boolean =>
      terrainAt(seed, x, y) !== "mountain" && taken.every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > spacing);
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
