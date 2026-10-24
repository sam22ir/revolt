/**
 * JSON for generated data files: objects and arrays of objects/arrays are indented, arrays of plain values stay on one
 * line, so a 64x64 grid is 64 lines instead of 4096.
 */
export const compactJson = (value: unknown, indent = 0): string => {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.every((x) => x === null || typeof x !== "object")) return JSON.stringify(value);
    return `[\n${value.map((x) => `${pad}  ${compactJson(x, indent + 1)}`).join(",\n")}\n${pad}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return `{\n${entries.map(([k, x]) => `${pad}  ${JSON.stringify(k)}: ${compactJson(x, indent + 1)}`).join(",\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
};
