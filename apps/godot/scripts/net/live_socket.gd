class_name LiveSocket
extends Node
## A WebSocket feed that keeps itself connected (map-socket.ts / alliance-socket.ts): it connects with the subprotocols
## `revolt.v1` and `auth.<token>` (the token is read on every connect, so a new one is picked up), reconnects with backoff
## until `stop`, and hands out each frame once `parser` accepts it. A frame the parser rejects (bad JSON, unknown type, wrong
## shape, a binary frame) is dropped; a frame it accepts ends the backoff.
##
## All time comes in through `step(now_ms)`, which `_process` calls with Time.get_ticks_msec, so tests drive it with a fake
## peer and a fake clock. The peer is a WebSocketPeer; tests pass a stand-in with the same methods.

signal message(data: Variant)
signal connection_changed(open: bool)

## Wait before the n-th reconnect attempt; the last value repeats.
const RECONNECT_BACKOFF_MS: Array[int] = [1000, 2000, 5000, 10_000, 30_000]
## A handshake that has not finished after this long is abandoned and retried.
const CONNECT_TIMEOUT_MS := 15_000
## A full map snapshot grows with the players on the server; leave plenty of room (the default is 64 KiB).
const INBOUND_BUFFER_BYTES := 1024 * 1024

## `ws://host/path`; see `ws_url`.
var url := ""
## Returns the bearer token, called on every connect.
var token_source: Callable = func() -> String: return ""
## Takes a text frame and returns a Dictionary, or null to drop the frame.
var parser: Callable = func(_text: String) -> Variant: return null
## Makes a new peer for each connection attempt.
var peer_factory: Callable = func() -> Object: return WebSocketPeer.new()

var _running := false
var _peer: Object = null
var _was_open := false
var _attempt := 0
var _retry_at_ms := -1
var _connecting_since_ms := 0

## The socket URL for an HTTP base URL and a path: `http` becomes `ws`, `https` becomes `wss`.
static func ws_url(base_url: String, path: String) -> String:
	if base_url.begins_with("https://"):
		return "wss://" + base_url.substr(8) + path
	if base_url.begins_with("http://"):
		return "ws://" + base_url.substr(7) + path
	return base_url + path

static func backoff_ms(attempt: int) -> int:
	return RECONNECT_BACKOFF_MS[mini(attempt, RECONNECT_BACKOFF_MS.size() - 1)]

func is_running() -> bool:
	return _running

func is_open() -> bool:
	return _peer != null and _peer.get_ready_state() == WebSocketPeer.STATE_OPEN

## Connects, and keeps reconnecting until `stop`.
func start(now_ms: int) -> void:
	if _running:
		return
	_running = true
	_attempt = 0
	_connect(now_ms)

func stop() -> void:
	_running = false
	_retry_at_ms = -1
	_drop_peer()

## Drops the connection and connects again at once (the token changed).
func restart(now_ms: int) -> void:
	if not _running:
		return
	_attempt = 0
	_drop_peer()
	_connect(now_ms)

## For app resume: reconnects only when the socket is not open, so a healthy connection is left alone.
func ensure_open(now_ms: int) -> void:
	if _running and not is_open():
		restart(now_ms)

## Sends a text frame. False when the socket is not open, so the caller can say so.
func send_text(text: String) -> bool:
	if not is_open():
		return false
	return _peer.send_text(text) == OK

func _process(_delta: float) -> void:
	step(Time.get_ticks_msec())

## Polls the peer, delivers frames, and reconnects when it is time.
func step(now_ms: int) -> void:
	if _peer != null:
		_peer.poll()
		var state: int = _peer.get_ready_state()
		# Open is announced before the first frame, which can arrive in the same poll.
		if state == WebSocketPeer.STATE_OPEN and not _was_open:
			_was_open = true
			connection_changed.emit(true)
		_drain()
		if state == WebSocketPeer.STATE_CONNECTING and now_ms - _connecting_since_ms > CONNECT_TIMEOUT_MS:
			_drop_peer()
			_schedule_retry(now_ms)
		elif state == WebSocketPeer.STATE_CLOSED:
			_drop_peer()
			_schedule_retry(now_ms)
	elif _running and _retry_at_ms >= 0 and now_ms >= _retry_at_ms:
		_connect(now_ms)

func _drain() -> void:
	while _peer != null and _peer.get_available_packet_count() > 0:
		var packet: PackedByteArray = _peer.get_packet()
		if not _peer.was_string_packet():
			continue
		var parsed: Variant = parser.call(packet.get_string_from_utf8())
		if parsed == null:
			continue
		_attempt = 0
		message.emit(parsed)

func _connect(now_ms: int) -> void:
	_retry_at_ms = -1
	var token: String = token_source.call()
	if token == "":
		_schedule_retry(now_ms)
		return
	var peer: Object = peer_factory.call()
	peer.supported_protocols = PackedStringArray(["revolt.v1", "auth." + token])
	peer.inbound_buffer_size = INBOUND_BUFFER_BYTES
	if peer.connect_to_url(url) != OK:
		_schedule_retry(now_ms)
		return
	_peer = peer
	_connecting_since_ms = now_ms

func _schedule_retry(now_ms: int) -> void:
	if not _running:
		return
	_retry_at_ms = now_ms + backoff_ms(_attempt)
	_attempt += 1

func _drop_peer() -> void:
	var was_open := _was_open
	_was_open = false
	if _peer != null:
		_peer.close()
		_peer = null
	if was_open:
		connection_changed.emit(false)
