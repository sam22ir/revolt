class_name AllianceScreen
extends PageFrame
## The Alliance page. Without an alliance: search and join, or found one. In one, four tabs: Members (and Leave), Chat, Help and Rallies.
## It draws what the Session holds and sends the player's intents through it; the server decides (names, tags, texts, who may leave).
## The joined view keeps its tabs and the chat's input in place and scrolls inside each tab. Fills the area between the HUD and the tab
## bar and is hidden on the other screens.

const MUTED := HudTheme.TEXT_SECOND
const GOLD := HudTheme.GOLD
const TAB_ICONS := {"members": "support", "chat": "chat", "help": "hourglass", "rallies": "marches"}
const HELP_ICONS := {"upgrade": "upgrade", "training": "train"}
const FILLED := Color("7d9a3a")
## A rank's badge.
const RANK_COLOURS := {"leader": Color("8f5f1c"), "officer": Color("305561"), "member": Color("575148")}
const NOTE_SECONDS := 4.0
## Within this many px of the bottom the chat follows a new line.
const STICK_SLOP := 48.0

## The band's back button.
signal home_requested
## Join on a rally row: the rally ({id, leader, target, gatherUntil, ...}); the shell that owns the map opens the troop sheet.
signal rally_join_requested(rally: Dictionary)

## Sends a chat line on the alliance socket; false when it is not open (set by the shell).
var send_chat: Callable = func(_text: String) -> bool: return false

var _session: Session
var _view := ""
var _busy := false
var _connected := true
var _search_seq := 0
var _results: Variant = null
var _searching := false
## A confirmation waiting for an answer: {"kind": "kick"|"transfer"|"leave", "handle", "key"}; empty when none.
var _pending := {}
var _tab := "members"
var _stick := true
var _alliance_id := ""
var _note_key := ""
var _note_seq := 0

var _loading := UiKit.label("", UiKit.BODY, MUTED)
var _note := UiKit.label("", UiKit.BODY, HudTheme.BUTTON_TEXT, true, true)
var _search_timer := Timer.new()

var _browse_scroll := ScrollContainer.new()
var _intro := UiKit.label("", UiKit.BODY, HudTheme.TEXT, false, true)
var _search_input := LineEdit.new()
var _results_box := VBoxContainer.new()
var _create_title: Label
var _create_hint := UiKit.label("", UiKit.SMALL, MUTED, false, true)
var _name_label := UiKit.label("", UiKit.SMALL, HudTheme.TEXT)
var _name_input := LineEdit.new()
var _tag_label := UiKit.label("", UiKit.SMALL, HudTheme.TEXT)
var _tag_input := LineEdit.new()
var _create_button := UiKit.primary_button("")

var _joined := VBoxContainer.new()
var _tab_buttons := {}
var _tab_labels := {}
var _chat_badge := UnreadBadge.new()
var _members_scroll := ScrollContainer.new()
var _hq_line := UiKit.label("", UiKit.BODY, HudTheme.TEXT, false, true)
var _rows_box := VBoxContainer.new()
var _leader_note := UiKit.warning("")
## The member whose actions are open, by handle; "" for none.
var _open_member := ""
var _chat_panel := VBoxContainer.new()
var _help_scroll := ScrollContainer.new()
var _rallies_scroll := ScrollContainer.new()
var _rallies_rows := VBoxContainer.new()
var _rallies_empty := EmptyState.new("marches")
var _rallies_key := ""
## rally id to its countdown label, while the Rallies tab shows it.
var _rally_timers := {}
var _help_rows := VBoxContainer.new()
var _help_empty := EmptyState.new("hourglass")
var _help_key := ""
## request id to its countdown label, while the Help tab shows it.
var _countdowns := {}
var _status := UiKit.warning("")
var _chat_scroll := ScrollContainer.new()
var _chat_box := VBoxContainer.new()
var _chat_input := LineEdit.new()
var _send_button := Button.new()
var _leave_button := Button.new()
var _confirm_box := KitDialog.new()
var _confirm_label := _confirm_box.message
var _yes_button := _confirm_box.yes
var _no_button := _confirm_box.no
var _offset_min := 0

func _init() -> void:
	super("alliance")
	back_pressed.connect(func() -> void: home_requested.emit())
	# This page scrolls inside its own parts, so the tabs and the chat's input stay put.
	scroll.visible = false

func _ready() -> void:
	_loading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_loading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	column.add_child(_loading)
	_build_browse()
	column.add_child(_browse_scroll)
	_build_joined()
	column.add_child(_joined)
	_note.add_theme_stylebox_override("normal", HudTheme.flat(Color("8a3426"), 8.0, HudTheme.BUTTON_INK, 1.6))
	_note.visible = false
	column.add_child(_note)
	add_child(_confirm_box)
	_confirm_box.answered.connect(_on_answered)
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
		_stick = true
		_render_state()
	_sync_chat_open()

## Connects the screen to the session it shows.
func setup(session: Session) -> void:
	_session = session
	session.alliance_refreshed.connect(_render_state)
	session.chat_changed.connect(_on_chat_changed)

func _on_chat_changed() -> void:
	_update_chat_badge()
	_render_chat()

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

func _scroll_list(of: ScrollContainer, separation := 8.0) -> VBoxContainer:
	of.size_flags_vertical = Control.SIZE_EXPAND_FILL
	of.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	of.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var box := VBoxContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", roundi(HudTheme.px(separation)))
	of.add_child(box)
	return box

func _field(input: LineEdit, most := 0) -> void:
	input.max_length = most
	input.custom_minimum_size.y = HudTheme.px(UiKit.TAP)
	input.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BODY + 1.0))

func _build_browse() -> void:
	var box := _scroll_list(_browse_scroll)
	var find := UiKit.section("alliance")
	UiKit.card_body(find).get_child(0).visible = false
	UiKit.card_body(find).get_child(1).visible = false
	UiKit.card_body(find).add_child(_intro)
	_field(_search_input)
	_search_input.text_changed.connect(func(_t: String) -> void: _search_timer.start())
	UiKit.card_body(find).add_child(_search_input)
	box.add_child(find)
	_results_box.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	box.add_child(_results_box)
	var found := UiKit.section("marches")
	_create_title = UiKit.section_title(found)
	var form := UiKit.card_body(found)
	form.add_child(_create_hint)
	# The name takes the room; the tag is four letters.
	var fields := HBoxContainer.new()
	fields.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	for pair: Array in [[_name_label, _name_input, AllianceModel.NAME_MAX, 2.4], [_tag_label, _tag_input, AllianceModel.TAG_MAX, 1.0]]:
		var part := VBoxContainer.new()
		part.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		part.size_flags_stretch_ratio = pair[3]
		part.add_child(pair[0])
		_field(pair[1], pair[2])
		part.add_child(pair[1])
		fields.add_child(part)
	_tag_input.text_direction = Control.TEXT_DIRECTION_LTR
	form.add_child(fields)
	_create_button.pressed.connect(_on_create)
	form.add_child(_create_button)
	box.add_child(found)

func _build_joined() -> void:
	_joined.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_joined.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", roundi(HudTheme.px(5)))
	var group := ButtonGroup.new()
	for id: String in TAB_ICONS:
		tabs.add_child(_tab_button(id, group))
	_tab_buttons["chat"].add_child(_chat_badge)
	_joined.add_child(tabs)
	_build_members()
	_joined.add_child(_members_scroll)
	_build_chat()
	_joined.add_child(_chat_panel)
	_build_help()
	_joined.add_child(_help_scroll)
	_build_rallies()
	_joined.add_child(_rallies_scroll)

## A tab: its icon over its name, on a game button that is amber when chosen.
func _tab_button(id: String, group: ButtonGroup) -> Button:
	var button := Button.new()
	button.toggle_mode = true
	button.button_group = group
	button.focus_mode = Control.FOCUS_NONE
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size.y = HudTheme.px(62)
	HudTheme.dress(button, "wood", "amber")
	button.pressed.connect(select_tab.bind(id))
	var face := VBoxContainer.new()
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	face.set_anchors_preset(Control.PRESET_FULL_RECT)
	face.offset_bottom = -HudTheme.LIP
	face.offset_top = 6.0
	face.alignment = BoxContainer.ALIGNMENT_CENTER
	face.add_theme_constant_override("separation", -roundi(HudTheme.px(2)))
	var icon := HudIcon.new(TAB_ICONS[id], 29.0)
	icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	face.add_child(icon)
	var label := UiKit.label("", UiKit.SMALL, HudTheme.BUTTON_TEXT, true)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.clip_text = true
	label.add_theme_color_override("font_outline_color", HudTheme.BUTTON_INK)
	label.add_theme_constant_override("outline_size", roundi(HudTheme.px(2.4)))
	face.add_child(label)
	button.add_child(face)
	_tab_buttons[id] = button
	_tab_labels[id] = label
	return button

func _build_help() -> void:
	var box := _scroll_list(_help_scroll)
	_help_rows.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	box.add_child(_help_rows)
	box.add_child(_help_empty)

## Called every frame while the screen shows: the Help tab's rows are rebuilt only when what they show changes (the language, or
## a request's id, kind, helps, mine, helped, or the open set), and only the countdown texts change per frame, so a Help button is
## never replaced under a finger. `now_ms` is server time, as `endsAt`.
func tick(now_ms: int, rallies := []) -> void:
	if _session == null or not _joined.visible:
		return
	if _tab == "rallies":
		_tick_rallies(rallies, now_ms)
	if _tab != "help":
		return
	var open := HelpModel.open_requests(_session.help, now_ms)
	var key := Fmt.lang() + "|" + ",".join(open.map(func(r: Dictionary) -> String: return HelpModel.row_key(r)))
	if key != _help_key:
		_help_key = key
		_rebuild_help(open)
	for id: String in _countdowns:
		for r: Dictionary in open:
			if String(r["id"]) == id:
				(_countdowns[id] as Label).text = Loc.t("help.timeLeft", {"time": Fmt.duration(float(r["endsAt"]) - now_ms)})

func _rebuild_help(open: Array) -> void:
	var lang := Fmt.lang()
	for child in _help_rows.get_children():
		_help_rows.remove_child(child)
		child.queue_free()
	_countdowns.clear()
	_help_empty.visible = open.is_empty()
	_help_empty.text = Loc.t("help.empty")
	for r: Dictionary in open:
		var row := ListRow.new(HELP_ICONS.get(String(r["kind"]), "upgrade"), false)
		row.title.text = "%s · %s" % [r.get("handle", ""), Loc.t("help.kind." + String(r["kind"]))]
		var helps := int(r.get("helps", 0))
		var most := int(r.get("maxHelps", 0))
		row.subtitle.text = Loc.t("help.progress", {"count": Fmt.amount(lang, helps), "max": Fmt.amount(lang, most)})
		row.extra.add_child(_meter(helps, most))
		var time := UiKit.label("", UiKit.SMALL, HudTheme.RING)
		_countdowns[String(r["id"])] = time
		row.extra.add_child(time)
		if bool(r.get("mine", false)) or bool(r.get("helped", false)):
			row.trailing.add_child(UiKit.badge(Loc.t("help.yours" if r.get("mine", false) else "help.helped"), ReportsScreen.RESULT_COLOURS["victory"]))
		var give := _row_button(Loc.t("help.give"))
		give.disabled = not HelpModel.can_give(r)
		give.pressed.connect(_on_give.bind(give, String(r["id"])))
		row.trailing.add_child(give)
		_help_rows.add_child(row)

## A bar of how many of `most` there are.
func _meter(count: int, most: int) -> SegmentBar:
	var bar := SegmentBar.new(float(most), [[count, FILLED]])
	bar.custom_minimum_size.x = HudTheme.px(120)
	return bar

## A row's own green button.
func _row_button(text: String) -> Button:
	var button := Button.new()
	button.text = text
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_filter = Control.MOUSE_FILTER_PASS
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	HudTheme.dress(button, "green")
	return button

func _build_rallies() -> void:
	var box := _scroll_list(_rallies_scroll)
	_rallies_rows.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	box.add_child(_rallies_rows)
	box.add_child(_rallies_empty)

## The Rallies tab: the alliance's rallies from the map snapshot, rebuilt only when what a row shows changes (the language, a rally's
## id, whether it is joined, its participants or whether it still gathers), with the gathering countdown set in place every frame, so a
## Join button is never replaced under a finger and is gone the moment the gathering ends.
func _tick_rallies(rallies: Array, now_ms: float) -> void:
	var key := Fmt.lang() + "|" + ",".join(rallies.map(func(r: Dictionary) -> String: return RallyModel.row_key(r, now_ms)))
	if key != _rallies_key:
		_rallies_key = key
		_rebuild_rallies(rallies, now_ms)
	for r: Dictionary in rallies:
		if _rally_timers.has(r["id"]):
			(_rally_timers[r["id"]] as Label).text = Loc.t("rally.gathering", {"time": Fmt.duration(float(r["gatherUntil"]) - now_ms)}) if now_ms < float(r["gatherUntil"]) else Loc.t("rally.marching")

func _rebuild_rallies(rallies: Array, now_ms: float) -> void:
	var lang := Fmt.lang()
	for child in _rallies_rows.get_children():
		_rallies_rows.remove_child(child)
		child.queue_free()
	_rally_timers.clear()
	_rallies_empty.visible = rallies.is_empty()
	_rallies_empty.text = Loc.t("rally.empty")
	for r: Dictionary in rallies:
		var row := ListRow.new("npc_" + String(r["target"]["kind"]), false)
		row.title.text = Loc.t("march.entry", {"name": Loc.t("npc.%s.name" % r["target"]["kind"]), "level": Fmt.amount(lang, int(r["target"]["level"]))})
		# The leader's handle is player text: it goes after the translated label, never through a template.
		row.subtitle.text = "%s %s" % [Loc.t("rally.led"), String(r["leader"])]
		var time := UiKit.label("", UiKit.SMALL, HudTheme.RING, true)
		_rally_timers[r["id"]] = time
		row.extra.add_child(time)
		row.extra.add_child(UiKit.label(Loc.t("rally.participants", {"count": Fmt.amount(lang, int(r["participants"])), "max": Fmt.amount(lang, int(r["maxParticipants"]))}), UiKit.SMALL, MUTED))
		row.extra.add_child(_meter(int(r["participants"]), int(r["maxParticipants"])))
		if bool(r["joined"]):
			var joined := UiKit.label(Loc.t("rally.joined"), UiKit.BODY, GOLD, true)
			joined.size_flags_horizontal = Control.SIZE_SHRINK_END
			row.trailing.add_child(joined)
		elif RallyModel.can_join(r, now_ms):
			var join := _row_button(Loc.t("rally.join"))
			join.pressed.connect(func() -> void: rally_join_requested.emit(r))
			row.trailing.add_child(join)
		_rallies_rows.add_child(row)

func _on_give(button: Button, id: String) -> void:
	button.disabled = true
	var verdict: Dictionary = await _session.give_help(id)
	if not verdict["ok"] and verdict["reason"] != "":
		show_note(String(verdict["reason"]))
		_help_key = ""

func _build_members() -> void:
	var box := _scroll_list(_members_scroll, 6.0)
	var hq := UiKit.card()
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	line.add_child(HudIcon.new("base", 30.0))
	_hq_line.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_hq_line.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.add_child(_hq_line)
	UiKit.card_body(hq).add_child(line)
	box.add_child(hq)
	_rows_box.add_theme_constant_override("separation", roundi(HudTheme.px(5)))
	box.add_child(_rows_box)
	box.add_child(_leader_note)
	HudTheme.dress(_leave_button, "red")
	_leave_button.mouse_filter = Control.MOUSE_FILTER_PASS
	_leave_button.focus_mode = Control.FOCUS_NONE
	_leave_button.pressed.connect(_on_leave)
	box.add_child(_leave_button)

func _on_answered(yes: bool) -> void:
	if yes:
		_on_confirm_yes()
	else:
		_pending = {}
		_render_leave()

func _build_chat() -> void:
	_chat_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_chat_panel.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	_chat_panel.add_child(_status)
	_chat_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_chat_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_chat_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_chat_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_chat_box.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	_chat_scroll.add_child(_chat_box)
	_chat_scroll.get_v_scroll_bar().value_changed.connect(func(_v: float) -> void: _stick = _near_bottom())
	_chat_panel.add_child(_chat_scroll)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	_field(_chat_input, AllianceModel.CHAT_MAX)
	_chat_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_chat_input.text_submitted.connect(func(_t: String) -> void: _on_send())
	row.add_child(_chat_input)
	_send_button.focus_mode = Control.FOCUS_NONE
	HudTheme.dress(_send_button, "green")
	_send_button.pressed.connect(_on_send)
	row.add_child(_send_button)
	_chat_panel.add_child(row)

## Shows the Members or the Chat tab. Chat counts as open (lines are seen) only while it is on screen.
func select_tab(id: String) -> void:
	_tab = id
	_pending = {}
	_stick = true
	_apply_tab()

func _apply_tab() -> void:
	var joined := _joined.visible
	_members_scroll.visible = _tab == "members"
	_chat_panel.visible = _tab == "chat"
	_help_scroll.visible = _tab == "help"
	_rallies_scroll.visible = _tab == "rallies"
	_rallies_key = ""
	_help_key = ""
	for t: String in _tab_buttons:
		_tab_buttons[t].set_pressed_no_signal(t == _tab)
	_render_leave()
	_sync_chat_open()
	if joined and _tab == "chat":
		_render_chat()

func _sync_chat_open() -> void:
	if _session != null:
		_session.set_chat_open(is_visible_in_tree() and _joined.visible and _tab == "chat")

func _retranslate() -> void:
	_loading.text = Loc.t("alliance.loading")
	_intro.text = Loc.t("alliance.none")
	_search_input.placeholder_text = Loc.t("alliance.searchPlaceholder")
	_create_title.text = Loc.t("alliance.createTitle")
	_create_hint.text = Loc.t("alliance.createHint")
	_name_label.text = Loc.t("alliance.nameLabel")
	_tag_label.text = Loc.t("alliance.tagLabel")
	_create_button.text = Loc.t("alliance.create")
	_tab_labels["members"].text = Loc.t("alliance.tab.members")
	_tab_labels["chat"].text = Loc.t("alliance.tab.chat")
	_tab_labels["help"].text = Loc.t("alliance.tab.help")
	_tab_labels["rallies"].text = Loc.t("alliance.tab.rallies")
	_rallies_key = ""
	_help_key = ""
	UiKit.set_warning(_status, Loc.t("chat.reconnecting"))
	_chat_input.placeholder_text = Loc.t("chat.placeholder")
	_send_button.text = Loc.t("chat.send")
	_leave_button.text = Loc.t("alliance.leave")
	_yes_button.text = Loc.t("alliance.confirmYes")
	_no_button.text = Loc.t("alliance.confirmNo")
	if _note.visible:
		_note.text = _note_text()
	_render_leave()
	_render_results()
	if _session != null and _joined.visible:
		_render_members()

func _render_state() -> void:
	if _session == null:
		_set_band()
		_loading.visible = true
		_browse_scroll.visible = false
		_joined.visible = false
		return
	var known := _session.alliance_known
	var joined := known and _session.alliance != null
	_set_band()
	_loading.visible = not known
	_browse_scroll.visible = known and not joined
	_joined.visible = joined
	var view := "loading" if not known else ("joined" if joined else "browse")
	var id := AllianceModel.alliance_id(_session.alliance)
	if id != _alliance_id:
		_alliance_id = id
		_open_member = ""
		_members_scroll.scroll_vertical = 0
		_pending = {}
		_stick = true
	if joined:
		_status.visible = not _connected
		_render_members()
		_apply_tab()
		_update_chat_badge()
	elif view == "browse" and _view != "browse" and is_visible_in_tree():
		_run_search()
	if joined or is_visible_in_tree():
		_view = view
	_sync_chat_open()

## The band: the alliance's own name (player text, never through a template) with its tag and member count, or the page's title.
func _set_band() -> void:
	var a: Variant = _session.alliance if _session != null else null
	if a is Dictionary:
		set_title(String(a["name"]), Loc.t("settings.back"))
		var count := Loc.t("alliance.memberCount", {"count": Fmt.amount(Fmt.lang(), (a["members"] as Array).size()), "max": Fmt.amount(Fmt.lang(), int(a["maxMembers"]))})
		set_subtitle("[%s] · %s" % [a["tag"], count])
	else:
		set_title(Loc.t("alliance.title"), Loc.t("settings.back"))
		set_subtitle("")

func _update_chat_badge() -> void:
	_chat_badge.set_count(_session.unread() if _session != null else 0, Fmt.lang())

func _render_leave() -> void:
	_confirm_box.visible = not _pending.is_empty()
	if not _pending.is_empty():
		var q := AllianceModel.confirm_text(_pending)
		_confirm_label.text = Loc.t(String(q["key"]), q["vars"])
	var a: Variant = _session.alliance if _session != null else null
	_leader_note.visible = a is Dictionary and AllianceModel.leave_plan(a).get("kind") == "blocked"
	UiKit.set_warning(_leader_note, Loc.t("alliance.leaderMustTransfer"))

func _render_members() -> void:
	if _session == null or not _session.alliance is Dictionary:
		return
	var a: Dictionary = _session.alliance
	var lang := Fmt.lang()
	var hq: Variant = a.get("hq")
	_hq_line.text = Loc.t("alliance.hqNone") if not hq is Dictionary else Loc.t("alliance.hqAt", {"x": Fmt.amount(lang, hq["x"]), "y": Fmt.amount(lang, hq["y"])})
	for child in _rows_box.get_children():
		_rows_box.remove_child(child)
		child.queue_free()
	for m: Dictionary in a["members"]:
		_rows_box.add_child(_member(m, String(a["myRank"])))
	_render_leave()

## A member's row and, under it, what the player may do about them: closed until the row is tapped, so a long list stays short.
func _member(m: Dictionary, my_rank: String) -> Control:
	var handle := String(m["handle"])
	var me: bool = m.get("me", false)
	var actions := AllianceModel.member_actions(my_rank, m)
	var group := VBoxContainer.new()
	group.add_theme_constant_override("separation", roundi(HudTheme.px(3)))
	var row := ListRow.new("avatar", not actions.is_empty())
	row.title.text = handle
	row.title.add_theme_color_override("font_color", GOLD if me else HudTheme.BUTTON_TEXT)
	row.subtitle.text = Loc.t("alliance.you") if me else ""
	row.subtitle.visible = me
	var rank := String(m["rank"])
	row.trailing.add_child(UiKit.badge(Loc.t("alliance.rank." + rank), RANK_COLOURS.get(rank, HudTheme.DISABLED)))
	group.add_child(row)
	if actions.is_empty():
		return group
	var strip := HFlowContainer.new()
	strip.add_theme_constant_override("h_separation", roundi(HudTheme.px(6)))
	strip.add_theme_constant_override("v_separation", roundi(HudTheme.px(4)))
	strip.visible = _open_member == handle
	for action: String in actions:
		var button := Button.new()
		button.text = Loc.t("alliance.action." + action)
		button.focus_mode = Control.FOCUS_NONE
		button.disabled = _busy
		HudTheme.dress(button, "red" if action == "kick" else "wood")
		button.pressed.connect(_on_member_action.bind(action, handle))
		strip.add_child(button)
	group.add_child(strip)
	row.pressed.connect(func() -> void:
		_open_member = "" if _open_member == handle else handle
		_render_members())
	return group

func _on_member_action(action: String, handle: String) -> void:
	if _busy or _session == null:
		return
	if action == "kick" or action == "transfer":
		_pending = {"kind": action, "handle": handle}
		_render_leave()
		return
	await _act(_session.member_action.bind(action, handle))

func _on_leave() -> void:
	if _session == null or _session.alliance == null or _busy:
		return
	var plan := AllianceModel.leave_plan(_session.alliance)
	if plan["kind"] == "blocked":
		show_note(String(plan["reason"]))
		return
	_pending = {"kind": "leave", "key": plan["key"]}
	_render_leave()

func _on_confirm_yes() -> void:
	var pending := _pending
	_pending = {}
	_render_leave()
	match pending.get("kind"):
		"kick", "transfer":
			await _act(_session.member_action.bind(pending["kind"], pending["handle"]))
		"leave":
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
	for b in _rows_box.find_children("*", "Button", true, false):
		(b as Button).disabled = busy
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
		_results_box.add_child(UiKit.label(Loc.t("alliance.searching"), UiKit.BODY, MUTED))
		return
	if _results == null:
		if _view == "browse" and _search_seq > 0:
			_results_box.add_child(UiKit.warning(Loc.t("alliance.searchFailed")))
		return
	var rows := AllianceModel.search_rows(_results)
	if rows.is_empty():
		_results_box.add_child(UiKit.label(Loc.t("alliance.noResults"), UiKit.BODY, MUTED))
	var lang := Fmt.lang()
	for r: Dictionary in rows:
		var row := ListRow.new("alliance", false)
		row.title.text = "%s · %s" % [r["name"], r["tag"]]
		var vars: Dictionary = r["count_vars"]
		row.subtitle.text = Loc.t("alliance.memberCount", {"count": Fmt.amount(lang, vars["count"]), "max": Fmt.amount(lang, vars["max"])})
		row.extra.add_child(_meter(int(vars["count"]), int(vars["max"])))
		var join := _row_button(Loc.t("alliance.join"))
		join.disabled = not r["can_join"] or _busy
		join.set_meta("can_join", r["can_join"])
		join.pressed.connect(_on_join.bind(r["id"]))
		row.trailing.add_child(join)
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
	if _session == null or not _joined.visible or not _chat_panel.visible or not is_visible_in_tree():
		return
	var stick := _stick
	for child in _chat_box.get_children():
		_chat_box.remove_child(child)
		child.queue_free()
	var lang := Fmt.lang()
	var me := AllianceModel.my_handle(_session.alliance)
	if _session.chat.is_empty():
		_chat_box.add_child(EmptyState.new("chat", Loc.t("chat.empty")))
	for line: Dictionary in _session.chat:
		var mine := String(line["handle"]) == me
		var meta := "%s · %s · %s" % [line["handle"], Loc.t("alliance.rank." + String(line["rank"])), ReportTime.clock(lang, int(line["at"]), _offset_min)]
		_chat_box.add_child(ChatBubble.new(meta, String(line["text"]), mine))
	if stick and is_inside_tree():
		await get_tree().process_frame
		_chat_scroll.scroll_vertical = int(_chat_scroll.get_v_scroll_bar().max_value)

func _near_bottom() -> bool:
	var bar := _chat_scroll.get_v_scroll_bar()
	return bar.max_value - (bar.value + bar.page) <= STICK_SLOP
