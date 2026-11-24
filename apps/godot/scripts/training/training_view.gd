class_name TrainingView
extends VBoxContainer
## The barracks training card inside the building card: the batch in progress (bar, countdown, help and speed-up), four troop tiles
## to choose from, the chosen troop's role and how many are at home and wounded, then the order: a count, the cost (lacking
## resources in red), the time, and the Train button with the reason it is blocked. While a batch runs the order is hidden, because
## the barracks trains one batch at a time. It renders TrainingModel.view and sends the intent through `train_pressed`; the server
## decides. One instance lives as long as the panel, so the chosen troop and count survive the card being rebuilt; everything is
## updated in place, and the count field is never rewritten while it has focus.

signal train_pressed(troop: String, count: int)
signal help_pressed

## How long a refusal of the help request stays under the button (Phaser's NOTE_MS in ui/training-section.ts, 4 s).
const HELP_NOTE_S := 4.0

var _troop := "infantry"
var _pending := false
var _blocked := false
var _text_key := ""
var _job_key := ""
var _help_note_code := ""
var _notice_code := ""
## The training speed-up under the running batch.
var speedup := SpeedupRow.new()

var _job_card := UiKit.card()
var _job_icon: TextureRect
var _job_label := UiKit.label("", UiKit.BODY, HudTheme.TEXT, true, true)
var _job_bar := UiKit.progress_bar()
var _job_time := UiKit.label("", UiKit.BIG, HudTheme.TEXT, true)
var _help_button := Button.new()
var _help_note := UiKit.label("", UiKit.BODY, HudTheme.LACKING, false, true)
var _help_note_timer := Timer.new()
var _tiles: Dictionary = {}
var _title := UiKit.label("", UiKit.BODY, HudTheme.RING, true)
var _role := UiKit.label("", UiKit.BODY, HudTheme.TEXT_SECOND, false, true)
var _home_chip := UiKit.stat_chip("base", "")
var _wounded_chip := UiKit.stat_chip("wounded", "")
var _order := VBoxContainer.new()
var _limit := UiKit.label("", UiKit.SMALL, HudTheme.TEXT_SECOND)
var _stepper := Stepper.new()
var _cost_chips: Dictionary = {}
var _time_chip := UiKit.time_chip("")
var _warning := UiKit.warning("")
var _submit := UiKit.primary_button("")

func _ready() -> void:
	add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_build_job()
	_build_tiles()
	_build_order()
	# Two lines for every troop, so the controls under it stay put when another tile is chosen (measured here, in the tree, where
	# the label has the theme's font).
	_role.custom_minimum_size.y = _role.get_theme_font("font").get_height(HudTheme.font(UiKit.BODY)) * 2.0 + _role.get_theme_constant("line_spacing")
	_retranslate()

func _build_job() -> void:
	var body := UiKit.card_body(_job_card)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	_job_icon = UiKit.troop_medallion(_troop)
	head.add_child(_job_icon)
	_job_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_job_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_job_label.size_flags_vertical = Control.SIZE_FILL
	head.add_child(_job_label)
	_job_time.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(_job_time)
	body.add_child(head)
	body.add_child(_job_bar)
	# The help button is only in the batch's card, so it is shown while a batch runs (and the player may ask).
	_help_button.focus_mode = Control.FOCUS_NONE
	_help_button.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BODY))
	_help_button.custom_minimum_size.y = HudTheme.px(UiKit.TAP)
	_help_button.visible = false
	_help_button.pressed.connect(func() -> void: help_pressed.emit())
	_help_note.visible = false
	_help_note_timer.one_shot = true
	_help_note_timer.wait_time = HELP_NOTE_S
	_help_note_timer.timeout.connect(func() -> void: _help_note_code = "")
	body.add_child(_help_button)
	body.add_child(_help_note)
	body.add_child(_help_note_timer)
	speedup.kind = "training"
	body.add_child(speedup)
	_job_card.visible = false
	add_child(_job_card)

func _build_tiles() -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(4)))
	for id: String in Balance.data()["troopIds"]:
		var tile := TroopTile.new(id)
		tile.pressed.connect(choose.bind(id))
		row.add_child(tile)
		_tiles[id] = tile
	add_child(row)

func _build_order() -> void:
	var c := UiKit.card()
	var body := UiKit.card_body(c)
	body.add_child(_title)
	body.add_child(_role)
	body.add_child(UiKit.chips([_home_chip, _wounded_chip]))
	add_child(c)
	_order.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	_stepper.changed.connect(func(_value: int) -> void: _notice_code = "")
	_order.add_child(_stepper)
	_limit.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_order.add_child(_limit)
	var chips: Array = []
	for id: String in Balance.data()["resourceIds"]:
		_cost_chips[id] = UiKit.cost_chip(id, "", false)
		chips.append(_cost_chips[id])
	chips.append(_time_chip)
	var flow := UiKit.chips(chips)
	_order.add_child(flow)
	_warning.visible = false
	_order.add_child(_warning)
	_submit.pressed.connect(_on_submit)
	_order.add_child(_submit)
	body.add_child(_order)

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
	var lang := String(ctx["lang"])
	var m := TrainingModel.view(int(ctx["barracks"]), ctx["troops"], ctx["wounded"], ctx["training"], ctx["amounts"], int(ctx["now_ms"]),
		_troop, _stepper.value, bool(ctx.get("can_help", false)))
	_update_job(m["job"], lang)
	if ctx.has("speedup"):
		speedup.update_view(ctx["speedup"])
	_help_button.visible = m["help"]
	_help_note.visible = _help_note_code != ""
	_help_note.text = Loc.t("reason." + _help_note_code) if _help_note_code != "" else ""
	for row: Dictionary in m["rows"]:
		(_tiles[row["id"]] as TroopTile).update_row(row, lang)
	_title.text = Loc.t("troop.%s.name" % _troop)
	_role.text = Loc.t("troop.%s.desc" % _troop)
	UiKit.set_chip(_home_chip, "%s %s" % [Loc.t("train.home"), Fmt.amount(lang, m["home"])])
	UiKit.set_chip(_wounded_chip, "%s %s" % [Loc.t("train.wounded"), Fmt.amount(lang, m["wounded"])], int(m["wounded"]) > 0)
	_order.visible = m["job"] == null
	_stepper.set_maximum(int(m["max"]))
	_limit.text = Loc.t("train.maxBatch", {"count": Fmt.amount(lang, m["max"])})
	_update_costs(m, lang)
	_blocked = m["reason"] != ""
	var reason: String = m["reason"] if _blocked else _notice_code
	_warning.visible = reason != ""
	if reason != "":
		UiKit.set_warning(_warning, Loc.t("reason." + reason))
	_submit.disabled = _blocked or _pending

## Chooses a troop (a tap on its tile).
func choose(troop: String) -> void:
	_troop = troop
	_notice_code = ""

## The request is in flight: the Train button is off until the answer is applied.
func set_pending(pending: bool) -> void:
	_pending = pending
	_submit.disabled = _blocked or _pending

## Why the server turned the batch down (a `reason.*` code); shown above the button until the next update that changes it.
func set_notice(code: String) -> void:
	_notice_code = code

## A refusal of the help request, shown under the batch for HELP_NOTE_S seconds.
func show_help_note(code: String) -> void:
	_help_note_code = code
	_help_note_timer.start()

## The texts that do not come from the model: set once, and again when the language or the background changes.
func _retranslate() -> void:
	for id: String in _tiles:
		(_tiles[id] as TroopTile).retranslate()
	_stepper.retranslate(Loc.t("train.count"))
	_submit.text = Loc.t("train.start")
	_help_button.text = Loc.t("help.ask")

func _on_submit() -> void:
	if _blocked or _pending:
		return
	train_pressed.emit(_troop, _stepper.value)

func _update_costs(m: Dictionary, lang: String) -> void:
	for id: String in _cost_chips:
		(_cost_chips[id] as Control).visible = false
	for item: Dictionary in m["cost"]:
		var chip: PanelContainer = _cost_chips[item["id"]]
		UiKit.set_chip(chip, Fmt.amount(lang, item["amount"]), item["lacking"])
		chip.visible = true
	UiKit.set_chip(_time_chip, Fmt.duration(float(m["duration_ms"])))

func _update_job(job: Variant, lang: String) -> void:
	_job_card.visible = job != null
	if job == null:
		return
	_job_icon.texture = UiKit.troop_texture(job["troop"])
	_job_label.text = Loc.t("train.inProgress", {"count": Fmt.amount(lang, job["count"]), "troop": Loc.t("troop.%s.name" % job["troop"])})
	_job_bar.value = float(job["fraction"]) * 100.0
	_job_time.text = Fmt.duration(float(job["remaining_ms"]))
