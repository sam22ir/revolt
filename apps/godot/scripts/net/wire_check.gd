class_name WireCheck
extends RefCounted
## Shape checks for server frames, mirroring the `is*` guards of the Phaser client (map-socket.ts, alliance-socket.ts).
## Anything that does not fit is dropped by the caller, never thrown.

const RANKS: Array[String] = ["leader", "officer", "member"]

static func is_num(v: Variant) -> bool:
	return (v is int) or (v is float and is_finite(v))

static func is_str(v: Variant) -> bool:
	return v is String

## Parses one text frame to a Dictionary, or null when it is not a JSON object.
static func parse_object(text: String) -> Variant:
	# A JSON instance: parse_string logs an engine error on bad input, and frames from the network are untrusted.
	var json := JSON.new()
	if json.parse(text) != OK:
		return null
	return json.data if json.data is Dictionary else null
