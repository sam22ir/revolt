class_name CampGestures
extends RefCounted
## Fingers (or the mouse) on the camp: one pans, two pinch, and a short press that did neither is a tap. Positions are viewport px.
## It only reads what it is given; the owner moves the picture.

## A press and release closer than this is a tap.
const SLOP := 16.0

var _at := {}
var _start := Vector2.INF
var _moved := false

## A pointer went down.
func press(index: int, pos: Vector2) -> void:
	_at[index] = pos
	if _at.size() == 1:
		_start = pos
		_moved = false
	else:
		# A second finger: whatever happens next, it is not a tap.
		_moved = true

## A pointer moved to `pos`: {pan, zoom, about}. One pointer past the slop pans; of two, the spread zooms about their middle and
## the middle pans.
func move(index: int, pos: Vector2) -> Dictionary:
	var still := {"pan": Vector2.ZERO, "zoom": 1.0, "about": pos}
	if not _at.has(index):
		return still
	var before: Vector2 = _at[index]
	if _at.size() == 1:
		_moved = _moved or pos.distance_to(_start) > SLOP
		if not _moved:
			return still
		_at[index] = pos
		return {"pan": pos - before, "zoom": 1.0, "about": pos}
	_at[index] = pos
	var other := Vector2.INF
	for i: int in _at:
		if i != index:
			other = _at[i]
			break
	var spread := before.distance_to(other)
	return {
		"pan": (pos - before) * 0.5,
		"zoom": pos.distance_to(other) / spread if spread > 1.0 else 1.0,
		"about": (pos + other) * 0.5,
	}

## A pointer went up at `pos`: whether that was a tap.
func release(index: int, pos: Vector2) -> bool:
	if not _at.has(index):
		return false
	var tap := _at.size() == 1 and not _moved and pos.distance_to(_start) <= SLOP
	forget(index)
	return tap

## Drops a pointer whose release went elsewhere.
func forget(index: int) -> void:
	_at.erase(index)

func clear() -> void:
	_at.clear()
