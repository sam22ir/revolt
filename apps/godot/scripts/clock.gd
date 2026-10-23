class_name Clock
extends RefCounted
## Server time for the client. The device's wall clock is never read after a sync: server time is the `now`
## from the last response plus the monotonic ticks (Time.get_ticks_msec) elapsed since, so changing the phone's
## date or time cannot move counters or timers. Re-sync on every server response.
## Before the first sync `now_ms` returns 0; callers should not show counters until `is_synced()`.

var _server_ms_at_sync: int = 0
var _ticks_at_sync: int = 0
var _synced := false

func is_synced() -> bool:
	return _synced

## `server_now_ms`: the `now` from a response. `ticks_ms`: Time.get_ticks_msec() when it arrived.
func sync(server_now_ms: int, ticks_ms: int) -> void:
	_server_ms_at_sync = server_now_ms
	_ticks_at_sync = ticks_ms
	_synced = true

## Server time now. `ticks_ms` is Time.get_ticks_msec() (monotonic); never goes backwards.
func now_ms(ticks_ms: int) -> int:
	if not _synced:
		return 0
	return _server_ms_at_sync + maxi(0, ticks_ms - _ticks_at_sync)
