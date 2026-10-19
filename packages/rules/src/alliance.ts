import { ALLIANCE_NAME_MAX, ALLIANCE_NAME_MIN, ALLIANCE_TAG_MAX, ALLIANCE_TAG_MIN, CHAT_MAX_LENGTH } from "./data/alliance.ts";

export const ALLIANCE_RANKS = ["leader", "officer", "member"] as const;
export type AllianceRank = (typeof ALLIANCE_RANKS)[number];

export const ALLIANCE_ACTIONS = ["kick", "promote", "demote", "transfer", "set_hq", "start_rally", "disband"] as const;
export type AllianceAction = (typeof ALLIANCE_ACTIONS)[number];

/** Why an alliance, help or rally request was refused. Shown to the player as `reason.<code>`. */
export const ALLIANCE_BLOCK_REASONS = [
  "already_member",
  "not_member",
  "bad_name",
  "bad_tag",
  "name_taken",
  "tag_taken",
  "alliance_full",
  "alliance_gone",
  "no_permission",
  "leader_must_transfer",
  "target_not_found",
  "target_rank",
  "bad_tile",
  "tile_taken",
  "hq_cooldown",
  "no_job",
  "already_requested",
  "already_helped",
  "help_full",
  "own_request",
  "request_gone",
  "bad_gather",
  "rally_gone",
  "rally_closed",
  "rally_full",
  "already_in_rally",
] as const;
export type AllianceBlockReason = (typeof ALLIANCE_BLOCK_REASONS)[number];

const RANK_ORDER: Readonly<Record<AllianceRank, number>> = { leader: 2, officer: 1, member: 0 };

/** Who may do what. Leaders do everything; officers run the day-to-day; members play. */
const PERMISSIONS: Readonly<Record<AllianceAction, readonly AllianceRank[]>> = {
  kick: ["leader", "officer"],
  promote: ["leader"],
  demote: ["leader"],
  transfer: ["leader"],
  set_hq: ["leader"],
  start_rally: ["leader", "officer"],
  disband: ["leader"],
};

export const canPerform = (rank: AllianceRank, action: AllianceAction): boolean => PERMISSIONS[action].includes(rank);

/** Kicking needs the kick permission and a strictly lower target rank. */
export const canKick = (actor: AllianceRank, target: AllianceRank): boolean =>
  canPerform(actor, "kick") && RANK_ORDER[actor] > RANK_ORDER[target];

export const isAllianceRank = (v: unknown): v is AllianceRank => ALLIANCE_RANKS.some((r) => r === v);

/** The rank after a promotion or demotion, or null if there is none (a leader changes by transfer). */
export const promotedRank = (r: AllianceRank): AllianceRank | null => (r === "member" ? "officer" : null);
export const demotedRank = (r: AllianceRank): AllianceRank | null => (r === "officer" ? "member" : null);

// Control (Cc) and format (Cf) characters include bidi overrides and zero-width characters that could
// spoof names in a mixed right-to-left and left-to-right interface; line and paragraph separators too.
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cn}\p{Co}\p{Cs}]/u;

const length = (s: string): number => [...s].length;

/** Player-written text: NFC-normalised, trimmed, no forbidden characters. Null if empty or not allowed. */
const cleanText = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFC").trim();
  return s.length > 0 && !FORBIDDEN.test(s) ? s : null;
};

/** An alliance name: 3–24 characters (code points), single spaces inside. The normalised name, or null. */
export const validateAllianceName = (v: unknown): string | null => {
  const s = cleanText(v)?.replace(/\s+/g, " ") ?? null;
  return s !== null && length(s) >= ALLIANCE_NAME_MIN && length(s) <= ALLIANCE_NAME_MAX ? s : null;
};

/**
 * An alliance tag: 2–4 ASCII letters and digits, upper-cased. Tags are the only alliance text drawn on the
 * map canvas, which is why they stay ASCII: names and chat live in the DOM overlay, where right-to-left works.
 */
export const validateAllianceTag = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase();
  return /^[A-Z0-9]+$/.test(s) && s.length >= ALLIANCE_TAG_MIN && s.length <= ALLIANCE_TAG_MAX ? s : null;
};

/** A chat message: one line, up to 300 characters, plain text. The normalised text, or null. */
export const validateChatText = (v: unknown): string | null => {
  const s = cleanText(v);
  return s !== null && length(s) <= CHAT_MAX_LENGTH ? s : null;
};

/** A name as the uniqueness check sees it: NFC and lower-cased (ASCII; other scripts have no case to fold). */
export const nameKey = (name: string): string => name.normalize("NFC").toLowerCase();
