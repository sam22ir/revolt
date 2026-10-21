import {
  activeEvents,
  advance,
  claimableWindows,
  isLeaderboardId,
  LEADERBOARD_PAGE,
  parseEventKey,
  eventsFor,
  type LeaderboardEntryView,
  type LeaderboardId,
  type LeaderboardResponse,
} from "@revolt/rules";
import { findMembership } from "../db/alliances.ts";
import { loadBase } from "../db/bases.ts";

import { allianceBoard, eventBoard, placeOnBoard, powerBoard, topOfBoard, type BoardQuery } from "../db/live.ts";
import { HttpError, json } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";
import { backgroundOf, syncSnapshot } from "./live-support.ts";

/**
 * GET /v1/leaderboard?board=power|regions|alliance|event[&event=<key>] — the top 50 of the viewer's own server and the
 * viewer's place. Players are named by handle, alliances by name; account ids never leave the server. The viewer's own
 * row is refreshed first; other players' rows are as of their last visit or save.
 */
export const getLeaderboard = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const url = new URL(ctx.req.url);
  const board = url.searchParams.get("board") ?? "power";
  if (!isLeaderboardId(board)) throw new HttpError("bad_request");
  const stored = await loadBase(ctx.env.DB, account.id);
  if (stored !== null) await syncSnapshot(ctx, account, advance(stored.state, ctx.now));
  const bg = backgroundOf(account);
  let query: BoardQuery;
  let meId = account.id;
  let eventKey: string | null = null;
  switch (board satisfies LeaderboardId) {
    case "power":
      query = powerBoard(account.server, "power");
      break;
    case "regions":
      query = powerBoard(account.server, "regions");
      break;
    case "alliance": {
      query = allianceBoard(account.server);
      const m = await findMembership(ctx.env.DB, account.id);
      meId = m?.allianceId ?? "";
      break;
    }
    case "event": {
      const asked = url.searchParams.get("event");
      const parsed = asked === null ? null : parseEventKey(asked);
      if (asked !== null && (parsed === null || !eventsFor(bg).includes(parsed.id))) throw new HttpError("bad_request");
      const fallback = [...activeEvents(ctx.now, bg), ...claimableWindows(ctx.now, bg)][0];
      eventKey = asked ?? fallback?.key ?? null;
      query = eventBoard(account.server, eventKey ?? "none");
      break;
    }
  }
  const rows = await topOfBoard(ctx.env.DB, query, LEADERBOARD_PAGE);
  const entries: LeaderboardEntryView[] = rows.map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, mine: r.id === meId }));
  const place = meId === "" ? null : await placeOnBoard(ctx.env.DB, query, meId);
  const body: LeaderboardResponse = { board, event: eventKey, entries, me: { rank: place?.rank ?? null, score: place?.row.score ?? 0 }, now: ctx.now };
  return json(body);
};

