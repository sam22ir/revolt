class_name MapOverlay
extends Node2D
## Region seams, bases, NPC targets, alliance HQs and march routes, drawn above the ground mesh.
## Placeholder shapes; sizes and colours follow the Phaser map (BASE_SPAN 2 tiles, NPC 1.45 tiles, HQ ring
## 0.62 * 48). Canvas text is limited to NPC level numbers and 2-4 character ASCII HQ tags (rule 6).

const SEAM_COLOR := Color(0.54, 0.42, 0.27, 0.55)
const SEAM_LIBERATED_COLOR := Color(0.88, 0.69, 0.25, 0.9)
const SEAM_WIDTH := 3.0
const BASE_SPAN := 2
const BASE_OWN := Color("d8b45a")
const BASE_OTHER := Color("9fb0d0")
const OUTLINE := Color(1.0, 0.95, 0.72)
const NPC_SIZE := 1.45
const NPC_COLORS := {
	"patrol": Color("8c7a3c"),
	"convoy": Color("b07a3a"),
	"outpost": Color("6f6a5a"),
	"fortified_line": Color("8a3b2e"),
}
const BADGE_FILL := Color("2b2219")
const BADGE_RING := Color("c8964a")
const BADGE_RING_FORTIFIED := Color("d0573a")
const HQ_OWN := Color("2f9e8f")
const HQ_OTHER := Color("6a55a8")
const ROUTE_MINE := Color(0.88, 0.69, 0.25, 0.75)
const ROUTE_OTHER := Color(0.96, 0.92, 0.84, 0.35)
const TAG_PATTERN := "^[A-Z0-9]{2,4}$"

var map: WorldMap
## How many times the overlay has been drawn (used by tests to prove the draw code ran).
var draw_count := 0
var _tag_re := RegEx.create_from_string(TAG_PATTERN)

func setup(m: WorldMap) -> void:
	map = m
	queue_redraw()

func _draw() -> void:
	if map == null or map.size == 0:
		return
	draw_count += 1
	_draw_seams()
	_draw_marches()
	var snap := map.snapshot
	for b: Dictionary in snap["bases"]:
		_draw_base(b)
	for n: Dictionary in snap["npcs"]:
		_draw_npc(n)
	for h: Dictionary in snap["hqs"]:
		_draw_hq(h)

func _draw_seams() -> void:
	for i in map.seam_liberated.size():
		var color := SEAM_LIBERATED_COLOR if map.seam_liberated[i] else SEAM_COLOR
		draw_line(map.seam_points[i * 2], map.seam_points[i * 2 + 1], color, SEAM_WIDTH)

func _draw_base(b: Dictionary) -> void:
	var x := int(b["x"])
	var y := int(b["y"])
	var corners := Iso.footprint(x, y, BASE_SPAN, BASE_SPAN)
	var fill := BASE_OWN if b["mine"] else BASE_OTHER
	draw_colored_polygon(corners, fill)
	var closed := corners.duplicate()
	closed.append(corners[0])
	draw_polyline(closed, OUTLINE if b["mine"] else Color(1, 1, 1, 0.6), 3.0 if b["mine"] else 1.5)

func _draw_npc(n: Dictionary) -> void:
	var c := Iso.tile_center(int(n["x"]), int(n["y"]))
	var kind := String(n["kind"])
	var half_w := Iso.TILE_W * 0.5 * NPC_SIZE
	var half_h := Iso.TILE_H * 0.5 * NPC_SIZE
	var diamond := PackedVector2Array([c + Vector2(0, -half_h), c + Vector2(half_w, 0), c + Vector2(0, half_h), c + Vector2(-half_w, 0)])
	draw_colored_polygon(diamond, NPC_COLORS.get(kind, Color.GRAY))
	var badge_at := c + Vector2(half_w * 0.62, -half_h * 0.7)
	draw_circle(badge_at, 11.0, BADGE_FILL)
	draw_arc(badge_at, 11.0, 0.0, TAU, 20, BADGE_RING_FORTIFIED if kind == "fortified_line" else BADGE_RING, 2.0)
	_draw_text(str(int(n["level"])), badge_at + Vector2(0, 6), 16, Color("fff8e6"))

func _draw_hq(h: Dictionary) -> void:
	var c := Iso.tile_center(int(h["x"]), int(h["y"]))
	var color := HQ_OWN if h["mine"] else HQ_OTHER
	var r := 0.62 * Iso.TILE_H
	draw_circle(c, r, Color(color, 0.35))
	draw_arc(c, r, 0.0, TAU, 28, color, 4.0 if h["mine"] else 3.0)
	var tag := String(h["tag"])
	if _tag_re.search(tag) != null:
		_draw_text(tag, c + Vector2(0, -r - 6), 16, Color("fff8e6"))

func _draw_marches() -> void:
	for m: Dictionary in map.snapshot["marches"]:
		var from := Iso.tile_center(int(m["from"]["x"]), int(m["from"]["y"]))
		var to := Iso.tile_center(int(m["to"]["x"]), int(m["to"]["y"]))
		draw_line(from, to, ROUTE_MINE if m["mine"] else ROUTE_OTHER, 3.0)

func _draw_text(text: String, at: Vector2, font_size: int, color: Color) -> void:
	var font := ThemeDB.fallback_font
	var width := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	draw_string(font, at - Vector2(width * 0.5, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)
