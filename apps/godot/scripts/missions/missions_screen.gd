class_name MissionsScreen
extends PageFrame
## The Missions page: the current beginner quest (its step in the chain, goal, progress and reward) above today's daily missions, each
## with its progress, its reward and a Claim button once it is done, and when the daily missions reset. It draws MissionsModel from the Session's view.
## Claim announces `claim_requested` with what the reward is: the reward popup shows it and sends the claim through the Session on Collect
## (the server decides). Fetches the missions each time it opens. Back announces `closed`.

signal closed
## A done row's Claim was pressed: `kind` "daily" or "quest", its id, the popup's title and subtitle (the goal), and the reward's items
## (MissionsModel.reward_items).
signal claim_requested(kind: String, id: String, title: String, subtitle: String, items: Array)

var _session: Session
var _key := ""
var _now := 0

func _init() -> void:
	super("victory")

func _ready() -> void:
	back_pressed.connect(func() -> void: closed.emit())
	visibility_changed.connect(func() -> void:
		if is_visible_in_tree():
			_key = ""
			if _session != null:
				_session.load_missions()
			_render())
	_render()

## Connects the screen to the session it shows.
func setup(session: Session) -> void:
	_session = session
	session.missions_changed.connect(_render)
	_render()

## Call every frame while the screen shows, with the server time: the reset countdown follows it (redrawn once a minute).
func tick(now: int) -> void:
	_now = now
	_render()

## Draws the texts again (the language changed).
func refresh() -> void:
	_key = ""
	_render()

func _signature(view: Dictionary) -> String:
	var minutes := MissionsModel.reset_in(view, _now) / 60000
	return "|".join([TranslationServer.get_locale(), Loc.background_id, JSON.stringify(view.get("daily", [])), JSON.stringify(view.get("quest")), str(minutes)])

func _render() -> void:
	if _session == null or not is_visible_in_tree():
		return
	set_title(Loc.t("missions.title"), Loc.t("settings.back"))
	var view := _session.missions
	var key := _signature(view) if MissionsModel.is_view(view) else "empty:%s:%s" % [TranslationServer.get_locale(), _session.online]
	if key == _key:
		return
	_key = key
	for child in body.get_children():
		body.remove_child(child)
		child.queue_free()
	if not MissionsModel.is_view(view):
		body.add_child(EmptyState.new("victory", Loc.t("missions.loading" if _session.online else "missions.offline")))
		return
	var quest := MissionsModel.quest_row(view)
	body.add_child(_quest_card(quest, view) if not quest.is_empty() else _done_card())
	body.add_child(_daily_card(view))

func _line(text: String, size: float, colour: Color) -> Label:
	var label := UiKit.label(text, size, colour, false, true)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label

## A row's goal text, with the building's name (per background) for a building goal and the numbers in the player's language.
static func goal_text(r: Dictionary) -> String:
	var lang := Fmt.lang()
	var vars := {"count": Fmt.amount(lang, r["vars"]["count"])}
	if r["vars"].has("building"):
		vars["building"] = Loc.t("building.%s.name" % r["vars"]["building"])
	return Loc.t(r["key"], vars)

func _quest_card(r: Dictionary, view: Dictionary) -> Control:
	var lang := Fmt.lang()
	var card := UiKit.section("upgrade", Loc.t("missions.quests"))
	UiKit.section_value(card, Loc.t("missions.step", {"step": Fmt.amount(lang, r["step"]), "steps": Fmt.amount(lang, r["steps"])}))
	var v := UiKit.card_body(card)
	v.add_child(_line(goal_text(r), UiKit.BODY + 1.0, HudTheme.TEXT))
	_add_progress(v, r)
	v.add_child(_rewards(view["quest"].get("reward"), 0))
	_add_claim(v, r, "quest", MissionsModel.reward_items(view["quest"].get("reward"), 0))
	return card

func _done_card() -> Control:
	var card := UiKit.section("upgrade", Loc.t("missions.quests"))
	UiKit.card_body(card).add_child(_line(Loc.t("missions.allDone"), UiKit.BODY, HudTheme.TEXT_SECOND))
	return card

func _daily_card(view: Dictionary) -> Control:
	var card := UiKit.section("clock", Loc.t("missions.daily"))
	UiKit.section_value(card, Loc.t("missions.resets", {"time": Fmt.duration(MissionsModel.reset_in(view, _now))}))
	var v := UiKit.card_body(card)
	var daily: Array = view["daily"]
	var rows := MissionsModel.daily_rows(view)
	for i in rows.size():
		if i > 0:
			v.add_child(UiKit.divider())
		var r: Dictionary = rows[i]
		var colour := HudTheme.TEXT_SECOND if r["state"] == "claimed" else HudTheme.TEXT
		v.add_child(_line(goal_text(r), UiKit.BODY, colour))
		_add_progress(v, r)
		var m: Dictionary = daily[i]
		v.add_child(_rewards(m.get("reward"), int(m.get("passXp", 0))))
		_add_claim(v, r, "daily", MissionsModel.reward_items(m.get("reward"), int(m.get("passXp", 0))))
	return card

func _add_progress(v: VBoxContainer, r: Dictionary) -> void:
	var lang := Fmt.lang()
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	var bar := UiKit.progress_bar()
	bar.max_value = 1.0
	bar.step = 0.0
	bar.value = float(r["fraction"])
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(bar)
	row.add_child(UiKit.label(Loc.t("missions.progress", {"have": Fmt.amount(lang, r["progress"]), "need": Fmt.amount(lang, r["target"])}), UiKit.SMALL, HudTheme.TEXT_SECOND))
	v.add_child(row)

## The reward as chips: resources with their icons, then shards, tokens and pass XP.
func _rewards(reward: Variant, pass_xp: int) -> Control:
	var lang := Fmt.lang()
	var chips: Array = []
	for item: Dictionary in MissionsModel.reward_items(reward, pass_xp):
		match item["kind"]:
			"resource":
				chips.append(UiKit.cost_chip(String(item["id"]), Fmt.amount(lang, item["amount"]), false))
			"shards":
				chips.append(UiKit.stat_chip("heroes", Fmt.amount(lang, item["amount"])))
			"tokens":
				chips.append(UiKit.stat_chip("clock", Loc.t("reward.tokens", {"count": Fmt.amount(lang, item["amount"])})))
			"pass_xp":
				chips.append(UiKit.stat_chip("power", Loc.t("missions.passXp", {"count": Fmt.amount(lang, item["amount"])})))
	return UiKit.chips(chips)

func _add_claim(v: VBoxContainer, r: Dictionary, kind: String, items: Array) -> void:
	if r["state"] == "claimed":
		v.add_child(UiKit.chips([UiKit.badge(Loc.t("missions.claimed"), Color("305561"))]))
		return
	# Unfinished rows show their bar only: a column of grey buttons would fill a phone screen with nothing to press.
	if r["state"] == "claim":
		var button := UiKit.primary_button(Loc.t("missions.claim"))
		button.focus_mode = Control.FOCUS_NONE
		button.mouse_filter = Control.MOUSE_FILTER_PASS
		var title := Loc.t("reward.questDone" if kind == "quest" else "reward.missionDone")
		button.pressed.connect(func() -> void: claim_requested.emit(kind, String(r["id"]), title, goal_text(r), items))
		v.add_child(button)
