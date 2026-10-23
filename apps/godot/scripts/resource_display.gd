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

## All resources of a base state at `now_ms` (server time, see Clock). `resources` and `levels` are the
## server's `state.resources` and `state.levels`; `last_ms` is `state.lastUpdated`.
static func amounts(resources: Dictionary, levels: Dictionary, last_ms: int, now_ms: int) -> Dictionary:
	var rate := Balance.production_per_hour(levels)
	var cap := Balance.storage_cap(int(levels["hq"]))
	var out := {}
	for id: String in resources:
		out[id] = amount(float(resources[id]), float(rate[id]), float(cap[id]), last_ms, now_ms)
	return out
