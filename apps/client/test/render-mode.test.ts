import { describe, expect, test } from "vitest";
import { pickRenderer } from "../src/render-mode.ts";

const SNB = "ANGLE (Intel, Mesa Intel(R) HD Graphics 3000 (SNB GT2), OpenGL 3.3)";
const MODERN = "ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)";

describe("pickRenderer", () => {
  test("uses Canvas on the GPUs known to draw sprite transparency as black", () => {
    expect(pickRenderer({ override: null, gpu: SNB })).toBe("canvas");
    expect(pickRenderer({ override: null, gpu: "Mesa Intel(R) Sandy Bridge Mobile" })).toBe("canvas");
    expect(pickRenderer({ override: null, gpu: "Intel(R) HD Graphics 2000" })).toBe("canvas");
  });

  test("leaves everything else on Phaser's automatic choice", () => {
    expect(pickRenderer({ override: null, gpu: MODERN })).toBe("auto");
    expect(pickRenderer({ override: null, gpu: "Intel(R) HD Graphics 4000" })).toBe("auto");
    expect(pickRenderer({ override: null, gpu: "Intel(R) UHD Graphics 630" })).toBe("auto");
    expect(pickRenderer({ override: null, gpu: null })).toBe("auto");
  });

  test("an explicit override wins over the GPU, and an unknown override is ignored", () => {
    expect(pickRenderer({ override: "webgl", gpu: SNB })).toBe("webgl");
    expect(pickRenderer({ override: "canvas", gpu: MODERN })).toBe("canvas");
    expect(pickRenderer({ override: "auto", gpu: SNB })).toBe("auto");
    expect(pickRenderer({ override: "vulkan", gpu: SNB })).toBe("canvas");
  });
});
