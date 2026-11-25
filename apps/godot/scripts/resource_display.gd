class_name ResourceDisplay
extends RefCounted
## Display-only counters: min(cap, stored + rate * (now - last)), with time never running backwards.
## An amount already at or above the cap is kept as is, never clamped down
## (same rule as `accrue` in packages/rules/src/production.ts).
## The server owns the real numbers; this only interpolates between responses.

const MS_PER_HOUR := 3600000.0

static func amount(stored: float, rate_per_hour: float, cap: float, last_ms: int, now_ms: int) -> float:
	if stored >= cap:
		return stored
	var dt := now_ms - last_ms
	if dt <= 0:
		return stored
	return minf(cap, stored + (rate_per_hour * dt) / MS_PER_HOUR)

## All resources of a base state at `now_ms` (server time, see Clock), settled in segments split wherever the
## server-wide liberation bonus changes (mirrors `accrue` in packages/rules/src/production.ts). `resources`,
## `levels` and `liberations` are the server's `state.resources`, `state.levels` and `liberations`;
## `last_ms` is `state.lastUpdated`. Time before `last_ms` is never paid.
static func amounts(resources: Dictionary, levels: Dictionary, last_ms: int, now_ms: int, liberations: Array = []) -> Dictionary:
	var out := {}
	for id: String in resources:
		out[id] = float(resources[id])
	if now_ms - last_ms <= 0:
		return out
	var cap := Balance.storage_cap(int(levels["hq"]))
	var edges: Array[int] = [last_ms]
	edges.append_array(Balance.multiplier_breakpoints(liberations, last_ms, now_ms))
	edges.append(now_ms)
	for i in range(edges.size() - 1):
		var start := edges[i]
		var rate := Balance.production_per_hour(levels, Balance.production_multiplier(liberations, start))
		for id: String in out:
			out[id] = amount(out[id], float(rate[id]), float(cap[id]), start, edges[i + 1])
	return out
