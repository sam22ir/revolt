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

## Resource id -> production per hour at the given building levels (building id -> level).
static func production_per_hour(levels: Dictionary) -> Dictionary:
	var out := {}
	for id: String in data()["resourceIds"]:
		out[id] = 0.0
	var buildings: Dictionary = data()["buildings"]
	for building_id: String in data()["buildingIds"]:
		var def: Dictionary = buildings[building_id]
		var produces: Variant = def["produces"]
		if produces != null:
			out[produces] += float(level_row(def["levels"], int(levels[building_id]))["ratePerHour"])
	return out

## Resource id -> storage cap at the given HQ level.
static func storage_cap(hq_level: int) -> Dictionary:
	return level_row(data()["storageCaps"], hq_level)
