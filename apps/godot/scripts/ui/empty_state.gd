class_name EmptyState
extends VBoxContainer
## What a page shows when it has nothing: a big icon, one line, and the action that would fill it.

signal pressed

func _init(icon_name: String, text: String, action := "") -> void:
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	alignment = BoxContainer.ALIGNMENT_CENTER
	add_theme_constant_override("separation", roundi(HudTheme.px(14)))
	var icon := HudIcon.new(icon_name, 110.0)
	icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	icon.set_dimmed(true)
	add_child(icon)
	var line := UiKit.label(text, UiKit.BODY + 1.0, HudTheme.TEXT, false, true)
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(line)
	if action != "":
		var button := UiKit.primary_button(action)
		button.custom_minimum_size.x = HudTheme.px(190)
		button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		button.pressed.connect(func() -> void: pressed.emit())
		add_child(button)
