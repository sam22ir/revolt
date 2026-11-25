class_name ReportsScreen
extends PageFrame
## The Reports page: the battle reports as a list of cards, and one report in full. The band's back button returns from a report to the
## list, and from the list home. It draws what ReportsModel gives it, in the shell's language; it never decides anything. Fills the area
## between the HUD and the tab bar, and is hidden (no drawing, no input) on the other screens.

signal home_requested
signal map_requested

const RESULT_COLOURS := {
	"victory": Color("4f6c24"),
	"defeat": Color("8a3426"),
	"target_gone": Color("575148"),
}
## The card rims in the list, tinting their brown.
const RESULT_RIMS := {
	"victory": Color(0.95, 1.3, 0.75),
	"defeat": Color(1.45, 0.85, 0.75),
	"target_gone": Color.WHITE,
}
const RESULT_ICONS := {"victory": "victory", "defeat": "defeat", "target_gone": "gone"}
const SURVIVED := Color("7d9a3a")
const WOUNDED := Color("d29a3a")
const LOST := Color("b04a36")
## Defenders left standing: neither good news nor a loss.
const STANDING := Color("8b8578")

var _reports: Array = []
var _open_id := ""
var _offset_min := 0

func _init() -> void:
	super("reports")
	back_pressed.connect(_on_back)

func _ready() -> void:
	_offset_min = ReportTime.device_offset_min()
	_render()

## The list as the session holds it (newest first).
func set_reports(list: Array) -> void:
	_reports = list
	_render()

## Opens one report in full (or the list again, when the id is no longer held).
func open_report(id: String) -> void:
	_open_id = id
	scroll.scroll_vertical = 0
	_render()

## Draws the texts again (the language changed).
func refresh() -> void:
	_render()

func is_report_open() -> bool:
	return _open_id != ""

func _on_back() -> void:
	if is_report_open():
		open_report("")
	else:
		home_requested.emit()

func _render() -> void:
	for child in body.get_children():
		body.remove_child(child)
		child.queue_free()
	var found := _find(_open_id)
	if found.is_empty():
		_open_id = ""
	set_title(Loc.t("report.title"), Loc.t("report.back" if is_report_open() else "settings.back"))
	# An empty list stands in the middle of the page.
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL if _reports.is_empty() else Control.SIZE_FILL
	if found.is_empty():
		_render_list()
	else:
		_render_detail(ReportsModel.detail(found))

func _find(id: String) -> Dictionary:
	if id == "":
		return {}
	for r: Dictionary in _reports:
		if String(r["id"]) == id:
			return r
	return {}

func _render_list() -> void:
	if _reports.is_empty():
		var empty := EmptyState.new("reports", Loc.t("report.empty"), Loc.t("nav.map"))
		empty.pressed.connect(func() -> void: map_requested.emit())
		body.add_child(empty)
		return
	for r: Dictionary in _reports:
		body.add_child(_row(r))

func _row(report: Dictionary) -> ListRow:
	var lang := Fmt.lang()
	var m := ReportsModel.row(report)
	var result := String(m["result"])
	var kind := String(m["target_kind"])
	var row := ListRow.new(_target_icon(kind))
	row.set_rim(RESULT_RIMS.get(result, Color.WHITE))
	row.title.text = _target_name(kind)
	var time := ReportTime.format(lang, int(m["at"]), _offset_min)
	row.subtitle.text = time if kind == "" else "%s · %s" % [Loc.t("panel.level", {"level": Fmt.amount(lang, m["level"])}), time]
	for item: Dictionary in ReportsModel.detail(report)["loot"]:
		var loot := HBoxContainer.new()
		loot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		loot.add_theme_constant_override("separation", roundi(HudTheme.px(3)))
		loot.add_child(HudIcon.new(item["id"], 19.0))
		loot.add_child(UiKit.label(Fmt.amount(lang, item["amount"]), UiKit.SMALL, HudTheme.TEXT, true))
		row.extra.add_child(loot)
	row.trailing.add_child(UiKit.badge(Loc.t("march.result." + result), RESULT_COLOURS.get(result, HudTheme.DISABLED)))
	var id := String(m["id"])
	row.pressed.connect(func() -> void: open_report(id))
	return row

func _render_detail(d: Dictionary) -> void:
	var lang := Fmt.lang()
	body.add_child(_banner(d, lang))
	if d["gone"]:
		var card := UiKit.card()
		UiKit.card_body(card).add_child(UiKit.label(Loc.t("report.targetGone"), UiKit.BODY, HudTheme.TEXT, false, true))
		body.add_child(card)
		return
	var loot := UiKit.section("storage", Loc.t("report.loot"))
	if (d["loot"] as Array).is_empty():
		UiKit.card_body(loot).add_child(UiKit.label(Loc.t("report.noLoot"), UiKit.BODY, HudTheme.TEXT_SECOND))
	else:
		UiKit.card_body(loot).add_child(UiKit.chips((d["loot"] as Array).map(func(item: Dictionary) -> Control:
			return UiKit.cost_chip(item["id"], Fmt.amount(lang, item["amount"]), false))))
	body.add_child(loot)
	_add_mine(d["mine"], lang)
	_add_theirs(d, lang)
	if not (d["heroes"] as Array).is_empty():
		var heroes := UiKit.section("heroes", Loc.t("report.heroes"))
		var chips := (d["heroes"] as Array).map(func(id: String) -> Control: return UiKit.stat_chip("heroes", Loc.t("hero.%s.name" % id)))
		UiKit.card_body(heroes).add_child(UiKit.chips(chips))
		body.add_child(heroes)

## The result across the page in its own colour: its emblem, the word, the target and where and when it was.
func _banner(d: Dictionary, lang: String) -> Control:
	var result := String(d["result"])
	var banner := MarginContainer.new()
	var fill := Gauge.new()
	fill.custom_minimum_size.y = HudTheme.px(92)
	fill.set_fill(1.0, (RESULT_COLOURS.get(result, HudTheme.DISABLED) as Color).lightened(0.12))
	banner.add_child(fill)
	var pad := MarginContainer.new()
	for side in ["margin_left", "margin_right"]:
		pad.add_theme_constant_override(side, roundi(HudTheme.px(12)))
	pad.add_theme_constant_override("margin_top", roundi(HudTheme.px(6)))
	pad.add_theme_constant_override("margin_bottom", roundi(HudTheme.px(9)))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(12)))
	var icon := HudIcon.new(RESULT_ICONS.get(result, "reports"), 74.0)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", -roundi(HudTheme.px(1)))
	column.add_child(_outlined(Loc.t("march.result." + result), UiKit.BIG + 4.0))
	if d["target_kind"] != "":
		column.add_child(_outlined("%s · %s" % [_target_name(d["target_kind"]), Loc.t("panel.level", {"level": Fmt.amount(lang, d["level"])})], UiKit.BODY))
	column.add_child(_outlined("%s · %s" % [Loc.t("map.coords", {"x": Fmt.amount(lang, d["x"]), "y": Fmt.amount(lang, d["y"])}), ReportTime.format(lang, int(d["at"]), _offset_min)], UiKit.SMALL))
	row.add_child(column)
	pad.add_child(row)
	banner.add_child(pad)
	return banner

func _outlined(text: String, size_px: float) -> Label:
	var label := UiKit.label(text, size_px, HudTheme.BUTTON_TEXT, true)
	label.add_theme_color_override("font_outline_color", HudTheme.BUTTON_INK)
	label.add_theme_constant_override("outline_size", roundi(HudTheme.px(2.4)))
	label.clip_text = true
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	return label

## The troops sent: one bar each of who survived, was wounded and was lost, with the numbers under it.
func _add_mine(mine: Array, lang: String) -> void:
	var total := 0
	for m: Dictionary in mine:
		total += int(m["sent"])
	var card := UiKit.section("train", Loc.t("report.sent"))
	UiKit.section_value(card, Fmt.amount(lang, total))
	for m: Dictionary in mine:
		var parts := [[int(m["survivors"]), SURVIVED], [int(m["wounded"]), WOUNDED], [int(m["lost"]), LOST]]
		var notes := [[Loc.t("report.survivors"), m["survivors"], SURVIVED], [Loc.t("report.wounded"), m["wounded"], WOUNDED], [Loc.t("report.lost"), m["lost"], LOST]]
		UiKit.card_body(card).add_child(_troop(m["troop"], int(m["sent"]), parts, notes, lang))
	body.add_child(card)

func _add_theirs(d: Dictionary, lang: String) -> void:
	var card := UiKit.section(_target_icon(d["target_kind"]), Loc.t("report.defenders"))
	UiKit.section_value(card, Loc.t("report.rounds", {"count": Fmt.amount(lang, d["rounds"])}))
	for m: Dictionary in d["theirs"]:
		var standing := int(m["defenders"]) - int(m["defeated"])
		var parts := [[standing, STANDING], [int(m["defeated"]), LOST]]
		UiKit.card_body(card).add_child(_troop(m["troop"], int(m["defenders"]), parts, [[Loc.t("report.defendersKilled"), m["defeated"], LOST]], lang))
	body.add_child(card)

## A troop's medallion, its name and count, its bar, and the numbers by their colours.
func _troop(troop: String, count: int, parts: Array, notes: Array, lang: String) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	var medallion := UiKit.troop_medallion(troop, 50.0)
	medallion.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(medallion)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", roundi(HudTheme.px(2)))
	column.add_child(UiKit.stat_row(null, Loc.t("troop.%s.name" % troop), Fmt.amount(lang, count)))
	(column.get_child(0).get_child(0) as Label).add_theme_color_override("font_color", HudTheme.TEXT)
	column.add_child(SegmentBar.new(float(count), parts))
	# What didn't happen isn't listed; many numbers wrap to a second line.
	var line := HFlowContainer.new()
	line.add_theme_constant_override("h_separation", roundi(HudTheme.px(12)))
	for note: Array in notes:
		if int(note[1]) <= 0:
			continue
		var item := HBoxContainer.new()
		item.add_theme_constant_override("separation", roundi(HudTheme.px(4)))
		item.add_child(_dot(note[2]))
		item.add_child(UiKit.label("%s %s" % [note[0], Fmt.amount(lang, note[1])], UiKit.SMALL, HudTheme.TEXT))
		line.add_child(item)
	column.add_child(line)
	row.add_child(column)
	return row

func _dot(colour: Color) -> Control:
	var dot := Panel.new()
	dot.add_theme_stylebox_override("panel", HudTheme.flat(colour, 5.0, HudTheme.BUTTON_INK, 1.0))
	dot.custom_minimum_size = Vector2.ONE * HudTheme.px(10)
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return dot

func _target_icon(kind: String) -> String:
	var icon := "npc_" + kind
	return icon if HudIcon.NAMES.has(icon) else "gone"

func _target_name(kind: String) -> String:
	return Loc.t("march.result.target_gone") if kind == "" else Loc.t("npc.%s.name" % kind)
