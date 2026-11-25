class_name Api
extends Node
## HTTP client for the game server. Intents go out, server state comes back; the client never decides.
## Every call returns {"ok": bool, "status": int, "data": Variant}. status 0 means the request never completed.

const DEFAULT_BASE_URL := "http://localhost:8787"
## The deployed server (docs/deploy.md), which a phone build talks to.
const LIVE_BASE_URL := "https://revolt-server.nafaa-store.workers.dev"
const SESSION_FILE := "user://session.cfg"

var base_url: String = DEFAULT_BASE_URL
var token: String = ""
## The last request that failed: {result: HTTPRequest.Result, status: HTTP status}, shown under the "could not reach" message.
var last_failure := {"result": 0, "status": 0}

## A phone build talks to the deployed server. On web the server address can be given as `?api=http://host:port` (used by
## the dev previews); otherwise the local dev server.
static func resolve_base_url() -> String:
	if OS.has_feature("mobile"):
		return LIVE_BASE_URL
	if OS.has_feature("web"):
		var q: Variant = JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('api')")
		if q is String and q != "":
			return q
	return DEFAULT_BASE_URL

func request_json(method: HTTPClient.Method, path: String, body: Variant = null) -> Dictionary:
	var req := HTTPRequest.new()
	add_child(req)
	var headers: PackedStringArray = ["content-type: application/json"]
	if token != "":
		headers.append("authorization: Bearer " + token)
	var payload := "" if body == null else JSON.stringify(body)
	var err := req.request(base_url + path, headers, method, payload)
	if err != OK:
		req.queue_free()
		last_failure = {"result": -int(err), "status": 0}
		return {"ok": false, "status": 0, "data": null}
	var done: Array = await req.request_completed
	req.queue_free()
	var status := int(done[1])
	var parsed: Variant = JSON.parse_string((done[3] as PackedByteArray).get_string_from_utf8())
	var ok := int(done[0]) == HTTPRequest.RESULT_SUCCESS and status >= 200 and status < 300
	if not ok:
		last_failure = {"result": int(done[0]), "status": status}
	return {"ok": ok, "status": status, "data": parsed}

func get_json(path: String) -> Dictionary:
	return await request_json(HTTPClient.METHOD_GET, path)

func post_json(path: String, body: Variant = {}) -> Dictionary:
	return await request_json(HTTPClient.METHOD_POST, path, body)

## Reuses the device's saved guest token if the server still knows it, otherwise creates a guest account.
## Guest creation is rate limited per IP, so the token is kept in user:// and reused. A saved token is only
## replaced when the server rejects it (see SessionPolicy); a transient failure returns the failed result and
## keeps the token. Returns the /v1/state (or /v1/guest) reply, or an {"ok": false} result.
func ensure_session() -> Dictionary:
	var cfg := ConfigFile.new()
	if cfg.load(SESSION_FILE) == OK:
		token = String(cfg.get_value("session", "token", ""))
	var state := {"ok": false, "status": 0, "data": null}
	if token != "":
		state = await get_json("/v1/state")
	match SessionPolicy.after_state_check(token != "", state["ok"], state["status"]):
		SessionPolicy.Action.USE_STATE, SessionPolicy.Action.UNREACHABLE:
			return state
	token = ""
	var guest := await post_json("/v1/guest", {})
	if guest["ok"]:
		token = String(guest["data"]["token"])
		cfg.set_value("session", "token", token)
		cfg.save(SESSION_FILE)
	return guest
