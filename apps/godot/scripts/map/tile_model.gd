class_name TileModel
extends RefCounted
## What a tapped tile holds and what the tile panel shows about it, as `tileInfo` (apps/client/src/state/tile-info.ts) says (golden cases
## in data/tile-fixtures.json; the terrain of an empty tile is the map's own). Pure: the snapshot and the terrain come in.

## What the exact tile (x, y) holds: {"kind": "own"|"camp"|"hq"|"npc"|"empty", "terrain", and "base", "hq" or "npc" (the snapshot's
## entry) with "def" (the exported level table row, or null for a level the table does not know)}. Precedence on one tile: a base,
## then an HQ, then a target.
static func info(snapshot: Dictionary, x: int, y: int, terrain: String) -> Dictionary:
	for b: Dictionary in snapshot["bases"]:
		if int(b["x"]) == x and int(b["y"]) == y:
			return {"kind": "own" if b["mine"] else "camp", "base": b, "terrain": terrain}
	for h: Dictionary in snapshot["hqs"]:
		if int(h["x"]) == x and int(h["y"]) == y:
			return {"kind": "hq", "hq": h, "terrain": terrain}
	for n: Dictionary in snapshot["npcs"]:
		if int(n["x"]) == x and int(n["y"]) == y:
			return {"kind": "npc", "npc": n, "def": npc_def(int(n["level"])), "terrain": terrain}
	return {"kind": "empty", "terrain": terrain}

## The exported table row for a target level (`npcLevel` in the rules), or null.
static func npc_def(level: int) -> Variant:
	for row: Dictionary in Balance.data()["npcLevels"]:
		if int(row["level"]) == level:
			return row
	return null

## What the panel draws for `info` at (x, y): {"title": String, "level": int (-1 for none), "coords": String, "desc": String,
## "defenders": Dictionary or null, "rally_only": bool, "can_march": bool (a target that is not rally-only; one whose level the table does not know can be sent at, as in the Phaser panel), "alliance_name": String}. `alliance_name` is the player's own alliance's name
## for their own HQ, else "". Player text (an alliance's name) never goes through a translation template: it is appended after.
static func view(info: Dictionary, x: int, y: int, own_alliance_name: String) -> Dictionary:
	var lang := Fmt.lang()
	var out := {
		"title": "", "level": -1, "coords": Loc.t("map.coords", {"x": Fmt.amount(lang, x), "y": Fmt.amount(lang, y)}),
		"desc": "", "defenders": null, "rally_only": false, "can_march": false, "alliance_name": "",
	}
	match info["kind"]:
		"own":
			out["title"] = Loc.t("map.ownCamp")
			out["desc"] = Loc.t("map.ownCampDesc")
		"camp":
			var b: Dictionary = info["base"]
			out["title"] = _camp_title(String(b["tag"]), b.get("alliance"))
			out["desc"] = Loc.t("map.campDesc")
		"hq":
			var h: Dictionary = info["hq"]
			out["title"] = Loc.t("map.hq", {"tag": String(h["tag"])})
			out["desc"] = Loc.t("map.hqOwnDesc" if h["mine"] else "map.hqDesc")
			if h["mine"]:
				out["alliance_name"] = own_alliance_name
		"npc":
			var n: Dictionary = info["npc"]
			out["title"] = Loc.t("npc.%s.name" % n["kind"])
			out["level"] = int(n["level"])
			out["desc"] = Loc.t("npc.%s.desc" % n["kind"])
			if info["def"] != null:
				out["defenders"] = info["def"]["defenders"]
				out["rally_only"] = bool(info["def"]["rallyOnly"])
			out["can_march"] = not out["rally_only"]
		_:
			out["title"] = Loc.t("terrain." + String(info["terrain"]))
			out["desc"] = Loc.t("map.nothingHere")
	return out

## "Camp ABCD" or "ABCD, alliance Name": the tag and the name are placed by marker substitution done in one pass over the template, so
## a name that looks like a placeholder stays literal.
static func _camp_title(tag: String, alliance: Variant) -> String:
	if alliance == null or String(alliance) == "":
		return Loc.t("map.camp", {"tag": tag})
	var template := Loc.t("map.campAlliance", {"tag": "\u0001T\u0001", "alliance": "\u0001A\u0001"})
	return template.replace("\u0001T\u0001", tag).replace("\u0001A\u0001", String(alliance))
