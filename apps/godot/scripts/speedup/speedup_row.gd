class_name SpeedupRow
extends VBoxContainer
## The speed-up control inside a sheet: the wallet line (tokens held, time the day still allows), one button "Use 1 on the
## upgrade/training", and under it why it is off (or a refusal for a few seconds). It draws what SpeedupModel.view says and
## sends `pressed`; the server decides the rest.

signal pressed

const FONT := 40 # UiKit.BODY in viewport px
const NOTE_S := 4.0
const MUTED := HudTheme.TEXT_SECOND
const LACKING := HudTheme.LACKING

## "upgrade" or "training": picks the button's text.
var kind := "upgrade"
var _line := _label("", MUTED)
var _button := Button.new()
var _reason := _label("", LACKING, true)
var _note_code := ""
var _note_timer := Timer.new()
var _pending := false
var _blocked := true

func _init() -> void:
	visible = false
	_button.focus_mode = Control.FOCUS_NONE
	_button.add_theme_font_size_override("font_size", FONT)
	_button.custom_minimum_size.y = HudTheme.px(UiKit.TAP)
	_button.pressed.connect(func() -> void:
		if not _blocked and not _pending:
			pressed.emit())
	_note_timer.one_shot = true
	_note_timer.wait_time = NOTE_S
	_note_timer.timeout.connect(func() -> void: _note_code = "")
	add_child(_line)
	add_child(_button)
	add_child(_reason)
	add_child(_note_timer)

## Takes a SpeedupModel.view; call every frame while the sheet shows.
func update_view(v: Dictionary) -> void:
	visible = bool(v["visible"])
	if not visible:
		return
	var lang := Fmt.lang()
	_line.text = "%s · %s" % [Loc.t("live.store.tokens", {"count": Fmt.amount(lang, v["tokens"])}), Loc.t("live.store.dailyLeft", {"time": Fmt.duration(float(v["left_ms"]))})]
	_button.text = Loc.t("live.store.useOn." + kind)
	_blocked = String(v["reason"]) != ""
	var shown: String = String(v["reason"]) if _blocked else _note_code
	_reason.text = Loc.t("reason." + shown) if shown != "" else ""
	_reason.visible = shown != ""
	_button.disabled = _blocked or _pending

## The request is in flight: the button is off until the answer is applied (one press spends one token).
func set_pending(pending: bool) -> void:
	_pending = pending
	_button.disabled = _blocked or _pending

## The server's refusal (a `reason.*` code), shown under the button for a few seconds.
func show_note(code: String) -> void:
	_note_code = code
	_note_timer.start()

func is_blocked() -> bool:
	return _blocked

func reason_text() -> String:
	return _reason.text

func button() -> Button:
	return _button

static func _label(text: String, color: Color, wrap := false) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", FONT)
	label.add_theme_color_override("font_color", color)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label
