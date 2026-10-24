class_name UpgradeView
extends RefCounted
## What the base screen shows about the next upgrade of a building: cost, time, and why it is blocked. Display only (the
## server decides, see Session.send_intent). Mirrors nextLevelQuote / checkUpgrade in packages/rules/src/upgrade.ts;
## test_upgrade_fixtures.gd checks every case of data/upgrade-fixtures.json against the real rules.
##
## Call it with the amounts accrued up to now (ResourceDisplay.amounts), not the stored ones: the client shows what the
## counters show, otherwise the button stays blocked as "insufficient" while the counters above it read enough.

## Block reasons, the keys `reason.<code>` in the locales.
const REASONS: Array[String] = ["queue_busy", "max_level", "hq_gate", "insufficient"]

## {"toLevel", "cost", "durationMs"} for the level after `level`, or null at the maximum.
static func quote(building: String, level: int) -> Variant:
	var data := Balance.data()
	var to_level := level + 1
	var rows: Array = data["buildings"][building]["levels"]
	if to_level > int(data["maxBuildingLevel"]) or to_level > rows.size():
		return null
	var row: Dictionary = rows[to_level - 1]
	return {"toLevel": to_level, "cost": row["cost"], "durationMs": int(row["durationSec"]) * 1000}

static func can_afford(resources: Dictionary, cost: Dictionary) -> bool:
	for id: String in cost:
		if float(resources.get(id, 0.0)) < float(cost[id]):
			return false
	return true

## {"ok": true, ...quote} or {"ok": false, "reason": String, ...quote}; the quote is left out at the maximum level.
## `queue` is the running upgrade ({building, toLevel, startedAt, endsAt}) or null.
static func check(levels: Dictionary, resources: Dictionary, queue: Variant, building: String) -> Dictionary:
	var q: Variant = quote(building, int(levels[building]))
	if q == null:
		return {"ok": false, "reason": "max_level"}
	var out: Dictionary = (q as Dictionary).duplicate()
	if queue != null:
		out["ok"] = false
		out["reason"] = "queue_busy"
	elif building != "hq" and int(out["toLevel"]) > int(levels["hq"]):
		# Gated by the HQ's current level, not one it may be upgrading to.
		out["ok"] = false
		out["reason"] = "hq_gate"
	elif not can_afford(resources, out["cost"]):
		out["ok"] = false
		out["reason"] = "insufficient"
	else:
		out["ok"] = true
	return out
