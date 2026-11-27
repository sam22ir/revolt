class_name MissionsModel
extends RefCounted
## What the Missions page shows, from the server's MissionsView (GET /v1/missions): the current beginner quest, today's daily missions
## and how many can be claimed (the entry button's dot). Pure: no nodes, no translation. The server decides progress and payouts.

const RESOURCE_IDS: Array[String] = ["food", "materiel", "funds", "support"]

## Shape check for an untrusted reply.
static func is_view(v: Variant) -> bool:
	return v is Dictionary and v.get("daily") is Array and v.has("now") and (v.get("quest") == null or v.get("quest") is Dictionary)

## "claim" (done, not yet claimed), "claimed", or "progress".
static func row_state(m: Dictionary) -> String:
	if bool(m.get("claimed", false)):
		return "claimed"
	return "claim" if bool(m.get("done", false)) else "progress"

## How many rewards wait for a tap: daily missions done and not claimed, and the current quest if its goal is met.
static func claimable(view: Dictionary) -> int:
	if not is_view(view):
		return 0
	var n := 0
	for m: Variant in view["daily"]:
		if m is Dictionary and row_state(m) == "claim":
			n += 1
	var q: Variant = view.get("quest")
	if q is Dictionary and bool(q.get("done", false)):
		n += 1
	return n

## A mission or quest as a row: its id, its text key and the values its text needs, the progress, the share done (0..1), the state.
## Daily missions always say their target as `count`; a quest says its goal's number, and its building for a building goal.
static func row(m: Dictionary, prefix: String) -> Dictionary:
	var target := maxi(1, int(m.get("target", 1)))
	var progress := clampi(int(m.get("progress", 0)), 0, target)
	var vars := {"count": target}
	var goal: Variant = m.get("goal")
	if goal is Dictionary and goal.get("kind") == "building_level":
		vars["building"] = String(goal.get("building", ""))
	return {
		"id": String(m.get("id", "")),
		"key": "%s.%s" % [prefix, m.get("id", "")],
		"vars": vars,
		"progress": progress,
		"target": target,
		"fraction": float(progress) / float(target),
		"state": "claim" if prefix == "quest" and bool(m.get("done", false)) else row_state(m),
	}

static func daily_rows(view: Dictionary) -> Array:
	if not is_view(view):
		return []
	return (view["daily"] as Array).filter(func(m: Variant) -> bool: return m is Dictionary).map(func(m: Dictionary) -> Dictionary: return row(m, "mission"))

## The current quest's row with its place in the chain, or {} once the chain is finished (or before the server has said).
static func quest_row(view: Dictionary) -> Dictionary:
	if not is_view(view) or not view.get("quest") is Dictionary:
		return {}
	var q: Dictionary = view["quest"]
	var r := row(q, "quest")
	r["step"] = int(q.get("step", 1))
	r["steps"] = int(q.get("steps", 1))
	return r

## A reward as chips, in a fixed order: resources by id, then hero shards, speed-up tokens and pass XP. Each is {"kind", "id", "amount"}.
static func reward_items(reward: Variant, pass_xp := 0) -> Array:
	var items: Array = []
	if reward is Dictionary:
		var res: Variant = reward.get("resources")
		if res is Dictionary:
			for id in RESOURCE_IDS:
				var n := int(res.get(id, 0))
				if n > 0:
					items.append({"kind": "resource", "id": id, "amount": n})
		if int(reward.get("shards", 0)) > 0:
			items.append({"kind": "shards", "id": "heroes", "amount": int(reward["shards"])})
		if int(reward.get("speedupTokens", 0)) > 0:
			items.append({"kind": "tokens", "id": "clock", "amount": int(reward["speedupTokens"])})
	if pass_xp > 0:
		items.append({"kind": "pass_xp", "id": "power", "amount": pass_xp})
	return items

## Milliseconds until the daily reset, never below 0.
static func reset_in(view: Dictionary, now: int) -> int:
	return maxi(0, int(view.get("resetsAt", now)) - now) if is_view(view) else 0
