class_name HealModel
extends RefCounted
## The infirmary's rules, ported from packages/rules/src/healing.ts (golden cases in data/heal-fixtures.json): the batch size, what
## one press of Heal takes, what it costs and how long it takes, and why it is off. The server decides; this only draws the form.

const REASONS: Array[String] = ["infirmary_busy", "no_wounded", "insufficient"]

static func _cfg() -> Dictionary:
	return Balance.data()["healing"]

## With the healers' batch lesson (`maxHealingBatch`).
static func max_batch(infirmary_level: int) -> int:
	return maxi(0, infirmary_level) * (int(_cfg()["batchPerLevel"]) + floori(Balance.lesson_bonus("heal_batch_per_level")))

## What healing one unit of `troop` costs: a share of training it, rounded up (the epsilon as in the TypeScript).
static func unit_cost(troop: String) -> Dictionary:
	var cost: Dictionary = Balance.data()["troops"][troop]["cost"]
	var out := {}
	for id: String in Balance.data()["resourceIds"]:
		out[id] = ceili(float(cost.get(id, 0)) * float(_cfg()["costShare"]) * (1.0 - minf(0.9, Balance.lesson_bonus("heal_cost"))) - 1e-9)
	return out

## The cost and time of healing exactly `troops`: {"cost": {...}, "durationMs": int}.
static func quote(troops: Dictionary) -> Dictionary:
	var cost := {}
	for id: String in Balance.data()["resourceIds"]:
		cost[id] = 0
	var ms := 0
	for troop: String in Balance.data()["troopIds"]:
		var n := int(troops.get(troop, 0))
		if n <= 0:
			continue
		var per := unit_cost(troop)
		for id: String in cost:
			cost[id] += int(per[id]) * n
		ms += roundi(float(Balance.data()["troops"][troop]["trainSecPerUnit"]) * float(_cfg()["timeShare"]) * (1.0 - minf(0.9, Balance.lesson_bonus("heal_time"))) * 1000.0) * n
	return {"cost": cost, "durationMs": ms}

## The batch one press takes: wounded in troop order, up to the batch size and as many as `amounts` pay for, a unit at a time.
static func plan(infirmary_level: int, wounded: Dictionary, amounts: Dictionary) -> Dictionary:
	var room := max_batch(infirmary_level)
	var left := amounts.duplicate()
	var take := {}
	for troop: String in Balance.data()["troopIds"]:
		take[troop] = 0
		var per := unit_cost(troop)
		var affordable := 1 << 60
		for id: String in per:
			if int(per[id]) > 0:
				affordable = mini(affordable, floori(float(left.get(id, 0.0)) / float(per[id])))
		var n := maxi(0, mini(mini(int(wounded.get(troop, 0)), room), affordable))
		if n == 0:
			continue
		take[troop] = n
		room -= n
		for id: String in per:
			left[id] = float(left.get(id, 0.0)) - int(per[id]) * n
	return take

static func count(troops: Variant) -> int:
	var n := 0
	if troops is Dictionary:
		for troop: String in Balance.data()["troopIds"]:
			n += int(troops.get(troop, 0))
	return n

## Why Heal is off, or "" when it can be pressed.
static func check(infirmary_level: int, wounded: Dictionary, amounts: Dictionary, healing: Variant) -> String:
	if healing is Dictionary:
		return "infirmary_busy"
	if count(wounded) == 0:
		return "no_wounded"
	if count(plan(infirmary_level, wounded, amounts)) == 0:
		return "insufficient"
	return ""
