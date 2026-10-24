class_name TrainingView
extends VBoxContainer
## The barracks training form inside the building sheet (ui/training-section.ts): the troops at home and wounded, the batch in
## progress (bar and countdown), then a unit, a count (− + Max), the cost (lacking resources in red), the time, and the Train
## button with the reason it is blocked. It renders TrainingModel.view and sends the intent through `train_pressed`; the server
## decides. One instance lives as long as the panel, so the chosen unit and count survive the sheet being rebuilt, and the count
## field is never rewritten while it has focus.

signal train_pressed(troop: String, count: int)

const FONT := 32
const PAPER := Color8(0xf4, 0xea, 0xd6)
const INK := Color8(0x2b, 0x2a, 0x24)
const GOLD := Color8(0xe0, 0xb0, 0x40)
const LACKING := Color8(0xb2, 0x3a, 0x2a)
const MUTED := Color8(0x6b, 0x64, 0x52)
const STEP_SIZE := Vector2(96, 96)

var _troop := "infantry"
var _count := 1
var _max := 1
var _pending := false
var _blocked := false
var _troop_ids: Array = []
var _text_key := ""
var _job_key := ""
var _notice_code := ""

var _title := _label("", FONT + 4, INK)
var _home := _label("", FONT, INK, true)
var _wounded := _label("", FONT, INK, true)
var _job_box := VBoxContainer.new()
var _job_label := _label("", FONT, INK, true)
var _job_bar := ProgressBar.new()
var _job_time := _label("", FONT, INK)
var _select := OptionButton.new()
var _role := _label("", FONT, MUTED, true)
var _minus := Button.new()
var _input := LineEdit.new()
var _plus := Button.new()
var _max_button := Button.new()
var _limit := _label("", FONT, MUTED)
var _costs := GridContainer.new()
var _cost_labels: Dictionary = {}
var _duration := _label("", FONT, INK)
var _submit := Button.new()
var _reason := _label("", FONT, LACKING, true)

func _ready() -> void:
	add_theme_constant_override("separation", 12)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_child(_title)
	add_child(_home)
	add_child(_wounded)

	_job_box.add_theme_constant_override("separation", 8)
	_job_bar.show_percentage = false
	_job_bar.custom_minimum_size.y = 20
	_job_box.add_child(_job_label)
	_job_box.add_child(_job_bar)
	_job_box.add_child(_job_time)
	add_child(_job_box)

	_troop_ids = Balance.data()["troopIds"]
	for id: String in _troop_ids:
		_select.add_item("")
	_select.item_selected.connect(func(index: int) -> void:
		_troop = _troop_ids[index]
		_notice_code = "")
	_select.add_theme_font_size_override("font_size", FONT)
	add_child(_select)
	add_child(_role)

	var count_row := HBoxContainer.new()
	count_row.add_theme_constant_override("separation", 8)
	_minus.text = "−"
	_plus.text = "+"
	for b: Button in [_minus, _plus, _max_button]:
		b.add_theme_font_size_override("font_size", FONT)
	_minus.custom_minimum_size = STEP_SIZE
	_plus.custom_minimum_size = STEP_SIZE
	_input.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_NUMBER
	_input.custom_minimum_size = Vector2(160, STEP_SIZE.y)
	_input.add_theme_font_size_override("font_size", FONT)
	# Typing updates the count, the cost and the time at once; the field itself is only rewritten on submit or focus loss.
	_input.text_changed.connect(func(text: String) -> void:
		if text.is_valid_float():
			_count = TrainingModel.clamp_count(text.to_float(), _max)
			_refresh_buttons()
			_update_costs(TrainingModel.quote(_troop, _count)["cost"], Fmt.lang())
			_duration.text = Loc.t("panel.duration") + ": " + Fmt.duration(float(TrainingModel.quote(_troop, _count)["duration_ms"])))
	_input.text_submitted.connect(func(_text: String) -> void: _set_count(_input.text.to_float()))
	_input.focus_exited.connect(func() -> void: _set_count(_input.text.to_float()))
	_minus.pressed.connect(func() -> void: _set_count(_count - 1))
	_plus.pressed.connect(func() -> void: _set_count(_count + 1))
	_max_button.pressed.connect(func() -> void: _set_count(_max))
	count_row.add_child(_minus)
	count_row.add_child(_input)
	count_row.add_child(_plus)
	count_row.add_child(_max_button)
	add_child(count_row)
	add_child(_limit)

	_costs.columns = 2
	_costs.add_theme_constant_override("h_separation", 24)
	for id: String in Balance.data()["resourceIds"]:
		var label := _label("", FONT, INK)
		_costs.add_child(label)
		_cost_labels[id] = label
	add_child(_costs)
	add_child(_duration)

	_submit.add_theme_font_size_override("font_size", FONT)
	_submit.custom_minimum_size.y = STEP_SIZE.y
	_submit.pressed.connect(_on_submit)
	add_child(_submit)
	add_child(_reason)
	_retranslate()
	_refresh_buttons()

## Takes the state the form shows. `ctx` holds: barracks (int), troops and wounded (Dictionary), training (Dictionary or null),
## amounts (resources accrued to now), now_ms, lang.
func update_context(ctx: Dictionary) -> void:
	# The static texts follow the language and the account's background (Vietnam renames units), so they are set again on a change.
	var key := "%s|%s" % [TranslationServer.get_locale(), Loc.background_id]
	if key != _text_key:
		_text_key = key
		_retranslate()
	# A refusal belongs to the batch it was given for: a new batch (or none) clears it.
	var job_key := str(ctx["training"])
	if job_key != _job_key:
		_job_key = job_key
		_notice_code = ""
	var m := TrainingModel.view(int(ctx["barracks"]), ctx["troops"], ctx["wounded"], ctx["training"], ctx["amounts"], int(ctx["now_ms"]),
		_troop, _count, String(ctx["lang"]))
	_troop = m["troop"]
	_count = m["count"]
	_max = m["max"]
	_home.text = "%s: %s" % [Loc.t("train.home"), m["home"]]
	_wounded.text = "%s: %s" % [Loc.t("train.wounded"), m["wounded"]]
	_select.select(_troop_ids.find(_troop))
	_role.text = Loc.t("troop.%s.desc" % _troop)
	if not _input.has_focus():
		_input.text = str(_count)
	_limit.text = Loc.t("train.maxBatch", {"count": Fmt.amount(String(ctx["lang"]), _max)})
	_duration.text = Loc.t("panel.duration") + ": " + Fmt.duration(float(m["duration_ms"]))
	_update_costs(m["cost"], String(ctx["lang"]))
	_update_job(m["job"])
	_reason.text = Loc.t("reason." + m["reason"]) if m["reason"] != "" else (Loc.t("reason." + _notice_code) if _notice_code != "" else "")
	_reason.visible = _reason.text != ""
	_blocked = m["reason"] != ""
	_submit.disabled = _blocked or _pending
	_refresh_buttons()

## The request is in flight: the Train button is off until the answer is applied.
func set_pending(pending: bool) -> void:
	_pending = pending
	_submit.disabled = _blocked or _pending

## Why the server turned the batch down (a `reason.*` code); shown under the button until the next update that changes it.
func set_notice(code: String) -> void:
	_notice_code = code

## The texts that do not come from the model: set once, and again when the language or the background changes.
func _retranslate() -> void:
	_title.text = Loc.t("train.title")
	for i in _troop_ids.size():
		_select.set_item_text(i, Loc.t("troop.%s.name" % _troop_ids[i]))
	_select.tooltip_text = Loc.t("train.unit")
	_max_button.text = Loc.t("panel.max")
	_minus.tooltip_text = Loc.t("panel.less")
	_plus.tooltip_text = Loc.t("panel.more")
	_input.tooltip_text = Loc.t("train.count")
	_submit.text = Loc.t("train.start")

func _set_count(value: float) -> void:
	_count = TrainingModel.clamp_count(value, _max)
	_input.text = str(_count)
	_notice_code = ""
	_refresh_buttons()

func _on_submit() -> void:
	if _blocked or _pending:
		return
	train_pressed.emit(_troop, _count)

func _refresh_buttons() -> void:
	_minus.disabled = _count <= 1
	_plus.disabled = _count >= _max
	_max_button.disabled = _count >= _max

func _update_costs(cost: Array, lang: String) -> void:
	for id: String in _cost_labels:
		(_cost_labels[id] as Label).visible = false
	for item: Dictionary in cost:
		var label: Label = _cost_labels[item["id"]]
		label.text = "%s %s" % [Loc.t("resource." + item["id"]), Fmt.amount(lang, item["amount"])]
		label.add_theme_color_override("font_color", LACKING if item["lacking"] else INK)
		label.visible = true

func _update_job(job: Variant) -> void:
	_job_box.visible = job != null
	if job == null:
		return
	_job_label.text = Loc.t("train.inProgress", {"count": Fmt.amount(Fmt.lang(), job["count"]), "troop": Loc.t("troop.%s.name" % job["troop"])})
	_job_bar.value = float(job["fraction"]) * 100.0
	_job_time.text = Fmt.duration(float(job["remaining_ms"]))

static func _label(text: String, size: int, color: Color, wrap := false) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label
