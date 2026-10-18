import { TROOP_IDS, type TroopId } from "./troop-id.ts";

/** Unit counts per troop type. Always non-negative integers. */
export type Troops = Readonly<Record<TroopId, number>>;

export const ZERO_TROOPS: Troops = { infantry: 0, scouts: 0, heavy: 0, porters: 0 };

export const mapTroops = (fn: (id: TroopId) => number): Troops => {
  const out: Record<TroopId, number> = { ...ZERO_TROOPS };
  for (const id of TROOP_IDS) out[id] = fn(id);
  return out;
};

export const addTroops = (a: Troops, b: Troops): Troops => mapTroops((id) => a[id] + b[id]);

export const subtractTroops = (a: Troops, b: Troops): Troops => mapTroops((id) => a[id] - b[id]);

export const totalTroops = (t: Troops): number => TROOP_IDS.reduce((n, id) => n + t[id], 0);

/** True if `have` holds at least `need` of every type. */
export const hasTroops = (have: Troops, need: Troops): boolean => TROOP_IDS.every((id) => have[id] >= need[id]);

/** Largest count accepted anywhere; keeps arithmetic far from float precision limits. */
export const MAX_TROOP_COUNT = 1_000_000;

const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_TROOP_COUNT;

/** Shape check for untrusted troop counts: every type present, non-negative integers, no extra keys read. */
export const isTroops = (v: unknown): v is Troops =>
  typeof v === "object" && v !== null && TROOP_IDS.every((id) => isCount((v as Record<string, unknown>)[id]));

/** Untrusted partial counts (e.g. a march intent) to full `Troops`; missing types are 0. Null if any value is invalid. */
export const parseTroops = (v: unknown): Troops | null => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const rec = v as Record<string, unknown>;
  for (const key of Object.keys(rec)) if (!TROOP_IDS.some((id) => id === key)) return null;
  const out = mapTroops((id) => (rec[id] === undefined ? 0 : (rec[id] as number)));
  return isTroops(out) ? out : null;
};
