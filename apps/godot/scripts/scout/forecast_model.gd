class_name ForecastModel
extends RefCounted
## What the march sheet's forecast card says, from the server's ScoutView (POST /v1/scout): the verdict, then what the watchtower's
## level adds (expected losses, the chance of victory), and which level would show more. Pure: no nodes, no translation.

const VERDICTS: Array[String] = ["likely_victory", "close", "likely_defeat"]

## Shape check for an untrusted reply.
static func is_view(v: Variant) -> bool:
	if not v is Dictionary or not v.has("watchtower"):
		return false
	var f: Variant = v.get("forecast")
	return f == null or (f is Dictionary and VERDICTS.has(String(f.get("verdict", ""))))

## The lines to show, in order: [{"key", "vars", "tone"}]. `tone` is "good", "even", "bad" for the verdict and "" for the rest.
static func lines(view: Dictionary) -> Array:
	var f: Variant = view.get("forecast")
	if not f is Dictionary:
		return [{"key": "forecast.unavailable", "vars": {}, "tone": ""}]
	var verdict := String(f["verdict"])
	var out: Array = [{"key": "forecast." + verdict, "vars": {}, "tone": {"likely_victory": "good", "close": "even", "likely_defeat": "bad"}[verdict]}]
	if f.get("lost") != null:
		out.append({"key": "forecast.losses", "vars": {"lost": int(f["lost"]), "wounded": int(f["wounded"])}, "tone": ""})
	if f.get("chance") != null:
		out.append({"key": "forecast.chance", "vars": {"chance": int(f["chance"])}, "tone": ""})
	if f.get("nextLevel") != null:
		out.append({"key": "forecast.more", "vars": {"level": int(f["nextLevel"])}, "tone": ""})
	return out

## What to ask the server for: the target's level, the troops chosen and the heroes picked; null when nobody is chosen (no request).
static func request(level: int, counts: Dictionary, loadout: Variant) -> Variant:
	var troops := {}
	var any := false
	for id: String in Balance.data()["troopIds"]:
		troops[id] = maxi(0, int(counts.get(id, 0)))
		any = any or troops[id] > 0
	if not any:
		return null
	var body := {"level": level, "troops": troops}
	if loadout != null:
		body["heroes"] = loadout
	return body
