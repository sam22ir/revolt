class_name ReportToast
extends Button
## A short "New battle report" notice above the nav bar. Tapping it opens the report; it fades after SHOW_S seconds (the report
## stays in the list). Shown for a report the socket pushed that the list did not hold yet (see Session.add_report).

signal opened(id: String)

const SHOW_S := 15.0
const FONT := 30

var _report: Dictionary = {}
var _timer := Timer.new()

func _ready() -> void:
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_font_size_override("font_size", FONT)
	var box := StyleBoxFlat.new()
	box.bg_color = Color8(0x2b, 0x2a, 0x24, 235)
	box.set_corner_radius_all(18)
	box.content_margin_left = 22
	box.content_margin_right = 22
	box.content_margin_top = 10
	box.content_margin_bottom = 10
	add_theme_stylebox_override("normal", box)
	add_theme_stylebox_override("hover", box)
	add_theme_stylebox_override("pressed", box)
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

## Draws the text again (the language changed while it shows).
func refresh() -> void:
	if _report.is_empty():
		return
	text = "%s · %s" % [Loc.t("report.newReport"), Loc.t("march.result." + String(_report["result"]))]

func hide_toast() -> void:
	visible = false
	_timer.stop()

func _on_pressed() -> void:
	var id := String(_report.get("id", ""))
	hide_toast()
	opened.emit(id)
