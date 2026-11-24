class_name MarchSheet
extends Control
## The send-march sheet for an NPC target: how many of each troop to send, up to three heroes (a lead and two deputies), the one-way
## travel time, what the force can carry and why Send is off. MarchModel works the numbers out from the base the session holds; the
## server decides, and its refusal shows under the buttons. Fills the area between the HUD and the nav bar and is hidden (no drawing,
## no input) when closed. It serves three kinds of send: a solo march (with heroes), starting an alliance rally (a gathering time, no
## heroes) and joining one that gathers (no heroes; it leaves and arrives on the rally's own times, whatever the troops). A fourth is a
## harvest of a resource site ("harvest"): the troops, the travel and what the march will bring home (HarvestModel), no odds, no heroes.

signal closed
## A march left: the sheet has closed itself.
signal sent

const MARGIN := 34
const FONT := 30
const SMALL := 26
const ROW_HEIGHT := 72
const PAPER := Color8(0xf4, 0xea, 0xd6)
const INK := Color8(0x2b, 0x2a, 0x24)
const MUTED := HudTheme.TEXT_SECOND
const LACKING := Color8(0xe0, 0x7a, 0x62)

var _session: Session
var _scroll := ScrollContainer.new()
var _body := VBoxContainer.new()
var _npc: Dictionary = {}
## "march", "rally_start" or "rally_join".
var _mode := "march"
var _rally: Dictionary = {}
## The harvest preview's rows (time to fill, rate, expected load, total time away) in harvest mode.
var _fill_label: Label
var _rate_label: Label
var _load_label: Label
var _away_label: Label
var _gather := 0
var _gather_picker: OptionButton
var _from := Vector2i(-1, -1)
var _counts: Dictionary = {}
## Lead first, then two deputies; "" is an empty slot.
var _picks: Array = ["", "", ""]
var _server_reason := ""
var _sending := false
var _rows: Dictionary = {}
var _pickers: Array[OptionButton] = []
var _picker_key := ""
var _bonus: Label
var _travel: Label
var _carry: Label
var _reason: Label
var _submit: Button

func _ready() -> void:
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	visible = false
	var backdrop := PageBackdrop.new()
	backdrop.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(backdrop)
	_scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, PageBackdrop.RIM)
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(_scroll)
	var margin := MarginContainer.new()
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for side in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		margin.add_theme_constant_override(side, MARGIN)
	_scroll.add_child(margin)
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 12)
	margin.add_child(_body)

## Connects the sheet to the session it reads and sends through.
func setup(session: Session) -> void:
	_session = session
	session.state_changed.connect(_refresh)

func is_open() -> bool:
	return visible and not _npc.is_empty()

## Opens the sheet for `npc` (the snapshot's entry for the target; a resource site in "harvest" mode) from the player's camp tile. The
## base is asked for again, so a march that has just come home does not still count against the slots.
func open(npc: Dictionary, from: Vector2i, mode := "march", rally := {}) -> void:
	_npc = npc
	_from = from
	_mode = mode
	_rally = rally
	_gather = int(RallyModel.gather_options()[0])
	_counts = {}
	for id: String in Balance.data()["troopIds"]:
		_counts[id] = 0
	_picks = ["", "", ""]
	_server_reason = ""
	_sending = false
	visible = true
	_build()
	_session.refresh()

func close() -> void:
	if _npc.is_empty() and not visible:
		return
	_npc = {}
	visible = false
	closed.emit()

## Draws the texts again (the language changed), keeping what is picked.
func refresh_language() -> void:
	if is_open():
		_build()

func _build() -> void:
	for child in _body.get_children():
		_body.remove_child(child)
		child.queue_free()
	_rows = {}
	_pickers = []
	_picker_key = ""
	var lang := Fmt.lang()
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	head.add_child(_label(Loc.t({"march": "march.title", "rally_start": "rally.startTitle", "rally_join": "rally.joinTitle", "harvest": "harvest.sendTitle"}[_mode]), FONT + 6, PAPER))
	var x := Button.new()
	x.text = Loc.t("panel.close")
	x.add_theme_font_size_override("font_size", FONT)
	HudTheme.dress(x, "red")
	x.pressed.connect(close)
	head.add_child(x)
	_body.add_child(head)
	if _mode == "harvest":
		var site_name := Loc.t("site.%s.name" % _npc["kind"])
		_body.add_child(_label(Loc.t("march.target", {"name": site_name, "level": Fmt.amount(lang, int(_npc["level"]))}), FONT, PAPER, true))
	else:
		_body.add_child(_label(Loc.t("march.target", {"name": Loc.t("npc.%s.name" % _npc["kind"]), "level": Fmt.amount(lang, int(_npc["level"]))}), FONT, PAPER, true))
		var def: Variant = TileModel.npc_def(int(_npc["level"]))
		if def != null:
			_body.add_child(_label("%s: %s" % [Loc.t("map.defenders"), TrainingModel.troop_list(def["defenders"], lang)], SMALL, MUTED, true))
	if _mode == "rally_start":
		_body.add_child(_gather_row())
	for id: String in Balance.data()["troopIds"]:
		_body.add_child(_troop_row(id))
	if _mode == "march":
		_body.add_child(_label(Loc.t("march.heroes"), FONT, PAPER))
		for slot in 3:
			_body.add_child(_picker_row(slot))
	_bonus = _label("", SMALL, PAPER, true)
	_body.add_child(_bonus)
	_travel = _label("", SMALL, PAPER)
	_carry = _label("", SMALL, PAPER)
	_body.add_child(_stat(Loc.t("march.travel"), _travel))
	_body.add_child(_stat(Loc.t("march.carry"), _carry))
	if _mode == "harvest":
		_rate_label = _label("", SMALL, PAPER)
		_fill_label = _label("", SMALL, PAPER)
		_load_label = _label("", SMALL, PAPER)
		_away_label = _label("", SMALL, PAPER)
		_body.add_child(_stat(Loc.t("harvest.rate"), _rate_label))
		_body.add_child(_stat(Loc.t("harvest.fillTime"), _fill_label))
		_body.add_child(_stat(Loc.t("harvest.load"), _load_label))
		_body.add_child(_stat(Loc.t("harvest.away"), _away_label))
	_reason = _label("", SMALL, LACKING, true)
	_body.add_child(_reason)
	_submit = Button.new()
	_submit.add_theme_font_size_override("font_size", FONT)
	_submit.custom_minimum_size.y = ROW_HEIGHT
	HudTheme.make_primary(_submit)
	_submit.pressed.connect(_on_send)
	_body.add_child(_submit)
	var cancel := Button.new()
	cancel.text = Loc.t("march.cancel")
	cancel.add_theme_font_size_override("font_size", FONT)
	cancel.custom_minimum_size.y = ROW_HEIGHT
	HudTheme.dress(cancel, "wood")
	cancel.pressed.connect(close)
	_body.add_child(cancel)
	_refresh()

func _gather_row() -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.custom_minimum_size.y = ROW_HEIGHT
	row.add_child(_label(Loc.t("rally.gatherTime"), SMALL, PAPER))
	_gather_picker = OptionButton.new()
	_gather_picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_gather_picker.add_theme_font_size_override("font_size", SMALL)
	var popup := _gather_picker.get_popup()
	popup.add_theme_font_size_override("font_size", SMALL)
	popup.add_theme_constant_override("v_separation", 22)
	var selected := 0
	for ms: Variant in RallyModel.gather_options():
		_gather_picker.add_item(Fmt.duration(float(ms)))
		_gather_picker.set_item_metadata(_gather_picker.item_count - 1, int(ms))
		if int(ms) == _gather:
			selected = _gather_picker.item_count - 1
	_gather_picker.select(selected)
	_gather_picker.item_selected.connect(func(index: int) -> void:
		_gather = int(_gather_picker.get_item_metadata(index))
		_server_reason = ""
		_refresh())
	row.add_child(_gather_picker)
	return row

func _troop_row(id: String) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.custom_minimum_size.y = ROW_HEIGHT
	var names := VBoxContainer.new()
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	names.add_child(_label(Loc.t("troop.%s.name" % id), FONT, PAPER))
	var home := _label("", SMALL, MUTED)
	names.add_child(home)
	row.add_child(names)
	var less := _step_button("−", Loc.t("panel.less"))
	less.pressed.connect(func() -> void: _set_count(id, int(_counts[id]) - 1))
	var field := LineEdit.new()
	field.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_NUMBER
	field.alignment = HORIZONTAL_ALIGNMENT_CENTER
	field.custom_minimum_size = Vector2(110, ROW_HEIGHT)
	field.add_theme_font_size_override("font_size", FONT)
	field.text_changed.connect(func(text: String) -> void: _typed(id, field, text))
	field.text_submitted.connect(func(_t: String) -> void: _refresh())
	field.focus_exited.connect(_refresh)
	var more := _step_button("+", Loc.t("panel.more"))
	more.pressed.connect(func() -> void: _set_count(id, int(_counts[id]) + 1))
	var most := Button.new()
	most.text = Loc.t("panel.max")
	most.add_theme_font_size_override("font_size", SMALL)
	most.custom_minimum_size.y = ROW_HEIGHT
	HudTheme.dress(most, "blue")
	most.pressed.connect(func() -> void: _set_count(id, _home(id)))
	for control: Control in [less, field, more, most]:
		row.add_child(control)
	_rows[id] = {"home": home, "field": field, "less": less, "more": more, "max": most}
	return row

## A count typed into the field: taken clamped, and the field shows the clamped number at once (a "400" with 106 at home reads 106).
func _typed(id: String, field: LineEdit, text: String) -> void:
	_set_count(id, text.to_int(), true)
	var shown := str(_counts[id])
	if text != "" and text != shown:
		field.text = shown
		field.caret_column = shown.length()

func _step_button(glyph: String, tip: String) -> Button:
	var b := Button.new()
	b.text = glyph
	b.tooltip_text = tip
	b.add_theme_font_size_override("font_size", FONT + 4)
	b.custom_minimum_size = Vector2(ROW_HEIGHT, ROW_HEIGHT)
	HudTheme.dress(b, "wood")
	return b

func _picker_row(slot: int) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.custom_minimum_size.y = ROW_HEIGHT
	row.add_child(_label(Loc.t("march.heroLead") if slot == 0 else Loc.t("march.heroDeputy", {"n": Fmt.amount(Fmt.lang(), slot)}), SMALL, PAPER))
	var picker := OptionButton.new()
	picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	picker.add_theme_font_size_override("font_size", SMALL)
	picker.item_selected.connect(func(index: int) -> void: _on_pick(slot, index))
	# The list that opens is its own window with the default small text: make it as big as the rest, and the rows tall enough to tap.
	var popup := picker.get_popup()
	popup.add_theme_font_size_override("font_size", SMALL)
	popup.add_theme_constant_override("v_separation", 22)
	row.add_child(picker)
	_pickers.append(picker)
	return row

func _stat(title: String, value: Label) -> Control:
	var row := HBoxContainer.new()
	row.add_child(_label(title, SMALL, MUTED, true))
	value.size_flags_horizontal = Control.SIZE_SHRINK_END
	row.add_child(value)
	return row

func _home(id: String) -> int:
	return int(_session.state.get("troops", {}).get(id, 0))

func _set_count(id: String, value: int, from_field := false) -> void:
	var next := MarchModel.clamp_count(value, _home(id))
	if next != int(_counts[id]):
		_server_reason = ""
	_counts[id] = next
	# A button took the change: the field shows it now. A change typed in the field leaves the field alone until it loses focus.
	if not from_field:
		(_rows[id]["field"] as LineEdit).text = str(next)
	_refresh()

func _on_pick(slot: int, index: int) -> void:
	var picker := _pickers[slot]
	_picks[slot] = String(picker.get_item_metadata(index)) if index > 0 else ""
	_server_reason = ""
	_picker_key = ""
	_refresh()

func _loadout() -> Variant:
	return MarchModel.loadout_from_picks(_picks) if _mode == "march" else null

## Updates the numbers and buttons from the base the session holds; the pickers are filled again only when their choices change.
func _refresh() -> void:
	if not is_open() or _session == null or _session.state.is_empty() or _rows.is_empty():
		return
	var lang := Fmt.lang()
	var state := _session.state
	for id: String in _rows:
		var row: Dictionary = _rows[id]
		var most := _home(id)
		# The troops at home can shrink under us (a batch, a returning march): never keep more than exists.
		if int(_counts[id]) > most:
			_counts[id] = most
		(row["home"] as Label).text = Loc.t("march.atHome", {"count": Fmt.amount(lang, most)})
		var field: LineEdit = row["field"]
		if not field.has_focus() and field.text != str(_counts[id]):
			field.text = str(_counts[id])
		(row["less"] as Button).disabled = int(_counts[id]) <= 0
		(row["more"] as Button).disabled = int(_counts[id]) >= most
		(row["max"] as Button).disabled = int(_counts[id]) >= most
	var free := MarchModel.available_heroes(state, _session.background)
	_picks = _picks.map(func(p: Variant) -> String: return String(p) if free.has(String(p)) else "")
	_fill_pickers(state, free)
	var loadout: Variant = _loadout()
	var p: Dictionary
	if _mode == "harvest":
		p = HarvestModel.preview(state, _from, _npc, _counts)
		_rate_label.text = Fmt.amount(lang, p["rate"])
		_fill_label.text = Fmt.duration(p["fill_ms"]) if int(p["carry"]) > 0 else "—"
		_load_label.text = Fmt.amount(lang, p["load"]) if int(p["carry"]) > 0 else "—"
		_away_label.text = Fmt.duration(p["away_ms"]) if int(p["away_ms"]) >= 0 else "—"
	else:
		p = MarchModel.preview(state, _from, Vector2i(int(_npc["x"]), int(_npc["y"])), _counts, loadout)
	if _mode != "march" and _mode != "harvest" and int(p["travel_ms"]) >= 0:
		p["travel_ms"] = _rally_leg()
	var bonus := MarchModel.hero_bonus(state, loadout)
	_bonus.visible = loadout != null
	_bonus.text = Loc.t("march.heroBonus", {"attack": Fmt.amount(lang, bonus["attack"]), "defense": Fmt.amount(lang, bonus["defense"])})
	_travel.text = Fmt.duration(p["travel_ms"]) if int(p["travel_ms"]) >= 0 else "—"
	_carry.text = Fmt.amount(lang, p["carry"])
	var why := _server_reason if _server_reason != "" else String(p["reason"])
	_reason.text = Loc.t("reason." + why) if why != "" else ""
	_submit.text = Loc.t("march.sending" if _sending else {"march": "march.send", "rally_start": "rally.start", "rally_join": "rally.join", "harvest": "harvest.send"}[_mode])
	_submit.disabled = _sending or p["reason"] != ""

## The one-way leg a rally shows: from your camp at the fixed rally speed when you start it; the rally's own when you join (the server
## gives a joiner the rally's times, which were worked out from its leader's camp, not yours).
func _rally_leg() -> int:
	if _mode == "rally_join":
		return int(float(_rally["arriveAt"]) - float(_rally["gatherUntil"]))
	return RallyModel.leg_ms(_from.x, _from.y, float(_npc["x"]), float(_npc["y"]))

func _fill_pickers(state: Dictionary, free: Array) -> void:
	var key := "%s|%s|%s" % [TranslationServer.get_locale(), ",".join(PackedStringArray(free)), ",".join(PackedStringArray(_picks))]
	if key == _picker_key:
		return
	_picker_key = key
	var owned: Dictionary = state.get("heroes", {}).get("owned", {})
	for slot in _pickers.size():
		var picker := _pickers[slot]
		picker.clear()
		picker.add_item(Loc.t("march.heroNone"))
		var selected := 0
		for id: String in free:
			var level := int(owned[id]["level"]) if owned.has(id) else 1
			picker.add_item("%s · %s" % [Loc.t("hero.%s.name" % id), Loc.t("panel.level", {"level": Fmt.amount(Fmt.lang(), level)})])
			var index := picker.item_count - 1
			picker.set_item_metadata(index, id)
			# A hero can fill one slot only.
			picker.set_item_disabled(index, _picks.has(id) and _picks[slot] != id)
			if _picks[slot] == id:
				selected = index
		picker.select(selected)
		picker.disabled = free.is_empty()

func _on_send() -> void:
	if _session == null or _sending or not is_open():
		return
	_sending = true
	_refresh()
	var verdict: Dictionary
	match _mode:
		"rally_start":
			verdict = await _session.rally_start(String(_npc["id"]), _counts, _gather)
		"rally_join":
			verdict = await _session.rally_join(String(_rally["id"]), _counts)
		"harvest":
			verdict = await _session.harvest_start(String(_npc["id"]), _counts)
		_:
			verdict = await _session.march(String(_npc["id"]), _counts, _loadout())
	_sending = false
	if verdict["reason"] == "" and not verdict["ok"]:
		_refresh()
		return
	if verdict["ok"]:
		_npc = {}
		visible = false
		sent.emit()
		closed.emit()
		return
	# "error" is a reply the client has no sentence for; the player can only try again.
	_server_reason = "unreachable" if verdict["reason"] == "error" else String(verdict["reason"])
	_refresh()

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
