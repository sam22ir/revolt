import { HELP_REDUCTION_MS, MAX_HELPS_PER_REQUEST } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MANY_GUESTS, mine, player, post, team, type Player } from "./alliance-helpers.ts";
import { body, HOUR, startServer, T0, type Json, type Server } from "./harness.ts";
import { getState, intent } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer(MANY_GUESTS);
});
afterEach(() => server.dispose());

const BATCH = 20;
/** Long enough that every allowed help fits before the job ends. */
const TRAIN_MS = HOUR;

/**
 * Gives `p` a rich base and a running training batch of `TRAIN_MS` (or an upgrade queue), written straight to
 * the base row: the real batch is capped at a few minutes, too short to try the help cap.
 */
const train = async (p: Player, kind: "training" | "upgrade" = "training", ms = TRAIN_MS): Promise<number> => {
  const row = await server.env.DB.prepare("SELECT state FROM bases WHERE account_id = ?").bind(p.id).first<{ state: string }>();
  const state = JSON.parse(row?.state ?? "{}") as Json;
  state.resources = { food: 9000, materiel: 9000, funds: 9000, support: 0 };
  const endsAt = T0 + ms;
  if (kind === "training") state.training = { troop: "infantry", count: BATCH, startedAt: T0, endsAt };
  else state.queue = { building: "hq", toLevel: 2, startedAt: T0, endsAt };
  await server.env.DB.prepare("UPDATE bases SET state = ?, version = version + 1 WHERE account_id = ?").bind(JSON.stringify(state), p.id).run();
  return endsAt;
};

const request = (p: Player, kind: unknown = "training"): Promise<Json> => post(server, p, "/v1/help/request", { kind });
const give = (p: Player, requestId: string): Promise<Json> => post(server, p, "/v1/help/give", { requestId });
/** `batch_assert` only ever receives a row to make a batch fail, so it must stay empty. */
const assertRows = async (): Promise<number> => (await server.env.DB.prepare("SELECT COUNT(*) AS n FROM batch_assert").first<{ n: number }>())?.n ?? -1;
const endsAt = async (p: Player): Promise<number> => (await getState(server, p.token)).training.endsAt;

describe("asking for help", () => {
  test("needs an alliance and a running job of that kind", async () => {
    const solo = await player(server);
    await train(solo);
    expect(await request(solo)).toMatchObject({ ok: false, reason: "not_member" });
    const t = await team(server, 1);
    expect(await request(t.leader)).toMatchObject({ ok: false, reason: "no_job" });
    expect(await request(t.leader, "upgrade")).toMatchObject({ ok: false, reason: "no_job" });
    await train(t.leader);
    expect(await request(t.leader, "upgrade")).toMatchObject({ ok: false, reason: "no_job" });
    for (const bad of ["build", 5, null, undefined]) expect((await server.request("POST", "/v1/help/request", { token: t.leader.token, body: { kind: bad } })).status).toBe(400);
  });

  test("a request for a running training is listed for the alliance, once per job", async () => {
    const t = await team(server, 2);
    const end = await train(t.leader);
    const r = await request(t.leader);
    expect(r).toMatchObject({ ok: true, request: { handle: t.leader.handle, kind: "training", endsAt: end, helps: 0, maxHelps: MAX_HELPS_PER_REQUEST, mine: true, helped: false } });
    expect(await request(t.leader)).toMatchObject({ ok: false, reason: "already_requested" });
    const seenByMember = (await mine(server, t.members[0]!)).help;
    expect(seenByMember).toEqual([{ ...r.request, mine: false }]);
    expect(server.room(t.allianceId).notices).toContain("help_changed");
  });

  test("a finished job cannot be asked for, and a request stops being listed when its job ends", async () => {
    const t = await team(server, 2);
    const end = await train(t.leader);
    server.now = end;
    expect(await request(t.leader)).toMatchObject({ ok: false, reason: "no_job" });
    server.now = T0;
    const r = await request(t.leader);
    expect((await mine(server, t.members[0]!)).help).toHaveLength(1);
    server.now = end;
    expect((await mine(server, t.members[0]!)).help).toEqual([]);
    expect(await give(t.members[0]!, r.request.id)).toMatchObject({ ok: false, reason: "request_gone" });
  });
});

describe("giving help", () => {
  test("each help ends the job a minute sooner and is counted", async () => {
    const t = await team(server, 3);
    const [a, b] = t.members as [Player, Player];
    const end = await train(t.leader);
    const { request: req } = await request(t.leader);
    const r1 = await give(a, req.id);
    expect(r1).toMatchObject({ ok: true, request: { helps: 1, helped: true, mine: false, endsAt: end - HELP_REDUCTION_MS } });
    expect(await endsAt(t.leader)).toBe(end - HELP_REDUCTION_MS);
    expect((await give(b, req.id)).request.helps).toBe(2);
    expect(await endsAt(t.leader)).toBe(end - 2 * HELP_REDUCTION_MS);
    expect((await mine(server, a)).help[0]).toMatchObject({ helps: 2, helped: true, endsAt: end - 2 * HELP_REDUCTION_MS });
    expect((await mine(server, t.leader)).help[0]).toMatchObject({ mine: true, helped: false });
    // The shortened job really completes sooner.
    server.now = end - 2 * HELP_REDUCTION_MS;
    expect((await getState(server, t.leader.token)).troops.infantry).toBe(10 + BATCH);
  });

  test("never past now: help on a nearly finished job ends it now, not in the past", async () => {
    const t = await team(server, 2);
    const end = await train(t.leader);
    const { request: req } = await request(t.leader);
    server.now = end - 20_000;
    expect(await give(t.members[0]!, req.id)).toMatchObject({ ok: true, request: { endsAt: server.now } });
    const s = await getState(server, t.leader.token);
    expect(s.training).toBeNull();
    expect(s.troops.infantry).toBe(10 + BATCH);
  });

  test("not your own request, not twice, not beyond the cap", async () => {
    const t = await team(server, MAX_HELPS_PER_REQUEST + 3);
    const { request: req } = await (async () => {
      await train(t.leader);
      return request(t.leader);
    })();
    expect(await give(t.leader, req.id)).toMatchObject({ ok: false, reason: "own_request" });
    const helpers = t.members;
    expect((await give(helpers[0]!, req.id)).ok).toBe(true);
    expect(await give(helpers[0]!, req.id)).toMatchObject({ ok: false, reason: "already_helped" });
    for (let i = 1; i < MAX_HELPS_PER_REQUEST; i++) expect((await give(helpers[i]!, req.id)).ok, `helper ${i}`).toBe(true);
    expect(await give(helpers[MAX_HELPS_PER_REQUEST]!, req.id)).toMatchObject({ ok: false, reason: "help_full" });
    const row = await server.env.DB.prepare("SELECT helps FROM help_requests WHERE id = ?").bind(req.id).first<{ helps: number }>();
    expect(row?.helps).toBe(MAX_HELPS_PER_REQUEST);
  });

  test("strangers, other alliances and unknown ids are refused and change nothing", async () => {
    const t = await team(server, 2);
    const other = await team(server, 2, "Other", "OT");
    const end = await train(t.leader);
    const { request: req } = await request(t.leader);
    const loner = await player(server);
    expect(await give(loner, req.id)).toMatchObject({ ok: false, reason: "not_member" });
    expect(await give(other.members[0]!, req.id)).toMatchObject({ ok: false, reason: "request_gone" });
    expect(await give(t.members[0]!, "no-such-request")).toMatchObject({ ok: false, reason: "request_gone" });
    for (const bad of [5, "", "x".repeat(70), null, undefined]) {
      expect((await server.request("POST", "/v1/help/give", { token: t.members[0]!.token, body: { requestId: bad } })).status).toBe(400);
    }
    expect(await endsAt(t.leader)).toBe(end);
  });

  test("a request whose job was replaced or whose owner left is gone", async () => {
    const t = await team(server, 3);
    const [a, b] = t.members as [Player, Player];
    await train(t.leader);
    const { request: req } = await request(t.leader);
    // The owner leaves the alliance: nobody can help what is no longer the alliance's.
    await post(server, b, "/v1/alliance/leave");
    await post(server, t.leader, "/v1/alliance/transfer", { handle: a.handle });
    await post(server, t.leader, "/v1/alliance/leave");
    expect(await give(a, req.id)).toMatchObject({ ok: false, reason: "request_gone" });
    const rows = await server.env.DB.prepare("SELECT COUNT(*) AS n FROM help_requests WHERE account_id = ?").bind(t.leader.id).first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  test("works on upgrades too", async () => {
    const t = await team(server, 2);
    const end = await train(t.leader, "upgrade");
    const { request: req } = await request(t.leader, "upgrade");
    expect(await give(t.members[0]!, req.id)).toMatchObject({ ok: true, request: { kind: "upgrade", endsAt: end - HELP_REDUCTION_MS } });
    expect((await getState(server, t.leader.token)).queue.endsAt).toBe(end - HELP_REDUCTION_MS);
  });
});

describe("races", () => {
  test("two helpers racing for the last help: exactly one is applied", async () => {
    const t = await team(server, MAX_HELPS_PER_REQUEST + 3);
    const end = await train(t.leader);
    const { request: req } = await request(t.leader);
    for (let i = 0; i < MAX_HELPS_PER_REQUEST - 1; i++) await give(t.members[i]!, req.id);
    const racers = [t.members[MAX_HELPS_PER_REQUEST - 1]!, t.members[MAX_HELPS_PER_REQUEST]!, t.members[MAX_HELPS_PER_REQUEST + 1]!];
    const rs = await Promise.all(racers.map((p) => give(p, req.id)));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok).every((r) => r.reason === "help_full")).toBe(true);
    const row = await server.env.DB.prepare("SELECT helps FROM help_requests WHERE id = ?").bind(req.id).first<{ helps: number }>();
    expect(row?.helps).toBe(MAX_HELPS_PER_REQUEST);
    const given = await server.env.DB.prepare("SELECT COUNT(*) AS n FROM help_given WHERE request_id = ?").bind(req.id).first<{ n: number }>();
    expect(given?.n).toBe(MAX_HELPS_PER_REQUEST);
    expect(await endsAt(t.leader)).toBe(end - MAX_HELPS_PER_REQUEST * HELP_REDUCTION_MS);
    expect(await assertRows()).toBe(0);
  });

  test("the same helper twice at once: one help, one 'already helped', nothing recorded without effect", async () => {
    const t = await team(server, 2);
    const end = await train(t.leader);
    const { request: req } = await request(t.leader);
    const rs = await Promise.all([give(t.members[0]!, req.id), give(t.members[0]!, req.id)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)?.reason).toBe("already_helped");
    expect(await endsAt(t.leader)).toBe(end - HELP_REDUCTION_MS);
    const given = await server.env.DB.prepare("SELECT COUNT(*) AS n FROM help_given WHERE request_id = ?").bind(req.id).first<{ n: number }>();
    expect(given?.n).toBe(1);
  });

  test("a help racing the requester's own action never loses either: the base changes are both kept", async () => {
    const t = await team(server, 2);
    await train(t.leader);
    const { request: req } = await request(t.leader);
    const [h, up] = await Promise.all([give(t.members[0]!, req.id), body(await intent(server, t.leader.token, { type: "upgrade", building: "hq" }))]);
    expect(h.ok).toBe(true);
    expect(up.ok).toBe(true);
    const s = await getState(server, t.leader.token);
    expect(s.queue).not.toBeNull();
    expect(s.training.endsAt).toBeLessThan(T0 + TRAIN_MS);
    expect(s.training.endsAt).toBeGreaterThanOrEqual(T0 + TRAIN_MS - HELP_REDUCTION_MS);
  });

  test("the database never records a help without its effect, whatever the interleaving", async () => {
    const t = await team(server, 5);
    await train(t.leader);
    const { request: req } = await request(t.leader);
    await Promise.all(t.members.map((p) => give(p, req.id)));
    const row = await server.env.DB.prepare("SELECT helps FROM help_requests WHERE id = ?").bind(req.id).first<{ helps: number }>();
    const given = await server.env.DB.prepare("SELECT COUNT(*) AS n FROM help_given WHERE request_id = ?").bind(req.id).first<{ n: number }>();
    expect(given?.n).toBe(row?.helps);
    expect(await endsAt(t.leader)).toBe(T0 + TRAIN_MS - (row?.helps ?? 0) * HELP_REDUCTION_MS);
    expect(await assertRows()).toBe(0);
  });
});

