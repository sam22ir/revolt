class_name ReportsModel
extends RefCounted
## The battle reports as the Reports screen shows them: the merged list, one row per report, and one report's sections. It builds
## the same content as the Phaser panel (apps/client/src/ui/reports-panel.ts) and never the text: the screen does the words and
## the numbers. Reports are the server's dictionaries (MapMessages.is_report checks the shape).

## Keeps the newest `max_count` reports of `current` and `incoming`, one per id (the later copy wins), newest first; ties by id,
## newer first, the order the server keeps them in. Malformed entries are dropped.
static func merged(current: Array, incoming: Array, max_count: int) -> Array:
	var by_id := {}
	for r: Variant in current + incoming:
		if MapMessages.is_report(r):
			by_id[String(r["id"])] = r
	var list: Array = by_id.values()
	list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if a["at"] != b["at"]:
			return a["at"] > b["at"]
		return String(a["id"]) > String(b["id"]))
	return list.slice(0, max_count)

## One list row: `target_kind` is "" when the target was gone (the target line then says so).
static func row(report: Dictionary) -> Dictionary:
	var target: Dictionary = report["target"]
	return {
		"id": String(report["id"]),
		"result": String(report["result"]),
		"target_kind": _kind(target),
		"level": int(target["level"]),
		"at": int(report["at"]),
	}

## One report's sections. `gone` (the result is target_gone) leaves out the tables, heroes, loot and rounds, as the panel does.
## `mine` lists the troops sent (sent, survivors, wounded, lost); `theirs` the defenders (defenders, defeated); only troops with a
## non-zero count appear. `heroes` is empty unless the march had heroes. `loot` lists only the resources above zero.
static func detail(report: Dictionary) -> Dictionary:
	var target: Dictionary = report["target"]
	var out := {
		"id": String(report["id"]),
		"result": String(report["result"]),
		"at": int(report["at"]),
		"target_kind": _kind(target),
		"level": int(target["level"]),
		"x": int(target["x"]),
		"y": int(target["y"]),
		"gone": String(report["result"]) == "target_gone",
		"rounds": int(report["rounds"]),
		"mine": [],
		"theirs": [],
		"heroes": [],
		"loot": [],
	}
	if out["gone"]:
		return out
	var sent: Dictionary = report["sent"]
	var defenders: Dictionary = report["defenders"]
	for id: String in Balance.data()["troopIds"]:
		if int(sent.get(id, 0)) > 0:
			out["mine"].append({
				"troop": id,
				"sent": int(sent[id]),
				"survivors": int(report["survivors"].get(id, 0)),
				"wounded": int(report["wounded"].get(id, 0)),
				"lost": int(report["lost"].get(id, 0)),
			})
		if int(defenders.get(id, 0)) > 0:
			out["theirs"].append({
				"troop": id,
				"defenders": int(defenders[id]),
				"defeated": int(report["defendersKilled"].get(id, 0)),
			})
	var heroes: Variant = report.get("heroes")
	if heroes is Array:
		for h: Variant in heroes:
			out["heroes"].append(String(h))
	var loot: Dictionary = report["loot"]
	for id: String in Balance.data()["resourceIds"]:
		if int(loot.get(id, 0)) > 0:
			out["loot"].append({"id": id, "amount": int(loot[id])})
	return out

static func _kind(target: Dictionary) -> String:
	var kind: Variant = target.get("kind")
	return kind if kind is String else ""
