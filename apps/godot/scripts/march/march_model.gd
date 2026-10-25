class_name MarchModel
extends RefCounted
## The numbers the send-march sheet shows, as `previewMarch`, `availableHeroes` and `bonusSummary` (apps/client/src/state/tile-info.ts,
## hero-view.ts) work them out from the rules' `travelMs`, `carryCapacity`, `checkMarch` and `heroBattleModifier` (golden cases in
## data/march-fixtures.json). Troop speeds, carry and the hero tables come from the exported balance data. The server decides every march.

static func _troops() -> Dictionary:
	return Balance.data()["troops"]

## Tiles per minute of the slowest unit sent, or 0 when nothing is sent.
static func speed(troops: Dictionary) -> float:
	var slowest := INF
	for id: String in Balance.data()["troopIds"]:
		if int(troops.get(id, 0)) > 0:
			slowest = minf(slowest, float(_troops()[id]["speed"]))
	return 0.0 if slowest == INF else slowest

## One-way travel in whole milliseconds (at least one second), or -1 when no troops are chosen. The distance is the plain Euclidean one
## in 64-bit floats (GDScript floats are doubles; a Vector2 would round to 32 bits), divided before it is scaled and rounded up, in the rules' order.
static func travel_ms(from_x: float, from_y: float, to_x: float, to_y: float, troops: Dictionary) -> int:
	var s := speed(troops)
	if s == 0.0:
		return -1
	var dx := from_x - to_x
	var dy := from_y - to_y
	var dist := sqrt(dx * dx + dy * dy)
	return maxi(1000, int(ceil((dist / s) * 60000.0)))

static func carry(troops: Dictionary) -> int:
	var total := 0
	for id: String in Balance.data()["troopIds"]:
		total += int(troops.get(id, 0)) * int(_troops()[id]["carry"])
	return total

## Heroes out on a march right now (the same rule as the Heroes screen).
static func busy_ids(state: Dictionary) -> Dictionary:
	return HeroesModel.busy_ids(state.get("marches", []))

## "" when the march may go, else the reason in the rules' order (`checkMarch`): no_troops, not_enough_troops, too_many_marches, then the
## loadout's (`checkLoadout`): too_many_deputies, duplicate_hero, not_owned, hero_busy. `loadout` is {lead, deputies} or null.
static func check(state: Dictionary, troops: Dictionary, loadout: Variant) -> String:
	var any_combat := false
	for id: String in Balance.data()["combatTroopIds"]:
		if int(troops.get(id, 0)) > 0:
			any_combat = true
	if not any_combat:
		return "no_troops"
	var home: Dictionary = state.get("troops", {})
	for id: String in Balance.data()["troopIds"]:
		if int(troops.get(id, 0)) > int(home.get(id, 0)):
			return "not_enough_troops"
	if (state.get("marches", []) as Array).size() >= int(Balance.data()["map"]["maxMarches"]):
		return "too_many_marches"
	if loadout == null:
		return ""
	var deputies: Array = loadout["deputies"]
	if deputies.size() > int(HeroesModel.progression()["maxDeputies"]):
		return "too_many_deputies"
	var ids: Array = [loadout["lead"]]
	ids.append_array(deputies)
	var seen := {}
	for id: String in ids:
		if seen.has(id):
			return "duplicate_hero"
		seen[id] = true
	var owned: Dictionary = state.get("heroes", {}).get("owned", {})
	for id: String in ids:
		if not owned.has(id):
			return "not_owned"
	var busy := busy_ids(state)
	for id: String in ids:
		if busy.has(id):
			return "hero_busy"
	return ""

## What the sheet shows for the troops picked: {"travel_ms" (-1 for none), "carry", "reason" ("" when it can go)}.
static func preview(state: Dictionary, from: Vector2i, to: Vector2i, troops: Dictionary, loadout: Variant) -> Dictionary:
	return {"travel_ms": travel_ms(from.x, from.y, to.x, to.y, troops), "carry": carry(troops), "reason": check(state, troops, loadout)}

## Heroes that can lead or join a march now: owned and not out, in the background's table order.
static func available_heroes(state: Dictionary, background: String) -> Array:
	var owned: Dictionary = state.get("heroes", {}).get("owned", {})
	var busy := busy_ids(state)
	var out: Array = []
	for id: String in HeroesModel.hero_ids(background):
		if owned.has(id) and not busy.has(id):
			out.append(id)
	return out

## {lead, deputies} from the three picker slots (lead first; "" is an empty slot): the first pick leads, the rest are deputies, or null
## when nothing is picked.
static func loadout_from_picks(picks: Array) -> Variant:
	var chosen: Array = picks.filter(func(p: Variant) -> bool: return String(p) != "")
	if chosen.is_empty():
		return null
	return {"lead": String(chosen[0]), "deputies": chosen.slice(1)}

## What a loadout brings in whole percent, as `bonusSummary` says: {"attack": best attack bonus over the troops it helps, "defense": share
## of damage no longer taken}. A hero's level scales each of its skills; only the lead's command skill counts. Zero for no heroes.
static func hero_bonus(state: Dictionary, loadout: Variant) -> Dictionary:
	if loadout == null:
		return {"attack": 0, "defense": 0}
	var p := HeroesModel.progression()
	var owned: Dictionary = state.get("heroes", {}).get("owned", {})
	var attack := {}
	for id: String in Balance.data()["troopIds"]:
		attack[id] = 1.0
	var reduction := 0.0
	var ids: Array = [loadout["lead"]]
	ids.append_array(loadout["deputies"])
	for i in ids.size():
		var def: Dictionary = Balance.data()["heroes"][ids[i]]
		var level := int(owned[ids[i]]["level"]) if owned.has(ids[i]) else 1
		var skills: Array = [def["command"]] if i == 0 else []
		skills.append_array(def["passives"])
		for skill: Dictionary in skills:
			var value := float(skill["value"]) * (1.0 + float(p["levelEffectStep"]) * float(level - 1))
			if skill["stat"] == "attack":
				attack[def["specialty"]] += value
			else:
				reduction += value
	var best := 1.0
	for id: String in attack:
		best = maxf(best, float(attack[id]))
	var taken := maxf(float(p["minDamageTaken"]), 1.0 - reduction)
	return {"attack": roundi(best * 100.0 - 100.0), "defense": roundi((1.0 - taken) * 100.0)}

## A count typed or stepped to, clamped to 0..`maximum`.
static func clamp_count(value: int, maximum: int) -> int:
	return clampi(value, 0, maxi(0, maximum))
