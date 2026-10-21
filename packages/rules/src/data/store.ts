import type { Reward } from "../reward.ts";

/**
 * The store catalog (GDD §8). `sku` is the Google Play product id too (docs/release.md). Prices are display hints only:
 * the store owns the real prices. Names and descriptions are i18n keys `product.<sku>.*`.
 * Nothing here sells a hero, a shard or combat strength: bundles are modest and resource grants stop at the HQ's
 * storage cap like any other income.
 */
export const PRODUCT_SKUS = [
  "pass_premium",
  "bundle_small",
  "bundle_large",
  "speedup_pack_small",
  "speedup_pack_large",
  "cosmetic_banner_plain",
  "cosmetic_march_lantern",
  "cosmetic_outfit_coat",
] as const;
export type ProductSku = (typeof PRODUCT_SKUS)[number];

export const isProductSku = (v: unknown): v is ProductSku => PRODUCT_SKUS.some((s) => s === v);

export const PRODUCT_KINDS = ["pass", "bundle", "speedup", "cosmetic"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export interface ProductDef {
  readonly kind: ProductKind;
  readonly grants: Reward;
  /** Unlocks the current season's premium pass track. */
  readonly passPremium?: true;
  /** Purchases of this product allowed per UTC day. Absent: no limit beyond what the store enforces. */
  readonly dailyLimit?: number;
  /** Display hint, US cents. */
  readonly priceHintUsdCents: number;
}

export const PRODUCTS: Readonly<Record<ProductSku, ProductDef>> = {
  pass_premium: { kind: "pass", grants: {}, passPremium: true, priceHintUsdCents: 499 },
  bundle_small: {
    kind: "bundle",
    grants: { resources: { food: 500, materiel: 500, funds: 500 }, speedupTokens: 2 },
    dailyLimit: 3,
    priceHintUsdCents: 199,
  },
  bundle_large: {
    kind: "bundle",
    grants: { resources: { food: 2000, materiel: 2000, funds: 2000 }, speedupTokens: 8 },
    dailyLimit: 3,
    priceHintUsdCents: 799,
  },
  speedup_pack_small: { kind: "speedup", grants: { speedupTokens: 5 }, dailyLimit: 5, priceHintUsdCents: 99 },
  speedup_pack_large: { kind: "speedup", grants: { speedupTokens: 25 }, dailyLimit: 3, priceHintUsdCents: 399 },
  cosmetic_banner_plain: { kind: "cosmetic", grants: { cosmetic: "banner_plain" }, priceHintUsdCents: 149 },
  cosmetic_march_lantern: { kind: "cosmetic", grants: { cosmetic: "march_lantern" }, priceHintUsdCents: 149 },
  cosmetic_outfit_coat: { kind: "cosmetic", grants: { cosmetic: "outfit_coat" }, priceHintUsdCents: 249 },
};

/** The largest resource total (food + materiel + funds) one product may grant. Guards the "modest bundles" promise. */
export const MAX_PRODUCT_RESOURCES = 6000;
/** The most speed-up tokens one product may grant. */
export const MAX_PRODUCT_TOKENS = 25;
