class_name CampTalk
extends RefCounted
## What someone in the camp says when tapped (docs/camp-life-plan.md, step 3): an everyday line of their kind, or every other
## time a hint at what the camp needs (full stores, food running low, idle builders, the wounded). Pure: the line depends only on
## who, the summary (CampSummary) and `pick`, which the caller counts up per tap so tapping again gives the next line.

## Who says which lines.
const POOL := {
	"worker": "worker", "drill": "drill", "wounded": "wounded", "sitting": "rest", "guard": "watch", "farmer": "fields",
	"pack": "carry", "crate": "carry", "mule": "carry",
}
## How many lines each pool has: camp.talk.<pool>.one, .two, ...
const COUNT := {"worker": 3, "drill": 3, "wounded": 3, "rest": 3, "watch": 2, "fields": 2, "carry": 3}
const NUMBERS: Array[String] = ["one", "two", "three"]

## Whether tapping this kind gives a line (tents, piles and the fire do not talk).
static func talks(kind: String) -> bool:
	return POOL.has(kind)

## {key, resource}: the i18n key, and for the full-stores hint the resource id to name ("" otherwise). {} for a kind that
## does not talk.
static func line(kind: String, summary: Dictionary, pick: int) -> Dictionary:
	if not talks(kind):
		return {}
	var tips := hints(summary)
	pick = absi(pick)
	if not tips.is_empty() and pick % 2 == 0:
		return tips[(pick / 2) % tips.size()]
	var pool: String = POOL[kind]
	return {"key": "camp.talk.%s.%s" % [pool, NUMBERS[pick % int(COUNT[pool])]], "resource": ""}

## The hints that apply now, most pressing first.
static func hints(summary: Dictionary) -> Array:
	var out := []
	var piles: Dictionary = summary.get("piles", {})
	for id: String in CampLayout.PILES:
		if piles.get(id, "") == "full":
			out.append({"key": "camp.talk.hint.full", "resource": id})
	if summary.get("food_low", false):
		out.append({"key": "camp.talk.hint.low", "resource": ""})
	if summary.has("upgrading") and String(summary["upgrading"]) == "":
		out.append({"key": "camp.talk.hint.idle", "resource": ""})
	if int(summary.get("wounded", 0)) > 0:
		out.append({"key": "camp.talk.hint.hurt", "resource": ""})
	return out
