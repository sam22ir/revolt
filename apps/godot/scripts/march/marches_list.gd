class_name MarchesList
extends PanelContainer
## The player's own marches over the map: the target and level, who leads, the stage and a countdown to departure, arrival or return, or
## the result once the battle is fought (ui/marches-list.ts). Its structure is rebuilt only when the marches or the language change;
## the stage and the countdown are set in place every frame from MarchesModel. It takes no input and hides when there is nothing to show.

const FONT := 26
const INK := Color8(0x2b, 0x2a, 0x24)
const PAPER := Color8(0xf4, 0xea, 0xd6)
const MUTED := Color8(0xb8, 0xae, 0x92)

var _body := VBoxContainer.new()
var _key := ""
var _refs: Dictionary = {}

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	visible = false
	var box := StyleBoxFlat.new()
	box.bg_color = Color(INK, 0.8)
	box.border_color = Color(1, 1, 1, 0.25)
	box.set_border_width_all(2)
	box.set_corner_radius_all(14)
	box.content_margin_left = 16
	box.content_margin_right = 16
	box.content_margin_top = 8
	box.content_margin_bottom = 8
	add_theme_stylebox_override("panel", box)
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.add_theme_constant_override("separation", 8)
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

func _rebuild(rows: Array) -> void:
	for child in _body.get_children():
		_body.remove_child(child)
		child.queue_free()
	_refs = {}
	var lang := Fmt.lang()
	for r: Dictionary in rows:
		var row := VBoxContainer.new()
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var title := _label(_title(r, lang), PAPER)
		row.add_child(title)
		if r["harvest"]:
			row.add_child(_label(Loc.t("march.harvesting", {"resource": Loc.t("resource." + String(r["resource"]))}), MUTED))
		elif not (r["heroes"] as Array).is_empty():
			var names: Array = (r["heroes"] as Array).map(func(id: String) -> String: return Loc.t("hero.%s.name" % id))
			row.add_child(_label(Loc.t("march.ledBy", {"names": ("، " if lang == "ar" else ", ").join(PackedStringArray(names))}), MUTED))
		var status := _label("", MUTED)
		row.add_child(status)
		_body.add_child(row)
		_refs[r["id"]] = status

## The row's name: a site's kind for a harvest (no level, it is not in the march), else the target and level.
func _title(r: Dictionary, lang: String) -> String:
	if r["harvest"]:
		return Loc.t("site.%s.name" % r["kind"])
	var name := Loc.t("npc.%s.name" % r["kind"]) if r["kind"] != "" else Loc.t("march.listTitle")
	return Loc.t("march.entry", {"name": name, "level": Fmt.amount(lang, r["level"])})

func _fill(status: Label, r: Dictionary) -> void:
	# After the battle the result is the news; before it, the leg of the journey.
	var text := Loc.t("march.phase." + String(r["stage"])) if r["result"] == "" else "%s · %s" % [Loc.t("march.result." + String(r["result"])), Loc.t("march.phase.returning")]
	if r["time_key"] != "":
		text += " · " + Loc.t(String(r["time_key"]), {"time": Fmt.duration(float(r["ms"]))})
	status.text = text

func _label(text: String, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", FONT)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.clip_text = true
	return label
