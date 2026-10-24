class_name AllianceModel
extends RefCounted
## What the alliance screen shows and when, as plain functions of the session's data (the server decides every rule; this only
## reads what it said). Unread chat follows alliance-store.ts: a line counts when its id is above the last one seen and it is not
## the player's own; the first history of a room, and every line while the chat is on screen, count as seen.

const NAME_MAX := 24
const TAG_MAX := 4
const CHAT_MAX := 300
## The server answers 5 lines per 10 s with `rate_limited`; the client does not count (alliance-store.ts neither).
const SEARCH_DEBOUNCE_S := 0.3

## The player's handle in the alliance view (the member marked `me`), or "".
static func my_handle(alliance: Variant) -> String:
	if not alliance is Dictionary:
		return ""
	for m: Variant in alliance.get("members", []):
		if m is Dictionary and m.get("me", false):
			return String(m.get("handle", ""))
	return ""

## The alliance id, or "" without an alliance.
static func alliance_id(alliance: Variant) -> String:
	return String(alliance.get("id", "")) if alliance is Dictionary else ""

## The highest chat line id, 0 for an empty chat.
static func top_id(chat: Array) -> int:
	var top := 0
	for line: Dictionary in chat:
		top = maxi(top, int(line["id"]))
	return top

## Lines above `seen` that someone else wrote.
static func unread(chat: Array, seen: int, me: String) -> int:
	var n := 0
	for line: Dictionary in chat:
		if int(line["id"]) > seen and String(line["handle"]) != me:
			n += 1
	return n

## The search results as rows: the list item, the member-count text vars, and whether Join is offered.
static func search_rows(list: Array) -> Array:
	var rows: Array = []
	for item: Variant in list:
		if not item is Dictionary:
			continue
		var members := int(item.get("members", 0))
		var cap := int(item.get("maxMembers", 0))
		rows.append({
			"id": String(item.get("id", "")), "name": String(item.get("name", "")), "tag": String(item.get("tag", "")),
			"count_vars": {"count": members, "max": cap}, "can_join": members < cap,
		})
	return rows

## Leaving: `{"kind": "blocked", "reason"}` for a leader with other members (a leader must hand over first, which is the members tab
## and not built yet), otherwise `{"kind": "confirm", "key"}` with the question's key (the last member disbands).
static func leave_plan(alliance: Dictionary) -> Dictionary:
	var count := (alliance.get("members", []) as Array).size()
	if String(alliance.get("myRank", "")) == "leader":
		if count > 1:
			return {"kind": "blocked", "reason": "leader_must_transfer"}
		return {"kind": "confirm", "key": "alliance.confirmDisband"}
	return {"kind": "confirm", "key": "alliance.confirmLeave"}

## A chat line to send: trimmed, nothing for an empty line. The server checks the characters and the length.
static func chat_text(raw: String) -> String:
	return raw.strip_edges()

## The create form's values: the name trimmed, the tag trimmed and upper-cased (what the server stores). The server validates.
static func create_values(name_raw: String, tag_raw: String) -> Dictionary:
	return {"name": name_raw.strip_edges(), "tag": tag_raw.strip_edges().to_upper()}
