class_name ResourceSheetModel
extends RefCounted
## What the resource sheet shows for one resource, as plain data: how much is in store against the cap, how long until the store is
## full, the hourly rate and where it comes from (the producing building, the liberation bonus, the lessons), and the building that
## sets the storage. Display only, from the same Balance tables as the top bar; the server owns the numbers.

## The building whose storage cap applies to every resource.
const STORAGE_BUILDING := "hq"

## The building that produces `id` ("" if none does).
static func producer(id: String) -> String:
	var buildings: Dictionary = Balance.data()["buildings"]
	for building_id: String in Balance.data()["buildingIds"]:
		if buildings[building_id]["produces"] == id:
			return building_id
	return ""

## {"id", "amount", "cap", "fraction", "full", "rate", "full_in_ms" (-1: full or not growing), "producer", "producer_level",
## "base_rate", "liberation_pct", "lesson_pct", "storage_building", "storage_level"}.
## `amounts` are the amounts accrued to `now_ms` (as the top bar shows them).
static func build(id: String, amounts: Dictionary, levels: Dictionary, liberations: Array, now_ms: int) -> Dictionary:
	var hq := int(levels.get(STORAGE_BUILDING, 1))
	var cap := float(Balance.storage_cap(hq)[id])
	var amount := float(amounts.get(id, 0.0))
	var rate := float(HudModel.rates(levels, liberations, now_ms).get(id, 0.0))
	var full := amount >= cap
	var source := producer(id)
	var source_level := int(levels.get(source, 1)) if source != "" else 0
	var base_rate := 0.0
	if source != "":
		base_rate = float(Balance.level_row(Balance.data()["buildings"][source]["levels"], source_level)["ratePerHour"])
	var full_in := -1
	if not full and rate > 0.0:
		full_in = ceili((cap - amount) / rate * ResourceDisplay.MS_PER_HOUR)
	var lesson := Balance.lesson_bonus("support_rate") if id == "support" else 0.0
	return {
		"id": id,
		"amount": amount,
		"cap": cap,
		"fraction": clampf(amount / cap, 0.0, 1.0) if cap > 0.0 else 0.0,
		"full": full,
		"rate": rate,
		"full_in_ms": full_in,
		"producer": source,
		"producer_level": source_level,
		"base_rate": base_rate,
		"liberation_pct": roundi((Balance.production_multiplier(liberations, now_ms) - 1.0) * 100.0),
		"lesson_pct": roundi(lesson * 100.0),
		"storage_building": STORAGE_BUILDING,
		"storage_level": hq,
	}
