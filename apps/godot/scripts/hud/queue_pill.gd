class_name QueuePill
extends PanelContainer
## The builders' status (ui/hud.ts): "Builders idle — tap a building", or the running upgrade ("Command post → level 2") with
## its countdown from the server's end time. Its structure text changes only when the job does; the countdown ticks in place.

const FONT := 32
const INK := Color8(0x2b, 0x2a, 0x24)
const GOLD := Color8(0xe0, 0xb0, 0x40)

var _label := Label.new()
var _time := Label.new()
var _box := StyleBoxFlat.new()
var _text_key := ""

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	_box.bg_color = Color(INK, 0.8)
	_box.border_color = Color(1, 1, 1, 0.25)
	_box.set_border_width_all(2)
	_box.set_corner_radius_all(18)
	_box.content_margin_left = 18
	_box.content_margin_right = 18
	_box.content_margin_top = 8
	_box.content_margin_bottom = 8
	add_theme_stylebox_override("panel", _box)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 16)
	_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# One line only: a longer text must not make the top box taller, because the base is fitted below it.
	_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_label.clip_text = true
	for label in [_label, _time]:
		label.add_theme_font_size_override("font_size", FONT)
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(_label)
	row.add_child(_time)
	add_child(row)

## Takes HudModel.pill's result.
func update_model(m: Dictionary, background: String) -> void:
	visible = m["visible"]
	if not visible:
		return
	var key := "%s|%s|%s|%s|%s" % [m["busy"], m["building"], m["level"], TranslationServer.get_locale(), background]
	if key != _text_key:
		_text_key = key
		if m["busy"]:
			_label.text = Loc.t("queue.busy", {"building": Loc.t("building.%s.name" % m["building"], {}, background), "level": Fmt.amount(Fmt.lang(), m["level"])})
		else:
			_label.text = Loc.t("queue.idle")
		_box.border_color = GOLD if m["busy"] else Color(1, 1, 1, 0.25)
	_time.text = Fmt.duration(float(m["remainingMs"])) if m["busy"] else ""
