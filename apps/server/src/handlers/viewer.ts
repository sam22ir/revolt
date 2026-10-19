import type { Account } from "../db/accounts.ts";
import { findMembership, type Membership } from "../db/alliances.ts";
import type { MapViewer } from "../map/map-client.ts";
import type { Ctx } from "./context.ts";

/** Who an account is to the map: its handle and current alliance, read from D1. */
export const viewerOf = (account: Account, m: Membership | null): MapViewer => ({
  accountId: account.id,
  handle: account.handle,
  allianceId: m?.allianceId ?? null,
  allianceTag: m?.allianceTag ?? null,
});

export const viewerFor = async (ctx: Ctx, account: Account): Promise<{ viewer: MapViewer; membership: Membership | null }> => {
  const membership = await findMembership(ctx.env.DB, account.id);
  return { viewer: viewerOf(account, membership), membership };
};

/** Pushes that must not fail the request: the database is the truth, and the next request repairs the map. */
export const bestEffort = async (label: string, work: () => Promise<unknown>): Promise<void> => {
  try {
    await work();
  } catch (e) {
    console.error(`${label} failed`, e);
  }
};
