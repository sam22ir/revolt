import { eventWindow, totalTroops, type BattleReport, type EventId } from "@revolt/rules";
import { body, DAY, newGuest, type Json, type Server } from "./harness.ts";
import { editBase, getMap, intent, march, nearestNpc } from "./map-helpers.ts";

/** A moment well inside window `index` of an event, so a few minutes of play never cross its edges. */
export const inWindow = (id: EventId, index: number): number => eventWindow(id, index).startsAt + DAY;

export const get = async (server: Server, token: string, path: string): Promise<Json> => body(await server.request("GET", path, { token }));
export const post = async (server: Server, token: string, path: string, b?: unknown): Promise<Json> =>
  body(await server.request("POST", path, { token, body: b ?? {} }));

export interface Fighter {
  readonly token: string;
  readonly id: string;
  readonly handle: string;
  readonly server: string;
}

/** A guest with plenty of troops at home, so several marches can be sent. */
export const fighter = async (server: Server, background?: "algeria" | "vietnam"): Promise<Fighter> => {
  const res = await body(await server.request("POST", "/v1/guest", { body: background === undefined ? {} : { background } }));
  const f: Fighter = { token: res.token, id: res.account.id, handle: res.account.handle, server: background === "vietnam" ? "vietnam-1" : "algeria-1" };
  await editBase(server, f.id, (s) => {
    s.troops.infantry = 400;
  });
  return f;
};

/** Sends 40 infantry at the `k`-th nearest level-1 NPC, lets it arrive, and returns the report. */
export const winBattle = async (server: Server, f: Fighter, k = 0): Promise<{ report: BattleReport; march: Json }> => {
  const snap = await getMap(server, f.token);
  const mine = snap.bases.find((b) => b.mine)!;
  const npc = snap.npcs
    .filter((n) => n.level === 1)
    .sort((a, b) => Math.max(Math.abs(a.x - mine.x), Math.abs(a.y - mine.y)) - Math.max(Math.abs(b.x - mine.x), Math.abs(b.y - mine.y)))[k];
  if (npc === undefined) throw new Error("no npc");
  const r = await march(server, f.token, npc.id, { infantry: 40 });
  if (!r.ok) throw new Error(`march: ${r.reason}`);
  const m = r.state.marches.at(-1);
  server.now = m.arriveAt;
  await server.fireAlarm(f.server);
  const reports = (await get(server, f.token, "/v1/reports")).reports as BattleReport[];
  const report = reports.find((x) => x.id === m.id);
  if (report === undefined) throw new Error("no report");
  return { report, march: m };
};

export const lostOf = (r: BattleReport): number => totalTroops(r.lost);

/** Writes award rows directly, to arrange a score without fighting. */
export const seedAward = async (server: Server, accountId: string, key: string, points: number, opts: { server?: string; at?: number; march?: string } = {}): Promise<void> => {
  await server.env.DB
    .prepare("INSERT INTO live_awards (march_id, key, account_id, server, points, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(opts.march ?? `seed-${Math.random()}`, key, accountId, opts.server ?? "algeria-1", points, opts.at ?? server.now)
    .run();
};

export const sql = async <T>(server: Server, q: string, ...binds: unknown[]): Promise<T[]> => (await server.env.DB.prepare(q).bind(...binds).all<T>()).results;

export const redeem = (server: Server, token: string, sku: string, txn: string): Promise<Json> =>
  post(server, token, "/v1/store/redeem", { sku, provider: "local", receipt: `local-test:${txn}` });

export { intent, nearestNpc, newGuest };
