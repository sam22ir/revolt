import type { Resources } from "../resources.ts";

/** Storage cap per HQ level. Row `i` is HQ level `i + 1`. */
export const STORAGE_CAPS: readonly Resources[] = [
  { food: 2000, materiel: 2000, funds: 2000, support: 300 },
  { food: 3500, materiel: 3500, funds: 3500, support: 500 },
  { food: 5500, materiel: 5500, funds: 5500, support: 800 },
  { food: 8000, materiel: 8000, funds: 8000, support: 1100 },
  { food: 11000, materiel: 11000, funds: 11000, support: 1500 },
  { food: 15000, materiel: 15000, funds: 15000, support: 2000 },
  { food: 20000, materiel: 20000, funds: 20000, support: 2600 },
  { food: 26000, materiel: 26000, funds: 26000, support: 3300 },
  { food: 33000, materiel: 33000, funds: 33000, support: 4100 },
  { food: 42000, materiel: 42000, funds: 42000, support: 5000 },
];
