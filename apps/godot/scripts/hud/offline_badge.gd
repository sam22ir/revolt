class_name OfflineBadge
extends PanelContainer
## "Offline — reconnecting…" over the tab bar while the server cannot be reached: a dark red plate with the cut-signal icon, which
## breathes while it shows. It takes no touches.

const BREATH_S := 0.9

var _icon := HudIcon.new("offline", 30.0)
var _label := UiKit.label("", UiKit.BODY, HudTheme.BUTTON_TEXT, true)
var _tween: Tween

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	visible = false
	var box := HudTheme.flat(Color("5e1f17"), 14.0, HudTheme.BUTTON_INK, 2.0)
	box.content_margin_left = HudTheme.px(10)
	box.content_margin_right = HudTheme.px(14)
	box.content_margin_top = HudTheme.px(3)
	box.content_margin_bottom = HudTheme.px(4)
	box.shadow_color = HudTheme.SHADOW
	box.shadow_size = roundi(HudTheme.px(4))
	add_theme_stylebox_override("panel", box)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	row.add_child(_icon)
	_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_label)
	add_child(row)

func refresh() -> void:
	_label.text = Loc.t("sync.offline")

func text() -> String:
	return _label.text

func set_online(online: bool) -> void:
	if visible == not online:
		return
	visible = not online
	if _tween != null:
		_tween.kill()
		_tween = null
	_icon.modulate.a = 1.0
	if visible and is_inside_tree():
		_tween = create_tween().set_loops().set_trans(Tween.TRANS_SINE)
		_tween.tween_property(_icon, "modulate:a", 0.45, BREATH_S)
		_tween.tween_property(_icon, "modulate:a", 1.0, BREATH_S)
