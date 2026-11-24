class_name PageBackdrop
extends Control
## What a full page stands on: the walnut wall, and on it a leather panel in the big brass frame, with a faint engraved survey map and a
## pool of warm light from above. The page's content stays `MARGIN` mockup px from the edges, clear of the frame.

const MARGIN := 20.0
## Where a scrolling area starts, in viewport px: just inside the frame's rim, so nothing scrolls over it.
const RIM := 34
## The wall showing round the panel, in viewport px.
const WALL := 6.0
const ENGRAVING_ALPHA := 0.16

var _wall: Texture2D = load(HudTheme.KIT + "fill_wood.webp")
var _engraving: Texture2D = load(HudTheme.KIT + "engraving.svg")
var _panel := HudTheme.framed("frame_sheet", 138.0, "leather", 0.0, 0.0)
var _light := _make_light()

func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	resized.connect(queue_redraw)

func _draw() -> void:
	var all := Rect2(Vector2.ZERO, size)
	draw_texture_rect(_wall, all, true)
	var page := all.grow(-WALL)
	# The panel without its frame, the engraving and the light on it, then the frame over them.
	var leather := FrameBox.new()
	leather.fill = _panel.fill
	draw_style_box(leather, page)
	var side := page.size.x * 1.15
	var at := Rect2(page.get_center() - Vector2.ONE * side * 0.5, Vector2.ONE * side)
	draw_texture_rect(_engraving, at, false, Color(1, 1, 1, ENGRAVING_ALPHA))
	draw_texture_rect(_light, page, false)
	var frame := FrameBox.new()
	frame.frame = _panel.frame
	frame.edge = _panel.edge
	draw_style_box(frame, page)

## Warm in the upper middle, dark toward the corners.
static func _make_light() -> GradientTexture2D:
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 0.45, 1.0])
	gradient.colors = PackedColorArray([Color(1.0, 0.8, 0.45, 0.10), Color(0.2, 0.1, 0.0, 0.0), Color(0.0, 0.0, 0.0, 0.55)])
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.3)
	texture.fill_to = Vector2(0.5, 1.15)
	texture.width = 128
	texture.height = 256
	return texture
