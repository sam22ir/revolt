class_name StudyView
extends VBoxContainer
## The academy's card inside the building card (docs/villages-plan.md): the lesson being studied (bar and countdown), then every lesson
## a village has taught, with what it does and where it came from: studied ones marked, the others with their cost, time and a Study
## button (or why it is off). It sends the intent through `study_pressed`; the server decides. Rebuilt only when what it shows changes.

signal study_pressed(lesson: String)

var _key := ""
var _pending := false
var _notice := {}
var _bar: ProgressBar
var _time: Label

func _ready() -> void:
	add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	size_flags_horizontal = Control.SIZE_EXPAND_FILL

func set_pending(pending: bool) -> void:
	_pending = pending
	_key = ""

## Why the server refused studying `lesson` ("" clears it), shown under that lesson until the next change.
func set_notice(lesson: String, code: String) -> void:
	_notice = {} if code == "" else {lesson: code}
	_key = ""

## Why `lesson` cannot be studied now, or "" (`checkStudy`, after the taught and studied checks the list already makes).
static func check(lesson: String, academy: int, study: Variant, amounts: Dictionary) -> String:
	if study is Dictionary:
		return "study_busy"
	var level := str(int(Balance.data()["lessons"][lesson]["level"]))
	if academy < int(Balance.data()["study"]["academyLevel"][level]):
		return "academy_level"
	var cost: Dictionary = Balance.data()["study"]["cost"][level]
	for id: String in cost:
		if float(amounts.get(id, 0.0)) < float(cost[id]):
			return "insufficient"
	return ""

## `ctx`: {"academy": int, "taught": Array, "studied": Array, "study": Variant, "amounts": Dictionary, "now_ms": int, "lang": String}.
func update_context(ctx: Dictionary) -> void:
	var rows: Array = []
	for lesson: Variant in ctx["taught"]:
		var id := String(lesson)
		if not Balance.data()["lessons"].has(id):
			continue
		rows.append([id, ctx["studied"].has(id), check(id, int(ctx["academy"]), ctx["study"], ctx["amounts"])])
	var key := "|".join([ctx["lang"], ctx["academy"], JSON.stringify(rows), JSON.stringify(ctx["study"]), _pending, JSON.stringify(_notice)])
	if key != _key:
		_key = key
		_rebuild(ctx, rows)
	var study: Variant = ctx["study"]
	if _bar != null and study is Dictionary:
		var total := maxf(1.0, float(study["endsAt"]) - float(study["startedAt"]))
		_bar.value = clampf((float(ctx["now_ms"]) - float(study["startedAt"])) / total, 0.0, 1.0) * 100.0
		_time.text = Fmt.duration(maxf(0.0, float(study["endsAt"]) - float(ctx["now_ms"])))

func _rebuild(ctx: Dictionary, rows: Array) -> void:
	for child in get_children():
		remove_child(child)
		child.queue_free()
	_bar = null
	_time = null
	var lang := String(ctx["lang"])
	var study: Variant = ctx["study"]
	if study is Dictionary:
		var card := UiKit.card(Loc.t("study.studying", {"lesson": Loc.t("lesson.%s.name" % study["lesson"])}))
		var body := UiKit.card_body(card)
		_bar = UiKit.progress_bar()
		body.add_child(_bar)
		_time = UiKit.label("", UiKit.BIG, HudTheme.TEXT, true)
		_time.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		body.add_child(_time)
		add_child(card)
	var list := UiKit.section("reports", Loc.t("study.title"))
	var v := UiKit.card_body(list)
	if rows.is_empty():
		v.add_child(UiKit.label(Loc.t("study.none"), UiKit.BODY, HudTheme.TEXT_SECOND, false, true))
	for i in rows.size():
		var id: String = rows[i][0]
		if i > 0:
			v.add_child(UiKit.divider())
		var def: Dictionary = Balance.data()["lessons"][id]
		v.add_child(UiKit.label(Loc.t("lesson.%s.name" % id), UiKit.BODY + 1.0, HudTheme.TEXT, true))
		v.add_child(UiKit.label(Loc.t("lesson.%s.desc" % id), UiKit.BODY, HudTheme.TEXT_SECOND, false, true))
		v.add_child(UiKit.label(Loc.t("study.from", {"village": Loc.t("village.%s.name" % def["village"])}), UiKit.SMALL, HudTheme.TEXT_SECOND, false, true))
		if rows[i][1]:
			v.add_child(UiKit.chips([UiKit.badge(Loc.t("study.studied"), Color("305561"))]))
			continue
		if study is Dictionary and String(study["lesson"]) == id:
			continue
		var level := str(int(def["level"]))
		var chips: Array = []
		var cost: Dictionary = Balance.data()["study"]["cost"][level]
		for r: String in cost:
			if int(cost[r]) > 0:
				chips.append(UiKit.cost_chip(r, Fmt.amount(lang, cost[r]), float(ctx["amounts"].get(r, 0.0)) < float(cost[r])))
		chips.append(UiKit.time_chip(Fmt.duration(float(Balance.data()["study"]["ms"][level]))))
		v.add_child(UiKit.chips(chips))
		var why := String(_notice.get(id, rows[i][2]))
		if why != "" and why != "study_busy":
			var text := Loc.t("reason." + why, {"level": Fmt.amount(lang, int(Balance.data()["study"]["academyLevel"][level]))})
			v.add_child(UiKit.warning(text if text != "reason." + why else Loc.t("reason.unreachable")))
		var button := UiKit.primary_button(Loc.t("study.button"))
		button.focus_mode = Control.FOCUS_NONE
		button.disabled = String(rows[i][2]) != "" or _pending
		button.pressed.connect(func() -> void: study_pressed.emit(id))
		v.add_child(button)
	add_child(list)
