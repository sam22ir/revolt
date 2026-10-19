import {
  advance,
  checkMarch,
  fightNpc,
  isTroops,
  MAP_SIZE,
  NPC_COUNT_BY_LEVEL,
  NPC_RESPAWN_MS,
  npcLevel,
  PLACEMENT_SPACING,
  planMarch,
  settleMarch,
  startMarch,
  targetGone,
  terrainAt,
  ZERO_TROOPS,
  type BaseState,
  type BattleReport,
  type MapPoint,
  type MapSnapshot,
  type MarchBlockReason,
  type MarchOutcome,
  type Troops,
} from "@revolt/rules";
import { loadBase, saveBase, saveBaseStatement } from "../db/bases.ts";
import type { Db } from "../db/db.ts";
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

export type SendMarchReason = MarchBlockReason | "target_gone";

export type SendMarchResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: SendMarchReason; readonly state: BaseState }
  | { readonly ok: false; readonly error: "not_found" | "conflict" };

export interface MapServiceDeps {
  readonly sql: MapSql;
  readonly db: Db;
  /** Uniform in [0, 1): placement, tags and battle seeds. */
  readonly random: () => number;
  readonly newId: () => string;
}

/** A march row stuck in `pending` this long (its base write never finished) is checked against the base. */
export const PENDING_TIMEOUT_MS = 30_000;
const CAS_ATTEMPTS = 3;
const TAG_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value)",
  `CREATE TABLE IF NOT EXISTS map_bases (account_id TEXT PRIMARY KEY, tag TEXT NOT NULL,
     x INTEGER NOT NULL, y INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  // A dead NPC keeps its row until it respawns elsewhere under a new id.
  `CREATE TABLE IF NOT EXISTS npcs (id TEXT PRIMARY KEY, level INTEGER NOT NULL,
     x INTEGER NOT NULL, y INTEGER NOT NULL, respawn_at INTEGER)`,
  // phase: pending (base not yet written) → outbound → returning; deleted on return.
  `CREATE TABLE IF NOT EXISTS marches (id TEXT PRIMARY KEY, account_id TEXT NOT NULL,
     npc_id TEXT NOT NULL, npc_level INTEGER NOT NULL,
     from_x INTEGER NOT NULL, from_y INTEGER NOT NULL, to_x INTEGER NOT NULL, to_y INTEGER NOT NULL,
     troops TEXT NOT NULL, seed INTEGER NOT NULL,
     depart_at INTEGER NOT NULL, arrive_at INTEGER NOT NULL, return_at INTEGER NOT NULL, phase TEXT NOT NULL)`,
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
  readonly phase: "pending" | "outbound" | "returning";
}

interface NpcRow {
  readonly id: string;
  readonly level: number;
  readonly x: number;
  readonly y: number;
}

const MAP_CHANGED: MapEvent = { type: "map_changed" };

/**
 * The world map of one server: base positions, NPC targets and marches in flight.
 * Runs inside the map's Durable Object (one writer), which serialises calls (see MapHost).
 * Every number comes from `packages/rules`; times are the caller's `now`.
 */
export class MapService {
  constructor(private readonly deps: MapServiceDeps) {
    for (const s of SCHEMA) deps.sql.exec(s);
    if (this.meta("terrain_seed") === null) this.setMeta("terrain_seed", this.randomU32());
    this.fillNpcs();
  }

  /** The server name shown in snapshots; remembered from the first call that names it. */
  rememberName(name: string): void {
    if (this.meta("name") !== name) this.setMeta("name", name);
  }

  /**
   * Resolves everything due by `now` (never earlier than the last settle): arrivals in
   * arrival order, then returns, then NPC respawns.
   */
  async settle(now: number): Promise<MapEvent[]> {
    const t = Math.max(now, Number(this.meta("last_settled") ?? 0));
    const events: MapEvent[] = [];
    for (const row of this.rows<MarchRow>("SELECT * FROM marches WHERE phase = 'pending' AND depart_at <= ?", t - PENDING_TIMEOUT_MS)) {
      events.push(...(await this.resolvePending(row)));
    }
    for (;;) {
      const row = this.rows<MarchRow>("SELECT * FROM marches WHERE phase = 'outbound' AND arrive_at <= ? ORDER BY arrive_at, id LIMIT 1", t)[0];
      if (row === undefined) break;
      events.push(...(await this.arrive(row, t)));
    }
    const back = this.rows<{ account_id: string }>("DELETE FROM marches WHERE phase = 'returning' AND return_at <= ? RETURNING account_id", t);
    for (const r of back) events.push({ type: "base_changed", accountId: r.account_id }, MAP_CHANGED);
    const respawned = this.rows<NpcRow>("DELETE FROM npcs WHERE respawn_at IS NOT NULL AND respawn_at <= ? RETURNING id, level, x, y", t);
    if (respawned.length > 0) {
      this.fillNpcs();
      events.push(MAP_CHANGED);
    }
    this.setMeta("last_settled", t);
    return events;
  }

  /** The map as `accountId` sees it. Places their base first if they have none. Read-only otherwise. */
  view(accountId: string, now: number): MapOp<MapSnapshot> {
    const placed = this.ensureBase(accountId, now);
    return { value: this.snapshot(accountId, now), events: placed.created ? [MAP_CHANGED] : [] };
  }

  snapshot(viewer: string, now: number): MapSnapshot {
    return {
      map: String(this.meta("name") ?? ""),
      terrainSeed: Number(this.meta("terrain_seed")),
      size: MAP_SIZE,
      bases: this.rows<{ account_id: string; tag: string; x: number; y: number }>("SELECT account_id, tag, x, y FROM map_bases ORDER BY created_at, account_id").map((b) => ({
        tag: b.tag,
        x: b.x,
        y: b.y,
        mine: b.account_id === viewer,
        alliance: null,
      })),
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
        mine: m.account_id === viewer,
        from: { x: m.from_x, y: m.from_y },
        to: { x: m.to_x, y: m.to_y },
        departAt: m.depart_at,
        arriveAt: m.arrive_at,
        returnAt: m.return_at,
      })),
      hqs: [],
      rallies: [],
      now,
    };
  }

  /**
   * Sends a march from the player's base to an NPC. The march row is written as
   * `pending` before the base, so a crash in between is cleaned up by `settle`.
   */
  async sendMarch(accountId: string, npcId: string, troops: Troops, now: number): Promise<MapOp<SendMarchResult>> {
    const events: MapEvent[] = [];
    const placed = this.ensureBase(accountId, now);
    if (placed.created) events.push(MAP_CHANGED);
    const stored = await loadBase(this.deps.db, accountId);
    if (stored === null) return { value: { ok: false, error: "not_found" }, events };
    const npc = this.rows<NpcRow>("SELECT id, level, x, y FROM npcs WHERE id = ? AND respawn_at IS NULL", npcId)[0];
    if (npc === undefined) return { value: { ok: false, reason: "target_gone", state: advance(stored.state, now) }, events };
    const reason = checkMarch(advance(stored.state, now), troops);
    if (reason !== null) return { value: { ok: false, reason, state: advance(stored.state, now) }, events };

    const id = this.deps.newId();
    const timing = planMarch(placed.at, npc, troops, now);
    const march = { id, target: { npcId: npc.id, level: npc.level, x: npc.x, y: npc.y }, from: placed.at, troops, ...timing };
    this.deps.sql.exec(
      `INSERT INTO marches (id, account_id, npc_id, npc_level, from_x, from_y, to_x, to_y, troops, seed, depart_at, arrive_at, return_at, phase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      id, accountId, npc.id, npc.level, placed.at.x, placed.at.y, npc.x, npc.y, JSON.stringify(troops), this.randomU32(),
      timing.departAt, timing.arriveAt, timing.returnAt,
    );
    let base = stored;
    for (let i = 0; i < CAS_ATTEMPTS; i++) {
      const r = startMarch(base.state, march, now);
      if (!r.ok) {
        this.deps.sql.exec("DELETE FROM marches WHERE id = ?", id);
        return { value: r, events };
      }
      if (await saveBase(this.deps.db, accountId, r.state, base.version, now)) {
        this.deps.sql.exec("UPDATE marches SET phase = 'outbound' WHERE id = ?", id);
        return { value: { ok: true, state: r.state }, events: [...events, MAP_CHANGED] };
      }
      const again = await loadBase(this.deps.db, accountId);
      if (again === null) break;
      base = again;
    }
    this.deps.sql.exec("DELETE FROM marches WHERE id = ?", id);
    return { value: { ok: false, error: "conflict" }, events };
  }

  /** Drops deleted accounts' bases and marches from the map. */
  removeAccounts(ids: readonly string[]): MapOp<number> {
    let removed = 0;
    for (const id of ids) {
      removed += this.rows("DELETE FROM map_bases WHERE account_id = ? RETURNING account_id", id).length;
      this.deps.sql.exec("DELETE FROM marches WHERE account_id = ?", id);
    }
    return { value: removed, events: removed > 0 ? [MAP_CHANGED] : [] };
  }

  /** Game time of the next thing to resolve, or null if nothing is pending. */
  nextDueAt(): number | null {
    const r = this.rows<{ due: number | null }>(
      `SELECT MIN(due) AS due FROM (
         SELECT arrive_at AS due FROM marches WHERE phase = 'outbound'
         UNION ALL SELECT return_at FROM marches WHERE phase = 'returning'
         UNION ALL SELECT depart_at + ? FROM marches WHERE phase = 'pending'
         UNION ALL SELECT respawn_at FROM npcs WHERE respawn_at IS NOT NULL)`,
      PENDING_TIMEOUT_MS,
    )[0];
    return r?.due ?? null;
  }

  /** Where `accountId`'s base is, placing it on a free tile first if needed. */
  ensureBase(accountId: string, now: number): { at: MapPoint; created: boolean } {
    const found = this.rows<{ x: number; y: number }>("SELECT x, y FROM map_bases WHERE account_id = ?", accountId)[0];
    if (found !== undefined) return { at: { x: found.x, y: found.y }, created: false };
    const at = this.freeTile();
    this.deps.sql.exec("INSERT INTO map_bases (account_id, tag, x, y, created_at) VALUES (?, ?, ?, ?, ?)", accountId, this.newTag(), at.x, at.y, now);
    return { at, created: true };
  }

  /** A battle on arrival: written to the base and the report in D1 first, then the map moves on. */
  private async arrive(row: MarchRow, now: number): Promise<MapEvent[]> {
    const troops: Troops = (() => {
      const parsed: unknown = JSON.parse(row.troops);
      return isTroops(parsed) ? parsed : ZERO_TROOPS;
    })();
    const npc = this.rows<NpcRow>("SELECT id, level, x, y FROM npcs WHERE id = ? AND respawn_at IS NULL", row.npc_id)[0];
    const fought = npc === undefined ? { outcome: targetGone(troops), battle: null } : fightNpc(troops, npc.level, row.seed);
    const { outcome, battle } = fought;
    const def = npcLevel(row.npc_level);
    const report: BattleReport = {
      id: row.id,
      at: row.arrive_at,
      target: { kind: def?.kind ?? null, level: row.npc_level, x: row.to_x, y: row.to_y },
      result: outcome.result,
      sent: troops,
      survivors: outcome.survivors,
      wounded: outcome.wounded,
      lost: outcome.lost,
      defenders: battle === null || def === null ? ZERO_TROOPS : def.defenders,
      defendersKilled: battle?.defenderKilled ?? ZERO_TROOPS,
      rounds: battle?.rounds.length ?? 0,
      loot: outcome.loot,
      seed: battle === null ? null : row.seed,
    };
    const delivered = await this.deliverOutcome(row.account_id, row.id, outcome, report, now);
    // The battle is deterministic, so if we crash before this point a retry writes the same result.
    if (npc !== undefined && outcome.result === "victory") {
      this.deps.sql.exec("UPDATE npcs SET respawn_at = ? WHERE id = ?", row.arrive_at + NPC_RESPAWN_MS, npc.id);
    }
    this.deps.sql.exec("UPDATE marches SET phase = 'returning' WHERE id = ?", row.id);
    const events: MapEvent[] = [MAP_CHANGED];
    if (delivered) events.push({ type: "report", accountId: row.account_id, report }, { type: "base_changed", accountId: row.account_id });
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
      if (!settled.changed) {
        await insertReport(db, accountId, report).run();
        return true;
      }
      const [save] = (await db.batch([saveBaseStatement(db, accountId, settled.state, stored.version, now), insertReport(db, accountId, report)])) as {
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
    this.deps.sql.exec("DELETE FROM marches WHERE id = ?", row.id);
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

  /** A random tile away from mountains and at least PLACEMENT_SPACING from any base or NPC. */
  private freeTile(): MapPoint {
    const seed = Number(this.meta("terrain_seed"));
    const taken = [
      ...this.rows<MapPoint>("SELECT x, y FROM map_bases"),
      ...this.rows<MapPoint>("SELECT x, y FROM npcs"),
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

  private newTag(): string {
    let s = "";
    for (let i = 0; i < 4; i++) s += TAG_ALPHABET[Math.floor(this.deps.random() * TAG_ALPHABET.length)];
    return s;
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
