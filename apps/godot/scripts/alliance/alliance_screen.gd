class_name AllianceScreen
extends Control
## The Alliance screen. Without an alliance: search and join, or found one. In one: its chat and Leave. It draws what the Session
## holds and sends the player's intents through it; the server decides (names, tags, texts, who may leave). Members, rallies and
## help tabs come later. Fills the area between the HUD and the nav bar and is hidden on the other screens.

const MARGIN := 24
const FONT := 30
const SMALL := 26
const PAPER := Color8(0xf4, 0xea, 0xd6)
const INK := Color8(0x2b, 0x2a, 0x24)
const MUTED := Color8(0x9a, 0x92, 0x7a)
const GOLD := Color8(0xe0, 0xb8, 0x5a)
const NOTE_COLOR := Color8(0xe0, 0x7a, 0x62)
const NOTE_SECONDS := 4.0
## Within this many px of the bottom the chat follows a new line.
const STICK_SLOP := 48.0

## Sends a chat line on the alliance socket; false when it is not open (set by the shell).
var send_chat: Callable = func(_text: String) -> bool: return false

var _session: Session
var _view := ""
var _busy := false
var _connected := true
var _search_seq := 0
var _results: Variant = null
var _searching := false
var _confirm_key := ""
var _stick := true
var _alliance_id := ""
var _note_key := ""
var _note_seq := 0

var _loading := Label.new()
var _note := Label.new()
var _search_timer := Timer.new()

var _browse_scroll := ScrollContainer.new()
var _intro := Label.new()
var _search_input := LineEdit.new()
var _results_box := VBoxContainer.new()
var _create_title := Label.new()
var _create_hint := Label.new()
var _name_label := Label.new()
var _name_input := LineEdit.new()
var _tag_label := Label.new()
var _tag_input := LineEdit.new()
var _create_button := Button.new()

var _joined := VBoxContainer.new()
var _header := Label.new()
var _count := Label.new()
var _chat_title := Label.new()
var _status := Label.new()
var _chat_scroll := ScrollContainer.new()
var _chat_box := VBoxContainer.new()
var _chat_input := LineEdit.new()
var _send_button := Button.new()
var _leave_button := Button.new()
var _confirm_box := VBoxContainer.new()
var _confirm_label := Label.new()
var _yes_button := Button.new()
var _no_button := Button.new()
var _offset_min := 0

func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = INK
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		margin.add_theme_constant_override(side, MARGIN)
	add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	margin.add_child(column)
	_style(_loading, FONT, MUTED)
	column.add_child(_loading)
	_build_browse()
	column.add_child(_browse_scroll)
	_build_joined()
	column.add_child(_joined)
	_style(_note, SMALL, NOTE_COLOR, true)
	_note.visible = false
	column.add_child(_note)
	_search_timer.one_shot = true
	_search_timer.wait_time = AllianceModel.SEARCH_DEBOUNCE_S
	_search_timer.timeout.connect(_run_search)
	add_child(_search_timer)
	_offset_min = ReportTime.device_offset_min()
	visibility_changed.connect(_on_visibility_changed)
	_retranslate()
	_render_state()

## Shown: the views are drawn again and the browse search runs once. Hidden screens do no work (no search, no chat rebuild).
func _on_visibility_changed() -> void:
	if is_visible_in_tree():
		_view = ""
		_render_state()

## Connects the screen to the session it shows.
func setup(session: Session) -> void:
	_session = session
	session.alliance_refreshed.connect(_render_state)
	session.chat_changed.connect(_render_chat)

## The alliance socket is open (or not): while it is not, the chat says it is reconnecting.
func set_connected(open: bool) -> void:
	_connected = open
	_status.visible = not open

## A refusal or server note for a few seconds (a reason code: `reason.<code>`, or a key such as chat.notSent).
func show_note(key: String) -> void:
	_note_key = key
	_note_seq += 1
	_note.text = _note_text()
	_note.visible = true
	var seq := _note_seq
	if is_inside_tree():
		await get_tree().create_timer(NOTE_SECONDS).timeout
		if seq == _note_seq:
			_note.visible = false

## Draws the texts again (the language changed).
func refresh() -> void:
	_retranslate()
	_render_state()

func _note_text() -> String:
	return Loc.t(_note_key) if _note_key.begins_with("chat.") else Loc.t("reason." + _note_key)

func _build_browse() -> void:
	_browse_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_browse_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_browse_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var box := VBoxContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", 14)
	_browse_scroll.add_child(box)
	_style(_intro, FONT, PAPER, true)
	box.add_child(_intro)
	_search_input.add_theme_font_size_override("font_size", FONT)
	_search_input.text_changed.connect(func(_t: String) -> void: _search_timer.start())
	box.add_child(_search_input)
	_results_box.add_theme_constant_override("separation", 10)
	box.add_child(_results_box)
	_style(_create_title, FONT + 4, PAPER)
	box.add_child(_create_title)
	_style(_create_hint, SMALL, MUTED, true)
	box.add_child(_create_hint)
	_style(_name_label, SMALL, PAPER)
	box.add_child(_name_label)
	_name_input.max_length = AllianceModel.NAME_MAX
	_name_input.add_theme_font_size_override("font_size", FONT)
	box.add_child(_name_input)
	_style(_tag_label, SMALL, PAPER)
	box.add_child(_tag_label)
	_tag_input.max_length = AllianceModel.TAG_MAX
	_tag_input.text_direction = Control.TEXT_DIRECTION_LTR
	_tag_input.add_theme_font_size_override("font_size", FONT)
	box.add_child(_tag_input)
	_create_button.add_theme_font_size_override("font_size", FONT)
	_create_button.pressed.connect(_on_create)
	box.add_child(_create_button)

func _build_joined() -> void:
	_joined.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_joined.add_theme_constant_override("separation", 10)
	_style(_header, FONT + 6, PAPER)
	_joined.add_child(_header)
	_style(_count, SMALL, MUTED)
	_joined.add_child(_count)
	_style(_chat_title, FONT, GOLD)
	_joined.add_child(_chat_title)
	_style(_status, SMALL, NOTE_COLOR)
	_joined.add_child(_status)
	_chat_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_chat_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_chat_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_chat_box.add_theme_constant_override("separation", 8)
	_chat_scroll.add_child(_chat_box)
	_chat_scroll.get_v_scroll_bar().value_changed.connect(func(_v: float) -> void: _stick = _near_bottom())
	_joined.add_child(_chat_scroll)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_chat_input.max_length = AllianceModel.CHAT_MAX
	_chat_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_chat_input.add_theme_font_size_override("font_size", FONT)
	_chat_input.text_submitted.connect(func(_t: String) -> void: _on_send())
	row.add_child(_chat_input)
	_send_button.add_theme_font_size_override("font_size", FONT)
	_send_button.pressed.connect(_on_send)
	row.add_child(_send_button)
	_joined.add_child(row)
	_leave_button.add_theme_font_size_override("font_size", SMALL)
	_leave_button.pressed.connect(_on_leave)
	_joined.add_child(_leave_button)
	_style(_confirm_label, SMALL, PAPER, true)
	_confirm_box.add_child(_confirm_label)
	var answers := HBoxContainer.new()
	answers.add_theme_constant_override("separation", 8)
	for b: Button in [_yes_button, _no_button]:
		b.add_theme_font_size_override("font_size", FONT)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		answers.add_child(b)
	_yes_button.pressed.connect(_on_confirm_yes)
	_no_button.pressed.connect(func() -> void:
		_confirm_key = ""
		_render_leave())
	_confirm_box.add_child(answers)
	_confirm_box.visible = false
	_joined.add_child(_confirm_box)

func _retranslate() -> void:
	_loading.text = Loc.t("alliance.loading")
	_intro.text = Loc.t("alliance.none")
	_search_input.placeholder_text = Loc.t("alliance.searchPlaceholder")
	_create_title.text = Loc.t("alliance.createTitle")
	_create_hint.text = Loc.t("alliance.createHint")
	_name_label.text = Loc.t("alliance.nameLabel")
	_tag_label.text = Loc.t("alliance.tagLabel")
	_create_button.text = Loc.t("alliance.create")
	_chat_title.text = Loc.t("alliance.tab.chat")
	_status.text = Loc.t("chat.reconnecting")
	_chat_input.placeholder_text = Loc.t("chat.placeholder")
	_send_button.text = Loc.t("chat.send")
	_leave_button.text = Loc.t("alliance.leave")
	_yes_button.text = Loc.t("alliance.confirmYes")
	_no_button.text = Loc.t("alliance.confirmNo")
	if _note.visible:
		_note.text = _note_text()
	_render_leave()
	_render_results()

func _render_state() -> void:
	if _session == null:
		_loading.visible = true
		_browse_scroll.visible = false
		_joined.visible = false
		return
	var known := _session.alliance_known
	var joined := known and _session.alliance != null
	_loading.visible = not known
	_browse_scroll.visible = known and not joined
	_joined.visible = joined
	var view := "loading" if not known else ("joined" if joined else "browse")
	var id := AllianceModel.alliance_id(_session.alliance)
	if id != _alliance_id:
		_alliance_id = id
		_confirm_key = ""
		_stick = true
	if joined:
		var a: Dictionary = _session.alliance
		_header.text = "%s · %s" % [a["name"], a["tag"]]
		_count.text = Loc.t("alliance.memberCount", {"count": Fmt.amount(Fmt.lang(), (a["members"] as Array).size()), "max": Fmt.amount(Fmt.lang(), int(a["maxMembers"]))})
		_status.visible = not _connected
		_render_leave()
		_render_chat()
	elif view == "browse" and _view != "browse" and is_visible_in_tree():
		_run_search()
	if joined or is_visible_in_tree():
		_view = view

func _render_leave() -> void:
	_leave_button.visible = _confirm_key == ""
	_confirm_box.visible = _confirm_key != ""
	if _confirm_key != "":
		_confirm_label.text = Loc.t(_confirm_key)

func _on_leave() -> void:
	if _session == null or _session.alliance == null or _busy:
		return
	var plan := AllianceModel.leave_plan(_session.alliance)
	if plan["kind"] == "blocked":
		show_note(String(plan["reason"]))
		return
	_confirm_key = String(plan["key"])
	_render_leave()

func _on_confirm_yes() -> void:
	_confirm_key = ""
	_render_leave()
	await _act(_session.leave_alliance)

## Runs one alliance request with the buttons held, then shows a refusal's reason; a success changes the view by itself
## (the session announces the new alliance and `alliance_refreshed` redraws).
func _act(request: Callable) -> void:
	if _busy:
		return
	_busy = true
	_set_busy_look(true)
	var verdict: Dictionary = await request.call()
	_busy = false
	_set_busy_look(false)
	if not verdict["ok"]:
		show_note(String(verdict["reason"]))

func _set_busy_look(busy: bool) -> void:
	_create_button.disabled = busy
	_leave_button.disabled = busy
	for child in _results_box.get_children():
		for b in child.find_children("*", "Button", true, false):
			(b as Button).disabled = busy or not b.get_meta("can_join", true)

func _on_create() -> void:
	if _session == null:
		return
	var v := AllianceModel.create_values(_name_input.text, _tag_input.text)
	await _act(_session.create_alliance.bind(v["name"], v["tag"]))

func _on_join(id: String) -> void:
	await _act(_session.join_alliance.bind(id))

func _run_search() -> void:
	if _session == null:
		return
	_search_seq += 1
	var seq := _search_seq
	_searching = true
	_render_results()
	var found: Variant = await _session.search_alliances(_search_input.text.strip_edges())
	if seq != _search_seq:
		return
	_searching = false
	_results = found
	_render_results()

func _render_results() -> void:
	for child in _results_box.get_children():
		_results_box.remove_child(child)
		child.queue_free()
	if _searching:
		_results_box.add_child(_made_label(Loc.t("alliance.searching"), SMALL, MUTED))
		return
	if _results == null:
		if _view == "browse" and _search_seq > 0:
			_results_box.add_child(_made_label(Loc.t("alliance.searchFailed"), SMALL, NOTE_COLOR))
		return
	var rows := AllianceModel.search_rows(_results)
	if rows.is_empty():
		_results_box.add_child(_made_label(Loc.t("alliance.noResults"), SMALL, MUTED))
	var lang := Fmt.lang()
	for r: Dictionary in rows:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		var text := VBoxContainer.new()
		text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		text.add_child(_made_label("%s · %s" % [r["name"], r["tag"]], FONT, PAPER))
		var vars: Dictionary = r["count_vars"]
		text.add_child(_made_label(Loc.t("alliance.memberCount", {"count": Fmt.amount(lang, vars["count"]), "max": Fmt.amount(lang, vars["max"])}), SMALL, MUTED))
		row.add_child(text)
		var join := Button.new()
		join.text = Loc.t("alliance.join")
		join.add_theme_font_size_override("font_size", FONT)
		join.disabled = not r["can_join"] or _busy
		join.set_meta("can_join", r["can_join"])
		join.pressed.connect(_on_join.bind(r["id"]))
		row.add_child(join)
		_results_box.add_child(row)

func _on_send() -> void:
	var text := AllianceModel.chat_text(_chat_input.text)
	if text == "":
		return
	if bool(send_chat.call(text)):
		_chat_input.text = ""
		_stick = true
	else:
		show_note("chat.notSent")

func _render_chat() -> void:
	if _session == null or not _joined.visible or not is_visible_in_tree():
		return
	var stick := _stick
	for child in _chat_box.get_children():
		_chat_box.remove_child(child)
		child.queue_free()
	var lang := Fmt.lang()
	var me := AllianceModel.my_handle(_session.alliance)
	if _session.chat.is_empty():
		_chat_box.add_child(_made_label(Loc.t("chat.empty"), SMALL, MUTED, true))
	for line: Dictionary in _session.chat:
		var mine := String(line["handle"]) == me
		var meta := "%s · %s · %s" % [line["handle"], Loc.t("alliance.rank." + String(line["rank"])), ReportTime.clock(lang, int(line["at"]), _offset_min)]
		_chat_box.add_child(_made_label(meta, SMALL, GOLD if mine else MUTED))
		_chat_box.add_child(_made_label(String(line["text"]), FONT, PAPER, true))
	if stick and is_inside_tree():
		await get_tree().process_frame
		_chat_scroll.scroll_vertical = int(_chat_scroll.get_v_scroll_bar().max_value)

func _near_bottom() -> bool:
	var bar := _chat_scroll.get_v_scroll_bar()
	return bar.max_value - (bar.value + bar.page) <= STICK_SLOP

func _style(label: Label, size: int, color: Color, wrap := false) -> void:
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

func _made_label(text: String, size: int, color: Color, wrap := false) -> Label:
	var label := Label.new()
	label.text = text
	_style(label, size, color, wrap)
	return label
