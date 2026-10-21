import { backgroundOfServer, playerPower, regionsLiberated, type BackgroundId, type BaseState } from "@revolt/rules";
import type { Account } from "../db/accounts.ts";
import { refreshSnapshot } from "../db/live.ts";
import type { Ctx } from "./context.ts";

export const backgroundOf = (account: Account): BackgroundId => backgroundOfServer(account.server);

/** Keeps the player's row on the power/regions/alliance boards current. Cheap: it writes only when a value changed. */
export const syncSnapshot = async (ctx: Ctx, account: Account, state: BaseState): Promise<void> => {
  try {
    await refreshSnapshot(ctx.env.DB, account.id, account.server, playerPower(state), regionsLiberated(state), ctx.now);
  } catch (e) {
    // The boards are secondary: a failed refresh must not fail the player's own request.
    ctx.deps.crash.capture(e, { where: "snapshot" });
  }
};
