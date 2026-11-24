class_name QueuePill
extends PanelContainer
## The builders' status (ui/hud.ts) beside a painted hammer: "Builders idle — tap a building" with a gold rim that invites a tap,
## or the running upgrade ("Command post → level 2") with its countdown from the server's end time and a thin bar along the
## pill's bottom edge showing how far it is. Its structure text changes only when the job does; the countdown and the bar move
## in place, and nothing changes the pill's height.

const FONT := 32 # HudTheme.font(FONT_SMALL), a mockup 11 px
## How long a refusal stays on the pill (Phaser's NOTE_MS in ui/hud.ts).
const NOTE_S := 4.0

signal help_pressed

var _label := Label.new()
var _time := Label.new()
var _box: FrameBox
var _text_key := ""
var _help := Button.new()
var _note_code := ""
var _note_timer := Timer.new()
var _fraction := 0.0
var _busy := false

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	_box = HudTheme.panel(9.0, 4.0)
	add_theme_stylebox_override("panel", _box)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 16)
	# No taller than the text line (the top bar must not grow: the camp is fitted under it), and the SVG so it reads at this size.
	var hammer := HudIcon.new("hammer", 20.0)
	hammer.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(hammer)
	_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# One line only: a longer text must not make the top box taller, because the base is fitted below it.
	_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_label.clip_text = true
	for label in [_label, _time]:
		label.add_theme_font_size_override("font_size", FONT)
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# The help button always takes its place in the row (a button is taller than a label), and only shows when it is offered:
	# hidden by alpha and input, not by `visible`, so the pill keeps one height and the base is never refitted when it appears.
	_help.add_theme_font_size_override("font_size", FONT)
	_help.focus_mode = Control.FOCUS_NONE
	_help.pressed.connect(func() -> void: help_pressed.emit())
	_set_help_shown(false)
	_note_timer.one_shot = true
	_note_timer.wait_time = NOTE_S
	_note_timer.timeout.connect(func() -> void: _note_code = "")
	add_child(_note_timer)
	row.add_child(_label)
	row.add_child(_time)
	row.add_child(_help)
	add_child(row)

func _set_help_shown(shown: bool) -> void:
	_help.modulate.a = 1.0 if shown else 0.0
	_help.disabled = not shown
	_help.mouse_filter = Control.MOUSE_FILTER_STOP if shown else Control.MOUSE_FILTER_IGNORE

## A refusal of the help request, shown in place of the countdown for NOTE_S seconds (reason codes re-translate with the language).
func show_note(code: String) -> void:
	_note_code = code
	_note_timer.start()

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
		# Idle builders are an invitation: a gold rim.
		_box = HudTheme.panel(9.0, 4.0, not m["busy"])
		add_theme_stylebox_override("panel", _box)
	_set_help_shown(m["help"])
	# A lone space keeps the row's height (an empty button is shorter) but gives its width to the text beside it.
	_help.text = Loc.t("help.ask") if m["help"] else " "
	_busy = m["busy"]
	var fraction := float(m.get("fraction", 0.0)) if _busy else 0.0
	if not is_equal_approx(fraction, _fraction):
		_fraction = fraction
		queue_redraw()
	if _note_code != "":
		_time.text = Loc.t("reason." + _note_code)
	else:
		_time.text = Fmt.duration(float(m["remainingMs"])) if m["busy"] else ""

## The running upgrade's progress: a gold line along the bottom edge, inside the rounded corners.
func _draw() -> void:
	if not _busy or _fraction <= 0.0:
		return
	var inset := HudTheme.px(10)
	var h := HudTheme.px(2.5)
	var width := (size.x - inset * 2.0) * _fraction
	var x := inset if not is_layout_rtl() else size.x - inset - width
	draw_rect(Rect2(x, size.y - h - HudTheme.px(2), width, h), HudTheme.GOLD)

func progress() -> float:
	return _fraction
