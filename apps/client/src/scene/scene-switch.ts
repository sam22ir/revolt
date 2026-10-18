import type Phaser from "phaser";

export type SceneKey = "base" | "world";

const OTHER: Readonly<Record<SceneKey, SceneKey>> = { base: "world", world: "base" };

/**
 * Shows one scene and puts the other to sleep (kept in memory with its camera, not drawn,
 * not receiving input). The world scene is started the first time it is shown.
 */
export const showScene = (game: Phaser.Game, key: SceneKey): void => {
  const scenes = game.scene;
  const other = OTHER[key];
  if (scenes.isActive(other)) scenes.sleep(other);
  if (scenes.isSleeping(key)) scenes.wake(key);
  else if (!scenes.isActive(key)) scenes.start(key);
};
