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


const INK := HudTheme.TEXT
const LACKING := HudTheme.LACKING
const MUTED := HudTheme.TEXT_SECOND
## The close button is a round bronze face, a comfortable target (UiKit.TAP).
const CLOSE_SIZE := UiKit.TAP

var _model: Dictionary = {}
## Which part of the building the card shows: "upgrade", "info" or "train" (the barracks' training form).
var mode := "upgrade"
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
	add_theme_stylebox_override("panel", HudTheme.sheet())
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
	# The cap is on the whole sheet, so the frame's margins come off what the scroll area may take.
	var room := _max_height - get_theme_stylebox("panel").get_minimum_size().y
	_scroll.custom_minimum_size.y = minf(want, room) if _max_height > 0.0 else want
	# Anchored to the bottom, it grows upward; a Control never shrinks by itself, so a shorter sheet would keep the last one's height.
	if anchor_top == 1.0:
		offset_top = offset_bottom - get_combined_minimum_size().y
	# Centred (the building card): as tall as its content, about the middle of its parent.
	elif anchor_top == 0.5:
		var h := get_combined_minimum_size().y
		offset_top = -h * 0.5
		offset_bottom = h * 0.5

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

func open_for(id: String, show := "upgrade") -> void:
	_model = {"id": id}
	mode = show
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
	var key := "%s|%s|%s|%s|%s|%s" % [model["key"], mode, TranslationServer.get_locale(), background, _pending, _notice]
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
	_body.add_child(_header(id, lang, int(m["level"])))
	if mode == "info":
		_build_info(m, lang, id)
		return
	if mode == "train":
		if id == "barracks":
			_body.add_child(training)
		return

	match m["mode"]:
		"upgrading":
			var c := UiKit.card(Loc.t("panel.upgrading", {"level": Fmt.amount(lang, m["job"]["toLevel"])}))
			var body := UiKit.card_body(c)
			_bar = UiKit.progress_bar()
			body.add_child(_bar)
			_countdown = UiKit.label("", UiKit.BIG, INK, true)
			_countdown.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			body.add_child(_countdown)
			_body.add_child(c)
			# Straight in the body, not the card: it is kept across rebuilds, and the old card is freed with its children.
			_body.add_child(upgrade_speedup)
			_add_stats_card(m, lang)
		"max":
			_add_stats_card(m, lang)
			var c := UiKit.card()
			UiKit.card_body(c).add_child(UiKit.label(Loc.t("panel.maxLevel"), UiKit.BODY, MUTED, false, true))
			_body.add_child(c)
		_:
			_build_next(m, lang, id)

## What the building is and does now; the hero hall adds its note (the ring's Heroes button opens the roster).
func _build_info(m: Dictionary, lang: String, id: String) -> void:
	var c := UiKit.card()
	var body := UiKit.card_body(c)
	body.add_child(UiKit.label(Loc.t("building.%s.desc" % id, {}, _background), UiKit.BODY, INK, false, true))
	if id == "hero_hall":
		body.add_child(UiKit.label(Loc.t("heroes.hallNote"), UiKit.BODY, MUTED, false, true))
	_body.add_child(c)
	_add_stats_card(m, lang)

## Portrait, name and level, and the close button.
func _header(id: String, lang: String, level: int) -> HBoxContainer:
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	head.add_child(UiKit.portrait(id, 60.0))
	var names := VBoxContainer.new()
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	names.alignment = BoxContainer.ALIGNMENT_CENTER
	names.add_theme_constant_override("separation", 0)
	var title := UiKit.label(Loc.t("building.%s.name" % id, {}, _background), UiKit.TITLE, INK, true)
	title.name = "Title"
	names.add_child(title)
	names.add_child(UiKit.label(Loc.t("panel.level", {"level": Fmt.amount(lang, level)}), UiKit.SMALL, HudTheme.RING))
	head.add_child(names)
	var close_button := Button.new()
	close_button.text = "×"
	close_button.add_theme_font_size_override("font_size", HudTheme.font(UiKit.TITLE + 6.0))
	close_button.tooltip_text = Loc.t("panel.close")
	close_button.custom_minimum_size = Vector2.ONE * HudTheme.px(CLOSE_SIZE)
	close_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	for state in ["normal", "hover", "pressed", "focus"]:
		close_button.add_theme_stylebox_override(state, HudTheme.round_face())
	close_button.pressed.connect(func() -> void:
		close()
		closed.emit())
	head.add_child(close_button)
	return head

## A card with what the building does now (while upgrading or at the maximum level), if it produces or stores anything.
func _add_stats_card(m: Dictionary, lang: String) -> void:
	if m["production"] == null and m["storage"] == null:
		return
	var c := UiKit.card()
	_add_stats(UiKit.card_body(c), m, lang, null)
	_body.add_child(c)

## Production and storage rows; with `next`, each shows now → next.
func _add_stats(body: VBoxContainer, m: Dictionary, lang: String, next: Variant) -> void:
	if m["production"] != null:
		var res: String = m["production"]["resource"]
		var now := Loc.t("panel.perHour", {"amount": "+" + Fmt.amount(lang, m["production"]["perHour"])})
		var later := "" if next == null or next["production"] == null else Loc.t("panel.perHour", {"amount": "+" + Fmt.amount(lang, next["production"])})
		body.add_child(UiKit.stat_row(HudIcon.new(res, 18.0, ResourceCell.ICON_TINT.get(res, INK)), Loc.t("panel.production"), now, later))
	if m["storage"] != null:
		var later := "" if next == null or next["storage"] == null else Fmt.amount(lang, next["storage"])
		body.add_child(UiKit.stat_row(UiKit.painted("storage", 22.0), Loc.t("panel.storage"), Fmt.amount(lang, m["storage"]), later))

func _build_next(m: Dictionary, lang: String, id: String) -> void:
	var n: Dictionary = m["next"]
	var c := UiKit.card(Loc.t("panel.nextLevel", {"level": Fmt.amount(lang, n["toLevel"])}))
	var body := UiKit.card_body(c)
	_add_stats(body, m, lang, n)
	var items: Array = []
	for cost: Dictionary in n["cost"]:
		items.append(UiKit.cost_chip(cost["id"], Fmt.amount(lang, cost["amount"]), cost["lacking"]))
	items.append(UiKit.time_chip(Fmt.duration(float(n["durationMs"]))))
	body.add_child(UiKit.chips(items))
	# The check's own reason, or the one the server just gave (it can know better: a stale view, a queue started elsewhere).
	var reason := _notice if _notice != "" else (String(n["reason"]) if not n["ok"] else "")
	if reason != "":
		var key := "reason." + reason
		var text := Loc.t(key, {"level": Fmt.amount(lang, n["toLevel"])})
		body.add_child(UiKit.warning(text if text != key else Loc.t("reason.unreachable")))
	var button := UiKit.primary_button(Loc.t("panel.upgrade"))
	button.disabled = not n["ok"] or _pending
	button.pressed.connect(func() -> void: upgrade_pressed.emit(id))
	body.add_child(button)
	_body.add_child(c)
