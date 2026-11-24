class_name FrameBox
extends StyleBox
## A panel of the kit: a seamless material tiled at its own size, then a brass frame whose corners are whole and whose edges repeat,
## so no detail is ever stretched. Materials and frames: art/kit/ (tools/ui/). Immediate and cheap: two draw commands.

var fill: Texture2D
var frame: Texture2D
## The frame's corner, in its own px.
var edge := 0.0
## How far the material stays inside the frame's outer line, in px: under its rim, and clear of its rounded corners.
var inset := 6.5
var fill_tint := Color.WHITE
var frame_tint := Color.WHITE
## Draws the frame's own middle too (a piece that carries its fill).
var draw_centre := false

func _draw(to: RID, rect: Rect2) -> void:
	if fill != null:
		var inside := rect.grow(-inset)
		if inside.size.x > 0.0 and inside.size.y > 0.0:
			RenderingServer.canvas_item_add_texture_rect(to, inside, fill.get_rid(), true, fill_tint)
	if frame != null:
		# A box smaller than two corners shrinks them, so they never cross.
		var e := minf(edge, minf(rect.size.x, rect.size.y) * 0.5)
		RenderingServer.canvas_item_add_nine_patch(to, rect, Rect2(Vector2.ZERO, frame.get_size()), frame.get_rid(), Vector2(e, e), Vector2(e, e),
			RenderingServer.NINE_PATCH_TILE_FIT, RenderingServer.NINE_PATCH_TILE_FIT, draw_centre, frame_tint)
