class_name HeroPortrait
extends Control
## A hero's square portrait (art/icons/hero_<id>.svg) in a frame of their rarity's colour, with their level on a badge at the bottom
## end; a hero not recruited is dimmed, with a lock there.

## The frame's colour per rarity. Plain metal and enamel, no gold.
const FRAMES := {"common": Color("a89f8a"), "rare": Color("5fa0d4"), "legendary": Color("e2793a")}
## The badge behind the rarity's word, dark enough for the light text.
const BADGES := {"common": Color("5f594c"), "rare": Color("2c5c86"), "legendary": Color("94451a")}
const RIM := 3.2
const INK_RIM := 1.6
## The level badge, at most; a small portrait has a smaller one.
const BADGE := 26.0

var _icon: HudIcon

## `size` is in mockup px; `level` 0 for a hero not recruited.
func _init(id: String, rarity: String, size := 120.0, level := 0) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2.ONE * HudTheme.px(size)
	_icon = HudIcon.new("hero_" + id, 1.0)
	_icon.custom_minimum_size = Vector2.ZERO
	_icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, roundi(HudTheme.px(INK_RIM)))
	_icon.set_dimmed(level == 0)
	add_child(_icon)
	var radius := size * 0.12
	_add_rim(HudTheme.BUTTON_INK, RIM + INK_RIM * 2.0, radius, 0.0)
	_add_rim(FRAMES[rarity] if level > 0 else (FRAMES[rarity] as Color).darkened(0.35), RIM, radius - INK_RIM, INK_RIM)
	if level > 0:
		_add_level(Fmt.amount(Fmt.lang(), level), clampf(size * 0.3, 20.0, BADGE))
	else:
		_pin(HudIcon.new("lock", size * 0.32))

func _add_rim(colour: Color, width: float, radius: float, inset: float) -> void:
	var rim := Panel.new()
	rim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := HudTheme.flat(Color(0, 0, 0, 0), radius, colour, width)
	box.draw_center = false
	rim.add_theme_stylebox_override("panel", box)
	rim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, roundi(HudTheme.px(inset)))
	add_child(rim)

func _add_level(text: String, across: float) -> void:
	var badge := PanelContainer.new()
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.add_theme_stylebox_override("panel", HudTheme.round_style(Color("4a3522"), HudTheme.RING, across, 1.6))
	badge.custom_minimum_size = Vector2.ONE * HudTheme.px(across)
	var number := UiKit.label(text, UiKit.BODY if across > 22.0 else UiKit.SMALL, HudTheme.BUTTON_TEXT, true)
	number.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	number.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	badge.add_child(number)
	_pin(badge)

## Hangs `mark` over the portrait's bottom end corner (the anchors mirror in Arabic).
func _pin(mark: Control) -> void:
	mark.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	mark.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	mark.grow_vertical = Control.GROW_DIRECTION_BEGIN
	mark.offset_right = HudTheme.px(5)
	mark.offset_bottom = HudTheme.px(5)
	add_child(mark)

static func rarity_badge(rarity: String) -> PanelContainer:
	return UiKit.badge(Loc.t("rarity." + rarity), BADGES[rarity])
