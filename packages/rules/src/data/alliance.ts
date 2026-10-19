/** Alliance, help and rally limits. Placeholder numbers for M4 (GDD §4.7). */

export const MAX_ALLIANCE_MEMBERS = 30;

export const ALLIANCE_NAME_MIN = 3;
export const ALLIANCE_NAME_MAX = 24;
export const ALLIANCE_TAG_MIN = 2;
export const ALLIANCE_TAG_MAX = 4;

/** Public player names are random handles of this length until players can pick names. */
export const HANDLE_LENGTH = 6;
export const HANDLE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const CHAT_MAX_LENGTH = 300;
/** Messages a room keeps and sends to a joining client. */
export const CHAT_HISTORY = 100;
/** At most this many messages per account in each window. */
export const CHAT_RATE_MAX = 5;
export const CHAT_RATE_WINDOW_MS = 10_000;

/** One help moves a running upgrade or training this much closer to done. */
export const HELP_REDUCTION_MS = 60_000;
export const MAX_HELPS_PER_REQUEST = 5;

/** The leader may move the alliance HQ at most this often. */
export const HQ_MOVE_COOLDOWN_MS = 60 * 60_000;

/** How long a rally gathers before it marches. 1 min is for testing and impatient leaders. */
export const RALLY_GATHER_OPTIONS_MS: readonly number[] = [60_000, 5 * 60_000, 15 * 60_000];
export const RALLY_MAX_PARTICIPANTS = 10;
/**
 * Tiles per minute for a rally's march. Fixed, so the timing is known when the rally starts and
 * joiners need no re-timing. A deviation from GDD §4.5 (troop speed), to revisit with heroes.
 */
export const RALLY_SPEED = 2;
