class_name HeroesModel
extends RefCounted
## What the Heroes screen shows: the background's heroes with their level, shards and why Level up is off, as `heroCards` in
## apps/client/src/state/hero-view.ts decides it (golden cases in data/heroes-fixtures.json). The tables come from the exported
## balance data (`heroes`, `heroesByBackground`, `heroProgression`), nothing is copied here. The server decides every change.

static func progression() -> Dictionary:
	return Balance.data()["heroProgression"]

## The hero ids of `background` ("" means the default one), in table order.
static func hero_ids(background: String) -> Array:
	var data := Balance.data()
	var key := background if data["heroesByBackground"].has(background) else String(data["defaultBackground"])
	return data["heroesByBackground"][key]

## Highest level the hero hall allows at `hall_level`.
static func level_cap(hall_level: int) -> int:
	var p := progression()
	return mini(int(p["maxLevel"]), hall_level * int(p["levelsPerHallLevel"]))

## Shards to go from `level` to the next, or -1 at the top level.
static func shards_to_next(level: int) -> int:
	var p := progression()
	var rows: Array = p["shardsPerLevel"]
	if level >= int(p["maxLevel"]) or level < 1 or level > rows.size():
		return -1
	return int(rows[level - 1])

## "" when Level up is allowed, else the reason, in the rules' order (`levelUpHero`): max_level, hall_cap, not_enough_shards.
## Only meaningful for an owned hero.
static func level_block(entry: Dictionary, hall_level: int) -> String:
	var need := shards_to_next(int(entry["level"]))
	if need < 0:
		return "max_level"
	if int(entry["level"]) >= level_cap(hall_level):
		return "hall_cap"
	if int(entry["shards"]) < need:
		return "not_enough_shards"
	return ""

## Heroes out on a march (lead or deputy of any march that carries heroes).
static func busy_ids(marches: Array) -> Dictionary:
	var busy := {}
	for m: Variant in marches:
		if m is Dictionary and m.get("heroes") is Dictionary:
			busy[String(m["heroes"]["lead"])] = true
			for d: Variant in m["heroes"].get("deputies", []):
				busy[String(d)] = true
	return busy

## The cards, owned first and then the rest, each group in table order. Each is
## {id, def, owned (the entry or null), busy, level_up ("" or a reason), next_shards (-1 at the top or when not owned), cap}.
static func cards(state: Dictionary, background: String) -> Array:
	var owned: Dictionary = state.get("heroes", {}).get("owned", {})
	var hall := int(state.get("levels", {}).get("hero_hall", 1))
	var busy := busy_ids(state.get("marches", []))
	var mine: Array = []
	var rest: Array = []
	for id: String in hero_ids(background):
		var entry: Variant = owned.get(id)
		var card := {
			"id": id, "def": Balance.data()["heroes"][id], "owned": entry, "busy": busy.has(id),
			"level_up": level_block(entry, hall) if entry is Dictionary else "",
			"next_shards": shards_to_next(int(entry["level"])) if entry is Dictionary else -1,
			"cap": level_cap(hall),
		}
		(mine if entry is Dictionary else rest).append(card)
	return mine + rest

## A skill's value in whole percent at `level`, as the card shows it: round(value x (1 + step x (level - 1)) x 100).
static func skill_pct(value: float, level: int) -> int:
	return roundi(value * (1.0 + float(progression()["levelEffectStep"]) * float(level - 1)) * 100.0)

## The skill lines of a card: [{slot ("command"|"passive"), id, stat, pct}], the command skill first.
static func skill_lines(card: Dictionary) -> Array:
	var level := int(card["owned"]["level"]) if card["owned"] is Dictionary else 1
	var def: Dictionary = card["def"]
	var out: Array = [{"slot": "command", "id": def["command"]["id"], "stat": def["command"]["stat"], "pct": skill_pct(float(def["command"]["value"]), level)}]
	for p: Dictionary in def["passives"]:
		out.append({"slot": "passive", "id": p["id"], "stat": p["stat"], "pct": skill_pct(float(p["value"]), level)})
	return out
