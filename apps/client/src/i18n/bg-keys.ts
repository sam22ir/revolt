import type { BackgroundId } from "@revolt/rules";

/**
 * Background-specific text is looked up by id, never baked into logic: `background.<background>.<key>` overrides the
 * shared `<key>` (say `background.vietnam.building.farm.name` over `building.farm.name`). Keys of the `background.`
 * family themselves (the picker) are never overridden.
 */
export const bgKey = (background: BackgroundId, key: string): string => `background.${background}.${key}`;

/** The keys to try in order: the background's own, then the shared one. */
export const bgKeys = (background: BackgroundId, key: string): string[] => (key.startsWith("background.") ? [key] : [bgKey(background, key), key]);
