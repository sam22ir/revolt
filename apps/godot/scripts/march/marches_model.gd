class_name MarchesModel
extends RefCounted
## Where each march is and what the list says about it, as `marchStage` (ui/marches-list.ts) and `marchPosition` (scene/world-layout.ts)
## work it out from the timestamps alone (golden cases in data/marches-fixtures.json). Pure functions of (march, now): nothing ticks.

## How long the battle marker shows at the target after a column arrives (Phaser's BATTLE_FLASH_MS).
const BATTLE_FLASH_MS := 5000

## A harvest march holds a resource site (`siteId`, docs/resource-sites-plan.md): no battle, its own stages and no result text.
static func is_harvest(m: Dictionary) -> bool:
	return String(m.get("siteId", "")) != ""

## When a harvest leaves its site: `leaveSiteAt` from the map snapshot. The base's own march list has none, so it falls back to
## returnAt minus the travel leg (arriveAt - departAt), which is exact: the leg is the same both ways and a recall sets returnAt = now + leg.
static func leave_at(m: Dictionary) -> float:
	if WireCheck.is_num(m.get("leaveSiteAt")):
		return float(m["leaveSiteAt"])
	return float(m["returnAt"]) - (float(m["arriveAt"]) - float(m["departAt"]))

## "gathering" (a rally's march before its departure), "outbound", "fighting" (arrived, no result yet) or "returning" (has a result).
## A harvest is "outbound", then "at_site" until it leaves, then "returning" whatever its outcome says.
static func stage(m: Dictionary, now: float) -> String:
	if is_harvest(m):
		if now < float(m["arriveAt"]):
			return "outbound"
		return "at_site" if now < leave_at(m) else "returning"
	if m.get("outcome") != null:
		return "returning"
	if m.get("rallyId") != null and now < float(m["departAt"]):
		return "gathering"
	return "outbound" if now < float(m["arriveAt"]) else "fighting"

static func _fraction(from: float, to: float, now: float) -> float:
	if to <= from:
		return 1.0
	return minf(1.0, maxf(0.0, (now - from) / (to - from)))

## {"leg": "outbound"|"at_site"|"returning"|"done", "x", "y"}: the column's tile coordinates (tile middles are +0.5) for a march with
## from, to, departAt, arriveAt and returnAt. Out until arriveAt, back until returnAt, then gone (at its start). A harvest waits at its
## site ("at_site", on the site tile) from arriveAt to leaveSiteAt, and walks back from there.
static func position(m: Dictionary, now: float) -> Dictionary:
	var fx := float(m["from"]["x"])
	var fy := float(m["from"]["y"])
	var tx := float(m["to"]["x"])
	var ty := float(m["to"]["y"])
	if now >= float(m["returnAt"]):
		return {"leg": "done", "x": fx, "y": fy}
	if now < float(m["arriveAt"]):
		var f := _fraction(float(m["departAt"]), float(m["arriveAt"]), now)
		return {"leg": "outbound", "x": fx + (tx - fx) * f, "y": fy + (ty - fy) * f}
	var back_from := float(m["arriveAt"])
	if is_harvest(m):
		back_from = leave_at(m)
		if now < back_from:
			return {"leg": "at_site", "x": tx, "y": ty}
	var g := _fraction(back_from, float(m["returnAt"]), now)
	return {"leg": "returning", "x": tx + (fx - tx) * g, "y": ty + (fy - ty) * g}

## Whether the fight marker shows at the target now. A harvest is no fight.
static func battle_flash(m: Dictionary, now: float) -> bool:
	if is_harvest(m):
		return false
	return now >= float(m["arriveAt"]) and now < float(m["arriveAt"]) + BATTLE_FLASH_MS

## The list's rows for the base's own marches, without one that is already home (`now` is past its return: the server brings a march home
## lazily, so the base the client holds can still list it; Phaser advances the state itself, a thin client just leaves it out): {id, kind ("" when the level is unknown; a site kind for a harvest), level, heroes (ids, lead first), stage,
## result ("" until the battle, always "" for a harvest), time_key ("" for fighting), ms (to departure, arrival, leaving the site or return),
## harvest (bool), resource (the id a harvest brings in, "" otherwise)}.
static func rows(marches: Array, now: float) -> Array:
	var out: Array = []
	for m: Dictionary in marches:
		if now >= float(m["returnAt"]):
			continue
		var st := stage(m, now)
		if is_harvest(m):
			out.append(_harvest_row(m, st, now))
			continue
		var def: Variant = TileModel.npc_def(int(m["target"]["level"]))
		var heroes: Array = []
		if m.get("heroes") is Dictionary:
			heroes.append(String(m["heroes"]["lead"]))
			for d: Variant in m["heroes"].get("deputies", []):
				heroes.append(String(d))
		var time_key := ""
		var ms := 0.0
		match st:
			"gathering":
				time_key = "march.departsIn"
				ms = float(m["departAt"]) - now
			"outbound":
				time_key = "march.arrivesIn"
				ms = float(m["arriveAt"]) - now
			"returning":
				time_key = "march.returnsIn"
				ms = float(m["returnAt"]) - now
		out.append({
			"id": String(m["id"]), "kind": String(def["kind"]) if def != null else "", "level": int(m["target"]["level"]),
			"heroes": heroes, "stage": st,
			"result": String(m["outcome"]["result"]) if m.get("outcome") is Dictionary else "",
			"time_key": time_key, "ms": ms, "harvest": false, "resource": "",
		})
	return out

## A harvest's row: the site's kind (its name is the title), the resource it brings, no result and no hero line.
static func _harvest_row(m: Dictionary, st: String, now: float) -> Dictionary:
	var kind := String(m["siteId"]).get_slice(":", 0)
	var time_key := ""
	var ms := 0.0
	match st:
		"outbound":
			time_key = "march.arrivesIn"
			ms = float(m["arriveAt"]) - now
		"at_site":
			time_key = "march.leavesSiteIn"
			ms = leave_at(m) - now
		_:
			time_key = "march.returnsIn"
			ms = float(m["returnAt"]) - now
	return {
		"id": String(m["id"]), "kind": kind, "level": 0, "heroes": [], "stage": st, "result": "",
		"time_key": time_key, "ms": ms, "harvest": true, "resource": SitesModel.kind_resource(kind),
	}
