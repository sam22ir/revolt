class_name MarchesList
extends PanelContainer
## The player's own marches over the map: the target and level, who leads, the stage and a countdown to departure, arrival or return, or
## the result once the battle is fought (ui/marches-list.ts). Its structure is rebuilt only when the marches or the language change;
## the stage and the countdown are set in place every frame from MarchesModel. Its only input is the Recall button of a harvest at its site
## (`recall_requested`); the rest passes through, and it hides when there is nothing to show.

const ICON := 42.0

## Emitted when Recall is tapped on a harvest at its site.
signal recall_requested(march_id: String)

var _body := VBoxContainer.new()
var _key := ""
var _refs: Dictionary = {}
## Why the last Recall was refused (a reason code), shown under the rows until the next press or rebuild.
var _notice := ""

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	visible = false
	add_theme_stylebox_override("panel", HudTheme.card(9.0, 7.0))
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	add_child(_body)

## Call every frame while the map shows: `marches` is the base's own list, `now` the synced clock in ms. `covered` hides it while a sheet
## (the march sheet) fills the same strip.
func update_view(marches: Array, now: float, covered := false) -> void:
	var rows := MarchesModel.rows(marches, now)
	visible = not rows.is_empty() and not covered
	if rows.is_empty():
		_key = ""
		return
	var key := TranslationServer.get_locale() + Loc.background_id + "|" + "|".join(rows.map(func(r: Dictionary) -> String: return "%s:%s" % [r["id"], ",".join(PackedStringArray(r["heroes"]))]))
	if key != _key:
		_key = key
		_rebuild(rows)
	for r: Dictionary in rows:
		_fill(_refs[r["id"]], r)

func refresh() -> void:
	_key = ""

## Shows why a Recall was refused ("" to clear it).
func show_notice(reason: String) -> void:
	_notice = reason
	_key = ""

func _rebuild(rows: Array) -> void:
	for child in _body.get_children():
		_body.remove_child(child)
		child.queue_free()
	_refs = {}
	var lang := Fmt.lang()
	for r: Dictionary in rows:
		if _body.get_child_count() > 0:
			_body.add_child(UiKit.divider())
		_body.add_child(_row(r, lang))
	if _notice != "":
		_body.add_child(UiKit.warning(Loc.t("reason." + _notice)))
	_let_touches_through(_body)

## What is marched at, the title, who leads or what it brings in, the stage with its countdown, and a harvest's Recall at the end.
func _row(r: Dictionary, lang: String) -> Control:
	var id := String(r["id"])
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(9)))
	var icon := HudIcon.new(_icon(r), ICON)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	words.add_theme_constant_override("separation", -roundi(HudTheme.px(1)))
	words.add_child(_label(_title(r, lang), UiKit.BODY, HudTheme.TEXT, true))
	if r["harvest"]:
		words.add_child(_label(Loc.t("march.harvesting", {"resource": Loc.t("resource." + String(r["resource"]))}), UiKit.SMALL, HudTheme.TEXT_SECOND))
	elif not (r["heroes"] as Array).is_empty():
		var names: Array = (r["heroes"] as Array).map(func(hero: String) -> String: return Loc.t("hero.%s.name" % hero))
		words.add_child(_label(Loc.t("march.ledBy", {"names": ("، " if lang == "ar" else ", ").join(PackedStringArray(names))}), UiKit.SMALL, HudTheme.TEXT_SECOND))
	var status := _label("", UiKit.SMALL, HudTheme.RING)
	words.add_child(status)
	row.add_child(words)
	var recall: Button = null
	if r["harvest"]:
		recall = Button.new()
		recall.text = Loc.t("harvest.recall")
		recall.focus_mode = Control.FOCUS_NONE
		recall.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		HudTheme.dress(recall, "blue")
		recall.pressed.connect(func() -> void: recall_requested.emit(id))
		row.add_child(recall)
	_refs[id] = {"status": status, "recall": recall}
	return row

func _icon(r: Dictionary) -> String:
	if r["harvest"]:
		return SitesModel.kind_resource(String(r["kind"]))
	return "npc_" + String(r["kind"]) if r["kind"] != "" else "marches"

## Everything but the Recall buttons lets the map under it have the touch.
func _let_touches_through(node: Control) -> void:
	for child in node.find_children("*", "Control", true, false):
		if not child is Button:
			(child as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE

## The row's name: a site's kind for a harvest (no level, it is not in the march), else the target and level.
func _title(r: Dictionary, lang: String) -> String:
	if r["harvest"]:
		return Loc.t("site.%s.name" % r["kind"])
	var name := Loc.t("npc.%s.name" % r["kind"]) if r["kind"] != "" else Loc.t("march.listTitle")
	return Loc.t("march.entry", {"name": name, "level": Fmt.amount(lang, r["level"])})

func _fill(refs: Dictionary, r: Dictionary) -> void:
	var status: Label = refs["status"]
	# After the battle the result is the news; before it, the leg of the journey.
	var text := Loc.t("march.phase." + String(r["stage"])) if r["result"] == "" else "%s · %s" % [Loc.t("march.result." + String(r["result"])), Loc.t("march.phase.returning")]
	if r["time_key"] != "":
		text += " · " + Loc.t(String(r["time_key"]), {"time": Fmt.duration(float(r["ms"]))})
	status.text = text
	if refs["recall"] != null:
		(refs["recall"] as Button).visible = r["recallable"]

func _label(text: String, size: float, colour: Color, bold := false) -> Label:
	var label := UiKit.label(text, size, colour, bold)
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.clip_text = true
	return label
