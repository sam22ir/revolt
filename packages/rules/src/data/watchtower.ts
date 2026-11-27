/**
 * The watchtower's battle forecast (GDD §4.1: scouting). The server plays the march against the target over FORECAST_SAMPLES battle
 * seeds; how much of that the player sees depends on the watchtower's level. Placeholder balance.
 */
export const FORECAST_SAMPLES = 40;
/** A share of victories at or above this reads "likely victory"; below CLOSE_FROM, "likely defeat"; between, "close". */
export const LIKELY_WIN_FROM = 0.8;
export const CLOSE_FROM = 0.35;
/** Watchtower level from which the forecast adds the expected losses and wounded, and from which it adds the chance in percent. */
export const FORECAST_LOSSES_LEVEL = 3;
export const FORECAST_CHANCE_LEVEL = 5;
