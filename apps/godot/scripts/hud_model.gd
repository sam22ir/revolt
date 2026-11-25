class_name HudModel
extends RefCounted
## What the HUD shows, as plain data (ui/hud.ts): a chip per resource with its bar, and the queue pill. Pure; the Controls
## only render it.

## Bar states, like the client's `near` (>= 90% of the cap) and `full` (at the cap).
const NEAR_FRACTION := 0.9

## [{"id", "amount", "cap", "fraction", "state": "normal" | "near" | "full"}] in resource order. `amounts` are the amounts
## accrued to now; each resource has its own cap (they can differ), and the fraction is clamped to 1 because an amount
## already above the cap is kept as it is.
static func chips(amounts: Dictionary, hq_level: int) -> Array:
	var caps := Balance.storage_cap(hq_level)
	var out := []
	for id: String in Balance.data()["resourceIds"]:
		var amount := float(amounts.get(id, 0.0))
		var cap := float(caps[id])
		var fraction := clampf(amount / cap, 0.0, 1.0) if cap > 0.0 else 0.0
		var state := "normal"
		if amount >= cap:
			state = "full"
		elif fraction >= NEAR_FRACTION:
			state = "near"
		out.append({"id": id, "amount": amount, "cap": cap, "fraction": fraction, "state": state})
	return out

## {"visible", "busy", "building", "level", "remainingMs", "fraction"} (how far the upgrade is, 0 to 1): idle builders are shown on the base ("tap a building") and hidden
## on the map; a running upgrade is shown on both. `queue` is the running upgrade or null.
## `help` is true when the help button shows: a running upgrade, and the player may ask (HelpModel.can_ask for "upgrade").
static func pill(queue: Variant, now_ms: int, screen: String, can_help := false) -> Dictionary:
	if queue == null:
		return {"visible": screen == "base", "busy": false, "building": "", "level": 0, "remainingMs": 0, "fraction": 0.0, "help": false}
	var started := int(queue.get("startedAt", queue["endsAt"]))
	var ends := int(queue["endsAt"])
	return {
		"visible": true,
		"busy": true,
		"building": String(queue["building"]),
		"level": int(queue["toLevel"]),
		"remainingMs": maxi(0, ends - now_ms),
		"fraction": 1.0 if ends <= started else clampf(float(now_ms - started) / float(ends - started), 0.0, 1.0),
		"help": can_help and HelpModel.helpable_job(queue, now_ms) != null,
	}

## The `+rate/h` of each resource at `now_ms` (the base's production with the server-wide liberation bonus).
static func rates(levels: Dictionary, liberations: Array, now_ms: int) -> Dictionary:
	return Balance.production_per_hour(levels, Balance.production_multiplier(liberations, now_ms))

## The player chip's power. The server has no power number yet, so the look test shows the troops at home (a stand-in).
static func power(troops: Variant) -> int:
	var total := 0
	if troops is Dictionary:
		for id: String in troops:
			total += maxi(0, int(troops[id]))
	return total

## Where the Base/Map switch goes from `screen`: the map from anywhere but the map, the base from the map.
static func switch_target(screen: String) -> String:
	return "base" if screen == "map" else "map"

## The one-dot attention mark on the Alliance button: unread chat, or a help request the player could answer.
static func alliance_dot(unread: int, open_help: int) -> bool:
	return unread > 0 or open_help > 0

## A short guest tag from the device's session token, so the token itself is never shown ("#A3F9C2"; "" without a token).
static func guest_tag(token: String) -> String:
	return "" if token == "" else "#" + token.sha256_text().substr(0, 6).to_upper()
