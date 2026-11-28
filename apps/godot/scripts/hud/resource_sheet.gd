class_name ResourceSheet
extends Control
## Opened by tapping a resource in the top bar: the resource's icon, name and what it is for; how full the store is and how long until
## it is full; the hourly rate and where it comes from (the producing building, liberated regions, lessons); and where the storage
## room comes from. "Go to" opens that building's card on the base; when the store is near full, "More room" opens the command post.
## Follows the counters while it is open (`tick`). A tap outside closes it.

signal closed
## The player asked to see a building (its upgrade card on the base).
signal building_requested(building: String)

var resource_id := ""
var icon := HudIcon.new("food", 52.0)
var name_label := UiKit.label("", UiKit.TITLE + 2.0, HudTheme.GOLD, true)
var use_label := UiKit.label("", UiKit.BODY, HudTheme.TEXT_SECOND, false, true)
var stored_label := UiKit.label("", UiKit.BODY + 2.0, HudTheme.TEXT, true)
var bar := UiKit.progress_bar()
var time_label := UiKit.label("", UiKit.BODY, HudTheme.TEXT, false, true)
var rows := VBoxContainer.new()
var storage_label := UiKit.label("", UiKit.SMALL, HudTheme.TEXT_SECOND, false, true)
var go_button := UiKit.primary_button("")
var room_button := Button.new()

var _card := PanelContainer.new()
var _rate_card: PanelContainer
var _model := {}
var _key := ""

func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)
	var centre := CenterContainer.new()
	centre.set_anchors_preset(Control.PRESET_FULL_RECT)
	centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(centre)
	_card.custom_minimum_size.x = HudTheme.px(320)
	_card.mouse_filter = Control.MOUSE_FILTER_STOP
	_card.add_theme_stylebox_override("panel", HudTheme.sheet(16.0, 16.0))
	centre.add_child(_card)
	var box := VBoxContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	_card.add_child(box)
	var head := HBoxContainer.new()
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(icon)
	var words := VBoxContainer.new()
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.add_theme_constant_override("separation", roundi(HudTheme.px(2)))
	words.add_child(name_label)
	use_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.add_child(use_label)
	head.add_child(words)
	box.add_child(head)
	var store := UiKit.card()
	var store_body := UiKit.card_body(store)
	var store_row := HBoxContainer.new()
	store_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	store_row.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	var storage_icon := HudIcon.new("storage", 24.0)
	storage_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	store_row.add_child(storage_icon)
	stored_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	store_row.add_child(stored_label)
	store_body.add_child(store_row)
	bar.max_value = 1.0
	bar.step = 0.0
	store_body.add_child(bar)
	store_body.add_child(time_label)
	box.add_child(store)
	_rate_card = UiKit.section("clock", "")
	rows.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rows.add_theme_constant_override("separation", roundi(HudTheme.px(4)))
	UiKit.card_body(_rate_card).add_child(rows)
	box.add_child(_rate_card)
	box.add_child(storage_label)
	go_button.focus_mode = Control.FOCUS_NONE
	go_button.pressed.connect(func() -> void:
		var b := String(_model.get("producer", ""))
		if b != "":
			building_requested.emit(b))
	box.add_child(go_button)
	room_button.focus_mode = Control.FOCUS_NONE
	room_button.custom_minimum_size.y = HudTheme.px(UiKit.TAP)
	HudTheme.dress(room_button, "wood")
	room_button.pressed.connect(func() -> void: building_requested.emit(ResourceSheetModel.STORAGE_BUILDING))
	box.add_child(room_button)

## Opens on resource `id`; `model` is ResourceSheetModel.build at the moment of the tap.
func open(id: String, model: Dictionary) -> void:
	resource_id = id
	visible = true
	_key = ""
	show_model(model)

func close() -> void:
	if not visible:
		return
	visible = false
	closed.emit()

## Draws `model` (ResourceSheetModel.build). Cheap to call every frame: it redraws only when a shown text changes.
func show_model(model: Dictionary) -> void:
	_model = model
	var lang := Fmt.lang()
	var id := String(model["id"])
	var stored := Loc.t("resourceSheet.stored", {"amount": Fmt.amount(lang, floorf(float(model["amount"]))), "cap": Fmt.amount(lang, model["cap"])})
	var time := _time_text(model)
	var key := "|".join([TranslationServer.get_locale(), Loc.background_id, id, stored, time, str(model["rate"]), str(model["producer_level"]), str(model["storage_level"]), str(model["liberation_pct"]), str(model["lesson_pct"])])
	bar.value = float(model["fraction"])
	if key == _key:
		return
	_key = key
	icon.set_icon(id)
	name_label.text = Loc.t("resource." + id)
	var hq := Loc.t("building.%s.name" % model["storage_building"])
	use_label.text = Loc.t("resourceSheet.use." + id, {"building": hq})
	stored_label.text = stored
	UiKit.section_title(_rate_card).text = Loc.t("resourceSheet.perHour")
	time_label.text = time
	time_label.add_theme_color_override("font_color", HudTheme.LACKING if model["full"] else HudTheme.TEXT)
	_fill_rows(model)
	storage_label.text = Loc.t("resourceSheet.storage", {"building": hq, "level": Fmt.amount(lang, model["storage_level"])})
	var producer := String(model["producer"])
	go_button.visible = producer != ""
	if producer != "":
		go_button.text = Loc.t("resourceSheet.goTo", {"building": Loc.t("building.%s.name" % producer)})
	# Room is the command post's: offered when the store is nearly full and the producer is not already the command post.
	room_button.visible = float(model["fraction"]) >= HudModel.NEAR_FRACTION and producer != ResourceSheetModel.STORAGE_BUILDING
	room_button.text = Loc.t("resourceSheet.moreRoom")

static func _time_text(model: Dictionary) -> String:
	if model["full"]:
		return Loc.t("resourceSheet.full", {"building": Loc.t("building.%s.name" % model["storage_building"])})
	if int(model["full_in_ms"]) < 0:
		return Loc.t("resourceSheet.noProduction")
	return Loc.t("resourceSheet.fullIn", {"time": Fmt.duration(int(model["full_in_ms"]))})

func _fill_rows(model: Dictionary) -> void:
	for child in rows.get_children():
		rows.remove_child(child)
		child.queue_free()
	var lang := Fmt.lang()
	var producer := String(model["producer"])
	if producer != "":
		var source := Loc.t("resourceSheet.source", {"building": Loc.t("building.%s.name" % producer), "level": Fmt.amount(lang, model["producer_level"])})
		rows.add_child(UiKit.stat_row(HudIcon.new(String(model["id"]), 22.0), source, Loc.t("hud.rate", {"amount": Fmt.amount(lang, model["base_rate"])})))
	if int(model["liberation_pct"]) > 0:
		rows.add_child(UiKit.stat_row(HudIcon.new("map", 22.0), Loc.t("resourceSheet.liberation"), Loc.t("resourceSheet.percent", {"amount": Fmt.amount(lang, model["liberation_pct"])})))
	if int(model["lesson_pct"]) > 0:
		rows.add_child(UiKit.stat_row(HudIcon.new("info", 22.0), Loc.t("resourceSheet.lessons"), Loc.t("resourceSheet.percent", {"amount": Fmt.amount(lang, model["lesson_pct"])})))
	rows.add_child(UiKit.divider())
	var total := UiKit.stat_row(null, Loc.t("resourceSheet.total"), Loc.t("hud.rate", {"amount": Fmt.amount(lang, model["rate"])}))
	(total.find_child("Value", true, false) as Label).add_theme_color_override("font_color", HudTheme.GOLD)
	rows.add_child(total)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		close()
