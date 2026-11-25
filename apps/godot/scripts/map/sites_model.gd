class_name SitesModel
extends RefCounted
## Resource sites on the map (docs/resource-sites-plan.md), read from the map snapshot's `sites` array, which the server has already
## resolved: {id ("farmland:0"), kind, level 1..3, x, y, occupied, mine}. Pure functions of the snapshot: nothing places a site or ticks.
## Tolerant: a snapshot without the array (an older server) gives no sites, and a malformed entry is skipped rather than drawn.

const LEVELS := [1, 2, 3]
const FALLBACK_RESOURCE := {"farmland": "food", "quarry": "materiel"}

## The well-formed sites of the snapshot, sorted by id so drawing is stable.
static func sites(snap: Dictionary) -> Array:
	var out: Array = []
	var raw: Variant = snap.get("sites", [])
	if not raw is Array:
		return out
	for s: Variant in raw:
		if _well_formed(s):
			out.append(s)
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return String(a["id"]) < String(b["id"]))
	return out

static func _well_formed(s: Variant) -> bool:
	if not s is Dictionary:
		return false
	if not (s.get("id") is String and s.get("kind") is String):
		return false
	if not (WireCheck.is_num(s.get("x")) and WireCheck.is_num(s.get("y")) and WireCheck.is_num(s.get("level"))):
		return false
	return int(s["level"]) in LEVELS and kind_resource(String(s["kind"])) != ""

## The site on tile (x, y), or {} when none stands there.
static func site_at(snap: Dictionary, x: int, y: int) -> Dictionary:
	for s: Dictionary in sites(snap):
		if int(s["x"]) == x and int(s["y"]) == y:
			return s
	return {}

## "mine" (the viewer's march holds it), "taken" (someone else's does) or "free".
static func state_of(site: Dictionary) -> String:
	if site.get("mine") == true:
		return "mine"
	return "taken" if site.get("occupied") == true else "free"

## The resource a kind yields, from the exported `sites.siteResource`; "" for an unknown kind.
static func kind_resource(kind: String) -> String:
	var table: Variant = Balance.data().get("sites", {}).get("siteResource", {})
	if table is Dictionary and table.has(kind):
		return String(table[kind])
	return String(FALLBACK_RESOURCE.get(kind, ""))

## The short text on the level badge: the same plain number the NPC badge shows.
static func label(site: Dictionary) -> String:
	return str(int(site["level"]))
