class_name SettingsPage
extends PageFrame
## The Settings page: who is playing (avatar, guest tag, level and power, "Link Google" marked as later), the language as three buttons,
## the sound switches, then help, privacy and the version. It opens from the player chip and the tab bar. Sound has no audio behind it
## yet, so the switches only keep their own state; help and privacy are only named until they have somewhere to go.

signal language_selected(lang: String)
signal sound_toggled(kind: String, on: bool)

const LANGS: Array[String] = ["en", "ar", "fr"]
const SOUNDS: Array[String] = ["music", "effects"]
const ABOUT := {"settings.help": "help", "settings.privacy": "lock"}

var _guest := UiKit.label("", UiKit.TITLE, HudTheme.TEXT, true)
var _guest_note := UiKit.label("", UiKit.SMALL, HudTheme.TEXT_SECOND, false, true)
var _level_chip := UiKit.stat_chip("base", "")
var _power_chip := UiKit.stat_chip("power", "")
var _link := Button.new()
var _titles := {}
var _version := UiKit.label("", UiKit.SMALL, HudTheme.TEXT_SECOND)
var _lang_buttons := {}
var _sound_labels := {}
var _sound_switches := {}
var _sound_on := {"music": true, "effects": true}
var _about_labels := {}
var _tag := ""
var _level := 0
var _power := 0

func _init() -> void:
	super("settings")
	body.add_child(_account_section())
	body.add_child(_language_section())
	body.add_child(_sound_section())
	body.add_child(_about_section())
	visible = false
	set_language(Fmt.lang())

## A card headed by an icon and a title (kept in `_titles` by its key).
func _section(key: String, icon_name: String) -> VBoxContainer:
	var card := UiKit.card()
	var inner := UiKit.card_body(card)
	inner.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	var icon := HudIcon.new(icon_name, 26.0)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(icon)
	var title := UiKit.label("", UiKit.BODY + 1.0, HudTheme.RING, true)
	title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(title)
	_titles[key] = title
	inner.add_child(head)
	inner.add_child(UiKit.divider())
	return inner

func _account_section() -> Control:
	var inner := _section("settings.account", "avatar")
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(12)))
	row.add_child(UiKit.avatar(62.0))
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", roundi(HudTheme.px(3)))
	_guest.clip_text = true
	column.add_child(_guest)
	column.add_child(_guest_note)
	column.add_child(UiKit.chips([_level_chip, _power_chip]))
	row.add_child(column)
	inner.add_child(row)
	_link.disabled = true
	_link.icon = HudIcon.load_texture("link")
	_link.expand_icon = true
	_link.add_theme_constant_override("icon_max_width", roundi(HudTheme.px(24)))
	_link.add_theme_constant_override("h_separation", roundi(HudTheme.px(8)))
	HudTheme.dress(_link, "blue")
	inner.add_child(_link)
	return inner.get_parent()

func _language_section() -> Control:
	var inner := _section("settings.language", "language")
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	var group := ButtonGroup.new()
	for lang in LANGS:
		var b := Button.new()
		b.toggle_mode = true
		b.button_group = group
		b.focus_mode = Control.FOCUS_NONE
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size.y = HudTheme.px(UiKit.BUTTON)
		HudTheme.dress(b, "wood", "amber")
		b.pressed.connect(func() -> void: language_selected.emit(lang))
		row.add_child(b)
		_lang_buttons[lang] = b
	inner.add_child(row)
	return inner.get_parent()

func _sound_section() -> Control:
	var inner := _section("settings.sound", "effects")
	for kind in SOUNDS:
		var toggle := GameSwitch.new()
		toggle.pressed.connect(func() -> void:
			_sound_on[kind] = not _sound_on[kind]
			_style_toggle(kind, true)
			sound_toggled.emit(kind, _sound_on[kind]))
		_sound_switches[kind] = toggle
		_sound_labels[kind] = _line(inner, kind, toggle)
	return inner.get_parent()

func _style_toggle(kind: String, slide := false) -> void:
	var on: bool = _sound_on[kind]
	(_sound_switches[kind] as GameSwitch).set_on(on, Loc.t("settings.on" if on else "settings.off"), slide)

func _about_section() -> Control:
	var inner := _section("settings.about", "info")
	# The two names share a line, and the version sits at the end of the heading, so the page fits a phone without scrolling.
	var row := HBoxContainer.new()
	for key: String in ABOUT:
		var half := VBoxContainer.new()
		half.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_about_labels[key] = _line(half, ABOUT[key], null)
		row.add_child(half)
	inner.add_child(row)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var head := inner.get_child(0)
	head.add_child(spacer)
	_version.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(_version)
	return inner.get_parent()

## One line of a section: an icon, a text and a control at the end. Returns its label.
func _line(inner: VBoxContainer, icon_name: String, trailing: Control) -> Label:
	var row := HBoxContainer.new()
	row.custom_minimum_size.y = HudTheme.px(UiKit.TAP)
	row.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	var icon := HudIcon.new(icon_name, 30.0)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	var text := UiKit.label("", UiKit.BODY + 1.0, HudTheme.TEXT)
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(text)
	if trailing != null:
		row.add_child(trailing)
	inner.add_child(row)
	return text

## Sets the shown guest tag (HudModel.guest_tag of the session token).
func set_guest_tag(tag: String) -> void:
	_tag = tag
	refresh()

## The player's level and power, as the player chip shows them.
func set_player(level: int, power: int) -> void:
	if level == _level and power == _power:
		return
	_level = level
	_power = power
	_set_chips()

func _set_chips() -> void:
	var lang := Fmt.lang()
	UiKit.set_chip(_level_chip, Loc.t("hud.level", {"level": Fmt.amount(lang, _level)}))
	UiKit.set_chip(_power_chip, Loc.t("hud.power", {"amount": Fmt.amount(lang, _power)}))

## Highlights the active language and translates every text again.
func set_language(lang: String) -> void:
	if _lang_buttons.has(lang):
		(_lang_buttons[lang] as Button).set_pressed_no_signal(true)
	refresh()

func refresh() -> void:
	set_title(Loc.t("settings.title"), Loc.t("settings.back"))
	for key: String in _titles:
		(_titles[key] as Label).text = Loc.t(key)
	_guest.text = Loc.t("settings.guestId", {"id": _tag})
	_guest_note.text = Loc.t("settings.guestNote")
	_set_chips()
	_link.text = "%s · %s" % [Loc.t("settings.linkGoogle"), Loc.t("settings.later")]
	for lang: String in _lang_buttons:
		(_lang_buttons[lang] as Button).text = Loc.t("language." + lang)
	for kind: String in _sound_labels:
		(_sound_labels[kind] as Label).text = Loc.t("settings." + kind)
		_style_toggle(kind)
	for key: String in _about_labels:
		(_about_labels[key] as Label).text = Loc.t(key)
	var version := String(ProjectSettings.get_setting("application/config/version", ""))
	_version.text = Loc.t("settings.version", {"version": version if version != "" else "0.1"})

func language_button(lang: String) -> Button:
	return _lang_buttons[lang]

func link_button() -> Button:
	return _link

func sound_on(kind: String) -> bool:
	return _sound_on[kind]

func sound_toggle(kind: String) -> GameSwitch:
	return _sound_switches[kind]
