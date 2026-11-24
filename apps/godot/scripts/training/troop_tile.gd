class_name TroopTile
extends PanelContainer
## One troop of the training card's picker: medallion, name, how many are at home and, in red, how many are wounded. The chosen one
## has a gold ring. An invisible button over it takes the tap and lets a drag scroll the card.

signal pressed

const MEDALLION := 44.0

var troop := ""
var _name := UiKit.label("", UiKit.SMALL, HudTheme.TEXT, false, true)
var _home := UiKit.label("", UiKit.BODY, HudTheme.TEXT, true)
var _wounded := UiKit.label("", UiKit.SMALL, HudTheme.LACKING, true)
var _selected := false

func _init(id: String) -> void:
	troop = id
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(UiKit.troop_medallion(id, MEDALLION))
	_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_name.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(_name)
	var counts := HBoxContainer.new()
	counts.alignment = BoxContainer.ALIGNMENT_CENTER
	counts.add_theme_constant_override("separation", roundi(HudTheme.px(4)))
	counts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	counts.add_child(_home)
	counts.add_child(_wounded)
	col.add_child(counts)
	add_child(col)
	var tap := Button.new()
	tap.focus_mode = Control.FOCUS_NONE
	tap.mouse_filter = Control.MOUSE_FILTER_PASS
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		tap.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	tap.pressed.connect(func() -> void: pressed.emit())
	add_child(tap)
	_style()

## Takes one of TrainingModel.view's `rows`; call every frame.
func update_row(row: Dictionary, lang: String) -> void:
	_home.text = Fmt.amount(lang, row["home"])
	_wounded.text = "+" + Fmt.amount(lang, row["wounded"])
	_wounded.visible = int(row["wounded"]) > 0
	if bool(row["selected"]) != _selected:
		_selected = row["selected"]
		_style()

func retranslate() -> void:
	_name.text = Loc.t("troop.%s.name" % troop)

func is_selected() -> bool:
	return _selected

func title() -> String:
	return _name.text

func _style() -> void:
	var box := HudTheme.framed("frame_tile_on" if _selected else "frame_tile", 34.0, "leather", 2.0, 5.0, Color(1.35, 1.2, 1.0) if _selected else Color(0.85, 0.82, 0.8))
	add_theme_stylebox_override("panel", box)
	_name.add_theme_color_override("font_color", HudTheme.GOLD if _selected else HudTheme.TEXT)
