class_name StatusPill
extends Control
## The top bar's status tray: a Gauge with an icon standing out of its start, a bold line and a quieter line under it, and room for a
## control at the end. Laid out by hand at one height, so nothing written on it moves the bar.

const HEIGHT := 45.0
const ICON := 36.0
const INSET := 8.0

var gauge := Gauge.new()
var icon: HudIcon
var title := UiKit.label("", UiKit.BODY, HudTheme.BUTTON_TEXT, true)
var detail := UiKit.label("", UiKit.SMALL, HudTheme.TEXT, true)
## A control at the reading end (the help button), and whether it takes its room.
var trailing: Control

func _init(icon_name := "") -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	custom_minimum_size.y = HudTheme.px(HEIGHT)
	add_child(gauge)
	for label: Label in [title, detail]:
		label.add_theme_color_override("font_outline_color", HudTheme.BUTTON_INK)
		label.add_theme_constant_override("outline_size", roundi(HudTheme.px(2.6)))
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.clip_text = true
		label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		add_child(label)
	icon = HudIcon.new(icon_name, ICON)
	add_child(icon)
	resized.connect(layout)

func _notification(what: int) -> void:
	if what == NOTIFICATION_LAYOUT_DIRECTION_CHANGED and icon != null:
		# After the children have turned too: a child laid out before that is mirrored once more.
		layout.call_deferred()

func layout() -> void:
	var rtl := is_layout_rtl()
	var inset := HudTheme.px(INSET)
	var side := HudTheme.px(ICON)
	gauge.position = Vector2(0.0 if rtl else inset, 0.0)
	gauge.size = Vector2(size.x - inset, size.y)
	icon.size = Vector2.ONE * side
	icon.pivot_offset = Vector2(side * (0.75 if rtl else 0.25), side * 0.85)
	icon.position = Vector2(size.x - side if rtl else 0.0, (size.y - HudTheme.px(2.0) - side) * 0.5)
	var start := side + HudTheme.px(4.0)
	var end := Gauge.RIM + HudTheme.px(4.0)
	if trailing != null and trailing.modulate.a > 0.0:
		var want := trailing.get_combined_minimum_size()
		trailing.size = Vector2(want.x, minf(want.y, size.y))
		var x := Gauge.RIM + HudTheme.px(2.0)
		trailing.position = Vector2(x if rtl else size.x - x - want.x, (size.y - HudTheme.px(2.0) - trailing.size.y) * 0.5)
		end += want.x + HudTheme.px(3.0)
	var room := maxf(0.0, size.x - start - end)
	var left := end if rtl else start
	# Two lines, or one in the middle.
	var title_h := HudTheme.px(20.0)
	var detail_h := HudTheme.px(18.0)
	var two := detail.text != ""
	var top := HudTheme.px(2.5) if two else (size.y - HudTheme.px(3.0) - title_h) * 0.5
	title.position = Vector2(left, top)
	title.size = Vector2(room, title_h)
	detail.position = Vector2(left, top + title_h - HudTheme.px(1.5))
	detail.size = Vector2(room, detail_h)
	detail.visible = two
