class_name KitDialog
extends Control
## A question over the whole page: it dims what is behind and holds the taps until it is answered. A tap outside means no.

signal answered(yes: bool)

var message := UiKit.label("", UiKit.BODY + 2.0, HudTheme.TEXT, false, true)
var yes := Button.new()
var no := Button.new()

func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.6)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)
	var centre := CenterContainer.new()
	centre.set_anchors_preset(Control.PRESET_FULL_RECT)
	centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(centre)
	var card := PanelContainer.new()
	card.custom_minimum_size.x = HudTheme.px(300)
	card.add_theme_stylebox_override("panel", HudTheme.sheet(18.0, 18.0))
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", roundi(HudTheme.px(16)))
	message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(message)
	var answers := HBoxContainer.new()
	answers.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	for b: Button in [no, yes]:
		b.focus_mode = Control.FOCUS_NONE
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		HudTheme.dress(b, "red" if b == yes else "wood")
		answers.add_child(b)
	box.add_child(answers)
	card.add_child(box)
	centre.add_child(card)
	yes.pressed.connect(func() -> void: answered.emit(true))
	no.pressed.connect(func() -> void: answered.emit(false))

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		answered.emit(false)
