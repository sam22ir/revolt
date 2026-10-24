class_name TrainingModel
extends RefCounted
## The barracks training rules as packages/rules/src/training.ts has them (the batch limit, the quote and the check), and the
## troop list as troop-format.ts writes it. Golden cases for `en` and `ar` in data/training-fixtures.json; the server decides,
## this only checks the form and shows why a batch is blocked. `amounts` are the resources accrued to now, as the counters show them.

const ARABIC_SEPARATOR := "\u060c "

## Largest batch the barracks at `barracks` can train at once.
static func max_batch(barracks: int) -> int:
	return barracks * int(Balance.data()["trainingBatchPerLevel"])

static func troop_tier(troop: String) -> int:
	return int(Balance.data()["troops"][troop]["tier"])

## {"cost": {resource: amount}, "duration_ms": float} for `count` units of `troop`.
static func quote(troop: String, count: int) -> Dictionary:
	var def: Dictionary = Balance.data()["troops"][troop]
	var cost := {}
	for id: String in Balance.data()["resourceIds"]:
		cost[id] = float(def["cost"][id]) * count
	return {"cost": cost, "duration_ms": float(def["trainSecPerUnit"]) * 1000.0 * count}

## The reason a batch is blocked (`bad_count`, `training_busy`, `barracks_level`, `insufficient`), or "" when it can start.
## Checked in the same order as checkTraining. `tier` overrides the data's tier (tests only; negative means the data's).
static func check(barracks: int, busy: bool, troop: String, count: float, amounts: Dictionary, tier := -1) -> String:
	if not is_equal_approx(count, floor(count)) or count < 1.0 or count > max_batch(barracks):
		return "bad_count"
	if busy:
		return "training_busy"
	var needed := tier if tier >= 0 else troop_tier(troop)
	if barracks < needed:
		return "barracks_level"
	var cost: Dictionary = quote(troop, int(count))["cost"]
	for id: String in Balance.data()["resourceIds"]:
		if float(amounts.get(id, 0.0)) < float(cost[id]):
			return "insufficient"
	return ""

## The count the field and the buttons hold: rounded down, between 1 and `max_count`; anything not a number is 1.
static func clamp_count(value: float, max_count: int) -> int:
	if is_nan(value) or is_inf(value):
		return 1
	return clampi(int(floor(value)), 1, maxi(1, max_count))

## "4 Infantry, 3 Scouts" in `lang`; `train.none` when there are no troops. Arabic joins with a comma and a space.
static func troop_list(troops: Dictionary, lang: String) -> String:
	var parts: Array[String] = []
	for id: String in Balance.data()["troopIds"]:
		var n := int(troops.get(id, 0))
		if n > 0:
			parts.append("%s %s" % [Fmt.amount(lang, n), Loc.t("troop.%s.name" % id)])
	if parts.is_empty():
		return Loc.t("train.none")
	return (ARABIC_SEPARATOR if lang == "ar" else ", ").join(parts)

## What the training form shows, as plain data (the training section of the barracks sheet). `count` is clamped to the batch
## limit; `cost` lists the resources the batch takes (a resource the batch does not take is left out) and which of them are
## short; `job` is the batch in progress ({"troop", "count", "remaining_ms", "fraction"}) or null.
## `help` is true when the help button shows (HelpModel.can_ask for "training", and a batch that is still running).
static func view(barracks: int, troops: Dictionary, wounded: Dictionary, training: Variant, amounts: Dictionary, now_ms: int,
		troop: String, count: int, lang: String, can_help := false) -> Dictionary:
	var max_count := max_batch(barracks)
	var clamped := clamp_count(float(count), max_count)
	var q := quote(troop, clamped)
	var cost: Array = []
	for id: String in Balance.data()["resourceIds"]:
		var amount := float(q["cost"][id])
		if amount <= 0.0:
			continue
		cost.append({"id": id, "amount": amount, "lacking": float(amounts.get(id, 0.0)) < amount})
	var job: Variant = null
	if training is Dictionary:
		var span := maxf(1.0, float(training["endsAt"]) - float(training["startedAt"]))
		job = {
			"troop": String(training["troop"]),
			"count": int(training["count"]),
			"remaining_ms": maxf(0.0, float(training["endsAt"]) - now_ms),
			"fraction": clampf((now_ms - float(training["startedAt"])) / span, 0.0, 1.0),
		}
	return {
		"troop": troop,
		"count": clamped,
		"max": max_count,
		"reason": check(barracks, training != null, troop, float(clamped), amounts),
		"cost": cost,
		"duration_ms": q["duration_ms"],
		"home": troop_list(troops, lang),
		"wounded": troop_list(wounded, lang),
		"job": job,
		"help": can_help and HelpModel.helpable_job(training, now_ms) != null,
	}

