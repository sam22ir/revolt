class_name BuildingPanelModel
extends RefCounted
## What the building panel shows for one building, as plain data (ui/building-panel.ts): level, production, and either the
## running upgrade (countdown, progress), the next level (cost with the lacking resources marked, time, production, the
## upgrade check) or the maximum-level note. Pure: the panel Controls only render it, and tests read it directly.
## `resources` are the amounts accrued to now (see UpgradeView), `queue` the running upgrade or null.

## {"id", "level", "hq", "production": {"resource", "perHour"} | null, "storage": int | null, "mode": "upgrading" | "next" | "max",
##  "job": {"toLevel", "remainingMs", "fraction"} | null,
##  "next": {"toLevel", "cost": [{"id", "amount", "lacking"}], "durationMs", "production": perHour | null, "storage": int | null,
##           "ok", "reason"} | null,
##  "key": String}
## `key` changes exactly when the panel's structure has to be rebuilt; the countdown and the bar are updated without a rebuild.
static func build(id: String, levels: Dictionary, resources: Dictionary, queue: Variant, now_ms: int) -> Dictionary:
	var level := int(levels[id])
	var def: Dictionary = Balance.data()["buildings"][id]
	var produces: Variant = def["produces"]
	var model := {
		"id": id,
		"level": level,
		"hq": int(levels["hq"]),
		"production": null,
		"storage": null,
		"mode": "next",
		"job": null,
		"next": null,
	}
	if produces != null:
		model["production"] = {"resource": produces, "perHour": rate_at(id, level)}
	if id == "hq":
		model["storage"] = int(Balance.storage_cap(level)["food"])
	var check := UpgradeView.check(levels, resources, queue, id)
	if queue != null and queue["building"] == id:
		var started := int(queue["startedAt"])
		var ends := int(queue["endsAt"])
		model["mode"] = "upgrading"
		model["job"] = {
			"toLevel": int(queue["toLevel"]),
			"remainingMs": maxi(0, ends - now_ms),
			"fraction": clampf(float(now_ms - started) / float(maxi(1, ends - started)), 0.0, 1.0),
		}
	elif not check.has("toLevel"):
		model["mode"] = "max"
	else:
		var cost: Array = []
		for r: String in Balance.data()["resourceIds"]:
			var amount := float(check["cost"].get(r, 0))
			if amount > 0.0:
				cost.append({"id": r, "amount": amount, "lacking": float(resources.get(r, 0.0)) < amount})
		model["next"] = {
			"toLevel": int(check["toLevel"]),
			"cost": cost,
			"durationMs": int(check["durationMs"]),
			"production": rate_at(id, int(check["toLevel"])) if produces != null else null,
			"storage": int(Balance.storage_cap(int(check["toLevel"]))["food"]) if id == "hq" else null,
			"ok": bool(check["ok"]),
			"reason": String(check.get("reason", "")),
		}
	model["key"] = _key(model)
	return model

static func rate_at(id: String, level: int) -> float:
	return float(Balance.level_row(Balance.data()["buildings"][id]["levels"], level)["ratePerHour"])

static func _key(m: Dictionary) -> String:
	var parts: Array = [m["id"], m["level"], m["hq"], m["mode"]]
	if m["job"] != null:
		parts.append(m["job"]["toLevel"])
	if m["next"] != null:
		parts.append(m["next"]["ok"])
		parts.append(m["next"]["reason"])
		for c: Dictionary in m["next"]["cost"]:
			parts.append(c["lacking"])
	return "|".join(parts.map(func(p: Variant) -> String: return str(p)))
