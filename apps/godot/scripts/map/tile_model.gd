class_name TileModel
extends RefCounted
## What a tapped tile holds and what the tile panel shows about it, as `tileInfo` (apps/client/src/state/tile-info.ts) says (golden cases
## in data/tile-fixtures.json; the terrain of an empty tile is the map's own). Pure: the snapshot and the terrain come in.

## What the exact tile (x, y) holds: {"kind": "own"|"camp"|"hq"|"npc"|"site"|"empty", "terrain", and "base", "hq", "npc" or "site" (the
## snapshot's entry) with "def" (the exported level table row, or null for a level the table does not know)}. Precedence on one tile: a
## base, then an HQ, then a target, then a resource site (sites are never on a base's, HQ's or target's tile in a live world, but the
## order is the rule). A site is not in tileInfo (the Phaser client has none), so its kind is Godot-only.
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
	var site := SitesModel.site_at(snapshot, x, y)
	if not site.is_empty():
		return {"kind": "site", "site": site, "terrain": terrain}
	return {"kind": "empty", "terrain": terrain}

## The exported table row for a target level (`npcLevel` in the rules), or null.
static func npc_def(level: int) -> Variant:
	for row: Dictionary in Balance.data()["npcLevels"]:
		if int(row["level"]) == level:
			return row
	return null

## What the panel draws for `info` at (x, y): {"title": String, "level": int (-1 for none), "coords": String, "desc": String,
## "defenders": Dictionary or null, "rally_only": bool, "can_march": bool (a target that is not rally-only; one whose level the table does not know can be sent at, as in the Phaser panel), "alliance_name": String,
## "lines": Array of String (a site's resource, rate and holder), "harvest_action": "" | "harvest" (free site) | "recall" (your march is at it), "recall_march": the march id to recall}.
## `alliance_name` is the player's own alliance's name for their own HQ, else "". Player text (an alliance's name) never goes through a translation template: it is appended after.
## `marches` and `now` (the viewer's marches and the synced clock, ms) decide a site's Recall button; a site needs neither otherwise.
static func view(info: Dictionary, x: int, y: int, own_alliance_name: String, marches: Array = [], now := 0.0) -> Dictionary:
	var lang := Fmt.lang()
	var out := {
		"title": "", "level": -1, "coords": Loc.t("map.coords", {"x": Fmt.amount(lang, x), "y": Fmt.amount(lang, y)}),
		"desc": "", "defenders": null, "rally_only": false, "can_march": false, "alliance_name": "",
		"lines": [], "harvest_action": "", "recall_march": "",
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
		"site":
			_site_view(out, info["site"], marches, now)
		_:
			out["title"] = Loc.t("terrain." + String(info["terrain"]))
			out["desc"] = Loc.t("map.nothingHere")
	return out

## A site's panel: its name and level, what it yields and at what rate, and who holds it. "mine" (the viewer's march is on it, or the
## snapshot says so) offers Recall only while that march is at the site; "free" offers Harvest; "taken" offers nothing.
static func _site_view(out: Dictionary, site: Dictionary, marches: Array, now: float) -> void:
	var lang := Fmt.lang()
	var kind := String(site["kind"])
	var level := int(site["level"])
	var holder := site_holder(site, marches, now)
	out["title"] = Loc.t("site.%s.name" % kind)
	out["level"] = level
	out["lines"] = [
		Loc.t("harvest.resourceLine", {"resource": Loc.t("resource." + SitesModel.kind_resource(kind))}),
		Loc.t("harvest.rateLine", {"rate": Fmt.amount(lang, HarvestModel.rate_per_hour(kind, level))}),
		Loc.t("harvest.mine" if holder == "mine" else ("harvest.taken" if holder == "taken" else "harvest.free")),
	]
	if holder == "mine":
		var march := recall_march(site, marches, now)
		if march != "":
			out["harvest_action"] = "recall"
			out["recall_march"] = march
	elif holder == "free":
		out["harvest_action"] = "harvest"

## Who holds a site for the viewer: "mine" when one of the viewer's marches on it has not yet come home (the base can still list one that
## has, until its next refresh) or the snapshot says so, else "taken" or "free" as the snapshot says.
static func site_holder(site: Dictionary, marches: Array, now: float) -> String:
	for m: Dictionary in marches:
		if String(m.get("siteId", "")) == String(site["id"]) and now < float(m["returnAt"]):
			return "mine"
	return SitesModel.state_of(site)

## The id of the viewer's march on this site that is at it now and can still be called home (its leave is not yet due), or "".
static func recall_march(site: Dictionary, marches: Array, now: float) -> String:
	for m: Dictionary in marches:
		if String(m.get("siteId", "")) == String(site["id"]) and MarchesModel.stage(m, now) == "at_site" and now < MarchesModel.leave_at(m):
			return String(m["id"])
	return ""

## "Camp ABCD" or "ABCD, alliance Name": the tag and the name are placed by marker substitution done in one pass over the template, so
## a name that looks like a placeholder stays literal.
static func _camp_title(tag: String, alliance: Variant) -> String:
	if alliance == null or String(alliance) == "":
		return Loc.t("map.camp", {"tag": tag})
	var template := Loc.t("map.campAlliance", {"tag": "\u0001T\u0001", "alliance": "\u0001A\u0001"})
	return template.replace("\u0001T\u0001", tag).replace("\u0001A\u0001", String(alliance))

## Whether a member of `rank` may place or move the alliance HQ (`canPerform(rank, "set_hq")`; "" for no alliance: no).
static func can_place_hq(rank: String) -> bool:
	return (Balance.data()["hqRanks"] as Array).has(rank)

## The button's text key on empty land: "map.moveHq" once the alliance has an HQ (the snapshot lists it with mine), else "map.placeHq".
static func hq_button_key(snapshot: Dictionary) -> String:
	for h: Dictionary in snapshot.get("hqs", []):
		if h["mine"]:
			return "map.moveHq"
	return "map.placeHq"
