export type RendererChoice = "auto" | "webgl" | "canvas";

/**
 * GPUs where Phaser's WebGL renderer draws the transparent pixels of every sprite as opaque black (seen on an
 * Intel HD Graphics 3000 under Mesa; the same textures and blend state work in plain WebGL, and Phaser's
 * Canvas renderer draws the same scene correctly). Matched on the unmasked renderer string.
 */
const BROKEN_WEBGL_GPU = /\bSNB\b|Sandy ?Bridge|HD Graphics (2000|3000)\b/i;

interface RendererInput {
  /** The `renderer` query parameter (`?renderer=canvas|webgl|auto`), or null. */
  readonly override: string | null;
  /** The WebGL unmasked renderer string, or null when WebGL is unavailable or does not say. */
  readonly gpu: string | null;
}

/** `canvas` when WebGL is unavailable or known to be broken here, else `auto`. An explicit override always wins. */
export const pickRenderer = ({ override, gpu }: RendererInput): RendererChoice => {
  if (override === "canvas" || override === "webgl" || override === "auto") return override;
  if (gpu === null) return "auto";
  return BROKEN_WEBGL_GPU.test(gpu) ? "canvas" : "auto";
};

/** The GPU's name from a throwaway WebGL context, or null. Costs one context, released straight away. */
export const readGpuRenderer = (): string | null => {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (gl === null) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info === null ? null : String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return null;
  }
};
