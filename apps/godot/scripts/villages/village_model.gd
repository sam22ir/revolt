class_name VillageModel
extends RefCounted
## Villages on the map (docs/villages-plan.md), from the map snapshot's `villages` ({id, kind, x, y, need, day}) and the player's base
## (`villages`: trust per village, `lessonsTaught`, `marches`). Ports of the rules in packages/rules/src/villages.ts and aid.ts that the
## screen needs; the server decides every help. Pure: no nodes, no translation.

const NEED_ICONS := {"food": "food", "funds": "funds", "care": "wounded", "labor": "hammer", "protection": "power"}
const DAY_MS := 86400000.0

static func _cfg() -> Dictionary:
	return Balance.data()["villages"]

## The well-formed villages of a snapshot, sorted by id. Tolerant: none from an older server.
static func villages(snap: Dictionary) -> Array:
	var out: Array = []
	var raw: Variant = snap.get("villages", [])
	if not raw is Array:
		return out
	for v: Variant in raw:
		if v is Dictionary and v.get("id") is String and (_cfg()["kinds"] as Array).has(v.get("kind")) and NEED_ICONS.has(v.get("need")) \
				and WireCheck.is_num(v.get("x")) and WireCheck.is_num(v.get("y")) and WireCheck.is_num(v.get("day")):
			out.append(v)
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return String(a["id"]) < String(b["id"]))
	return out

static func village_at(snap: Dictionary, x: int, y: int) -> Dictionary:
	for v: Dictionary in villages(snap):
		if int(v["x"]) == x and int(v["y"]) == y:
			return v
	return {}

static func record(state: Dictionary, id: String) -> Dictionary:
	var all: Variant = state.get("villages", {})
	var r: Variant = all.get(id) if all is Dictionary else null
	return r if r is Dictionary else {"trust": 0.0, "at": 0.0, "taught": 0, "helpedDay": -1}

## Trust at `now`: it fades from `at` by the day's decay, never below 0, and time going backwards adds none (`trustAt`).
static func trust(state: Dictionary, id: String, now: float) -> float:
	var r := record(state, id)
	var faded := float(r["trust"]) - float(_cfg()["trustDecayPerDay"]) / DAY_MS * maxf(0.0, now - float(r["at"]))
	return clampf(faded, 0.0, float(_cfg()["trustMax"]))

static func level_of(t: float) -> int:
	var n := 0
	for threshold: Variant in _cfg()["trustLevels"]:
		if t >= float(threshold):
			n += 1
	return n

static func max_level() -> int:
	return (_cfg()["trustLevels"] as Array).size()

## The share of the way from the current level's threshold to the next (1 at the top), for a bar.
static func level_progress(t: float) -> float:
	var levels: Array = _cfg()["trustLevels"]
	var l := level_of(t)
	if l >= levels.size():
		return 1.0
	var from := 0.0 if l == 0 else float(levels[l - 1])
	return clampf((t - from) / (float(levels[l]) - from), 0.0, 1.0)

static func helped_today(state: Dictionary, v: Dictionary) -> bool:
	return int(record(state, String(v["id"]))["helpedDay"]) == int(v["day"])

## The lesson village `kind` teaches at trust `level`, or "".
static func lesson_at(kind: String, level: int) -> String:
	var lessons: Dictionary = Balance.data()["lessons"]
	for id: String in Balance.data()["lessonIds"]:
		if lessons[id]["village"] == kind and int(lessons[id]["level"]) == level:
			return id
	return ""

## The next lesson this village would teach the player: {"level", "lesson"}, or {} once it has taught all three.
static func next_lesson(state: Dictionary, v: Dictionary) -> Dictionary:
	var taught := int(record(state, String(v["id"]))["taught"])
	if taught >= max_level():
		return {}
	return {"level": taught + 1, "lesson": lesson_at(String(v["kind"]), taught + 1)}

## What answering today's need takes at the player's trust: {"cost": {resource: amount}, "stay_ms": int} (`aidPlan`).
static func plan(need: String, trust_level: int) -> Dictionary:
	var cost := {"food": 0, "materiel": 0, "funds": 0, "support": 0}
	var stay := 0
	match need:
		"food":
			cost["food"] = int(_cfg()["needFoodPerLevel"]) * (trust_level + 1)
		"funds":
			cost["funds"] = int(_cfg()["needFundsPerLevel"]) * (trust_level + 1)
		"care":
			for id: String in _cfg()["careCost"]:
				cost[id] = int(_cfg()["careCost"][id])
		"labor":
			stay = int(_cfg()["laborMs"])
	return {"cost": cost, "stay_ms": stay}

## What `counts` carries, with the weavers' porter lesson (`carryCapacity`).
static func carry(counts: Dictionary) -> float:
	var n := 0.0
	var bonus := Balance.lesson_bonus("porter_carry")
	for id: String in Balance.data()["troopIds"]:
		n += int(counts.get(id, 0)) * float(Balance.data()["troops"][id]["carry"]) * ((1.0 + bonus) if id == "porters" else 1.0)
	return n

## Why an aid march with `counts` cannot leave now, or "" (`checkAid`, plus "no_troops" for an empty march). The server checks again.
static func check(state: Dictionary, v: Dictionary, counts: Dictionary, amounts: Dictionary, now: float) -> String:
	var need := String(v["need"])
	if need == "protection":
		return "not_this_need"
	if helped_today(state, v):
		return "already_helped_today"
	for m: Variant in state.get("marches", []):
		if m is Dictionary and m.get("aid") is Dictionary and m["aid"].get("village") == v["id"] and int(m["aid"].get("day", -1)) == int(v["day"]):
			return "already_on_the_way"
	var total := 0
	for id: String in Balance.data()["troopIds"]:
		total += int(counts.get(id, 0))
	if total == 0:
		return "no_troops"
	var p := plan(need, level_of(trust(state, String(v["id"]), now)))
	var load := 0
	for id: String in p["cost"]:
		load += int(p["cost"][id])
	if (need == "food" or need == "funds") and carry(counts) < load:
		return "not_enough_carry"
	if need == "care" and int(state.get("levels", {}).get("infirmary", 1)) < int(_cfg()["careInfirmaryLevel"]):
		return "infirmary_level"
	if need == "labor" and total < int(_cfg()["laborTroops"]):
		return "labor_troops"
	for id: String in p["cost"]:
		if float(amounts.get(id, 0.0)) < float(p["cost"][id]):
			return "insufficient"
	return ""

## The line that says today's need, as a translation key and its values (numbers still raw).
static func need_line(state: Dictionary, v: Dictionary, now: float) -> Dictionary:
	var need := String(v["need"])
	var p := plan(need, level_of(trust(state, String(v["id"]), now)))
	match need:
		"food", "funds":
			return {"key": "need.%s.line" % need, "vars": {"amount": int(p["cost"][need])}}
		"care":
			return {"key": "need.care.line", "vars": {"level": int(_cfg()["careInfirmaryLevel"])}}
		"labor":
			return {"key": "need.labor.line", "vars": {"count": int(_cfg()["laborTroops"]), "time_ms": int(_cfg()["laborMs"])}}
	return {"key": "need.protection.line", "vars": {}}

## The ids of the snapshot's villages the player has helped today, as a set (the map leaves their need badge off).
static func helped_ids(snap: Dictionary, state: Dictionary) -> Dictionary:
	var out := {}
	for v: Dictionary in villages(snap):
		if helped_today(state, v):
			out[String(v["id"])] = true
	return out
