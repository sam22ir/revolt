class_name HeroTile
extends PanelContainer
## One hero on the Heroes page's grid: the portrait, the name, and either the shards towards the next level or "Not recruited". The whole
## tile takes the tap; a drag on it scrolls the page.

signal pressed

const PORTRAIT := 124.0

var hero := ""
var _up := HudTheme.card(8.0, 9.0)
var _down := HudTheme.card(8.0, 9.0)

## `card` is one of HeroesModel.cards.
func _init(card: Dictionary) -> void:
	hero = card["id"]
	mouse_filter = Control.MOUSE_FILTER_PASS
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_down.fill_tint = Color(0.7, 0.68, 0.66)
	add_theme_stylebox_override("panel", _up)
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", roundi(HudTheme.px(4)))
	add_child(column)
	var name_label := UiKit.label(Loc.t("hero.%s.name" % hero), UiKit.BODY + 1.0, HudTheme.BUTTON_TEXT, true)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.clip_text = true
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var owned: Variant = card["owned"]
	var portrait := HeroPortrait.new(hero, card["def"]["rarity"], PORTRAIT, int(owned["level"]) if owned is Dictionary else 0)
	portrait.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	if owned is Dictionary and card["level_up"] == "":
		_add_ready(portrait)
	column.add_child(portrait)
	column.add_child(name_label)
	var rarity := HeroPortrait.rarity_badge(card["def"]["rarity"])
	rarity.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	column.add_child(rarity)
	column.add_child(_foot(card))
	_add_tap()

## The shards as a bar, or why there are none; "On a march" while the hero is out.
func _foot(card: Dictionary) -> Control:
	var foot := VBoxContainer.new()
	foot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	foot.add_theme_constant_override("separation", roundi(HudTheme.px(2)))
	var owned: Variant = card["owned"]
	var text := Loc.t("heroes.notRecruited")
	if owned is Dictionary:
		foot.add_child(shard_bar(owned, card["next_shards"]))
		text = Loc.t("heroes.busy") if card["busy"] else shard_text(owned, card["next_shards"])
	var line := UiKit.label(text, UiKit.SMALL, HudTheme.RING if owned is Dictionary and card["busy"] else HudTheme.TEXT_SECOND)
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	foot.add_child(line)
	return foot

static func shard_text(owned: Dictionary, need: int) -> String:
	if need < 0:
		return Loc.t("heroes.maxed")
	return Loc.t("heroes.shards", {"have": Fmt.amount(Fmt.lang(), owned["shards"]), "need": Fmt.amount(Fmt.lang(), need)})

static func shard_bar(owned: Dictionary, need: int) -> SegmentBar:
	var full := need < 0 or int(owned["shards"]) >= need
	return SegmentBar.new(float(maxi(1, need)), [[1 if need < 0 else int(owned["shards"]), Color("7d9a3a") if full else Color("4f86ad")]])

## An arrow on the portrait's top corner: there is a level to take.
func _add_ready(portrait: Control) -> void:
	var arrow := HudIcon.new("upgrade", 30.0)
	arrow.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	arrow.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	arrow.offset_right = HudTheme.px(7)
	arrow.offset_top = -HudTheme.px(5)
	portrait.add_child(arrow)

func _add_tap() -> void:
	var tap := Button.new()
	tap.focus_mode = Control.FOCUS_NONE
	tap.mouse_filter = Control.MOUSE_FILTER_PASS
	for state in ["normal", "hover", "pressed", "hover_pressed", "focus", "disabled"]:
		tap.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	tap.pressed.connect(func() -> void: pressed.emit())
	tap.button_down.connect(func() -> void: add_theme_stylebox_override("panel", _down))
	tap.button_up.connect(func() -> void: add_theme_stylebox_override("panel", _up))
	add_child(tap)
