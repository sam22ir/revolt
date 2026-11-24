class_name QueuePill
extends StatusPill
## The builders' status (ui/hud.ts): idle, an amber-rimmed tray that says so and what to do about it, its hammer swinging now and then to
## invite a tap; with an upgrade running, what is being built, the countdown from the server's end time and the tray filling as it goes,
## the hammer at work. The structure text changes only when the job does, and nothing changes the pill's height.

## How long a refusal stays on the pill (Phaser's NOTE_MS in ui/hud.ts).
const NOTE_S := 4.0
const WORKING := Color("6f8a2f")
## The idle text's two halves are joined by this in every language.
const SPLIT := " — "
## The hammer's swing, in degrees, and the rest between two swings (idle, at work).
const SWING := 16.0
const REST_IDLE_S := 3.2
const REST_BUSY_S := 0.5

signal help_pressed

var _text_key := ""
var _help := Button.new()
var _note_code := ""
var _note_timer := Timer.new()
var _idle_detail := ""
## "→ Level 2", before the countdown.
var _target := ""
var _compact := false
var _busy := false
var _swing: Tween

func _init() -> void:
	super("hammer")
	# The help button is hidden by alpha and input, not by `visible`: it keeps its height, and its room is given only when it shows.
	_help.focus_mode = Control.FOCUS_NONE
	HudTheme.dress(_help, "blue", "", true)
	_help.custom_minimum_size = Vector2(44.0, 38.0) * HudTheme.SCALE
	var hands := HudIcon.new("alliance", 24.0)
	hands.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, roundi(HudTheme.px(5)))
	hands.offset_bottom -= HudTheme.LIP * 0.6
	_help.add_child(hands)
	_help.pressed.connect(func() -> void: help_pressed.emit())
	trailing = _help
	add_child(_help)
	_set_help_shown(false)
	_note_timer.one_shot = true
	_note_timer.wait_time = NOTE_S
	_note_timer.timeout.connect(func() -> void: _note_code = "")
	add_child(_note_timer)

func _ready() -> void:
	_start_swing()

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
	# Beside the marches there is no room for the help button; the base has it.
	var help: bool = m["help"] and not _compact
	var key := "%s|%s|%s|%s|%s|%s" % [m["busy"], m["building"], m["level"], help, TranslationServer.get_locale(), background]
	var changed := key != _text_key
	if changed:
		_text_key = key
		var was_busy := _busy
		_busy = m["busy"]
		if _busy:
			title.text = Loc.t("building.%s.name" % m["building"], {}, background)
			_target = "%s %s" % [UiKit.arrow(), Loc.t("panel.level", {"level": Fmt.amount(Fmt.lang(), m["level"])})]
		else:
			var halves := Loc.t("queue.idle").split(SPLIT, true, 1)
			title.text = halves[0]
			_idle_detail = halves[1] if halves.size() > 1 else ""
		_help.tooltip_text = Loc.t("help.ask")
		_set_help_shown(help)
		# Idle builders are an invitation: an amber rim.
		gauge.set_warm(not _busy)
		detail.add_theme_color_override("font_color", HudTheme.GOLD if _busy else HudTheme.TEXT)
		if was_busy != _busy and is_inside_tree():
			_start_swing()
	gauge.set_fill(float(m.get("fraction", 0.0)) if _busy else 0.0, WORKING)
	var line := _idle_detail
	if _note_code != "":
		line = Loc.t("reason." + _note_code)
	elif _busy:
		var left := Fmt.duration(float(m["remainingMs"]))
		line = left if _compact else "%s · %s" % [_target, left]
	var had := detail.text != ""
	detail.text = line
	if changed or had != (line != ""):
		layout()

## Shares the row with the marches.
func set_compact(compact: bool) -> void:
	_compact = compact

## The hammer swings back and strikes, then rests: now and then while idle, steadily at work. Only for show.
func _start_swing() -> void:
	if _swing != null:
		_swing.kill()
	icon.rotation = 0.0
	var way := -1.0 if is_layout_rtl() else 1.0
	_swing = create_tween().set_loops()
	_swing.tween_property(icon, "rotation", deg_to_rad(-SWING * way), 0.28).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	_swing.tween_property(icon, "rotation", deg_to_rad(SWING * 0.55 * way), 0.11).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_swing.tween_property(icon, "rotation", 0.0, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_swing.tween_interval(REST_BUSY_S if _busy else REST_IDLE_S)

func progress() -> float:
	return gauge.fraction
