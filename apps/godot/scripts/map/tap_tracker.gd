class_name TapTracker
extends RefCounted
## Decides whether a press and its release are a tap and not the end of a drag, a pinch or a long press. One pointer only: a second
## finger cancels it. Distances are logical pixels; the camera converts the slop from CSS pixels.

const MAX_MS := 450

var _active := false
var _index := -1
var _start := Vector2.ZERO
var _t0 := 0
var _slop := 0.0

## A pointer went down. `fingers` is how many are down now, this one included.
func press(index: int, pos: Vector2, t_ms: int, fingers: int, slop: float) -> void:
	if fingers != 1:
		cancel()
		return
	_active = true
	_index = index
	_start = pos
	_t0 = t_ms
	_slop = slop

## A pointer moved: past the slop it is a drag, not a tap.
func move(index: int, pos: Vector2) -> void:
	if _active and index == _index and pos.distance_to(_start) > _slop:
		cancel()

## The pointer went up: true when this was a tap.
func release(index: int, pos: Vector2, t_ms: int) -> bool:
	var tap := _active and index == _index and pos.distance_to(_start) <= _slop and t_ms - _t0 <= MAX_MS
	cancel()
	return tap

func cancel() -> void:
	_active = false
	_index = -1
