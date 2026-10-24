class_name MapMessages
extends RefCounted
## One frame of the map socket (`GET /v1/map/ws`), as map-socket.ts parseMapMessage: a Dictionary with a `type` of
## "map" (`snapshot`), "report" (`report`) or "base_changed" (`now`), or null for anything malformed or unknown.

static func parse(text: String) -> Variant:
	var msg: Variant = WireCheck.parse_object(text)
	if msg == null:
		return null
	match msg.get("type"):
		"map":
			return {"type": "map", "snapshot": msg["snapshot"]} if _is_snapshot(msg.get("snapshot")) else null
		"report":
			return {"type": "report", "report": msg["report"]} if is_report(msg.get("report")) else null
		"base_changed":
			return {"type": "base_changed", "now": msg["now"]} if WireCheck.is_num(msg.get("now")) else null
	return null

static func _is_snapshot(v: Variant) -> bool:
	return v is Dictionary and WireCheck.is_num(v.get("size")) and WireCheck.is_num(v.get("terrainSeed")) \
		and WireCheck.is_num(v.get("now")) and v.get("bases") is Array and v.get("npcs") is Array and v.get("marches") is Array

## A battle report of the server (the fields the screens read); anything else is dropped.
static func is_report(v: Variant) -> bool:
	return v is Dictionary and WireCheck.is_str(v.get("id")) and WireCheck.is_num(v.get("at")) \
		and WireCheck.is_str(v.get("result")) and v.get("target") is Dictionary and WireCheck.is_num(v.get("rounds")) \
		and v.get("sent") is Dictionary and v.get("survivors") is Dictionary and v.get("wounded") is Dictionary \
		and v.get("lost") is Dictionary and v.get("defenders") is Dictionary and v.get("defendersKilled") is Dictionary \
		and v.get("loot") is Dictionary
