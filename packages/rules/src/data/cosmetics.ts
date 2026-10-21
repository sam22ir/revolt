/**
 * Cosmetics (GDD §8): looks only. They carry no numbers, so nothing here can change a battle, a timer or a cost.
 * Names are i18n keys `cosmetic.<id>`; art is looked up by id (placeholder until the art pass, docs/art.md).
 */
export const COSMETIC_SLOTS = ["base_skin", "banner", "march_skin", "hero_outfit"] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

export const COSMETIC_SLOT: Readonly<Record<string, CosmeticSlot>> = {
  skin_olive: "base_skin",
  skin_sand: "base_skin",
  skin_slate: "base_skin",
  banner_plain: "banner",
  banner_stripes: "banner",
  banner_dawn: "banner",
  march_dust: "march_skin",
  march_lantern: "march_skin",
  outfit_field: "hero_outfit",
  outfit_scarf: "hero_outfit",
  outfit_coat: "hero_outfit",
};

export const COSMETIC_IDS = [
  "skin_olive",
  "skin_sand",
  "skin_slate",
  "banner_plain",
  "banner_stripes",
  "banner_dawn",
  "march_dust",
  "march_lantern",
  "outfit_field",
  "outfit_scarf",
  "outfit_coat",
] as const;
export type CosmeticId = (typeof COSMETIC_IDS)[number];

export const isCosmeticId = (v: unknown): v is CosmeticId => COSMETIC_IDS.some((id) => id === v);

export const slotOf = (id: CosmeticId): CosmeticSlot => COSMETIC_SLOT[id] ?? "base_skin";
