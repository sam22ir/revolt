class_name SettingsPage
extends Control
## The Settings page (look test): a full page with the back button at the start edge and no resource bar. Account (the guest tag,
## "Link Google" marked as later), the language as three segmented buttons, the sound toggles, then help, privacy and the version.
## The page opens from the player chip. Sound has no audio behind it yet, so the toggles only keep their own state.

signal back_pressed
signal language_selected(lang: String)
signal sound_toggled(kind: String, on: bool)

const LANGS: Array[String] = ["en", "ar", "fr"]
const SOUNDS: Array[String] = ["music", "effects"]

var _back := Button.new()
var _back_icon := HudIcon.new("back", 20.0)
var _title := Label.new()
var _guest := Label.new()
var _guest_note := Label.new()
var _link := Button.new()
var _language_title := Label.new()
var _account_title := Label.new()
var _sound_title := Label.new()
var _about_title := Label.new()
var _version := Label.new()
var _lang_buttons := {}
var _sound_rows := {}
var _sound_on := {"music": true, "effects": true}
var _rows: Array[Dictionary] = []
var _tag := ""

func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(PageBackdrop.new())
	var page := VBoxContainer.new()
	page.set_anchors_preset(Control.PRESET_FULL_RECT)
	page.offset_left = HudTheme.px(PageBackdrop.MARGIN)
	page.offset_right = -HudTheme.px(PageBackdrop.MARGIN)
	page.offset_top = HudTheme.px(PageBackdrop.MARGIN)
	page.offset_bottom = -HudTheme.px(PageBackdrop.MARGIN)
	page.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	add_child(page)
	page.add_child(_title_bar())
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	page.add_child(scroll)
	var body := VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	scroll.add_child(body)
	body.add_child(_account_section())
	body.add_child(_language_section())
	body.add_child(_sound_section())
	body.add_child(_about_section())
	visible = false
	set_language(Fmt.lang())

func _title_bar() -> Control:
	var bar := PanelContainer.new()
	bar.add_theme_stylebox_override("panel", HudTheme.panel(6.0, 4.0))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	bar.add_child(row)
	_back.focus_mode = Control.FOCUS_NONE
	_back.custom_minimum_size = Vector2.ONE * HudTheme.px(40)
	_back.pressed.connect(func() -> void: back_pressed.emit())
	_back_icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, roundi(HudTheme.px(7)))
	_back.add_child(_back_icon)
	row.add_child(_back)
	_title.add_theme_font_override("font", load("res://fonts/IBMPlexSansArabic-Bold.ttf"))
	_title.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_BIG))
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(_title)
	return bar

func _section(title: Label) -> VBoxContainer:
	title.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL))
	title.add_theme_color_override("font_color", HudTheme.TEXT_SECOND)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", roundi(HudTheme.px(4)))
	box.add_child(title)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", HudTheme.card(12.0, 11.0))
	box.add_child(panel)
	var inner := VBoxContainer.new()
	inner.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	panel.add_child(inner)
	box.set_meta("inner", inner)
	return box

func _inner(section: VBoxContainer) -> VBoxContainer:
	return section.get_meta("inner") as VBoxContainer

func _account_section() -> Control:
	var section := _section(_account_title)
	var inner := _inner(section)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	var avatar := Panel.new()
	avatar.custom_minimum_size = Vector2.ONE * HudTheme.px(40)
	avatar.add_theme_stylebox_override("panel", HudTheme.round_style(HudTheme.TERRACOTTA, HudTheme.RING, 40.0))
	var face := HudIcon.new("avatar", 30.0)
	face.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, roundi(HudTheme.px(1)))
	avatar.add_child(face)
	row.add_child(avatar)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 0)
	_guest.add_theme_font_override("font", load("res://fonts/IBMPlexSansArabic-Bold.ttf"))
	_guest_note.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL))
	_guest_note.add_theme_color_override("font_color", HudTheme.TEXT_SECOND)
	_guest_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_guest)
	column.add_child(_guest_note)
	row.add_child(column)
	inner.add_child(row)
	_link.disabled = true
	_link.focus_mode = Control.FOCUS_NONE
	inner.add_child(_link)
	return section

func _language_section() -> Control:
	var section := _section(_language_title)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	var group := ButtonGroup.new()
	for lang in LANGS:
		var b := Button.new()
		b.toggle_mode = true
		b.button_group = group
		b.focus_mode = Control.FOCUS_NONE
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		HudTheme.dress(b, "wood", "amber")
		b.pressed.connect(func() -> void: language_selected.emit(lang))
		row.add_child(b)
		_lang_buttons[lang] = b
	_inner(section).add_child(row)
	return section

func _sound_section() -> Control:
	var section := _section(_sound_title)
	for kind in SOUNDS:
		var row := HBoxContainer.new()
		var label := Label.new()
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var toggle := Button.new()
		toggle.focus_mode = Control.FOCUS_NONE
		toggle.custom_minimum_size.x = HudTheme.px(64)
		toggle.pressed.connect(func() -> void:
			_sound_on[kind] = not _sound_on[kind]
			_style_toggle(kind)
			sound_toggled.emit(kind, _sound_on[kind]))
		row.add_child(label)
		row.add_child(toggle)
		_inner(section).add_child(row)
		_sound_rows[kind] = {"label": label, "toggle": toggle}
		_style_toggle(kind)
	return section

func _style_toggle(kind: String) -> void:
	var toggle: Button = _sound_rows[kind]["toggle"]
	var on: bool = _sound_on[kind]
	HudTheme.dress(toggle, "green" if on else "grey")
	toggle.text = Loc.t("settings.on" if on else "settings.off")

func _about_section() -> Control:
	var section := _section(_about_title)
	var inner := _inner(section)
	for key in ["settings.help", "settings.privacy"]:
		var row := HBoxContainer.new()
		var label := Label.new()
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var chevron := HudIcon.new("chevron", 16.0)
		row.add_child(label)
		row.add_child(chevron)
		inner.add_child(row)
		_rows.append({"key": key, "label": label, "chevron": chevron})
	_version.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL))
	_version.add_theme_color_override("font_color", HudTheme.TEXT_SECOND)
	inner.add_child(_version)
	return section

## Sets the shown guest tag (HudModel.guest_tag of the session token).
func set_guest_tag(tag: String) -> void:
	_tag = tag
	refresh()

## Highlights the active language and re-translates every text; the back and chevron arrows turn with the direction.
func set_language(lang: String) -> void:
	if _lang_buttons.has(lang):
		(_lang_buttons[lang] as Button).set_pressed_no_signal(true)
	refresh()

func refresh() -> void:
	var arabic := Fmt.lang() == "ar"
	_title.text = Loc.t("settings.title")
	_back.tooltip_text = Loc.t("settings.back")
	_back_icon.flip_h = arabic
	_account_title.text = Loc.t("settings.account")
	_guest.text = Loc.t("settings.guestId", {"id": _tag})
	_guest_note.text = Loc.t("settings.guestNote")
	_link.text = "%s · %s" % [Loc.t("settings.linkGoogle"), Loc.t("settings.later")]
	_language_title.text = Loc.t("settings.language")
	for lang: String in _lang_buttons:
		(_lang_buttons[lang] as Button).text = Loc.t("language." + lang)
	_sound_title.text = Loc.t("settings.sound")
	for kind: String in _sound_rows:
		(_sound_rows[kind]["label"] as Label).text = Loc.t("settings." + kind)
		_style_toggle(kind)
	_about_title.text = Loc.t("settings.about")
	for r: Dictionary in _rows:
		(r["label"] as Label).text = Loc.t(r["key"])
		(r["chevron"] as HudIcon).flip_h = arabic
	var version := String(ProjectSettings.get_setting("application/config/version", ""))
	_version.text = Loc.t("settings.version", {"version": version if version != "" else "0.1"})

func title_text() -> String:
	return _title.text

func language_button(lang: String) -> Button:
	return _lang_buttons[lang]

func back_button() -> Button:
	return _back

func link_button() -> Button:
	return _link

func sound_on(kind: String) -> bool:
	return _sound_on[kind]

func sound_toggle(kind: String) -> Button:
	return _sound_rows[kind]["toggle"]
