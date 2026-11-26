class_name HarvestModel
extends RefCounted
## The harvest sheet's numbers (docs/resource-sites-plan.md, chunk 4), as the server's `harvestTiming`, `harvestedAt` and `checkHarvest`
## (packages/rules/src/sites.ts) work them out: the time to fill the carry at the site's rate, capped by the harvest window, the load the
## march brings home, the time away and why Send is off. Pure: the base, the site from the snapshot and the troops come in. The server
## decides every harvest; this only previews it.

const HOUR_MS := 3600000

## Yield per hour of a site kind at a level, from the exported `sites.ratePerHour`; 0 for an unknown one.
static func rate_per_hour(kind: String, level: int) -> int:
	var rates: Dictionary = Balance.data()["sites"]["ratePerHour"]
	return int(rates.get(kind, {}).get(str(level), 0))

## The longest a march stays at a site (`maxHarvestMs`): longer in a contested zone.
static func max_ms(in_zone := false) -> int:
	var sites: Dictionary = Balance.data()["sites"]
	return int(sites["zoneMaxHarvestMs"] if in_zone else sites["maxHarvestMs"])

## Whether a snapshot site is in a contested zone.
static func in_zone(site: Dictionary) -> bool:
	return site.get("zone") != null

## The troops' carry from this site (`harvestCarry`): a zone's sites let them carry more.
static func site_carry(troops: Dictionary, site: Dictionary) -> int:
	return MarchModel.carry(troops) * (int(Balance.data()["sites"]["zoneCarryMultiplier"]) if in_zone(site) else 1)

## Whole milliseconds to fill `carry` at the site's rate, rounded up as the server does, then capped at the harvest window. 0 for no carry.
static func fill_ms(carry: int, kind: String, level: int, zone := false) -> int:
	var rate := rate_per_hour(kind, level)
	if carry <= 0 or rate <= 0:
		return 0
	return mini(int(ceil(float(carry) * HOUR_MS / float(rate))), max_ms(zone))

## What the march brings home when it leaves: the rate over the time it stayed, capped by the carry (`harvestedAt` at the leave time).
static func expected_load(carry: int, kind: String, level: int, zone := false) -> int:
	var elapsed := fill_ms(carry, kind, level, zone)
	return mini(carry, rate_per_hour(kind, level) * elapsed / HOUR_MS)

## "" when the harvest may go, else the reason in the server's order (`checkHarvest`): no_such_site, site_taken (by any march row, the
## viewer's own included), then the troop checks of a march (`MarchModel.check`: no_troops for porters only, not_enough_troops,
## too_many_marches, which counts harvest marches too).
static func check(state: Dictionary, troops: Dictionary, site: Dictionary) -> String:
	if site.is_empty():
		return "no_such_site"
	if SitesModel.state_of(site) != "free" or _holds_site(state.get("marches", []), String(site["id"])):
		return "site_taken"
	return MarchModel.check(state, troops, null)

static func _holds_site(marches: Array, site_id: String) -> bool:
	for m: Dictionary in marches:
		if String(m.get("siteId", "")) == site_id:
			return true
	return false

## What the sheet shows for the troops picked: {"travel_ms" (-1 for none), "carry", "reason", "rate" (per hour), "fill_ms", "load"
## (expected), "away_ms" (total, out and home; -1 for none)}.
static func preview(state: Dictionary, from: Vector2i, site: Dictionary, troops: Dictionary) -> Dictionary:
	var carry := site_carry(troops, site)
	var kind := String(site.get("kind", ""))
	var level := int(site.get("level", 0))
	var zone := in_zone(site)
	var travel := -1
	if not site.is_empty():
		travel = MarchModel.travel_ms(from.x, from.y, float(site["x"]), float(site["y"]), troops)
	var fill := fill_ms(carry, kind, level, zone)
	return {
		"travel_ms": travel, "carry": carry, "reason": check(state, troops, site),
		"rate": rate_per_hour(kind, level), "fill_ms": fill, "load": expected_load(carry, kind, level, zone),
		"away_ms": 2 * travel + fill if travel >= 0 else -1,
	}
