class_name Gauge
extends Control
## A dark rounded tray that fills with a colour from the reading start, the whole height of it (a store, an upgrade's progress). What is
## written on it goes over it as siblings or children. `warm` gives it the amber rim of something that invites a tap.

## The face inside the rim, in viewport px (tools/ui/build_frames.py `gauge`): sides and top, and the foot above its lip.
const RIM := 8.0
const FOOT := 14.0
## The bright line at the fill's edge.
const EDGE := 4.0

var fraction := 0.0
var colour := Color.WHITE
var _warm := false
var _trays := {true: HudTheme.slice("gauge_warm", 30.0, 0.0, 0.0), false: HudTheme.slice("gauge", 30.0, 0.0, 0.0)}
var _clip := Control.new()
var _fill := Panel.new()
var _edge := ColorRect.new()

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_clip.clip_contents = true
	_clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fill.add_theme_stylebox_override("panel", HudTheme.slice("gauge_fill", 20.0, 0.0, 0.0))
	_edge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_clip.add_child(_fill)
	_clip.add_child(_edge)
	add_child(_clip)
	resized.connect(_layout)

func set_fill(to: float, tint: Color) -> void:
	to = clampf(to, 0.0, 1.0)
	if is_equal_approx(to, fraction) and tint == colour:
		return
	fraction = to
	colour = tint
	_fill.modulate = tint
	_edge.color = Color(tint.lightened(0.45), 0.9)
	_layout()

func set_warm(warm: bool) -> void:
	if warm != _warm:
		_warm = warm
		queue_redraw()

func is_warm() -> bool:
	return _warm

func _notification(what: int) -> void:
	if what == NOTIFICATION_LAYOUT_DIRECTION_CHANGED:
		# After the children have turned too: a child laid out before that is mirrored once more.
		_layout.call_deferred()

func _layout() -> void:
	var face := Rect2(RIM, RIM, maxf(0.0, size.x - RIM * 2.0), maxf(0.0, size.y - RIM - FOOT))
	var width := face.size.x * fraction
	var rtl := is_layout_rtl()
	_clip.position = Vector2(face.end.x - width if rtl else face.position.x, face.position.y)
	_clip.size = Vector2(width, face.size.y)
	# The fill is always the whole face, seen through the clip, so its rounded ends never squash.
	_fill.position = Vector2(width - face.size.x if rtl else 0.0, 0.0)
	_fill.size = face.size
	_edge.visible = fraction > 0.03 and fraction < 0.97
	_edge.position = Vector2(0.0 if rtl else width - EDGE, 0.0)
	_edge.size = Vector2(EDGE, face.size.y)
	queue_redraw()

func _draw() -> void:
	draw_style_box(_trays[_warm], Rect2(Vector2.ZERO, size))
