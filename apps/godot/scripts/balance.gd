class_name Balance
extends RefCounted
## Balance tables exported from packages/rules (data/balance.json, run `pnpm godot:export`).
## Display only: the server owns every number. Mirrors productionPerHour / storageCap in
## packages/rules/src/production.ts; test/unit/test_display_fixtures.gd checks both against the real rules.

const PATH := "res://data/balance.json"

static var _data: Dictionary = {}

static func data() -> Dictionary:
	if _data.is_empty():
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
		assert(parsed is Dictionary, "balance.json missing or invalid")
		_data = parsed
	return _data

static func level_row(rows: Array, level: int) -> Variant:
	return rows[clampi(level, 1, rows.size()) - 1]

## Resource id -> production per hour at the given building levels (building id -> level);
## `multiplier` is the server-wide liberation bonus (see production_multiplier).
static func production_per_hour(levels: Dictionary, multiplier: float = 1.0) -> Dictionary:
	var out := {}
	for id: String in data()["resourceIds"]:
		out[id] = 0.0
	var buildings: Dictionary = data()["buildings"]
	for building_id: String in data()["buildingIds"]:
		var def: Dictionary = buildings[building_id]
		var produces: Variant = def["produces"]
		if produces != null:
			out[produces] += float(level_row(def["levels"], int(levels[building_id]))["ratePerHour"]) * multiplier
	return out

## Resource id -> storage cap at the given HQ level.
static func storage_cap(hq_level: int) -> Dictionary:
	return level_row(data()["storageCaps"], hq_level)

## Number of distinct regions liberated at time `t_ms`. `liberations` is the server's list of
## {region, from, until} (until null while still held). Mirrors liberatedCount in liberation.ts.
static func liberated_count(liberations: Array, t_ms: int) -> int:
	var regions := {}
	for l: Dictionary in liberations:
		var until: Variant = l["until"]
		if int(l["from"]) <= t_ms and (until == null or t_ms < int(until)):
			regions[int(l["region"])] = true
	return regions.size()

## `1 + bonus`, bonus capped. Mirrors productionMultiplier in liberation.ts.
static func production_multiplier(liberations: Array, t_ms: int) -> float:
	var lib: Dictionary = data()["liberation"]
	return 1.0 + minf(float(lib["bonusCap"]), liberated_count(liberations, t_ms) * float(lib["bonusPerRegion"]))

## Times strictly inside (from_ms, to_ms) where the multiplier may change, ascending, no duplicates.
static func multiplier_breakpoints(liberations: Array, from_ms: int, to_ms: int) -> Array[int]:
	var points := {}
	for l: Dictionary in liberations:
		for key in ["from", "until"]:
			if l[key] != null:
				var p := int(l[key])
				if p > from_ms and p < to_ms:
					points[p] = true
	var out: Array[int] = []
	for p: int in points:
		out.append(p)
	out.sort()
	return out
