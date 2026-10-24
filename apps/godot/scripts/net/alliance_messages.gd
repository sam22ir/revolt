class_name AllianceMessages
extends RefCounted
## One frame of the alliance socket (`GET /v1/alliance/ws`), as alliance-socket.ts parseAllianceMessage: "history"
## (`messages`), "chat" (`message`), "members_changed", "help_changed", "kicked" or "error" (`reason`), or null for anything
## malformed or unknown. Malformed entries inside a history are dropped one by one.

const ERROR_REASONS: Array[String] = ["rate_limited", "bad_text"]

static func parse(text: String) -> Variant:
	var msg: Variant = WireCheck.parse_object(text)
	if msg == null:
		return null
	match msg.get("type"):
		"history":
			var list: Variant = msg.get("messages")
			if not list is Array:
				return null
			return {"type": "history", "messages": (list as Array).filter(is_chat_message)}
		"chat":
			return {"type": "chat", "message": msg["message"]} if is_chat_message(msg.get("message")) else null
		"members_changed", "help_changed", "kicked":
			return {"type": msg["type"]}
		"error":
			return {"type": "error", "reason": msg["reason"]} if ERROR_REASONS.has(msg.get("reason")) else null
	return null

static func is_chat_message(v: Variant) -> bool:
	return v is Dictionary and WireCheck.is_num(v.get("id")) and WireCheck.is_num(v.get("at")) \
		and WireCheck.is_str(v.get("handle")) and WireCheck.RANKS.has(v.get("rank")) and WireCheck.is_str(v.get("text"))

## The one frame the client sends: a chat line (alliance-socket.ts send). The server checks the text.
static func chat_frame(text: String) -> String:
	return JSON.stringify({"type": "chat", "text": text})
