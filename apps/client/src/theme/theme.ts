import type { TerrainId } from "@revolt/rules";

/**
 * The game's palette, stored once. Phaser reads the numbers directly; CSS reads the
 * custom properties that `applyThemeToCss` sets from the same numbers.
 */
export interface Theme {
  /** Page and world backgrounds. */
  readonly ground: {
    /** Page and Phaser base background. */
    readonly base: number;
    /** The void behind the world map. */
    readonly world: number;
  };
  /** [light, dark] per terrain: a checker of two shades keeps tiles readable without outlines. */
  readonly terrain: Readonly<Record<TerrainId, readonly [number, number]>>;
  /** Alliance HQ pennants: teal for the player's own alliance, violet for the others. */
  readonly alliance: {
    readonly own: number;
    readonly other: number;
  };
  readonly accent: {
    readonly gold: number;
    readonly paper: number;
  };
  readonly ink: {
    /** Text and outline colour (CSS --ink). */
    readonly base: number;
  };
}

export const theme: Theme = {
  ground: { base: 0x4a3a2c, world: 0x30251c },
  terrain: {
    plain: [0xc99c60, 0xc4985c],
    hills: [0xae9448, 0xa99044],
    forest: [0x6b5e34, 0x675a32],
    mountain: [0x6a5846, 0x665543],
  },
  alliance: { own: 0x2f9e8f, other: 0x6a55a8 },
  accent: { gold: 0xe0b040, paper: 0xf4ead6 },
  ink: { base: 0x2b2a24 },
};

/** A 0xRRGGBB number as a CSS hex colour, e.g. 0x3d4a3a -> "#3d4a3a". */
export const hex = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;

/** Sets the palette as CSS custom properties on `root` (normally `document.documentElement`). */
export const applyThemeToCss = (root: HTMLElement): void => {
  const vars: Readonly<Record<string, number>> = {
    "--bg-base": theme.ground.base,
    "--bg-world": theme.ground.world,
    "--ink": theme.ink.base,
    "--paper": theme.accent.paper,
    "--gold": theme.accent.gold,
    "--alliance-own": theme.alliance.own,
    "--alliance-other": theme.alliance.other,
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, hex(value));
};
