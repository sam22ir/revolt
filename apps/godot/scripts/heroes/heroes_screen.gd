class_name HeroesScreen
extends PageFrame
## The Heroes page: a grid of the background's heroes under the recruit card, and a hero's own page (portrait, what they do, shards and
## Level up, skills). It draws what HeroesModel gives it and sends the player's intent through the Session; the server decides. Back goes
## from a hero to the grid, and from the grid announces `closed`. Fills the area between the HUD and the tab bar and is hidden (no drawing,
## no input, no work) on the other screens.

signal closed

const COLUMNS := 2
const MEDALLION := 40.0

var _session: Session
var _body := body
var _key := ""
## The hero whose page is open; "" for the grid.
var _open := ""
## Where the grid was scrolled to when a hero's page was opened.
var _grid_scroll := 0
var _scroll_target := 0
var _scroll_frames := 0
## A refusal per hero, shown on their page until it is redrawn from fresh state.
var _notes := {}
## The resources accrued to now (fed every frame by the shell while the screen shows), for the draw's affordability.
var _amounts := {}
## What the last draw gave ({"kind": "drawn", ...draw}) or why it was refused ({"kind": "refused", "reason"}), until the next draw.
var _recruit_note: Variant = null

func _init() -> void:
	super("heroes")

func _ready() -> void:
	set_process(false)
	back_pressed.connect(_on_back)
	scroll.scroll_started.connect(func() -> void: set_process(false)) # a finger wins over the view being put back
	visibility_changed.connect(func() -> void:
		if is_visible_in_tree():
			_open = ""
			_key = ""
			_render())
	_render()

## Connects the screen to the session it shows.
func setup(session: Session) -> void:
	_session = session
	session.state_changed.connect(_render)

## Call every frame while the screen shows: the draw's button follows what can be afforded as the resources grow.
func tick(amounts: Dictionary) -> void:
	_amounts = amounts
	_render()

## Draws the texts again (the language changed).
func refresh() -> void:
	_key = ""
	_render()

func is_hero_open() -> bool:
	return _open != ""

## Opens a hero's page, or the grid for "".
func open_hero(id: String) -> void:
	if _open == "":
		_grid_scroll = scroll.scroll_vertical
	_open = id
	_render()
	_scroll_to(0 if id != "" else _grid_scroll)

## Scrolls there, again for a few frames: the new view's wrapped lines take a frame or two to have their height.
func _scroll_to(to: int) -> void:
	_scroll_target = to
	_scroll_frames = 3
	scroll.scroll_vertical = to
	set_process(true)

func _process(_delta: float) -> void:
	scroll.scroll_vertical = _scroll_target
	_scroll_frames -= 1
	if _scroll_frames <= 0:
		set_process(false)

func _on_back() -> void:
	if is_hero_open():
		open_hero("")
	else:
		closed.emit()

func _signature(cards: Array) -> String:
	var parts: Array[String] = [TranslationServer.get_locale(), Loc.background_id, _open]
	for c: Dictionary in cards:
		var o: Variant = c["owned"]
		parts.append("%s:%s:%s:%d:%s:%s" % [c["id"], o["level"] if o is Dictionary else 0, o["shards"] if o is Dictionary else 0, int(c["busy"]), c["level_up"], _notes.get(c["id"], "")])
	parts.append(str(cards[0]["cap"]))
	parts.append(HeroesModel.recruit_block(_session.state, _amounts))
	parts.append(str(_session.state.get("heroes", {}).get("pity", 0)))
	parts.append(JSON.stringify(_recruit_note))
	return "|".join(parts)

func _render() -> void:
	if _session == null or _session.state.is_empty() or not is_visible_in_tree():
		return
	var cards := HeroesModel.cards(_session.state, _session.background)
	var key := _signature(cards)
	if key == _key:
		return
	_key = key
	for child in body.get_children():
		body.remove_child(child)
		child.queue_free()
	var shown := cards.filter(func(c: Dictionary) -> bool: return c["id"] == _open)
	if shown.is_empty():
		_open = ""
		set_title(Loc.t("heroes.title"), Loc.t("settings.back"))
		_render_grid(cards)
	else:
		set_title(Loc.t("hero.%s.name" % _open), Loc.t("settings.back"))
		_render_hero(shown[0])

func _render_grid(cards: Array) -> void:
	body.add_child(_recruit_card())
	var grid := GridContainer.new()
	grid.columns = COLUMNS
	grid.mouse_filter = Control.MOUSE_FILTER_PASS
	grid.add_theme_constant_override("h_separation", roundi(HudTheme.px(7)))
	grid.add_theme_constant_override("v_separation", roundi(HudTheme.px(7)))
	for c: Dictionary in cards:
		var tile := HeroTile.new(c)
		tile.pressed.connect(open_hero.bind(String(c["id"])))
		grid.add_child(tile)
	body.add_child(grid)
	var about := UiKit.card()
	UiKit.card_body(about).add_child(_line(Loc.t("heroes.hallCap", {"cap": Fmt.amount(Fmt.lang(), cards[0]["cap"])}), UiKit.BODY, HudTheme.TEXT))
	UiKit.card_body(about).add_child(_line(Loc.t("heroes.intro"), UiKit.SMALL, HudTheme.TEXT_SECOND))
	body.add_child(about)

func _line(text: String, size: float, colour: Color) -> Label:
	var label := UiKit.label(text, size, colour, false, true)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label

## The draw: its cost, the button, why it is off or what the last draw gave, and the published odds with the pity rule.
func _recruit_card() -> Control:
	var lang := Fmt.lang()
	var card := UiKit.section("support", Loc.t("heroes.recruit"))
	var v := UiKit.card_body(card)
	var gap := Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	UiKit.section_head(card).add_child(gap)
	for item: Dictionary in HeroesModel.recruit_cost(_amounts):
		UiKit.section_head(card).add_child(UiKit.cost_chip(String(item["id"]), Fmt.amount(lang, item["amount"]), item["lacking"]))
	if _recruit_note is Dictionary and _recruit_note["kind"] == "drawn":
		v.add_child(_drawn_row(_recruit_note))
	var block := HeroesModel.recruit_block(_session.state, _amounts)
	var button := UiKit.primary_button(Loc.t("heroes.recruit"))
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_filter = Control.MOUSE_FILTER_PASS
	button.disabled = block != ""
	button.pressed.connect(_on_recruit.bind(button))
	v.add_child(button)
	var why := block
	if _recruit_note is Dictionary and _recruit_note["kind"] == "refused":
		why = String(_recruit_note["reason"])
	if why != "":
		v.add_child(UiKit.warning(Loc.t("reason." + why, {"level": Fmt.amount(lang, HeroesModel.progression()["drawMinHall"])})))
	var odds := HeroesModel.odds_percent()
	var parts := ["common", "rare", "legendary"].map(func(r: String) -> Array: return [odds[r], HeroPortrait.FRAMES[r]])
	v.add_child(SegmentBar.new(100.0, parts))
	v.add_child(_line(Loc.t("heroes.odds", {"common": Fmt.amount(lang, odds["common"]), "rare": Fmt.amount(lang, odds["rare"]), "legendary": Fmt.amount(lang, odds["legendary"])}), UiKit.SMALL, HudTheme.TEXT_SECOND))
	var pity := int(_session.state.get("heroes", {}).get("pity", 0))
	var run := int(HeroesModel.progression()["pityDraws"])
	var left := HeroesModel.pity_left(pity)
	v.add_child(SegmentBar.new(float(run), [[run - left, Color("4f86ad")]]))
	v.add_child(_line(Loc.t("heroes.pity", {"count": Fmt.amount(lang, run), "left": Fmt.amount(lang, left)}), UiKit.SMALL, HudTheme.TEXT_SECOND))
	return card

## Who the last draw brought, by their portrait.
func _drawn_row(note: Dictionary) -> Control:
	var tray := PanelContainer.new()
	tray.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tray.add_theme_stylebox_override("panel", HudTheme.inset(8.0, 8.0))
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(12)))
	var id := String(note["heroId"])
	var owned: Dictionary = _session.state.get("heroes", {}).get("owned", {}).get(id, {"level": 1})
	row.add_child(HeroPortrait.new(id, Balance.data()["heroes"][id]["rarity"], 64.0, int(owned["level"])))
	var text := _line(Loc.t("heroes.drawnDuplicate" if note["duplicate"] else "heroes.drawn", {"name": Loc.t("hero.%s.name" % id)}), UiKit.BODY + 1.0, HudTheme.TEXT)
	text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(text)
	tray.add_child(row)
	return tray

func _on_recruit(button: Button) -> void:
	if _session == null:
		return
	button.disabled = true
	var verdict: Dictionary = await _session.recruit()
	if verdict["reason"] == "" and not verdict["ok"]:
		return
	if verdict["ok"] and verdict.get("draw") is Dictionary:
		_recruit_note = {"kind": "drawn", "heroId": verdict["draw"]["heroId"], "duplicate": verdict["draw"]["duplicate"]}
	elif verdict["ok"]:
		_recruit_note = null
	else:
		_recruit_note = {"kind": "refused", "reason": String(verdict["reason"])}
	_key = ""
	_render()

func _render_hero(c: Dictionary) -> void:
	body.add_child(_portrait_card(c))
	if c["owned"] is Dictionary:
		body.add_child(_level_card(c))
	body.add_child(_skills_card(c))

func _portrait_card(c: Dictionary) -> Control:
	var lang := Fmt.lang()
	var owned: Variant = c["owned"]
	var card := UiKit.card()
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(14)))
	row.add_child(HeroPortrait.new(c["id"], c["def"]["rarity"], 132.0, int(owned["level"]) if owned is Dictionary else 0))
	var facts := VBoxContainer.new()
	facts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	facts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	facts.alignment = BoxContainer.ALIGNMENT_CENTER
	facts.add_theme_constant_override("separation", roundi(HudTheme.px(5)))
	var badges: Array = [HeroPortrait.rarity_badge(c["def"]["rarity"])]
	if c["busy"]:
		badges.append(UiKit.badge(Loc.t("heroes.busy"), Color("305561")))
	facts.add_child(UiKit.chips(badges))
	var status := Loc.t("heroes.level", {"level": Fmt.amount(lang, owned["level"])}) if owned is Dictionary else Loc.t("heroes.notRecruited")
	facts.add_child(UiKit.label(status, UiKit.TITLE, HudTheme.TEXT, true))
	var special := HBoxContainer.new()
	special.mouse_filter = Control.MOUSE_FILTER_IGNORE
	special.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	special.add_child(UiKit.troop_medallion(c["def"]["specialty"], MEDALLION))
	var words := VBoxContainer.new()
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.add_theme_constant_override("separation", 0)
	words.add_child(UiKit.label(Loc.t("heroes.specialty"), UiKit.SMALL, HudTheme.TEXT_SECOND))
	words.add_child(_line(Loc.t("troop.%s.name" % c["def"]["specialty"]), UiKit.BODY, HudTheme.TEXT))
	special.add_child(words)
	facts.add_child(special)
	row.add_child(facts)
	UiKit.card_body(card).add_child(row)
	UiKit.card_body(card).add_child(UiKit.divider())
	# The description carries "inspired by" and "not a portrait of anyone real" (GDD section 6): always shown.
	UiKit.card_body(card).add_child(_line(Loc.t("hero.%s.desc" % c["id"]), UiKit.BODY, HudTheme.TEXT))
	return card

func _level_card(c: Dictionary) -> Control:
	var need: int = c["next_shards"]
	var card := UiKit.section("upgrade", HeroTile.shard_text(c["owned"], need))
	var v := UiKit.card_body(card)
	v.add_child(HeroTile.shard_bar(c["owned"], need))
	if need < 0:
		return card
	var button := UiKit.primary_button(Loc.t("heroes.levelUp"))
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_filter = Control.MOUSE_FILTER_PASS
	button.disabled = c["level_up"] != ""
	button.pressed.connect(_on_level_up.bind(button, String(c["id"])))
	v.add_child(button)
	var why := String(_notes.get(c["id"], c["level_up"]))
	if why != "":
		v.add_child(UiKit.warning(Loc.t("reason." + why, {"cap": Fmt.amount(Fmt.lang(), c["cap"])})))
	return card

## A row per skill: its mark, its name, what it does, and whether it is the command skill.
func _skills_card(c: Dictionary) -> Control:
	var lang := Fmt.lang()
	var card := UiKit.card()
	var v := UiKit.card_body(card)
	for line: Dictionary in HeroesModel.skill_lines(c):
		if v.get_child_count() > 0:
			v.add_child(UiKit.divider())
		var attack: bool = line["stat"] == "attack"
		var row := HBoxContainer.new()
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
		var icon := HudIcon.new("power" if attack else "alliance", 36.0)
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(icon)
		var words := VBoxContainer.new()
		words.mouse_filter = Control.MOUSE_FILTER_IGNORE
		words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		words.add_theme_constant_override("separation", 0)
		var slot := UiKit.badge(Loc.t("hero.skill." + String(line["slot"])), Color("7a4a1c") if line["slot"] == "command" else Color("575148"))
		words.add_child(UiKit.chips([UiKit.label(Loc.t("skill.%s.name" % line["id"]), UiKit.BODY + 1.0, HudTheme.BUTTON_TEXT, true), slot]))
		words.add_child(_line(Loc.t("hero.skill.attack_pct", {"troop": Loc.t("troop.%s.name" % c["def"]["specialty"]), "pct": Fmt.amount(lang, line["pct"])}) if attack else Loc.t("hero.skill.defense_pct", {"pct": Fmt.amount(lang, line["pct"])}), UiKit.BODY, HudTheme.GOLD))
		row.add_child(words)
		v.add_child(row)
	return card

func _on_level_up(button: Button, id: String) -> void:
	if _session == null:
		return
	button.disabled = true
	var verdict: Dictionary = await _session.level_up_hero(id)
	if verdict["reason"] == "" and verdict["ok"] == false:
		return
	if verdict["ok"]:
		_notes.erase(id)
	else:
		_notes[id] = String(verdict["reason"])
	_key = ""
	_render()
