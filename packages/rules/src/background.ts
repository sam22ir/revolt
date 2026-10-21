/**
 * Backgrounds (GDD §2.2): the revolution a player takes part in. The choice is made once, when the account is
 * created, and fixes the map server for good, so players of different backgrounds never share a map, an alliance
 * list or a handle namespace. The mechanical ids (buildings, troops, NPC kinds) are shared; names, art, heroes and
 * story are looked up per background.
 */
export const BACKGROUND_IDS = ["algeria", "vietnam"] as const;
export type BackgroundId = (typeof BACKGROUND_IDS)[number];

/** The fallback for old clients, saves and tests that name no background. */
export const DEFAULT_BACKGROUND: BackgroundId = "algeria";

export const isBackgroundId = (v: unknown): v is BackgroundId => BACKGROUND_IDS.some((id) => id === v);

/** The first map server of each background. Another server of the same background would be `<background>-2`. */
export const BACKGROUND_SERVER: Readonly<Record<BackgroundId, string>> = {
  algeria: "algeria-1",
  vietnam: "vietnam-1",
};

/** The server a new account of this background is created on. */
export const serverFor = (background: BackgroundId): string => BACKGROUND_SERVER[background];

const SERVER_NAME = /^([a-z]+)-[1-9][0-9]*$/;

/** The background a server belongs to (`<background>-<n>`); throws on a server name no background owns. */
export const backgroundOfServer = (server: string): BackgroundId => {
  const prefix = SERVER_NAME.exec(server)?.[1];
  if (isBackgroundId(prefix)) return prefix;
  throw new Error(`unknown server: ${server}`);
};
