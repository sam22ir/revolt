class_name BuildingPanel
extends PanelContainer
## The building sheet of the base screen (ui/building-panel.ts), drawn from a BuildingPanelModel: title and level, what it
## produces, then the running upgrade (bar and countdown), the next level (cost with the lacking resources in red, time,
## production, the upgrade button and why it is blocked) or the maximum-level note. The structure is rebuilt only when the
## model's key, the language, the background, the pending request or the notice change; the countdown and the bar are updated
## in place every frame. The server decides: the button only sends the intent (`upgrade_pressed`).

signal upgrade_pressed(id: String)
signal train_pressed(troop: String, count: int)
signal closed
## The hero hall sheet's link to the Heroes screen.
signal heroes_requested

const FONT := 34
const TITLE_FONT := 42
const PAPER := Color8(0xf4, 0xea, 0xd6)
const INK := Color8(0x2b, 0x2a, 0x24)
const GOLD := Color8(0xe0, 0xb0, 0x40)
const LACKING := Color8(0xb2, 0x3a, 0x2a)
const MUTED := Color8(0x6b, 0x64, 0x52)

var _model: Dictionary = {}
var _key := ""
var _pending := false
var _notice := ""
var _notice_key := ""
var _background := ""
var _body := VBoxContainer.new()
var _scroll := ScrollContainer.new()
var _max_height := 0.0
## The training form of the barracks sheet. One instance for the panel's life (see TrainingView); it is in the body only on the barracks.
var training := TrainingView.new()
## The upgrade speed-up under the running upgrade's countdown (one instance, kept across rebuilds like the training form).
var upgrade_speedup := SpeedupRow.new()
var _countdown: Label
var _bar: ProgressBar

func _ready() -> void:
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	mouse_filter = Control.MOUSE_FILTER_STOP
	var box := StyleBoxFlat.new()
	box.bg_color = PAPER
	box.border_color = GOLD
	box.set_border_width_all(4)
	box.corner_radius_top_left = 28
	box.corner_radius_top_right = 28
	box.set_content_margin_all(28)
	add_theme_stylebox_override("panel", box)
	_body.add_theme_constant_override("separation", 14)
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(_scroll)
	_scroll.add_child(_body)
	training.train_pressed.connect(func(troop: String, count: int) -> void: train_pressed.emit(troop, count))
	visible = false

## The most the sheet may take (the space between the HUD and the nav bar); a longer sheet scrolls.
## The form and the speed-up row are kept across rebuilds and are children of the body only while shown; one that is not in a tree
## when the panel itself is deleted is freed with it (not on leaving the tree: the base screen still holds them then).
func _notification(what: int) -> void:
	if what == NOTIFICATION_PREDELETE:
		for n: Node in [training, upgrade_speedup]:
			if is_instance_valid(n) and n.get_parent() == null:
				n.free()

func set_max_height(px: float) -> void:
	_max_height = px
	_fit()

func _fit() -> void:
	var want := _body.get_combined_minimum_size().y
	_scroll.custom_minimum_size.y = minf(want, _max_height) if _max_height > 0.0 else want

## Feeds the training form (only on the barracks sheet). `ctx` is TrainingView.update_context's.
func update_training(ctx: Dictionary) -> void:
	if visible and training.get_parent() == _body:
		training.update_context(ctx)
		_fit()

## Feeds the upgrade's speed-up row (shown only while the upgrading building's sheet is open).
func update_speedup(view: Dictionary) -> void:
	if visible and upgrade_speedup.get_parent() == _body:
		upgrade_speedup.update_view(view)
		_fit()

func is_open() -> bool:
	return visible

func shown_id() -> String:
	return String(_model.get("id", "")) if visible else ""

func open_for(id: String) -> void:
	_model = {"id": id}
	_key = ""
	_notice = ""
	visible = true

func close() -> void:
	visible = false
	_key = ""
	_notice = ""

## The request is in flight: the button is off until the answer is applied.
func set_pending(pending: bool) -> void:
	_pending = pending

func is_pending() -> bool:
	return _pending

## Why the server turned the upgrade down (a `reason.*` code); shown under the button until the model changes.
func set_notice(code: String) -> void:
	_notice = code
	_notice_key = String(_model.get("key", ""))
	_key = ""

## Takes the model of the shown building; call every frame while the panel is open.
func update_model(model: Dictionary, background: String) -> void:
	if not visible:
		return
	_model = model
	_background = background
	if _notice != "" and _notice_key != String(model["key"]):
		_notice = ""
	var key := "%s|%s|%s|%s|%s" % [model["key"], TranslationServer.get_locale(), background, _pending, _notice]
	if key != _key:
		_key = key
		_rebuild()
	# Every frame: the body's height is known one frame after a rebuild, and other buildings never feed the training form.
	_fit()
	if model["mode"] == "upgrading" and _countdown != null:
		_countdown.text = Fmt.duration(float(model["job"]["remainingMs"]))
		_bar.value = float(model["job"]["fraction"]) * 100.0

func _rebuild() -> void:
	for child in _body.get_children():
		_body.remove_child(child)
		if child != training and child != upgrade_speedup:
			child.queue_free()
	_countdown = null
	_bar = null
	var m := _model
	var lang := Fmt.lang()
	var id: String = m["id"]
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 14)
	var title := _label(Loc.t("building.%s.name" % id, {}, _background), TITLE_FONT, INK)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	head.add_child(_label(Loc.t("panel.level", {"level": Fmt.amount(lang, m["level"])}), FONT, MUTED))
	var close_button := Button.new()
	close_button.text = "×"
	close_button.add_theme_font_size_override("font_size", TITLE_FONT)
	close_button.tooltip_text = Loc.t("panel.close")
	close_button.pressed.connect(func() -> void:
		close()
		closed.emit())
	head.add_child(close_button)
	_body.add_child(head)
	_body.add_child(_label(Loc.t("building.%s.desc" % id, {}, _background), FONT, INK, true))

	if m["production"] != null:
		_body.add_child(_row(Loc.t("panel.production"), Loc.t("panel.perHour", {"amount": "+" + Fmt.amount(lang, m["production"]["perHour"])})))
	if m["storage"] != null:
		_body.add_child(_row(Loc.t("panel.storage"), Fmt.amount(lang, m["storage"])))

	match m["mode"]:
		"upgrading":
			_body.add_child(_label(Loc.t("panel.upgrading", {"level": Fmt.amount(lang, m["job"]["toLevel"])}), FONT, INK))
			_bar = ProgressBar.new()
			_bar.show_percentage = false
			_bar.custom_minimum_size.y = 26
			_bar.value = 0.0
			# Gold on a dark track; the fill starts at the layout's start side, so it runs right to left in Arabic.
			var track := StyleBoxFlat.new()
			track.bg_color = Color(INK, 0.35)
			track.set_corner_radius_all(10)
			var fill := StyleBoxFlat.new()
			fill.bg_color = GOLD
			fill.set_corner_radius_all(10)
			_bar.add_theme_stylebox_override("background", track)
			_bar.add_theme_stylebox_override("fill", fill)
			_body.add_child(_bar)
			_countdown = _label("", FONT, INK)
			_body.add_child(_countdown)
			_body.add_child(upgrade_speedup)
		"max":
			_body.add_child(_label(Loc.t("panel.maxLevel"), FONT, MUTED, true))
		_:
			_build_next(m["next"], lang, m["id"])

	if id == "hero_hall":
		_body.add_child(_label(Loc.t("heroes.hallNote"), FONT, INK, true))
		var heroes := Button.new()
		heroes.text = Loc.t("heroes.open")
		heroes.add_theme_font_size_override("font_size", FONT)
		heroes.pressed.connect(func() -> void: heroes_requested.emit())
		_body.add_child(heroes)
	if id == "barracks":
		_body.add_child(training)

func _build_next(n: Dictionary, lang: String, id: String) -> void:
	_body.add_child(_label(Loc.t("panel.nextLevel", {"level": Fmt.amount(lang, n["toLevel"])}), FONT + 4, INK))
	var costs := HFlowContainer.new()
	costs.add_theme_constant_override("h_separation", 24)
	for c: Dictionary in n["cost"]:
		var chip := _label("%s %s" % [Loc.t("resource." + c["id"], {}, _background), Fmt.amount(lang, c["amount"])], FONT, LACKING if c["lacking"] else INK)
		costs.add_child(chip)
	_body.add_child(costs)
	_body.add_child(_row(Loc.t("panel.duration"), Fmt.duration(float(n["durationMs"]))))
	if n["production"] != null:
		_body.add_child(_row(Loc.t("panel.production"), Loc.t("panel.perHour", {"amount": "+" + Fmt.amount(lang, n["production"])})))
	var button := Button.new()
	button.text = Loc.t("panel.upgrade")
	button.add_theme_font_size_override("font_size", FONT + 2)
	button.custom_minimum_size.y = 96
	button.disabled = not n["ok"] or _pending
	button.add_theme_stylebox_override("normal", _button_box(GOLD))
	button.add_theme_stylebox_override("hover", _button_box(GOLD.lightened(0.15)))
	button.add_theme_stylebox_override("pressed", _button_box(GOLD.darkened(0.15)))
	button.add_theme_stylebox_override("disabled", _button_box(Color8(0xd8, 0xcf, 0xb8)))
	button.add_theme_color_override("font_color", INK)
	button.add_theme_color_override("font_disabled_color", MUTED)
	button.pressed.connect(func() -> void: upgrade_pressed.emit(id))
	_body.add_child(button)
	# The check's own reason, or the one the server just gave (it can know better: a stale view, a queue started elsewhere).
	var reason := _notice if _notice != "" else (String(n["reason"]) if not n["ok"] else "")
	if reason != "":
		var key := "reason." + reason
		var text := Loc.t(key, {"level": Fmt.amount(lang, n["toLevel"])})
		_body.add_child(_label(text if text != key else Loc.t("reason.unreachable"), FONT, LACKING, true))

func _row(left: String, right: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	var a := _label(left, FONT, MUTED)
	a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(a)
	row.add_child(_label(right, FONT, INK))
	return row

## `wrap` only for a paragraph that has the whole row to itself: an auto-wrapping label inside a row or a flow container has no
## minimum width and collapses to one character per line.
func _label(text: String, size: int, color: Color, wrap := false) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

func _button_box(color: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.set_corner_radius_all(18)
	box.set_content_margin_all(12)
	return box
