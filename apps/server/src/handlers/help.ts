import { advance, HELP_REDUCTION_MS, helpableJob, isHelpKind, MAX_HELPS_PER_REQUEST, reduceJob, type AllianceBlockReason, type HelpRequestView } from "@revolt/rules";
import { findAccountById } from "../db/accounts.ts";
import { findMembership } from "../db/alliances.ts";
import { loadBase } from "../db/bases.ts";
import { isUniqueViolation } from "../db/db.ts";
import { findRequest } from "../db/help.ts";
import { HttpError, json, readJson } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";
import { bestEffort } from "./viewer.ts";

const refuse = (ctx: Ctx, reason: AllianceBlockReason): Response => json({ ok: false, reason, now: ctx.now });

const ATTEMPTS = 3;

/** A failed CHECK on `batch_assert` is how a batch says "a condition I rely on changed": nothing was written. */
const isAssertFailure = (e: unknown): boolean => e instanceof Error && /CHECK constraint failed/i.test(e.message);

const notifyHelp = (ctx: Ctx, allianceId: string): Promise<void> =>
  bestEffort("room notify", () => ctx.deps.room(ctx.env, allianceId).notify("help_changed"));

/** POST /v1/help/request `{ kind }` — asks the alliance to speed up the player's running upgrade or training. */
export const postHelpRequest = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const { kind } = await readJson(ctx.req);
  if (!isHelpKind(kind)) throw new HttpError("bad_request");
  const m = await findMembership(ctx.env.DB, account.id);
  if (m === null) return refuse(ctx, "not_member");
  const stored = await loadBase(ctx.env.DB, account.id);
  if (stored === null) throw new HttpError("not_found");
  const job = helpableJob(advance(stored.state, ctx.now), kind, ctx.now);
  if (job === null) return refuse(ctx, "no_job");
  const id = crypto.randomUUID();
  try {
    await ctx.env.DB
      .prepare("INSERT INTO help_requests (id, account_id, kind, job_started_at, ends_at, created_at, helps) VALUES (?, ?, ?, ?, ?, ?, 0)")
      .bind(id, account.id, kind, job.startedAt, job.endsAt, ctx.now)
      .run();
  } catch (e) {
    if (isUniqueViolation(e)) return refuse(ctx, "already_requested");
    throw e;
  }
  await notifyHelp(ctx, m.allianceId);
  const request: HelpRequestView = { id, handle: account.handle, kind, endsAt: job.endsAt, helps: 0, maxHelps: MAX_HELPS_PER_REQUEST, mine: true, helped: false };
  return json({ ok: true, request, now: ctx.now });
};

/**
 * POST /v1/help/give `{ requestId }` — shortens a member's running job by HELP_REDUCTION_MS, once per helper.
 * The helper's record, the request's count and the requester's base change in one D1 batch. An UPDATE that matches no
 * row does not abort a batch, so a final assertion rolls everything back unless BOTH updates were this batch's own
 * (not merely values another concurrent batch happened to produce). On such a conflict the request is read again.
 */
export const postHelpGive = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const requestId = (await readJson(ctx.req)).requestId;
  if (typeof requestId !== "string" || requestId.length === 0 || requestId.length > 64) throw new HttpError("bad_request");
  const db = ctx.env.DB;
  const m = await findMembership(db, account.id);
  if (m === null) return refuse(ctx, "not_member");

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const req = await findRequest(db, requestId);
    // Another alliance's request, or one whose owner left, is "gone" to this player.
    if (req === null || req.allianceId !== m.allianceId || req.endsAt <= ctx.now) return refuse(ctx, "request_gone");
    if (req.accountId === account.id) return refuse(ctx, "own_request");
    if (req.helps >= MAX_HELPS_PER_REQUEST) return refuse(ctx, "help_full");
    const base = await loadBase(db, req.accountId);
    if (base === null) return refuse(ctx, "request_gone");
    const advanced = advance(base.state, ctx.now);
    const job = helpableJob(advanced, req.kind, ctx.now);
    // The job the request was made for must still be the running one.
    if (job === null || job.startedAt !== req.jobStartedAt) return refuse(ctx, "request_gone");
    const reduced = reduceJob(advanced, req.kind, HELP_REDUCTION_MS, ctx.now);
    if (!reduced.changed) return refuse(ctx, "request_gone");
    const endsAt = (req.kind === "upgrade" ? reduced.state.queue : reduced.state.training)?.endsAt ?? req.endsAt;
    try {
      await db.batch([
        // A second help from the same player violates the primary key, which aborts the batch.
        db.prepare("INSERT INTO help_given (request_id, helper_id) VALUES (?, ?)").bind(req.id, account.id),
        // Wins only if nobody else helped since we read `helps`; marks the request as ours.
        db
          .prepare("UPDATE help_requests SET helps = helps + 1, ends_at = ?, last_helper = ? WHERE id = ? AND helps = ?")
          .bind(endsAt, account.id, req.id, req.helps),
        // Applies only if the request update above was ours, and only to the version of the base we read.
        db
          .prepare(
            `UPDATE bases SET state = ?, version = version + 1, updated_at = ?
             WHERE account_id = ? AND version = ? AND (SELECT last_helper FROM help_requests WHERE id = ?) = ?`,
          )
          .bind(JSON.stringify(reduced.state), ctx.now, req.accountId, base.version, req.id, account.id),
        // All or nothing: `changes()` is the base update just above, and the marker proves the request update was ours.
        db
          .prepare(
            `INSERT INTO batch_assert (ok) SELECT CASE WHEN changes() = 1
               AND (SELECT last_helper FROM help_requests WHERE id = ?) = ? THEN 1 ELSE 0 END`,
          )
          .bind(req.id, account.id),
      ]);
    } catch (e) {
      if (isUniqueViolation(e)) return refuse(ctx, "already_helped");
      if (isAssertFailure(e)) continue;
      throw e;
    }
    await notifyHelp(ctx, m.allianceId);
    const owner = await findAccountById(db, req.accountId);
    const request: HelpRequestView = {
      id: req.id,
      handle: owner?.handle ?? "",
      kind: req.kind,
      endsAt,
      helps: req.helps + 1,
      maxHelps: MAX_HELPS_PER_REQUEST,
      mine: false,
      helped: true,
    };
    return json({ ok: true, request, now: ctx.now });
  }
  throw new HttpError("conflict");
};
