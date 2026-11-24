class_name CameraMath
extends RefCounted
## Pure camera maths for the map (no nodes), so it can be unit tested. World units are map pixels; a camera
## shows `viewport_px / zoom` world units. `center` is the world point in the middle of the screen.

## Keeps the visible area inside `bounds`. If the visible area is larger than the bounds on an axis,
## the camera centres on the bounds on that axis.
static func clamp_center(center: Vector2, viewport_px: Vector2, zoom: float, bounds: Rect2) -> Vector2:
	var half := viewport_px / zoom * 0.5
	var out := center
	if bounds.size.x <= half.x * 2.0:
		out.x = bounds.position.x + bounds.size.x * 0.5
	else:
		out.x = clampf(center.x, bounds.position.x + half.x, bounds.end.x - half.x)
	if bounds.size.y <= half.y * 2.0:
		out.y = bounds.position.y + bounds.size.y * 0.5
	else:
		out.y = clampf(center.y, bounds.position.y + half.y, bounds.end.y - half.y)
	return out

## Keeps the centre on the map's diamond of `size` tiles, so the view never wanders off into the land past the frontier.
static func clamp_to_map(center: Vector2, size: int) -> Vector2:
	var tile := Iso.world_to_tile(center)
	return Iso.tile_to_world(clampf(tile.x, 0.0, size), clampf(tile.y, 0.0, size))

static func clamp_zoom(zoom: float, min_zoom: float, max_zoom: float) -> float:
	return clampf(zoom, min_zoom, max_zoom)

## World point under a screen point (screen origin top-left).
static func screen_to_world(screen: Vector2, center: Vector2, viewport_px: Vector2, zoom: float) -> Vector2:
	return center + (screen - viewport_px * 0.5) / zoom

## The new centre that keeps the world point under `anchor_screen` fixed while the zoom changes.
static func zoom_about(center: Vector2, viewport_px: Vector2, zoom: float, new_zoom: float, anchor_screen: Vector2) -> Vector2:
	var anchor_world := screen_to_world(anchor_screen, center, viewport_px, zoom)
	return anchor_world - (anchor_screen - viewport_px * 0.5) / new_zoom

## The new centre after dragging by `screen_delta` pixels (content follows the finger).
static func pan(center: Vector2, screen_delta: Vector2, zoom: float) -> Vector2:
	return center - screen_delta / zoom

## One step of a two-finger gesture, composed exactly: the world point that was under the old fingers' midpoint
## ends up under the new midpoint at the new (clamped) zoom. `zoom` is in logical pixels per world unit.
## Returns {"center": Vector2, "zoom": float}.
static func pinch_step(center: Vector2, viewport_px: Vector2, zoom: float, min_zoom: float, max_zoom: float, prev_a: Vector2, prev_b: Vector2, a: Vector2, b: Vector2) -> Dictionary:
	var g := pinch(prev_a, prev_b, a, b)
	var new_zoom := clamp_zoom(zoom * float(g["scale"]), min_zoom, max_zoom)
	var anchor_world := screen_to_world(g["from"], center, viewport_px, zoom)
	var new_center: Vector2 = anchor_world - (Vector2(g["to"]) - viewport_px * 0.5) / new_zoom
	return {"center": new_center, "zoom": new_zoom}

## Two-finger gesture: the zoom factor (distance ratio) and the screen-space midpoints before and after.
## Returns {"scale": float, "from": Vector2, "to": Vector2}; scale is 1.0 when the fingers started on one point.
static func pinch(prev_a: Vector2, prev_b: Vector2, a: Vector2, b: Vector2) -> Dictionary:
	var prev_dist := prev_a.distance_to(prev_b)
	var scale := 1.0 if prev_dist < 1.0 else a.distance_to(b) / prev_dist
	return {"scale": scale, "from": (prev_a + prev_b) * 0.5, "to": (a + b) * 0.5}
