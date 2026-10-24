class_name ReportsScreen
extends Control
## The Reports screen: the battle reports as a list, and one report in full (its back button returns to the list). It draws what
## ReportsModel gives it, in the shell's language; it never decides anything. Fills the area between the HUD and the nav bar,
## and is hidden (no drawing, no input) on the other screens.

const MARGIN := 24
const FONT := 30
const SMALL := 26
const PAPER := Color8(0xf4, 0xea, 0xd6)
const INK := Color8(0x2b, 0x2a, 0x24)
const MUTED := Color8(0x9a, 0x92, 0x7a)
const RESULT_COLORS := {
	"victory": Color8(0x9c, 0xc8, 0x6e),
	"defeat": Color8(0xe0, 0x7a, 0x62),
	"target_gone": Color8(0xb8, 0xb0, 0x98),
}

var _reports: Array = []
var _open_id := ""
var _scroll := ScrollContainer.new()
var _body := VBoxContainer.new()
var _offset_min := 0

func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = INK
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	_scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(_scroll)
	var margin := MarginContainer.new()
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for side in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		margin.add_theme_constant_override(side, MARGIN)
	_scroll.add_child(margin)
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 14)
	margin.add_child(_body)
	_offset_min = ReportTime.device_offset_min()
	_render()

## The list as the session holds it (newest first).
func set_reports(list: Array) -> void:
	_reports = list
	_render()

## Opens one report in full (or the list again, when the id is no longer held).
func open_report(id: String) -> void:
	_open_id = id
	_scroll.scroll_vertical = 0
	_render()

## Draws the texts again (the language changed).
func refresh() -> void:
	_render()

func _render() -> void:
	for child in _body.get_children():
		_body.remove_child(child)
		child.queue_free()
	var found := _find(_open_id)
	if found.is_empty():
		_open_id = ""
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
	_body.add_child(_label(Loc.t("report.title"), FONT + 6, PAPER))
	if _reports.is_empty():
		_body.add_child(_label(Loc.t("report.empty"), FONT, MUTED, true))
		return
	var lang := Fmt.lang()
	for r: Dictionary in _reports:
		var row := ReportsModel.row(r)
		var button := Button.new()
		button.custom_minimum_size.y = 150
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var margin := MarginContainer.new()
		margin.set_anchors_preset(Control.PRESET_FULL_RECT)
		margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
		for side in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
			margin.add_theme_constant_override(side, 14)
		button.add_child(margin)
		var box := VBoxContainer.new()
		box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		margin.add_child(box)
		var result := String(row["result"])
		box.add_child(_label(Loc.t("march.result." + result), FONT, RESULT_COLORS.get(result, PAPER)))
		box.add_child(_label(_target_summary(String(row["target_kind"]), int(row["level"]), lang), SMALL, PAPER))
		box.add_child(_label(ReportTime.format(lang, int(row["at"]), _offset_min), SMALL, MUTED))
		button.pressed.connect(open_report.bind(String(row["id"])))
		_body.add_child(button)

func _render_detail(d: Dictionary) -> void:
	var lang := Fmt.lang()
	var back := Button.new()
	back.text = Loc.t("report.back")
	back.add_theme_font_size_override("font_size", FONT)
	back.pressed.connect(open_report.bind(""))
	_body.add_child(back)
	var result := String(d["result"])
	_body.add_child(_label(Loc.t("march.result." + result), FONT + 6, RESULT_COLORS.get(result, PAPER)))
	_body.add_child(_label(_target_line(d, lang), SMALL, PAPER, true))
	_body.add_child(_label(ReportTime.format(lang, int(d["at"]), _offset_min), SMALL, MUTED))
	if d["gone"]:
		_body.add_child(_label(Loc.t("report.targetGone"), SMALL, MUTED, true))
		return

	if not (d["heroes"] as Array).is_empty():
		_body.add_child(_heading(Loc.t("report.heroes")))
		for id: String in d["heroes"]:
			_body.add_child(_label(Loc.t("hero.%s.name" % id), SMALL, PAPER))

	var mine: Array = []
	for m: Dictionary in d["mine"]:
		mine.append([Loc.t("troop.%s.name" % m["troop"]), Fmt.amount(lang, m["sent"]), Fmt.amount(lang, m["survivors"]), Fmt.amount(lang, m["wounded"]), Fmt.amount(lang, m["lost"])])
	_body.add_child(_table([Loc.t("report.unit"), Loc.t("report.sent"), Loc.t("report.survivors"), Loc.t("report.wounded"), Loc.t("report.lost")], mine))

	_body.add_child(_heading(Loc.t("report.defenders")))
	var theirs: Array = []
	for m: Dictionary in d["theirs"]:
		theirs.append([Loc.t("troop.%s.name" % m["troop"]), Fmt.amount(lang, m["defenders"]), Fmt.amount(lang, m["defeated"])])
	_body.add_child(_table([Loc.t("report.unit"), Loc.t("report.defenders"), Loc.t("report.defendersKilled")], theirs))

	_body.add_child(_label(Loc.t("report.rounds", {"count": Fmt.amount(lang, d["rounds"])}), SMALL, PAPER))
	_body.add_child(_heading(Loc.t("report.loot")))
	if (d["loot"] as Array).is_empty():
		_body.add_child(_label(Loc.t("report.noLoot"), SMALL, MUTED))
	for item: Dictionary in d["loot"]:
		_body.add_child(_label("%s  %s" % [Loc.t("resource." + item["id"]), Fmt.amount(lang, item["amount"])], SMALL, PAPER))

## "Patrol · level 3 · (12, 40)" for a report; the target is gone when its kind is empty.
func _target_line(d: Dictionary, lang: String) -> String:
	var name := _target_name(String(d["target_kind"]))
	var level := "" if d["target_kind"] == "" else " · " + Loc.t("panel.level", {"level": Fmt.amount(lang, d["level"])})
	return "%s%s · %s" % [name, level, Loc.t("map.coords", {"x": Fmt.amount(lang, d["x"]), "y": Fmt.amount(lang, d["y"])})]

## The list's line: the target and its level, without coordinates.
func _target_summary(kind: String, level: int, lang: String) -> String:
	if kind == "":
		return _target_name(kind)
	return "%s · %s" % [_target_name(kind), Loc.t("panel.level", {"level": Fmt.amount(lang, level)})]

func _target_name(kind: String) -> String:
	return Loc.t("report.targetGone") if kind == "" else Loc.t("npc.%s.name" % kind)

## A table with one row of cells per entry; the first column is the unit's name. Cells never wrap: a wrapped label collapses.
func _table(heads: Array, rows: Array) -> GridContainer:
	var grid := GridContainer.new()
	grid.columns = heads.size()
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 6)
	for head: String in heads:
		grid.add_child(_label(head, SMALL, MUTED))
	for row: Array in rows:
		for cell: String in row:
			grid.add_child(_label(cell, SMALL, PAPER))
	return grid

func _heading(text: String) -> Label:
	return _label(text, FONT, PAPER)

func _label(text: String, size: int, color: Color, wrap := false) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label
