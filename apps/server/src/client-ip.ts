/**
 * The rate-limit bucket for a request's client IP: the full IPv4 address, or the
 * /64 prefix for IPv6 (one subscriber usually holds a whole /64). Requests
 * without `CF-Connecting-IP` share one bucket rather than skipping the limit.
 */
export const ipBucket = (req: Request): string => {
  const ip = req.headers.get("cf-connecting-ip")?.trim().toLowerCase() ?? "";
  if (ip.length === 0) return "unknown";
  if (!ip.includes(":")) return ip;
  const [head = "", tail] = ip.split("::", 2);
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
};
