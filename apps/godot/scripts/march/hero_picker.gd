class_name HeroPicker
extends Control
## Who takes a place on the march: a card over the sheet with a row per free hero (portrait, name, level, specialty) and one for nobody. A
## hero who has another place is shown but cannot be taken. A tap outside changes nothing.

## The hero's id, or "" for nobody.
signal picked(id: String)

var _title := UiKit.label("", UiKit.TITLE, HudTheme.TEXT, true)
var _rows := VBoxContainer.new()
var _scroll := ScrollContainer.new()

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
	card.add_theme_stylebox_override("panel", HudTheme.sheet(16.0, 16.0))
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(_title)
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rows.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	_scroll.add_child(_rows)
	box.add_child(_scroll)
	card.add_child(box)
	centre.add_child(card)

## Opens for a place called `title`. `free` are the heroes who can go, `owned` the base's table, `taken` the ids with another place and
## `now_id` who has this one ("" for nobody).
func open(title: String, free: Array, owned: Dictionary, taken: Array, now_id: String) -> void:
	_title.text = title
	for child in _rows.get_children():
		_rows.remove_child(child)
		child.queue_free()
	for id: String in free:
		_rows.add_child(_row(id, int(owned[id]["level"]) if owned.has(id) else 1, taken.has(id), id == now_id))
	var nobody := ListRow.new("avatar")
	nobody.title.text = Loc.t("march.heroNone")
	nobody.subtitle.visible = false
	nobody.pressed.connect(_take.bind(""))
	_rows.add_child(nobody)
	_scroll.custom_minimum_size = Vector2(HudTheme.px(300), minf(_rows.get_combined_minimum_size().y, size.y * 0.7))
	visible = true

func close() -> void:
	visible = false

func rows() -> Array:
	return _rows.get_children()

func _row(id: String, level: int, taken: bool, here: bool) -> ListRow:
	var def: Dictionary = Balance.data()["heroes"][id]
	var row := ListRow.new("hero_" + id, not taken)
	row.title.text = Loc.t("hero.%s.name" % id)
	row.subtitle.text = "%s · %s" % [Loc.t("panel.level", {"level": Fmt.amount(Fmt.lang(), level)}), Loc.t("troop.%s.name" % def["specialty"])]
	row.set_rim(HeroPortrait.FRAMES[def["rarity"]])
	row.modulate.a = 0.45 if taken else 1.0
	if here:
		row.title.add_theme_color_override("font_color", HudTheme.GOLD)
	row.pressed.connect(_take.bind(id))
	return row

func _take(id: String) -> void:
	close()
	picked.emit(id)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		close()
