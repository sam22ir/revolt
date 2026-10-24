class_name Session
extends RefCounted
## The player's base as the server last said it, and the server clock. Every reply that carries `now` syncs the clock;
## every reply that carries `state` replaces the base (the client never decides, it shows what the server returned).
## `api` is an Api (or anything with get_json, post_json and a `token`), `clock` a Clock.
##
## A 401 after the session started means the server no longer knows this token. That is reported (`auth_lost`) and nothing
## else: a new guest account would replace the player's base for good (see SessionPolicy), so only the start-up check may
## create one.

signal state_changed
## A battle report pushed on the map socket (newest first in `reports`).
signal report_received(report: Dictionary)
## The list changed (a fetch or a pushed report).
signal reports_changed
signal auth_lost
## The server became unreachable or reachable again (see `online`).
signal connection_changed(online: bool)
## The alliance chat changed (history or a new line).
signal chat_changed
## Membership, ranks, HQ or help requests changed on the server: the alliance view should be fetched again.
signal alliance_changed

const MAX_REPORTS := 20
const MAX_CHAT := 200
## A running job is asked about this long after its `endsAt`, in server time, so a reply stamped just before it is rare;
## when the server still reports the job, it is asked again every RETRY_MS, at most MAX_COMPLETION_ASKS times in all.
## While offline the base is asked for again this often (apps/client/src/main.ts RETRY_MS, last value).
const OFFLINE_RETRY_MS := 10_000
const COMPLETION_MARGIN_MS := 400
const COMPLETION_RETRY_MS := 2000
const MAX_COMPLETION_ASKS := 5

var api: Object
var clock: Clock
## Monotonic milliseconds; tests replace it.
var ticks: Callable = func() -> int: return Time.get_ticks_msec()

## The account's background (`algeria`, `vietnam`): names and texts can be overridden per background (Loc.t).
var background := ""
## False after a state, intent or reports request failed (no answer, 429 or a server error); true again at the next answer, or at
## any well-formed socket frame. A 401 is `auth_lost`, not offline. The same rule as the Phaser store's status.
var online := true
var state: Dictionary = {}
var resources: Dictionary = {}
var levels: Dictionary = {}
var last_updated := 0
var liberations: Array = []
var reports: Array = []
## Alliance chat lines, oldest first (each {id, at, handle, rank, text}). Text is plain: render it as text, never as markup.
var chat: Array = []

var _refreshing := false
var _refresh_again := false
var _offline_asked_at_ms := 0
var _watched := {}
## The server time of the reply that last set the base, and the one that last set the liberations. A reply stamped earlier
## than these is an older answer that arrived late (a /v1/state fetch overtaken by an intent reply) and is not applied.
var _base_now := -1
var _liberations_now := -1

func _init(api_ref: Object, clock_ref: Clock) -> void:
	api = api_ref
	clock = clock_ref

## Takes a server reply: syncs the clock from its `now`, and the base from its `state` when it has one. A reply stamped
## earlier than the one that last set the base (or the liberations) leaves that part alone and emits nothing; a reply with
## no `now`, an equal one, or a newer one is taken.
func apply(reply: Dictionary) -> void:
	var stamped: bool = reply.has("now") and WireCheck.is_num(reply["now"])
	var reply_now := int(reply["now"]) if stamped else -1
	if stamped:
		clock.sync(reply_now, ticks.call())
	var changed := false
	if reply.get("account") is Dictionary and reply["account"].get("background") is String:
		background = reply["account"]["background"]
		Loc.background_id = background
	if reply.has("liberations") and _newer_than(reply_now, stamped, _liberations_now):
		liberations = reply["liberations"]
		_liberations_now = maxi(_liberations_now, reply_now)
		changed = true
	if reply.get("state") is Dictionary and _newer_than(reply_now, stamped, _base_now):
		var s: Dictionary = reply["state"]
		state = s
		resources = s.get("resources", {})
		levels = s.get("levels", {})
		last_updated = int(s.get("lastUpdated", 0))
		_base_now = maxi(_base_now, reply_now)
		changed = true
	if changed:
		state_changed.emit()

## The running upgrade ({building, toLevel, startedAt, endsAt}) or null.
func queue() -> Variant:
	return state.get("queue")

## Call every frame. When a running job (upgrade or training) is over (server time), asks the server for the base once, so
## the new level or the new troops come from the server and not from the client. If the answer still holds the job (the
## server's clock is a little behind), it asks again after COMPLETION_RETRY_MS, up to MAX_COMPLETION_ASKS times for that job.
func tick() -> void:
	_retry_when_offline()
	_watch_job("upgrade", queue())
	_watch_job("training", state.get("training"))

func _watch_job(kind: String, job: Variant) -> void:
	if job == null:
		_watched.erase(kind)
		return
	var key := "%s:%s:%s" % [job.get("building", job.get("troop", "")), job.get("toLevel", job.get("count", 0)), job["endsAt"]]
	var w: Dictionary = _watched.get(kind, {})
	if w.get("key", "") != key:
		w = {"key": key, "asked": 0, "asked_at_ms": 0}
	_watched[kind] = w
	var now_ticks: int = ticks.call()
	if clock.now_ms(now_ticks) < int(job["endsAt"]) + COMPLETION_MARGIN_MS or w["asked"] >= MAX_COMPLETION_ASKS:
		return
	if w["asked"] > 0 and now_ticks - w["asked_at_ms"] < COMPLETION_RETRY_MS:
		return
	w["asked"] += 1
	w["asked_at_ms"] = now_ticks
	refresh()

## A well-formed socket frame proves the server is reachable. Coming back from offline this way, the base is fetched once:
## the request that failed may still have been applied by the server (an upgrade whose answer was lost), and nothing else
## would correct the view.
func mark_reachable() -> void:
	if online:
		return
	_set_online(true)
	refresh()

func _set_online(value: bool) -> void:
	if online != value:
		online = value
		connection_changed.emit(value)

## While offline, asks again every OFFLINE_RETRY_MS (and the answer, if it comes, brings the session back online).
func _retry_when_offline() -> void:
	if online:
		return
	var now_ticks: int = ticks.call()
	if now_ticks - _offline_asked_at_ms >= OFFLINE_RETRY_MS:
		_offline_asked_at_ms = now_ticks
		refresh()

## Takes the liberations of a map snapshot (`now` is the snapshot's), which can be newer than the last state reply.
func set_liberations(list: Array, now: int) -> void:
	if now >= _liberations_now and list != liberations:
		liberations = list
		state_changed.emit()
	_liberations_now = maxi(_liberations_now, now)

static func _newer_than(reply_now: int, stamped: bool, last: int) -> bool:
	return not stamped or reply_now >= last

## A report pushed on the map socket. Only a report not held yet is announced (a reconnect may replay one).
func add_report(report: Dictionary) -> void:
	if not MapMessages.is_report(report) or _holds(String(report["id"])):
		return
	merge_reports([report])
	report_received.emit(report)

## Merges reports into the list (by id, newest first, at most MAX_REPORTS). Used by the fetch and by the socket.
func merge_reports(incoming: Array) -> void:
	var next := ReportsModel.merged(reports, incoming, MAX_REPORTS)
	if next == reports:
		return
	reports = next
	reports_changed.emit()

## Fetches `/v1/reports` (the server's list, newest first) and merges it, so a push that arrived meanwhile is kept. Called at
## start-up, on resume and when the Reports screen opens; a failed fetch changes nothing.
func load_reports() -> void:
	var result: Dictionary = await api.get_json("/v1/reports")
	_take(result)
	if result["ok"] and result["data"] is Dictionary and result["data"].get("reports") is Array:
		merge_reports(result["data"]["reports"])

func _holds(id: String) -> bool:
	for r: Dictionary in reports:
		if String(r["id"]) == id:
			return true
	return false

## Fetches `/v1/state`. Calls that arrive while a fetch is in flight are folded into one more fetch afterwards, so a push
## that lands just after the server answered is never lost and a burst costs at most two requests.
func refresh() -> void:
	if _refreshing:
		_refresh_again = true
		return
	_refreshing = true
	while true:
		_refresh_again = false
		_take(await api.get_json("/v1/state"))
		if not _refresh_again:
			break
	_refreshing = false

## Sends an intent. Returns the server's verdict: {"ok": true} or {"ok": false, "reason": String}; the reason
## "unreachable" means no answer arrived. A refused intent still carries the base, which is applied either way.
func send_intent(intent: Dictionary) -> Dictionary:
	var result: Dictionary = await api.post_json("/v1/intent", intent)
	_take(result)
	var data: Variant = result["data"]
	if data is Dictionary and data.has("ok"):
		return {"ok": bool(data["ok"]), "reason": String(data.get("reason", ""))}
	return {"ok": false, "reason": "unreachable" if int(result["status"]) == 0 else "error"}

## Takes one parsed alliance socket frame (AllianceMessages.parse). Returns true for "kicked", after which the caller
## stops the socket. "history" replaces the chat; a "chat" line already in the history (same id) is not added twice.
func apply_alliance_message(msg: Dictionary) -> bool:
	match msg["type"]:
		"history":
			chat = (msg["messages"] as Array).duplicate()
			_trim_chat()
			chat_changed.emit()
		"chat":
			var line: Dictionary = msg["message"]
			if chat.is_empty() or int(line["id"]) > int(chat[chat.size() - 1]["id"]):
				chat.append(line)
				_trim_chat()
				chat_changed.emit()
		"members_changed", "help_changed":
			alliance_changed.emit()
		"kicked":
			chat = []
			chat_changed.emit()
			alliance_changed.emit()
			return true
	return false

func _trim_chat() -> void:
	if chat.size() > MAX_CHAT:
		chat = chat.slice(chat.size() - MAX_CHAT)

func _take(result: Dictionary) -> void:
	var status := int(result["status"])
	if status == 401:
		auth_lost.emit()
		return
	# No answer, rate limited or a server error: offline. Other refusals (400s) say nothing about the connection.
	if status == 0 or status == 429 or status >= 500:
		if online:
			_offline_asked_at_ms = ticks.call()
		_set_online(false)
		return
	if result["data"] is Dictionary:
		apply(result["data"])
		_set_online(true)
