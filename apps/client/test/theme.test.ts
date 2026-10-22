import { describe, expect, it } from "vitest";
import { TERRAIN_IDS } from "@revolt/rules";
import { applyThemeToCss, hex, theme } from "../src/theme/theme.ts";

const isRgb = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xffffff;

const allNumbers = (): number[] => [
  theme.ground.base,
  theme.ground.world,
  ...TERRAIN_IDS.flatMap((id) => [...theme.terrain[id]]),
  theme.alliance.own,
  theme.alliance.other,
  theme.accent.gold,
  theme.accent.paper,
  theme.ink.base,
];

describe("theme palette", () => {
  it("stores every colour as a valid 0xRRGGBB number", () => {
    for (const n of allNumbers()) expect(isRgb(n)).toBe(true);
  });

  it("has a [light, dark] pair for every terrain id", () => {
    for (const id of TERRAIN_IDS) {
      expect(theme.terrain[id]).toHaveLength(2);
    }
  });

  it("round-trips through hex", () => {
    for (const n of allNumbers()) expect(parseInt(hex(n).slice(1), 16)).toBe(n);
    expect(hex(0x3d4a3a)).toBe("#3d4a3a");
    expect(hex(0x000000)).toBe("#000000");
  });

  it("sets every expected CSS variable on the root", () => {
    const set = new Map<string, string>();
    const root = { style: { setProperty: (name: string, value: string) => set.set(name, value) } } as unknown as HTMLElement;
    applyThemeToCss(root);
    expect(Object.fromEntries(set)).toEqual({
      "--bg-base": "#4a3a2c",
      "--bg-world": "#30251c",
      "--ink": "#2b2a24",
      "--paper": "#f4ead6",
      "--gold": "#e0b040",
      "--alliance-own": "#2f9e8f",
      "--alliance-other": "#6a55a8",
    });
  });
});
