class_name HelpModel
extends RefCounted
## Ask for help, as the Phaser client decides it. `helpable_job` is `helpableJob` (packages/rules/src/help.ts): a job counts only while it
## runs, so one that ends at `now` is over (golden cases in data/training-fixtures.json). `can_ask` mirrors `canAskHelp` in
## apps/client/src/ui/app-ui.ts (a closure there, so the cases are written out in test_help_model.gd): the player is in an alliance
## and has no open request of their own of that kind. The server decides everything else; this only shows the button.

## The running job, or null when nothing runs or it is over at `now_ms`.
static func helpable_job(job: Variant, now_ms: int) -> Variant:
	if not job is Dictionary or float(job["endsAt"]) <= now_ms:
		return null
	return job

## Whether the button may show for `kind` ("upgrade" or "training"): `alliance` is the alliance view or null, `help` the open
## requests of the alliance (each a request dictionary, `mine` flagged for the player's own).
static func can_ask(alliance: Variant, help: Array, kind: String, now_ms: int) -> bool:
	if alliance == null:
		return false
	for r: Dictionary in help:
		if bool(r.get("mine", false)) and String(r.get("kind", "")) == kind and float(r.get("endsAt", 0)) > now_ms:
			return false
	return true

## A request as the server sends it (the fields the screens read), or false.
static func is_request(v: Variant) -> bool:
	return v is Dictionary and WireCheck.is_str(v.get("id")) and WireCheck.is_str(v.get("kind")) \
		and WireCheck.is_num(v.get("endsAt")) and v.get("mine") is bool

## `help` with `request` put in place of the one with the same id (or added): the list after a request is made or answered.
static func with_request(help: Array, request: Dictionary) -> Array:
	var out: Array = []
	var replaced := false
	for r: Dictionary in help:
		if String(r["id"]) == String(request["id"]):
			out.append(request)
			replaced = true
		else:
			out.append(r)
	if not replaced:
		out.append(request)
	return out

## Whether the player can still help this request (`canHelp` in alliance-help.ts): not their own, not helped already, not full.
static func can_give(r: Dictionary) -> bool:
	return not bool(r.get("mine", false)) and not bool(r.get("helped", false)) and int(r.get("helps", 0)) < int(r.get("maxHelps", 0))

## The requests still open at `now_ms` (a request whose job has ended is gone), in the server's order.
static func open_requests(help: Array, now_ms: int) -> Array:
	return help.filter(func(r: Dictionary) -> bool: return float(r.get("endsAt", 0)) > now_ms)

## What a row shows besides its countdown; the Help tab rebuilds its rows only when this changes (so a button is not replaced under a finger).
static func row_key(r: Dictionary) -> String:
	return "%s:%s:%d:%d:%d" % [r.get("id", ""), r.get("kind", ""), int(r.get("helps", 0)), int(bool(r.get("mine", false))), int(bool(r.get("helped", false)))]
