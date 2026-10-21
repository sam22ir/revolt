import { DEFAULT_BACKGROUND, type BackgroundId } from "@revolt/rules";

/** The background of an account. Answers from servers older than M6 carry none, and those players are in Algeria. */
export const getBackground = (account: { readonly background?: BackgroundId }): BackgroundId => account.background ?? DEFAULT_BACKGROUND;

let active: BackgroundId = DEFAULT_BACKGROUND;

/**
 * The background the player is in, kept in one place so every screen (names, story, art, heroes) reads the same
 * value. Set by the game store whenever the account is known; it never changes while the app runs, because a Google
 * sign-in onto an account of another background reloads the app.
 */
export const setActiveBackground = (background: BackgroundId): void => {
  active = background;
};

export const activeBackground = (): BackgroundId => active;
