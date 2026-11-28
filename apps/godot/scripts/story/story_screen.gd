class_name StoryScreen
extends PageFrame
## The Story page (a port of the Phaser story panel): the current chapter's scenes with Back and Next, its objectives with progress, the
## reward and Claim, then the chapters already claimed, each of which opens again for reading. Every chapter is placeholder text pending
## historian review (GDD §6), so the draft notice is always on screen. It draws StoryModel from the Session's base. Claim announces
## `claim_requested` with the reward: the reward popup shows it and sends the claim through the Session on Collect (the server decides).
## The page's back button closes a chapter opened for reading, else announces `closed`.

signal closed
## The current chapter's Claim was pressed: the popup's title and subtitle, and the reward's items (StoryModel.reward_items).
signal claim_requested(title: String, subtitle: String, items: Array)

var _session: Session
var _key := ""
## The scene being read (0-based) and the chapter index it belongs to.
var _scene := 0
var _scene_chapter := -1
## A claimed chapter opened for reading again, or -1.
var _replay := -1

func _init() -> void:
	super("info")

func _ready() -> void:
	back_pressed.connect(_on_back)
	visibility_changed.connect(func() -> void:
		if is_visible_in_tree():
			_replay = -1
			_scene_chapter = -1
			_key = ""
			_render())
	_render()

## Connects the screen to the session it shows.
func setup(session: Session) -> void:
	_session = session
	session.state_changed.connect(_render)
	_render()

## Draws the texts again (the language changed).
func refresh() -> void:
	_key = ""
	_render()

func is_replaying() -> bool:
	return _replay >= 0

## Opens a claimed chapter for reading (its index), or goes back to the current one for -1.
func open_replay(index: int) -> void:
	_replay = index
	_scene_chapter = -1
	_key = ""
	_render()

func _on_back() -> void:
	if _replay >= 0:
		open_replay(-1)
	else:
		closed.emit()

func _bg() -> String:
	return _session.background if _session != null else ""

func _signature(state: Dictionary) -> String:
	var bg := _bg()
	var chapter := StoryModel.current(state, bg)
	var have: Array = []
	for o: Variant in chapter.get("objectives", []):
		if o is Dictionary:
			have.append(StoryModel.progress(state, o)["have"])
	return "|".join([TranslationServer.get_locale(), bg, StoryModel.claimed(state), StoryModel.status(state, bg), str(have), _scene, _scene_chapter, _replay])

func _render() -> void:
	if _session == null or not is_visible_in_tree():
		return
	set_title(Loc.t("story.title"), Loc.t("settings.back"))
	var state := _session.state
	var key := _signature(state) if not state.is_empty() else "empty:%s" % TranslationServer.get_locale()
	if key == _key:
		return
	_key = key
	for child in body.get_children():
		body.remove_child(child)
		child.queue_free()
	body.add_child(UiKit.warning(Loc.t("story.draftNotice")))
	if state.is_empty():
		body.add_child(EmptyState.new("info", Loc.t("missions.loading" if _session.online else "missions.offline")))
		return
	var bg := _bg()
	var all := StoryModel.chapters(bg)
	var claimed := StoryModel.claimed(state)
	if _replay >= 0 and _replay < mini(claimed, all.size()):
		body.add_child(_chapter_card(_replay, all[_replay], state, false))
		return
	_replay = -1
	var chapter := StoryModel.current(state, bg)
	if chapter.is_empty():
		var done := UiKit.section("victory", Loc.t("story.complete"))
		UiKit.card_body(done).add_child(_line(Loc.t("story.completeDesc"), UiKit.BODY, HudTheme.TEXT_SECOND))
		body.add_child(done)
	else:
		body.add_child(_chapter_card(claimed, chapter, state, true))
	if claimed > 0:
		body.add_child(_completed_card(all, mini(claimed, all.size())))

func _line(text: String, size: float, colour: Color) -> Label:
	var label := UiKit.label(text, size, colour, false, true)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label

## "Chapter 2 · <title>".
func chapter_heading(index: int, chapter: Dictionary) -> String:
	return "%s · %s" % [Loc.t("story.chapter", {"n": Fmt.amount(Fmt.lang(), index + 1)}), Loc.t(StoryModel.title_key(_bg(), chapter))]

## An objective as a sentence: names from i18n keys for ids, numbers in the player's language.
static func objective_sentence(o: Dictionary) -> String:
	var lang := Fmt.lang()
	var t := StoryModel.objective_text(o)
	var vars := {}
	if t.has("building"):
		vars["building"] = Loc.t("building.%s.name" % t["building"])
	if t.has("hero"):
		vars["hero"] = Loc.t("hero.%s.name" % t["hero"])
	for k: String in ["level", "count"]:
		if t.has(k):
			vars[k] = Fmt.amount(lang, t[k])
	return Loc.t(t["key"], vars) if t["key"] != "" else ""

func _chapter_card(index: int, chapter: Dictionary, state: Dictionary, current: bool) -> Control:
	var card := UiKit.section("info", chapter_heading(index, chapter))
	var v := UiKit.card_body(card)
	_add_scenes(v, index, chapter)
	if not current:
		return card
	v.add_child(UiKit.divider())
	v.add_child(UiKit.label(Loc.t("story.objectives"), UiKit.BODY, HudTheme.TEXT, true))
	var lang := Fmt.lang()
	for o: Variant in chapter.get("objectives", []):
		if not o is Dictionary:
			continue
		var p := StoryModel.progress(state, o)
		var row := HBoxContainer.new()
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
		var colour := HudTheme.TEXT_SECOND if p["done"] else HudTheme.TEXT
		row.add_child(UiKit.label("✓" if p["done"] else "○", UiKit.BODY, colour, true))
		row.add_child(_line(objective_sentence(o), UiKit.BODY, colour))
		row.add_child(UiKit.label(Loc.t("story.progress", {"have": Fmt.amount(lang, p["have"]), "need": Fmt.amount(lang, p["need"])}), UiKit.SMALL, HudTheme.TEXT_SECOND))
		v.add_child(row)
	v.add_child(UiKit.divider())
	v.add_child(UiKit.label(Loc.t("story.reward"), UiKit.BODY, HudTheme.TEXT, true))
	var items := StoryModel.reward_items(chapter)
	var chips: Array = []
	for item: Dictionary in items:
		if item["kind"] == "resource":
			chips.append(UiKit.cost_chip(String(item["id"]), Fmt.amount(lang, item["amount"]), false))
		elif item["kind"] == "shards":
			chips.append(UiKit.stat_chip("heroes", Fmt.amount(lang, item["amount"])))
	v.add_child(UiKit.chips(chips))
	var button := UiKit.primary_button(Loc.t("story.claim"))
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_filter = Control.MOUSE_FILTER_PASS
	button.disabled = StoryModel.status(state, _bg()) != "ready"
	var heading := chapter_heading(index, chapter)
	button.pressed.connect(func() -> void: claim_requested.emit(heading, "", items))
	v.add_child(button)
	return card

## The scene text and its Back / "Scene n of m" / Next row. The scene restarts at 1 when another chapter is shown.
func _add_scenes(v: VBoxContainer, index: int, chapter: Dictionary) -> void:
	if _scene_chapter != index:
		_scene_chapter = index
		_scene = 0
	var scenes := maxi(1, int(chapter.get("scenes", 1)))
	_scene = clampi(_scene, 0, scenes - 1)
	var lang := Fmt.lang()
	v.add_child(_line(Loc.t(StoryModel.scene_key(_bg(), chapter, _scene + 1)), UiKit.BODY + 1.0, HudTheme.TEXT))
	var nav := HBoxContainer.new()
	nav.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	var back := _small_button(Loc.t("story.back"), _scene <= 0)
	back.pressed.connect(func() -> void:
		_scene = maxi(0, _scene - 1)
		_render())
	var count := UiKit.label(Loc.t("story.sceneOf", {"n": Fmt.amount(lang, _scene + 1), "total": Fmt.amount(lang, scenes)}), UiKit.SMALL, HudTheme.TEXT_SECOND)
	count.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var next := _small_button(Loc.t("story.next"), _scene >= scenes - 1)
	next.pressed.connect(func() -> void:
		_scene = mini(scenes - 1, _scene + 1)
		_render())
	nav.add_child(back)
	nav.add_child(count)
	nav.add_child(next)
	v.add_child(nav)

func _small_button(text: String, disabled: bool) -> Button:
	var b := Button.new()
	b.text = text
	b.disabled = disabled
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_filter = Control.MOUSE_FILTER_PASS
	b.custom_minimum_size = Vector2(HudTheme.px(UiKit.TAP * 2.0), HudTheme.px(UiKit.TAP))
	HudTheme.dress(b, "wood")
	return b

func _completed_card(all: Array, claimed: int) -> Control:
	var card := UiKit.section("victory", Loc.t("story.completed"))
	var v := UiKit.card_body(card)
	for i in claimed:
		var b := _small_button(chapter_heading(i, all[i]), false)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(open_replay.bind(i))
		v.add_child(b)
	return card
