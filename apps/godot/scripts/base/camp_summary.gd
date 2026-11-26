class_name CampSummary
extends RefCounted
## What the camp needs to know of the player's game to show it (CampCast, docs/camp-life-plan.md), taken from the base state the
## session already has. Pure: the same state and amounts give the same summary.

## {upgrading, training, wounded, piles, food_low, marches, hq, support_fill, looks}:
## - `upgrading`: the building being upgraded, "" for none; `training`: whether troops are training.
## - `wounded`: all wounded troops; `piles`: resource -> "near" or "full" (HudModel.chips(), so piles and HUD chips agree).
## - `food_low`: food under CampLayout.FOOD_LOW of its cap; `support_fill`: support over its cap, 0 to 1.
## - `marches`: [{depart, back}] server ms (a march still gathering for a rally has not left).
## - `hq`: the HQ level; `looks`: the look each building shows.
## `state` is the server's base state (training, wounded, marches), `queue` the running upgrade or null, `amounts` accrued to now.
static func build(levels: Dictionary, queue: Variant, state: Dictionary, amounts: Dictionary) -> Dictionary:
	var hq := int(levels.get("hq", 1))
	var piles := {}
	var food_low := false
	var support_fill := 0.0
	for chip: Dictionary in HudModel.chips(amounts, hq):
		if chip["state"] != "normal":
			piles[chip["id"]] = chip["state"]
		if chip["id"] == "food":
			food_low = float(chip["fraction"]) < CampLayout.FOOD_LOW
		if chip["id"] == "support":
			support_fill = float(chip["fraction"])
	var wounded := 0
	var hurt: Variant = state.get("wounded")
	if hurt is Dictionary:
		for troop: String in hurt:
			wounded += int(hurt[troop])
	var marches := []
	var list: Variant = state.get("marches")
	if list is Array:
		for m: Variant in list:
			if m is Dictionary and m.has("departAt") and m.has("returnAt"):
				marches.append({"depart": int(m["departAt"]), "back": int(m["returnAt"])})
	var looks := {}
	for id: String in CampLayout.BUILDINGS:
		looks[id] = CampArt.look_for(int(levels.get(id, 1)))
	return {
		"upgrading": "" if queue == null else String(queue["building"]),
		"training": state.get("training") != null,
		"wounded": wounded,
		"piles": piles,
		"food_low": food_low,
		"marches": marches,
		"hq": hq,
		"support_fill": support_fill,
		"looks": looks,
	}
