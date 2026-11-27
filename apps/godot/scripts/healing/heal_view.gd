class_name HealView
extends VBoxContainer
## The infirmary's card inside the building card: the group in care (bar and countdown), then the wounded waiting (by troop), how many
## the infirmary treats at once, and the next group with its cost (lacking resources in red), its time and the Treat button with the
## reason it is off. It draws HealModel and sends the intent through `heal_pressed`; the server decides. One instance lives as long as
## the panel; the structure is rebuilt only when what it shows changes, the countdown and the bar every frame.

signal heal_pressed

var _key := ""
var _pending := false
var _notice := ""
var _bar: ProgressBar
var _time: Label
var _ctx: Dictionary = {}

func _ready() -> void:
	add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	size_flags_horizontal = Control.SIZE_EXPAND_FILL

## The request is out: the button is off until the answer is applied.
func set_pending(pending: bool) -> void:
	_pending = pending
	_key = ""

## Why the server turned the request down (a `reason.*` code), shown under the button until the next change; "" clears it.
func set_notice(code: String) -> void:
	_notice = code
	_key = ""

## `ctx`: {"infirmary": int, "wounded": Dictionary, "healing": Variant, "amounts": Dictionary, "now_ms": int, "lang": String}.
func update_context(ctx: Dictionary) -> void:
	_ctx = ctx
	var level := int(ctx["infirmary"])
	var healing: Variant = ctx["healing"]
	var plan := HealModel.plan(level, ctx["wounded"], ctx["amounts"])
	var quote := HealModel.quote(plan)
	var reason := HealModel.check(level, ctx["wounded"], ctx["amounts"], healing)
	var lacking := {}
	for id: String in quote["cost"]:
		lacking[id] = float(ctx["amounts"].get(id, 0.0)) < float(quote["cost"][id])
	var key := "|".join([ctx["lang"], level, JSON.stringify(ctx["wounded"]), JSON.stringify(healing), JSON.stringify(plan), JSON.stringify(lacking), reason, _pending, _notice])
	if key != _key:
		_key = key
		_rebuild(level, healing, plan, quote, reason, lacking)
	if _bar != null and healing is Dictionary:
		var total := maxf(1.0, float(healing["endsAt"]) - float(healing["startedAt"]))
		_bar.value = clampf((float(ctx["now_ms"]) - float(healing["startedAt"])) / total, 0.0, 1.0) * 100.0
		_time.text = Fmt.duration(maxf(0.0, float(healing["endsAt"]) - float(ctx["now_ms"])))

func _rebuild(level: int, healing: Variant, plan: Dictionary, quote: Dictionary, reason: String, lacking: Dictionary) -> void:
	for child in get_children():
		remove_child(child)
		child.queue_free()
	_bar = null
	_time = null
	var lang := String(_ctx["lang"])
	if healing is Dictionary:
		var care := UiKit.card(Loc.t("heal.inCare", {"count": Fmt.amount(lang, HealModel.count(healing["troops"]))}))
		var body := UiKit.card_body(care)
		body.add_child(TilePanel.troop_chips(healing["troops"]))
		_bar = UiKit.progress_bar()
		body.add_child(_bar)
		_time = UiKit.label("", UiKit.BIG, HudTheme.TEXT, true)
		_time.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		body.add_child(_time)
		add_child(care)
	var waiting := HealModel.count(_ctx["wounded"])
	var card := UiKit.section("wounded", Loc.t("heal.title"))
	var v := UiKit.card_body(card)
	if waiting == 0:
		v.add_child(UiKit.label(Loc.t("heal.none"), UiKit.BODY, HudTheme.TEXT_SECOND, false, true))
		add_child(card)
		return
	UiKit.section_value(card, Loc.t("heal.wounded", {"count": Fmt.amount(lang, waiting)}))
	v.add_child(TilePanel.troop_chips(_ctx["wounded"]))
	v.add_child(UiKit.label(Loc.t("heal.batch", {"count": Fmt.amount(lang, HealModel.max_batch(level))}), UiKit.SMALL, HudTheme.TEXT_SECOND))
	if not healing is Dictionary and HealModel.count(plan) > 0:
		v.add_child(UiKit.divider())
		v.add_child(UiKit.label(Loc.t("heal.next", {"count": Fmt.amount(lang, HealModel.count(plan))}), UiKit.BODY, HudTheme.TEXT, true))
		var chips: Array = []
		for id: String in quote["cost"]:
			if int(quote["cost"][id]) > 0:
				chips.append(UiKit.cost_chip(id, Fmt.amount(lang, quote["cost"][id]), lacking[id]))
		chips.append(UiKit.time_chip(Fmt.duration(float(quote["durationMs"]))))
		v.add_child(UiKit.chips(chips))
	var why := _notice if _notice != "" else reason
	if why != "" and why != "infirmary_busy":
		var text := Loc.t("reason." + why)
		v.add_child(UiKit.warning(text if text != "reason." + why else Loc.t("reason.unreachable")))
	if not healing is Dictionary:
		var button := UiKit.primary_button(Loc.t("heal.button"))
		button.focus_mode = Control.FOCUS_NONE
		button.disabled = reason != "" or _pending
		button.pressed.connect(func() -> void: heal_pressed.emit())
		v.add_child(button)
	add_child(card)
