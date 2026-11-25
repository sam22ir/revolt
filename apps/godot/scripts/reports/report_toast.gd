class_name ReportToast
extends Button
## A "New battle report" card under the top bar: the result's icon and rim, what was marched at, and the result. Tapping it opens the
## report; it goes after SHOW_S seconds (the report stays in the list). Shown for a report the socket pushed that the list did not hold
## yet (see Session.add_report).

signal opened(id: String)

const SHOW_S := 15.0
const SLIDE_S := 0.22
const ICON := 46.0

var _report: Dictionary = {}
var _timer := Timer.new()
var _box := HudTheme.card(10.0, 8.0)
var _down := HudTheme.card(10.0, 8.0)
var _row := HBoxContainer.new()
var _icon := HudIcon.new("", ICON)
var _news := UiKit.label("", UiKit.SMALL, HudTheme.TEXT_SECOND)
var _target := UiKit.label("", UiKit.BODY + 1.0, HudTheme.BUTTON_TEXT, true)
var _badge_place := CenterContainer.new()
var _chevron := HudIcon.new("chevron", 18.0)
var _tween: Tween

func _init() -> void:
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	focus_mode = Control.FOCUS_NONE
	_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_row.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_row.add_child(_icon)
	var words := VBoxContainer.new()
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.alignment = BoxContainer.ALIGNMENT_CENTER
	words.add_theme_constant_override("separation", 0)
	for label: Label in [_news, _target]:
		label.clip_text = true
		label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		words.add_child(label)
	_row.add_child(words)
	_badge_place.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_row.add_child(_badge_place)
	_chevron.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_row.add_child(_chevron)
	add_child(_row)

func _ready() -> void:
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	_down.fill_tint = Color(0.7, 0.68, 0.66)
	for state in ["normal", "hover", "disabled"]:
		add_theme_stylebox_override(state, _box)
	for state in ["pressed", "hover_pressed"]:
		add_theme_stylebox_override(state, _down)
	add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	_row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_row.offset_left = _box.content_margin_left
	_row.offset_right = -_box.content_margin_right
	_row.offset_top = _box.content_margin_top
	_row.offset_bottom = -_box.content_margin_bottom
	custom_minimum_size.y = HudTheme.px(ICON) + _box.content_margin_top + _box.content_margin_bottom
	_timer.one_shot = true
	_timer.wait_time = SHOW_S
	_timer.timeout.connect(hide_toast)
	add_child(_timer)
	pressed.connect(_on_pressed)

## Shows the notice for one report, replacing any notice already up.
func show_report(report: Dictionary) -> void:
	_report = report
	refresh()
	visible = true
	_timer.start()
	if _tween != null:
		_tween.kill()
	modulate.a = 0.0
	_row.position.y = -HudTheme.px(8)
	_tween = create_tween().set_parallel().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_tween.tween_property(self, "modulate:a", 1.0, SLIDE_S)
	_tween.tween_property(_row, "position:y", _box.content_margin_top, SLIDE_S)

## Draws the texts again (the language changed while it shows).
func refresh() -> void:
	if _report.is_empty():
		return
	var row := ReportsModel.row(_report)
	var result := String(row["result"])
	var colour: Color = ReportsScreen.RESULT_COLOURS.get(result, HudTheme.DISABLED)
	_icon.set_icon(ReportsScreen.RESULT_ICONS.get(result, "reports"))
	_news.text = Loc.t("report.newReport")
	var kind := String(row["target_kind"])
	var target := ReportsScreen.target_name(kind)
	_target.text = target if kind == "" else Loc.t("march.entry", {"name": target, "level": Fmt.amount(Fmt.lang(), row["level"])})
	for child in _badge_place.get_children():
		_badge_place.remove_child(child)
		child.queue_free()
	_badge_place.add_child(UiKit.badge(Loc.t("march.result." + result), colour))
	_chevron.flip_h = Fmt.lang() == "ar"
	_box.frame_tint = colour.lightened(0.45)
	_down.frame_tint = _box.frame_tint
	queue_redraw()

func hide_toast() -> void:
	visible = false
	_timer.stop()

func _on_pressed() -> void:
	var id := String(_report.get("id", ""))
	hide_toast()
	opened.emit(id)
