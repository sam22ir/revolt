extends GutTest
## LiveSocket against a fake peer and a fake clock: the handshake protocols, frame filtering, the backoff schedule and its
## reset, the handshake timeout, and stop / restart / ensure_open.

class FakePeer:
	extends RefCounted
	var supported_protocols := PackedStringArray()
	var inbound_buffer_size := 0
	var state: int = WebSocketPeer.STATE_CONNECTING
	var packets: Array = []
	var connected_url := ""
	var closed := false
	var sent: Array[String] = []
	var _last_is_string := true

	func connect_to_url(url: String) -> int:
		connected_url = url
		return OK
	func poll() -> void:
		pass
	func get_ready_state() -> int:
		return state
	func get_available_packet_count() -> int:
		return packets.size()
	func get_packet() -> PackedByteArray:
		var p: Dictionary = packets.pop_front()
		_last_is_string = p["string"]
		return p["data"]
	func was_string_packet() -> bool:
		return _last_is_string
	func send_text(text: String) -> int:
		sent.append(text)
		return OK
	func close() -> void:
		closed = true
		state = WebSocketPeer.STATE_CLOSED
	func push(text: String, as_string := true) -> void:
		packets.append({"data": text.to_utf8_buffer(), "string": as_string})

var _peers: Array[FakePeer] = []
var _token := "tok1"

func _socket() -> LiveSocket:
	_peers = []
	_token = "tok1"
	var s: LiveSocket = autofree(LiveSocket.new())
	s.url = "ws://host/v1/map/ws"
	s.token_source = func() -> String: return _token
	s.parser = WireCheck.parse_object
	s.peer_factory = func() -> Object:
		var p := FakePeer.new()
		_peers.append(p)
		return p
	return s

func test_ws_url_follows_the_http_scheme() -> void:
	assert_eq(LiveSocket.ws_url("http://localhost:8787", "/v1/map/ws"), "ws://localhost:8787/v1/map/ws")
	assert_eq(LiveSocket.ws_url("https://api.example.com", "/v1/alliance/ws"), "wss://api.example.com/v1/alliance/ws")

func test_connects_with_the_game_protocol_and_the_token() -> void:
	var s := _socket()
	s.start(0)
	assert_eq(_peers.size(), 1)
	assert_eq(_peers[0].connected_url, "ws://host/v1/map/ws")
	assert_eq(_peers[0].supported_protocols, PackedStringArray(["revolt.v1", "auth.tok1"]))
	assert_gte(_peers[0].inbound_buffer_size, 1024 * 1024, "room for a large snapshot")

func test_a_new_token_is_used_on_the_next_connect() -> void:
	var s := _socket()
	s.start(0)
	_token = "tok2"
	s.restart(10)
	assert_eq(_peers.size(), 2)
	assert_true(_peers[0].closed, "the old connection was dropped")
	assert_eq(_peers[1].supported_protocols, PackedStringArray(["revolt.v1", "auth.tok2"]))

func test_no_token_means_no_connection_yet() -> void:
	var s := _socket()
	_token = ""
	s.start(0)
	assert_eq(_peers.size(), 0)
	_token = "late"
	s.step(LiveSocket.backoff_ms(0))
	assert_eq(_peers.size(), 1, "it connects once a token exists")

func test_open_is_announced_and_text_frames_are_delivered() -> void:
	var s := _socket()
	var got := []
	var opened := []
	s.message.connect(func(m: Variant) -> void: got.append(m))
	s.connection_changed.connect(func(o: bool) -> void: opened.append(o))
	s.start(0)
	_peers[0].state = WebSocketPeer.STATE_OPEN
	_peers[0].push('{"type":"x"}')
	s.step(10)
	assert_eq(opened, [true])
	assert_eq(got, [{"type": "x"}])
	assert_true(s.is_open())

func test_malformed_and_binary_frames_are_dropped() -> void:
	var s := _socket()
	var got := []
	s.message.connect(func(m: Variant) -> void: got.append(m))
	s.start(0)
	_peers[0].state = WebSocketPeer.STATE_OPEN
	_peers[0].push("not json")
	_peers[0].push("[1,2]")
	_peers[0].push('{"type":"binary"}', false)
	_peers[0].push('{"type":"ok"}')
	s.step(10)
	assert_eq(got, [{"type": "ok"}], "only the well-formed text frame arrives")

func test_frames_queued_before_the_close_are_still_delivered() -> void:
	var s := _socket()
	var got := []
	s.message.connect(func(m: Variant) -> void: got.append(m))
	s.start(0)
	_peers[0].state = WebSocketPeer.STATE_CLOSED
	_peers[0].push('{"type":"last"}')
	s.step(10)
	assert_eq(got, [{"type": "last"}])

func test_backoff_follows_the_schedule_and_the_last_value_repeats() -> void:
	var s := _socket()
	s.start(0)
	var now := 0
	var expected: Array[int] = [1000, 2000, 5000, 10_000, 30_000, 30_000]
	for i in expected.size():
		_peers[i].state = WebSocketPeer.STATE_CLOSED
		now += 1
		s.step(now)
		assert_eq(_peers.size(), i + 1, "no reconnect before the wait is over (attempt %d)" % i)
		s.step(now + expected[i] - 1)
		assert_eq(_peers.size(), i + 1, "still waiting 1 ms early (attempt %d)" % i)
		now += expected[i]
		s.step(now)
		assert_eq(_peers.size(), i + 2, "reconnected after %d ms" % expected[i])

func test_a_good_frame_resets_the_backoff() -> void:
	var s := _socket()
	s.start(0)
	# Two failed attempts: waits of 1000 then 2000.
	_peers[0].state = WebSocketPeer.STATE_CLOSED
	s.step(1)
	s.step(1001)
	_peers[1].state = WebSocketPeer.STATE_CLOSED
	s.step(1002)
	s.step(3002)
	assert_eq(_peers.size(), 3)
	# The third attempt opens and delivers a frame, then drops: the wait is the first one again.
	_peers[2].state = WebSocketPeer.STATE_OPEN
	_peers[2].push('{"type":"ok"}')
	s.step(3003)
	_peers[2].state = WebSocketPeer.STATE_CLOSED
	s.step(3004)
	s.step(3004 + 999)
	assert_eq(_peers.size(), 3)
	s.step(3004 + 1000)
	assert_eq(_peers.size(), 4)

func test_a_handshake_that_never_finishes_is_retried() -> void:
	var s := _socket()
	s.start(0)
	s.step(LiveSocket.CONNECT_TIMEOUT_MS - 1)
	assert_eq(_peers.size(), 1)
	s.step(LiveSocket.CONNECT_TIMEOUT_MS + 1)
	assert_true(_peers[0].closed, "the stuck handshake was abandoned")
	s.step(LiveSocket.CONNECT_TIMEOUT_MS + 1 + 1000)
	assert_eq(_peers.size(), 2)

func test_stop_ends_reconnecting() -> void:
	var s := _socket()
	var opened := []
	s.connection_changed.connect(func(o: bool) -> void: opened.append(o))
	s.start(0)
	_peers[0].state = WebSocketPeer.STATE_OPEN
	s.step(1)
	s.stop()
	assert_eq(opened, [true, false])
	s.step(1_000_000)
	assert_eq(_peers.size(), 1, "no new connection after stop")
	assert_false(s.is_running())

func test_ensure_open_leaves_a_healthy_connection_alone() -> void:
	var s := _socket()
	s.start(0)
	_peers[0].state = WebSocketPeer.STATE_OPEN
	s.step(1)
	s.ensure_open(2)
	assert_eq(_peers.size(), 1, "an open socket is not churned")
	_peers[0].state = WebSocketPeer.STATE_CLOSED
	s.step(3)
	s.ensure_open(4)
	assert_eq(_peers.size(), 2, "a dead socket reconnects at once, without waiting for the backoff")

func test_send_text_only_when_open() -> void:
	var s := _socket()
	s.start(0)
	assert_false(s.send_text("hi"), "still connecting")
	_peers[0].state = WebSocketPeer.STATE_OPEN
	s.step(1)
	assert_true(s.send_text("hi"))
	assert_eq(_peers[0].sent, ["hi"])

func test_open_is_announced_before_the_first_frame() -> void:
	var s := _socket()
	var order := []
	s.message.connect(func(_m: Variant) -> void: order.append("frame"))
	s.connection_changed.connect(func(o: bool) -> void: order.append("open" if o else "closed"))
	s.start(0)
	_peers[0].state = WebSocketPeer.STATE_OPEN
	_peers[0].push('{"type":"map"}')
	s.step(1)
	assert_eq(order, ["open", "frame"])

func test_stopping_from_inside_a_frame_handler_is_safe_and_final() -> void:
	# What a "kicked" frame does: the handler stops the socket while step is still running.
	var s := _socket()
	s.message.connect(func(_m: Variant) -> void: s.stop())
	s.start(0)
	_peers[0].state = WebSocketPeer.STATE_OPEN
	_peers[0].push('{"type":"kicked"}')
	_peers[0].push('{"type":"after"}')
	s.step(1)
	s.step(1_000_000)
	assert_eq(_peers.size(), 1, "no reconnect after the handler stopped it")
	assert_false(s.is_running())
