extends Control
## Slice 0 demo: proves the toolchain end to end (Arabic shaping and RTL, translations, server-synced clock,
## display math). Not the real UI. The "server" here is a stand-in: a base last settled 3 hours before `now`.

const LANGS: Array[String] = ["en", "ar", "fr"]
const DEMO_SERVER_NOW_MS := 1_700_000_000_000
const DEMO_OFFLINE_MS := 3 * 3600 * 1000

var _clock := Clock.new()
var _levels: Dictionary
var _resources: Dictionary
var _last_ms: int
var _title: Label
var _counter_names := {}
var _counter_values := {}
var _building_rows := {}
var _language_buttons := {}

func _ready() -> void:
	var start: Dictionary = Balance.data()["start"]
	_levels = start["levels"]
	_resources = start["resources"]
	_clock.sync(DEMO_SERVER_NOW_MS, Time.get_ticks_msec())
	_last_ms = DEMO_SERVER_NOW_MS - DEMO_OFFLINE_MS
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	_build()
	_apply_language("en")

func _build() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 32)
	add_child(margin)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	margin.add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 20)
	scroll.add_child(column)

	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 56)
	column.add_child(_title)

	var languages := HBoxContainer.new()
	languages.add_theme_constant_override("separation", 12)
	column.add_child(languages)
	for lang in LANGS:
		var button := Button.new()
		button.custom_minimum_size = Vector2(0, 96)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_apply_language.bind(lang))
		languages.add_child(button)
		_language_buttons[lang] = button

	for id: String in Balance.data()["resourceIds"]:
		var row := HBoxContainer.new()
		column.add_child(row)
		var name_label := Label.new()
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name_label.add_theme_font_size_override("font_size", 40)
		row.add_child(name_label)
		var value_label := Label.new()
		value_label.add_theme_font_size_override("font_size", 40)
		row.add_child(value_label)
		_counter_names[id] = name_label
		_counter_values[id] = value_label

	for id: String in Balance.data()["buildingIds"]:
		var name_label := Label.new()
		name_label.add_theme_font_size_override("font_size", 36)
		column.add_child(name_label)
		var desc_label := Label.new()
		desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc_label.add_theme_font_size_override("font_size", 28)
		column.add_child(desc_label)
		_building_rows[id] = [name_label, desc_label]

func _apply_language(lang: String) -> void:
	TranslationServer.set_locale(lang)
	_title.text = Loc.t("app.title")
	for l: String in _language_buttons:
		_language_buttons[l].text = Loc.t("language." + l)
	for id: String in _counter_names:
		_counter_names[id].text = Loc.t("resource." + id)
	for id: String in _building_rows:
		var level := int(_levels[id])
		_building_rows[id][0].text = "%s — %s" % [Loc.t("building.%s.name" % id), Loc.t("panel.level", {"level": level})]
		_building_rows[id][1].text = Loc.t("building.%s.desc" % id)

func _process(_delta: float) -> void:
	var now := _clock.now_ms(Time.get_ticks_msec())
	var amounts := ResourceDisplay.amounts(_resources, _levels, _last_ms, now)
	for id: String in amounts:
		_counter_values[id].text = str(int(floor(amounts[id])))
