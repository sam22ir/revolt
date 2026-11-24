class_name MarchesStrip
extends PanelContainer
## The context strip's map half (look test): how many of the player's marches are in flight. The builders half is the QueuePill.

var _icon := HudIcon.new("marches", 18.0)
var _label := Label.new()
var _count := -1

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	add_theme_stylebox_override("panel", HudTheme.panel(8.0, 4.0))
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	_label.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL))
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_label.clip_text = true
	_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	row.add_child(_icon)
	row.add_child(_label)
	add_child(row)
	set_count(0)

func set_count(count: int) -> void:
	if count == _count:
		return
	_count = count
	refresh()

func refresh() -> void:
	if _count < 0:
		return
	_label.text = Loc.t("hud.marches", {"count": Fmt.amount(Fmt.lang(), _count)}) if _count > 0 else Loc.t("hud.marchesNone")
	_icon.set_dimmed(_count == 0)

func text() -> String:
	return _label.text
