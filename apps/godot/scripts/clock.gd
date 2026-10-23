class_name Clock
extends RefCounted
## Server-synced clock. The client never trusts the device clock directly:
## it stores the offset between the server's `now` and the device's time.

var offset_ms: int = 0

func sync(server_now_ms: int, device_now_ms: int) -> void:
	offset_ms = server_now_ms - device_now_ms

func now_ms(device_now_ms: int) -> int:
	return device_now_ms + offset_ms
