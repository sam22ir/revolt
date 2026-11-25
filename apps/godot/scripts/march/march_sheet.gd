class_name MarchSheet
extends PageFrame
## The send-march sheet for an NPC target: how many of each troop to send, up to three heroes (a lead and two deputies), the one-way
## travel time, what the force can carry and why Send is off. MarchModel works the numbers out from the base the session holds; the
## server decides, and its refusal shows over the buttons, which stay in place under the scrolling part. Fills the area between the HUD and the nav bar and is hidden (no drawing,
## no input) when closed. It serves three kinds of send: a solo march (with heroes), starting an alliance rally (a gathering time, no
## heroes) and joining one that gathers (no heroes; it leaves and arrives on the rally's own times, whatever the troops). A fourth is a
## harvest of a resource site ("harvest"): the troops, the travel and what the march will bring home (HarvestModel), no odds, no heroes.

signal closed
## A march left: the sheet has closed itself.
signal sent

const MEDALLION := 44.0
const SLOT := 84.0
## The width of a count's field, in mockup px.
const FIELD := 56.0

var _session: Session
var _body := body
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
## gathering time (ms) to its button.
var _gather_buttons: Dictionary = {}
var _from := Vector2i(-1, -1)
var _counts: Dictionary = {}
## Lead first, then two deputies; "" is an empty slot.
var _picks: Array = ["", "", ""]
var _server_reason := ""
var _sending := false
var _rows: Dictionary = {}
var _slots: Array[Button] = []
var _slot_key := ""
var _picker := HeroPicker.new()
var _picking := -1
var _footer := PanelContainer.new()
var _footer_box := VBoxContainer.new()
var _bonus: Label
var _travel: Label
var _carry: Label
var _reason: PanelContainer
var _submit: Button

func _init() -> void:
	super("marches")

func _ready() -> void:
	visible = false
	back_pressed.connect(close)
	var board := HudTheme.card(11.0, 9.0)
	_footer.add_theme_stylebox_override("panel", board)
	_footer_box.add_theme_constant_override("separation", roundi(HudTheme.px(7)))
	_footer.add_child(_footer_box)
	column.add_child(_footer)
	_picker.picked.connect(_on_picked)
	add_child(_picker)

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
	_picker.close()
	scroll.scroll_vertical = 0
	visible = true
	_build()
	_session.refresh()

func close() -> void:
	if _npc.is_empty() and not visible:
		return
	_npc = {}
	_picker.close()
	visible = false
	closed.emit()

## Draws the texts again (the language changed), keeping what is picked.
func refresh_language() -> void:
	if is_open():
		_build()

func _build() -> void:
	for box: Control in [body, _footer_box]:
		for child in box.get_children():
			box.remove_child(child)
			child.queue_free()
	_rows = {}
	_slots = []
	_slot_key = ""
	_gather_buttons = {}
	_picker.close()
	set_title(Loc.t({"march": "march.title", "rally_start": "rally.startTitle", "rally_join": "rally.joinTitle", "harvest": "harvest.sendTitle"}[_mode]), Loc.t("settings.back"))
	body.add_child(_target_card())
	if _mode == "rally_start":
		body.add_child(_gather_card())
	var troops := UiKit.card()
	for id: String in Balance.data()["troopIds"]:
		if not _rows.is_empty():
			UiKit.card_body(troops).add_child(UiKit.divider())
		UiKit.card_body(troops).add_child(_troop_row(id))
	body.add_child(troops)
	if _mode == "march":
		body.add_child(_heroes_card())
	if _mode == "harvest":
		body.add_child(_harvest_card())
	_build_footer()
	_refresh()

## What is marched at: its medallion, name and level, and who defends it.
func _target_card() -> Control:
	var lang := Fmt.lang()
	var card := UiKit.card()
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(11)))
	var harvest := _mode == "harvest"
	var kind := String(_npc["kind"])
	var icon := HudIcon.new(SitesModel.kind_resource(kind) if harvest else "npc_" + kind, 56.0)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	words.add_theme_constant_override("separation", roundi(HudTheme.px(4)))
	var name_key := "site.%s.name" if harvest else "npc.%s.name"
	words.add_child(UiKit.label(Loc.t("march.target", {"name": Loc.t(name_key % kind), "level": Fmt.amount(lang, int(_npc["level"]))}), UiKit.BODY + 2.0, HudTheme.TEXT, true, true))
	var def: Variant = null if harvest else TileModel.npc_def(int(_npc["level"]))
	if def != null:
		words.add_child(UiKit.label(Loc.t("map.defenders"), UiKit.SMALL, HudTheme.TEXT_SECOND))
		words.add_child(TilePanel.troop_chips(def["defenders"]))
	row.add_child(words)
	UiKit.card_body(card).add_child(row)
	return card

## The gathering times to start a rally with, as buttons; the chosen one is amber.
func _gather_card() -> Control:
	var card := UiKit.section("hourglass", Loc.t("rally.gatherTime"))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	var group := ButtonGroup.new()
	for ms: Variant in RallyModel.gather_options():
		var button := Button.new()
		button.text = Fmt.duration(float(ms))
		button.toggle_mode = true
		button.button_group = group
		button.button_pressed = int(ms) == _gather
		button.focus_mode = Control.FOCUS_NONE
		button.mouse_filter = Control.MOUSE_FILTER_PASS
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		HudTheme.dress(button, "wood", "amber")
		button.pressed.connect(func() -> void:
			_gather = int(ms)
			_server_reason = ""
			_refresh())
		_gather_buttons[int(ms)] = button
		row.add_child(button)
	UiKit.card_body(card).add_child(row)
	return card

## The places for a lead and two deputies, as portraits to tap.
func _heroes_card() -> Control:
	var card := UiKit.section("heroes", Loc.t("march.heroes"))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for slot in 3:
		row.add_child(_slot(slot))
	UiKit.card_body(card).add_child(row)
	_bonus = UiKit.label("", UiKit.BODY, HudTheme.GOLD, false, true)
	UiKit.card_body(card).add_child(_bonus)
	return card

func _slot_title(slot: int) -> String:
	return Loc.t("march.heroLead") if slot == 0 else Loc.t("march.heroDeputy", {"n": Fmt.amount(Fmt.lang(), slot)})

func _slot(slot: int) -> Control:
	var place := VBoxContainer.new()
	place.mouse_filter = Control.MOUSE_FILTER_IGNORE
	place.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	place.add_theme_constant_override("separation", roundi(HudTheme.px(3)))
	var tap := Button.new()
	tap.focus_mode = Control.FOCUS_NONE
	tap.mouse_filter = Control.MOUSE_FILTER_PASS
	tap.custom_minimum_size = Vector2.ONE * HudTheme.px(SLOT)
	tap.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	for state in ["normal", "hover", "disabled"]:
		tap.add_theme_stylebox_override(state, HudTheme.inset())
	for state in ["pressed", "hover_pressed"]:
		tap.add_theme_stylebox_override(state, HudTheme.card(4.0, 4.0))
	tap.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	tap.pressed.connect(_open_picker.bind(slot))
	place.add_child(tap)
	var name_label := UiKit.label("", UiKit.SMALL, HudTheme.TEXT)
	var who := UiKit.label(_slot_title(slot), UiKit.SMALL, HudTheme.TEXT_SECOND)
	for label: Label in [who, name_label]:
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.clip_text = true
		label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		place.add_child(label)
	tap.set_meta("name", name_label)
	_slots.append(tap)
	return place

func _harvest_card() -> Control:
	var card := UiKit.card()
	var rows: Array = []
	for row: Array in [["upgrade", "harvest.rate"], ["hourglass", "harvest.fillTime"], ["storage", "harvest.load"], ["clock", "harvest.away"]]:
		var stat := UiKit.stat_row(HudIcon.new(row[0], 24.0), Loc.t(row[1]), "")
		UiKit.card_body(card).add_child(stat)
		rows.append(stat.get_node("Value"))
	_rate_label = rows[0]
	_fill_label = rows[1]
	_load_label = rows[2]
	_away_label = rows[3]
	return card

## Under the scrolling part: how long and how much, why it cannot go, and the buttons.
func _build_footer() -> void:
	var figures := HBoxContainer.new()
	figures.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	_travel = _figure(figures, "clock", Loc.t("march.travel"))
	_carry = _figure(figures, "storage", Loc.t("march.carry"))
	_footer_box.add_child(figures)
	_reason = UiKit.warning("")
	_footer_box.add_child(_reason)
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	var cancel := Button.new()
	cancel.text = Loc.t("march.cancel")
	cancel.focus_mode = Control.FOCUS_NONE
	cancel.custom_minimum_size = Vector2(110, UiKit.BUTTON) * Vector2(HudTheme.SCALE, HudTheme.SCALE)
	HudTheme.dress(cancel, "wood")
	cancel.pressed.connect(close)
	buttons.add_child(cancel)
	_submit = UiKit.primary_button("")
	_submit.focus_mode = Control.FOCUS_NONE
	_submit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_submit.pressed.connect(_on_send)
	buttons.add_child(_submit)
	_footer_box.add_child(buttons)

## A figure of the footer: its icon, a small word and the value under it. Returns the value's label.
func _figure(row: Container, icon_name: String, word: String) -> Label:
	var half := HBoxContainer.new()
	half.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	half.add_theme_constant_override("separation", roundi(HudTheme.px(7)))
	var icon := HudIcon.new(icon_name, 30.0)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	half.add_child(icon)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.add_theme_constant_override("separation", -roundi(HudTheme.px(2)))
	var small := UiKit.label(word, UiKit.SMALL, HudTheme.TEXT_SECOND)
	small.clip_text = true
	small.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	words.add_child(small)
	var value := UiKit.label("", UiKit.BODY + 1.0, HudTheme.TEXT, true)
	words.add_child(value)
	half.add_child(words)
	row.add_child(half)
	return value

## A troop: its medallion, name and how many are at home, and under them the count: −, the field, + and Max.
func _troop_row(id: String) -> Control:
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	var medallion := UiKit.troop_medallion(id, MEDALLION)
	medallion.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(medallion)
	var lines := VBoxContainer.new()
	lines.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lines.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lines.add_theme_constant_override("separation", roundi(HudTheme.px(3)))
	var top := HBoxContainer.new()
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var name_label := UiKit.label(Loc.t("troop.%s.name" % id), UiKit.BODY, HudTheme.TEXT, true)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.clip_text = true
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	top.add_child(name_label)
	var home := UiKit.label("", UiKit.SMALL, HudTheme.TEXT_SECOND)
	home.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	top.add_child(home)
	lines.add_child(top)
	var count := HBoxContainer.new()
	count.mouse_filter = Control.MOUSE_FILTER_IGNORE
	count.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	var less := _step_button("−", Loc.t("panel.less"), "wood")
	less.pressed.connect(func() -> void: _set_count(id, int(_counts[id]) - 1))
	var field := LineEdit.new()
	field.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_NUMBER
	field.alignment = HORIZONTAL_ALIGNMENT_CENTER
	field.max_length = 6
	field.custom_minimum_size = Vector2(FIELD, UiKit.TAP) * HudTheme.SCALE
	field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	field.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BIG - 2.0))
	field.add_theme_font_override("font", load(UiKit.BOLD))
	field.add_theme_stylebox_override("normal", HudTheme.inset())
	var focus := HudTheme.inset()
	focus.frame_tint = Color(1.35, 1.25, 1.0)
	field.add_theme_stylebox_override("focus", focus)
	field.text_changed.connect(func(text: String) -> void: _typed(id, field, text))
	field.text_submitted.connect(func(_t: String) -> void: field.release_focus())
	field.focus_exited.connect(_refresh)
	var more := _step_button("+", Loc.t("panel.more"), "wood")
	more.pressed.connect(func() -> void: _set_count(id, int(_counts[id]) + 1))
	var most := _step_button(Loc.t("panel.max"), "", "blue")
	most.pressed.connect(func() -> void: _set_count(id, _home(id)))
	for control: Control in [less, field, more, most]:
		count.add_child(control)
	lines.add_child(count)
	row.add_child(lines)
	_rows[id] = {"home": home, "field": field, "less": less, "more": more, "max": most}
	return row

## A count typed into the field: taken clamped, and the field shows the clamped number at once (a "400" with 106 at home reads 106).
func _typed(id: String, field: LineEdit, text: String) -> void:
	_set_count(id, text.to_int(), true)
	var shown := str(_counts[id])
	if text != "" and text != shown:
		field.text = shown
		field.caret_column = shown.length()

func _step_button(text: String, tip: String, kind: String) -> Button:
	var b := Button.new()
	b.text = text
	b.tooltip_text = tip
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_filter = Control.MOUSE_FILTER_PASS
	b.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BIG if kind == "wood" else UiKit.SMALL + 1.0))
	b.add_theme_font_override("font", load(UiKit.BOLD))
	b.custom_minimum_size = Vector2(UiKit.TAP, UiKit.TAP) * HudTheme.SCALE
	HudTheme.dress(b, kind)
	return b

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

func _open_picker(slot: int) -> void:
	_picking = slot
	var taken: Array = _picks.filter(func(p: Variant) -> bool: return String(p) != "" and String(p) != String(_picks[slot]))
	_picker.open(_slot_title(slot), MarchModel.available_heroes(_session.state, _session.background), _session.state.get("heroes", {}).get("owned", {}), taken, String(_picks[slot]))

## A hero ("" for nobody) for the place whose picker is open. A hero fills one place only.
func _on_picked(id: String) -> void:
	if _picking < 0 or (id != "" and _picks.has(id) and _picks[_picking] != id):
		return
	_picks[_picking] = id
	_picking = -1
	_server_reason = ""
	_refresh()

func _loadout() -> Variant:
	return MarchModel.loadout_from_picks(_picks) if _mode == "march" else null

## Updates the numbers and buttons from the base the session holds; the hero places are drawn again only when who is in them changes.
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
	_fill_slots(state, free)
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
	if _mode == "march":
		_bonus.visible = loadout != null
		_bonus.text = Loc.t("march.heroBonus", {"attack": Fmt.amount(lang, bonus["attack"]), "defense": Fmt.amount(lang, bonus["defense"])})
	_travel.text = Fmt.duration(p["travel_ms"]) if int(p["travel_ms"]) >= 0 else "—"
	_carry.text = Fmt.amount(lang, p["carry"])
	var why := _server_reason if _server_reason != "" else String(p["reason"])
	UiKit.set_warning(_reason, Loc.t("reason." + why) if why != "" else "")
	# Its room is kept, so the rows do not move under the finger that makes the march possible.
	_reason.modulate.a = 1.0 if why != "" else 0.0
	_submit.text = Loc.t("march.sending" if _sending else {"march": "march.send", "rally_start": "rally.start", "rally_join": "rally.join", "harvest": "harvest.send"}[_mode])
	_submit.disabled = _sending or p["reason"] != ""

## The one-way leg a rally shows: from your camp at the fixed rally speed when you start it; the rally's own when you join (the server
## gives a joiner the rally's times, which were worked out from its leader's camp, not yours).
func _rally_leg() -> int:
	if _mode == "rally_join":
		return int(float(_rally["arriveAt"]) - float(_rally["gatherUntil"]))
	return RallyModel.leg_ms(_from.x, _from.y, float(_npc["x"]), float(_npc["y"]))

func _fill_slots(state: Dictionary, free: Array) -> void:
	var owned: Dictionary = state.get("heroes", {}).get("owned", {})
	var levels: Array = _picks.map(func(p: Variant) -> int: return int(owned[String(p)]["level"]) if owned.has(String(p)) else 1)
	var key := "%s|%s|%s" % [free.is_empty(), ",".join(PackedStringArray(_picks)), str(levels)]
	if key == _slot_key:
		return
	_slot_key = key
	for slot in _slots.size():
		var tap := _slots[slot]
		for child in tap.get_children():
			tap.remove_child(child)
			child.queue_free()
		var id := String(_picks[slot])
		var face: Control
		if id != "":
			face = HeroPortrait.new(id, Balance.data()["heroes"][id]["rarity"], SLOT, levels[slot])
		else:
			face = HudIcon.new("avatar", 1.0)
			(face as HudIcon).set_dimmed(true)
		face.custom_minimum_size = Vector2.ZERO
		face.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 0 if id != "" else roundi(HudTheme.px(14)))
		tap.add_child(face)
		tap.disabled = free.is_empty()
		(tap.get_meta("name") as Label).text = Loc.t("hero.%s.name" % id) if id != "" else Loc.t("march.heroNone")

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
		_picker.close()
		visible = false
		sent.emit()
		closed.emit()
		return
	# "error" is a reply the client has no sentence for; the player can only try again.
	_server_reason = "unreachable" if verdict["reason"] == "error" else String(verdict["reason"])
	_refresh()
