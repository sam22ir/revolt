class_name RallyModel
extends RefCounted
## The rules the rally buttons and the alliance's Rallies tab follow, as the Phaser client has them (`canJoinRally` in
## ui/alliance-rallies.ts, `rallyTiming` in rules/rally.ts, `canPerform(rank, "start_rally")`; golden cases in data/rallies-fixtures.json).
## The rally speed, the gathering times and the ranks that may start one come from the exported balance data. The server decides.

static func data() -> Dictionary:
	return Balance.data()["rally"]

## The gathering times a rally can be started with, in ms.
static func gather_options() -> Array:
	return data()["gatherOptionsMs"]

## Whether a member of `rank` may start a rally ("" for no alliance: no).
static func can_start(rank: String) -> bool:
	return (data()["startRanks"] as Array).has(rank)

## A rally can be joined while it gathers, has room, and the viewer is not in it.
static func can_join(r: Dictionary, now: float) -> bool:
	return not bool(r["joined"]) and now < float(r["gatherUntil"]) and int(r["participants"]) < int(r["maxParticipants"])

## The open rallies at a target (by its NPC id) the viewer can still join, in the snapshot's order.
static func open_at(rallies: Array, npc_id: String, now: float) -> Array:
	return rallies.filter(func(r: Dictionary) -> bool: return String(r["target"]["npcId"]) == npc_id and can_join(r, now))

## One-way leg of a rally started from a camp at (fx, fy) at a target at (tx, ty): the fixed rally speed whatever troops are in it, at
## least a second, in 64-bit floats and the rules' order.
static func leg_ms(fx: float, fy: float, tx: float, ty: float) -> int:
	var dx := fx - tx
	var dy := fy - ty
	return maxi(1000, int(ceil((sqrt(dx * dx + dy * dy) / float(data()["speed"])) * 60000.0)))

## What a Rallies row needs to rebuild when it changes (a Join button must not outlive the gathering): id, joined, participants,
## whether it still gathers and whether it can be joined.
static func row_key(r: Dictionary, now: float) -> String:
	return "%s:%d:%d:%d:%d" % [r["id"], int(bool(r["joined"])), int(r["participants"]), int(now < float(r["gatherUntil"])), int(can_join(r, now))]

## A join sheet's target, as the march sheet takes it (the snapshot's NPC entry shape), from a rally's target.
static func npc_of(r: Dictionary) -> Dictionary:
	var t: Dictionary = r["target"]
	return {"id": t["npcId"], "kind": t["kind"], "level": t["level"], "x": t["x"], "y": t["y"], "region": null}
