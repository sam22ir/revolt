import { HELP_REDUCTION_MS, MAX_HELPS_PER_REQUEST } from "@revolt/rules";
import { test } from "vitest";
import { MANY_GUESTS, mine, player, post, team, type Player } from "./alliance-helpers.ts";
import { body, HOUR, T0, type Json, type Server } from "./harness.ts";
import { getState, intent } from "./map-helpers.ts";
import { LONG, rows } from "./rows.ts";

const BATCH = 20;
/** Long enough that every allowed help fits before the job ends. */
const TRAIN_MS = HOUR;

/**
 * Gives `p` a rich base and a running training batch of `TRAIN_MS` (or an upgrade queue), written straight to
 * the base row: the real batch is capped at a few minutes, too short to try the help cap.
 */
const train = async (s: Server, p: Player, kind: "training" | "upgrade" = "training", ms = TRAIN_MS): Promise<number> => {
  const row = await s.env.DB.prepare("SELECT state FROM bases WHERE account_id = ?").bind(p.id).first<{ state: string }>();
  const state = JSON.parse(row?.state ?? "{}") as Json;
  state.resources = { food: 9000, materiel: 9000, funds: 9000, support: 0 };
  const endsAt = T0 + ms;
  if (kind === "training") state.training = { troop: "infantry", count: BATCH, startedAt: T0, endsAt };
  else state.queue = { building: "hq", toLevel: 2, startedAt: T0, endsAt };
  await s.env.DB.prepare("UPDATE bases SET state = ?, version = version + 1 WHERE account_id = ?").bind(JSON.stringify(state), p.id).run();
  return endsAt;
};

const request = (s: Server, p: Player, kind: unknown = "training"): Promise<Json> => post(s, p, "/v1/help/request", { kind });
const give = (s: Server, p: Player, requestId: string): Promise<Json> => post(s, p, "/v1/help/give", { requestId });
/** `batch_assert` only ever receives a row to make a batch fail, so it must stay empty. */
const assertRows = async (s: Server): Promise<number> => (await s.env.DB.prepare("SELECT COUNT(*) AS n FROM batch_assert").first<{ n: number }>())?.n ?? -1;
const endsAt = async (s: Server, p: Player): Promise<number> => (await getState(s, p.token)).training.endsAt;
const num = async (s: Server, sql: string, id: string): Promise<number | undefined> => (await s.env.DB.prepare(sql).bind(id).first<{ n: number }>())?.n;

test("asking for help: membership, job, listing, expiry", async () => {
  await rows(MANY_GUESTS, {
    "needs an alliance and a running job of that kind": async (s, ex) => {
      const solo = await player(s);
      await train(s, solo);
      ex(await request(s, solo), "no alliance").toMatchObject({ ok: false, reason: "not_member" });
      const t = await team(s, 1);
      ex(await request(s, t.leader), "no job").toMatchObject({ ok: false, reason: "no_job" });
      ex(await request(s, t.leader, "upgrade"), "no upgrade").toMatchObject({ ok: false, reason: "no_job" });
      await train(s, t.leader);
      ex(await request(s, t.leader, "upgrade"), "training only").toMatchObject({ ok: false, reason: "no_job" });
      for (const bad of ["build", 5, null, undefined]) ex((await s.request("POST", "/v1/help/request", { token: t.leader.token, body: { kind: bad } })).status, `kind ${String(bad)}`).toBe(400);
    },
    "a request for a running training is listed for the alliance, once per job": async (s, ex) => {
      const t = await team(s, 2);
      const end = await train(s, t.leader);
      const r = await request(s, t.leader);
      ex(r).toMatchObject({ ok: true, request: { handle: t.leader.handle, kind: "training", endsAt: end, helps: 0, maxHelps: MAX_HELPS_PER_REQUEST, mine: true, helped: false } });
      ex(await request(s, t.leader), "second request").toMatchObject({ ok: false, reason: "already_requested" });
      const seenByMember = (await mine(s, t.members[0]!)).help;
      ex(seenByMember).toEqual([{ ...r.request, mine: false }]);
      ex(s.room(t.allianceId).notices).toContain("help_changed");
    },
    "a finished job cannot be asked for, and a request stops being listed when its job ends": async (s, ex) => {
      const t = await team(s, 2);
      const end = await train(s, t.leader);
      s.now = end;
      ex(await request(s, t.leader), "finished job").toMatchObject({ ok: false, reason: "no_job" });
      s.now = T0;
      const r = await request(s, t.leader);
      ex((await mine(s, t.members[0]!)).help, "listed while running").toHaveLength(1);
      s.now = end;
      ex((await mine(s, t.members[0]!)).help, "gone when it ends").toEqual([]);
      ex(await give(s, t.members[0]!, r.request.id), "help after the end").toMatchObject({ ok: false, reason: "request_gone" });
    },
  });
}, LONG);

test("giving help: effect, limits, permissions, vanished requests, upgrades", async () => {
  await rows(MANY_GUESTS, {
    "each help ends the job a minute sooner and is counted": async (s, ex) => {
      const t = await team(s, 3);
      const [a, b] = t.members as [Player, Player];
      const end = await train(s, t.leader);
      const { request: req } = await request(s, t.leader);
      const r1 = await give(s, a, req.id);
      ex(r1).toMatchObject({ ok: true, request: { helps: 1, helped: true, mine: false, endsAt: end - HELP_REDUCTION_MS } });
      ex(await endsAt(s, t.leader)).toBe(end - HELP_REDUCTION_MS);
      ex((await give(s, b, req.id)).request.helps).toBe(2);
      ex(await endsAt(s, t.leader)).toBe(end - 2 * HELP_REDUCTION_MS);
      ex((await mine(s, a)).help[0]).toMatchObject({ helps: 2, helped: true, endsAt: end - 2 * HELP_REDUCTION_MS });
      ex((await mine(s, t.leader)).help[0]).toMatchObject({ mine: true, helped: false });
      // The shortened job really completes sooner.
      s.now = end - 2 * HELP_REDUCTION_MS;
      ex((await getState(s, t.leader.token)).troops.infantry).toBe(10 + BATCH);
    },
    "never past now: help on a nearly finished job ends it now, not in the past": async (s, ex) => {
      const t = await team(s, 2);
      const end = await train(s, t.leader);
      const { request: req } = await request(s, t.leader);
      s.now = end - 20_000;
      ex(await give(s, t.members[0]!, req.id)).toMatchObject({ ok: true, request: { endsAt: s.now } });
      const st = await getState(s, t.leader.token);
      ex(st.training).toBeNull();
      ex(st.troops.infantry).toBe(10 + BATCH);
    },
    "not your own request, not twice, not beyond the cap": async (s, ex) => {
      const t = await team(s, MAX_HELPS_PER_REQUEST + 3);
      await train(s, t.leader);
      const { request: req } = await request(s, t.leader);
      ex(await give(s, t.leader, req.id), "own request").toMatchObject({ ok: false, reason: "own_request" });
      const helpers = t.members;
      ex((await give(s, helpers[0]!, req.id)).ok).toBe(true);
      ex(await give(s, helpers[0]!, req.id), "twice").toMatchObject({ ok: false, reason: "already_helped" });
      for (let i = 1; i < MAX_HELPS_PER_REQUEST; i++) ex((await give(s, helpers[i]!, req.id)).ok, `helper ${i}`).toBe(true);
      ex(await give(s, helpers[MAX_HELPS_PER_REQUEST]!, req.id), "beyond the cap").toMatchObject({ ok: false, reason: "help_full" });
      ex(await num(s, "SELECT helps AS n FROM help_requests WHERE id = ?", req.id)).toBe(MAX_HELPS_PER_REQUEST);
    },
    "strangers, other alliances and unknown ids are refused and change nothing": async (s, ex) => {
      const t = await team(s, 2);
      const other = await team(s, 2, "Other", "OT");
      const end = await train(s, t.leader);
      const { request: req } = await request(s, t.leader);
      const loner = await player(s);
      ex(await give(s, loner, req.id), "stranger").toMatchObject({ ok: false, reason: "not_member" });
      ex(await give(s, other.members[0]!, req.id), "other alliance").toMatchObject({ ok: false, reason: "request_gone" });
      ex(await give(s, t.members[0]!, "no-such-request"), "unknown id").toMatchObject({ ok: false, reason: "request_gone" });
      for (const bad of [5, "", "x".repeat(70), null, undefined]) {
        ex((await s.request("POST", "/v1/help/give", { token: t.members[0]!.token, body: { requestId: bad } })).status, `requestId ${String(bad)}`).toBe(400);
      }
      ex(await endsAt(s, t.leader)).toBe(end);
    },
    "a request whose job was replaced or whose owner left is gone": async (s, ex) => {
      const t = await team(s, 3);
      const [a, b] = t.members as [Player, Player];
      await train(s, t.leader);
      const { request: req } = await request(s, t.leader);
      // The owner leaves the alliance: nobody can help what is no longer the alliance's.
      await post(s, b, "/v1/alliance/leave");
      await post(s, t.leader, "/v1/alliance/transfer", { handle: a.handle });
      await post(s, t.leader, "/v1/alliance/leave");
      ex(await give(s, a, req.id)).toMatchObject({ ok: false, reason: "request_gone" });
      ex(await num(s, "SELECT COUNT(*) AS n FROM help_requests WHERE account_id = ?", t.leader.id)).toBe(0);
    },
    "works on upgrades too": async (s, ex) => {
      const t = await team(s, 2);
      const end = await train(s, t.leader, "upgrade");
      const { request: req } = await request(s, t.leader, "upgrade");
      ex(await give(s, t.members[0]!, req.id)).toMatchObject({ ok: true, request: { kind: "upgrade", endsAt: end - HELP_REDUCTION_MS } });
      ex((await getState(s, t.leader.token)).queue.endsAt).toBe(end - HELP_REDUCTION_MS);
    },
  });
}, LONG);

test("help races: last help, same helper, requester's own action, no help without effect", async () => {
  await rows(MANY_GUESTS, {
    "two helpers racing for the last help: exactly one is applied": async (s, ex) => {
      const t = await team(s, MAX_HELPS_PER_REQUEST + 3);
      const end = await train(s, t.leader);
      const { request: req } = await request(s, t.leader);
      for (let i = 0; i < MAX_HELPS_PER_REQUEST - 1; i++) await give(s, t.members[i]!, req.id);
      const racers = [t.members[MAX_HELPS_PER_REQUEST - 1]!, t.members[MAX_HELPS_PER_REQUEST]!, t.members[MAX_HELPS_PER_REQUEST + 1]!];
      const rs = await Promise.all(racers.map((p) => give(s, p, req.id)));
      ex(rs.filter((r) => r.ok)).toHaveLength(1);
      ex(rs.filter((r) => !r.ok).every((r) => r.reason === "help_full")).toBe(true);
      ex(await num(s, "SELECT helps AS n FROM help_requests WHERE id = ?", req.id)).toBe(MAX_HELPS_PER_REQUEST);
      ex(await num(s, "SELECT COUNT(*) AS n FROM help_given WHERE request_id = ?", req.id)).toBe(MAX_HELPS_PER_REQUEST);
      ex(await endsAt(s, t.leader)).toBe(end - MAX_HELPS_PER_REQUEST * HELP_REDUCTION_MS);
      ex(await assertRows(s)).toBe(0);
    },
    "the same helper twice at once: one help, one 'already helped', nothing recorded without effect": async (s, ex) => {
      const t = await team(s, 2);
      const end = await train(s, t.leader);
      const { request: req } = await request(s, t.leader);
      const rs = await Promise.all([give(s, t.members[0]!, req.id), give(s, t.members[0]!, req.id)]);
      ex(rs.filter((r) => r.ok)).toHaveLength(1);
      ex(rs.find((r) => !r.ok)?.reason).toBe("already_helped");
      ex(await endsAt(s, t.leader)).toBe(end - HELP_REDUCTION_MS);
      ex(await num(s, "SELECT COUNT(*) AS n FROM help_given WHERE request_id = ?", req.id)).toBe(1);
    },
    "a help racing the requester's own action never loses either: the base changes are both kept": async (s, ex) => {
      const t = await team(s, 2);
      await train(s, t.leader);
      const { request: req } = await request(s, t.leader);
      const [h, up] = await Promise.all([give(s, t.members[0]!, req.id), body(await intent(s, t.leader.token, { type: "upgrade", building: "hq" }))]);
      ex(h.ok).toBe(true);
      ex(up.ok).toBe(true);
      const st = await getState(s, t.leader.token);
      ex(st.queue).not.toBeNull();
      ex(st.training.endsAt).toBeLessThan(T0 + TRAIN_MS);
      ex(st.training.endsAt).toBeGreaterThanOrEqual(T0 + TRAIN_MS - HELP_REDUCTION_MS);
    },
    "the database never records a help without its effect, whatever the interleaving": async (s, ex) => {
      const t = await team(s, 5);
      await train(s, t.leader);
      const { request: req } = await request(s, t.leader);
      await Promise.all(t.members.map((p) => give(s, p, req.id)));
      const helps = await num(s, "SELECT helps AS n FROM help_requests WHERE id = ?", req.id);
      ex(await num(s, "SELECT COUNT(*) AS n FROM help_given WHERE request_id = ?", req.id)).toBe(helps);
      ex(await endsAt(s, t.leader)).toBe(T0 + TRAIN_MS - (helps ?? 0) * HELP_REDUCTION_MS);
      ex(await assertRows(s)).toBe(0);
    },
  });
}, LONG);
