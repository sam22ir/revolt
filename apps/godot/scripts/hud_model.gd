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

## {"visible", "busy", "building", "level", "remainingMs"}: idle builders are shown on the base ("tap a building") and hidden
## on the map; a running upgrade is shown on both. `queue` is the running upgrade or null.
static func pill(queue: Variant, now_ms: int, screen: String) -> Dictionary:
	if queue == null:
		return {"visible": screen == "base", "busy": false, "building": "", "level": 0, "remainingMs": 0}
	return {
		"visible": true,
		"busy": true,
		"building": String(queue["building"]),
		"level": int(queue["toLevel"]),
		"remainingMs": maxi(0, int(queue["endsAt"]) - now_ms),
	}
