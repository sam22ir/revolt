class_name HeroesScreen
extends Control
## The Heroes screen: the background's heroes with level, shards, skills and a Level up button. It draws what HeroesModel gives it
## and sends the player's intent through the Session; the server decides. Opened from the hero hall's sheet and left with Close.
## There are no portraits yet: rarity shows as the card's border and its label, the specialty as text. Fills the area between the
## HUD and the nav bar and is hidden (no drawing, no input, no work) on the other screens.

signal closed

const MARGIN := 34
const FONT := 30
const SMALL := 26
const PAPER := Color8(0xf4, 0xea, 0xd6)
const INK := Color8(0x2b, 0x2a, 0x24)
const MUTED := HudTheme.TEXT_SECOND
const LACKING := Color8(0xe0, 0x7a, 0x62)
const RARITY_COLORS := {
	"common": Color8(0x9a, 0x92, 0x7a),
	"rare": Color8(0x6a, 0xa8, 0xe0),
	"legendary": Color8(0xe0, 0xb0, 0x40),
}

var _session: Session
var _scroll := ScrollContainer.new()
var _body := VBoxContainer.new()
var _key := ""
## A refusal per hero, shown under the card until it is redrawn from fresh state.
var _notes := {}
## The resources accrued to now (fed every frame by the shell while the screen shows), for the draw's affordability.
var _amounts := {}
## What the last draw gave ({"kind": "drawn", ...draw}) or why it was refused ({"kind": "refused", "reason"}), until the next draw.
var _recruit_note: Variant = null

func _ready() -> void:
	add_child(PageBackdrop.new())
	_scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, PageBackdrop.RIM)
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
	visibility_changed.connect(func() -> void:
		if is_visible_in_tree():
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

func _signature(cards: Array) -> String:
	var parts: Array[String] = [TranslationServer.get_locale(), Loc.background_id]
	for c: Dictionary in cards:
		var o: Variant = c["owned"]
		parts.append("%s:%s:%s:%d:%s:%s" % [c["id"], o["level"] if o is Dictionary else 0, o["shards"] if o is Dictionary else 0, int(c["busy"]), c["level_up"], _notes.get(c["id"], "")])
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
	for child in _body.get_children():
		_body.remove_child(child)
		child.queue_free()
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	var title := _label(Loc.t("heroes.title"), FONT + 6, PAPER)
	head.add_child(title)
	var close := Button.new()
	close.text = Loc.t("panel.close")
	close.add_theme_font_size_override("font_size", FONT)
	close.pressed.connect(func() -> void: closed.emit())
	head.add_child(close)
	_body.add_child(head)
	_body.add_child(_label(Loc.t("heroes.intro"), SMALL, MUTED, true))
	_body.add_child(_label(Loc.t("heroes.hallCap", {"cap": Fmt.amount(Fmt.lang(), cards[0]["cap"])}), SMALL, MUTED, true))
	_body.add_child(_recruit_box())
	for c: Dictionary in cards:
		_body.add_child(_card(c))

## The draw: its cost, the button, why it is off or what the last draw gave, and the published odds with the pity rule.
func _recruit_box() -> Control:
	var lang := Fmt.lang()
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	var costs := HFlowContainer.new()
	for item: Dictionary in HeroesModel.recruit_cost(_amounts):
		costs.add_child(_label("%s %s" % [Loc.t("resource." + String(item["id"])), Fmt.amount(lang, item["amount"])], FONT, LACKING if item["lacking"] else PAPER))
	v.add_child(costs)
	var block := HeroesModel.recruit_block(_session.state, _amounts)
	var button := Button.new()
	button.text = Loc.t("heroes.recruit")
	button.add_theme_font_size_override("font_size", FONT)
	button.disabled = block != ""
	button.pressed.connect(_on_recruit.bind(button))
	v.add_child(button)
	var why := block
	if _recruit_note is Dictionary and _recruit_note["kind"] == "refused":
		why = String(_recruit_note["reason"])
	if why != "":
		v.add_child(_label(Loc.t("reason." + why, {"level": Fmt.amount(lang, HeroesModel.progression()["drawMinHall"])}), SMALL, LACKING, true))
	if _recruit_note is Dictionary and _recruit_note["kind"] == "drawn":
		var key := "heroes.drawnDuplicate" if _recruit_note["duplicate"] else "heroes.drawn"
		v.add_child(_label(Loc.t(key, {"name": Loc.t("hero.%s.name" % _recruit_note["heroId"])}), SMALL, PAPER, true))
	var odds := HeroesModel.odds_percent()
	v.add_child(_label(Loc.t("heroes.odds", {"common": Fmt.amount(lang, odds["common"]), "rare": Fmt.amount(lang, odds["rare"]), "legendary": Fmt.amount(lang, odds["legendary"])}), SMALL, MUTED, true))
	var pity := int(_session.state.get("heroes", {}).get("pity", 0))
	v.add_child(_label(Loc.t("heroes.pity", {"count": Fmt.amount(lang, HeroesModel.progression()["pityDraws"]), "left": Fmt.amount(lang, HeroesModel.pity_left(pity))}), SMALL, MUTED, true))
	return v

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

func _card(c: Dictionary) -> Control:
	var lang := Fmt.lang()
	var rarity: String = c["def"]["rarity"]
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# The rarity colours the card's brass.
	var box := HudTheme.card(14.0, 12.0)
	box.frame_tint = (RARITY_COLORS[rarity] as Color).lerp(Color.WHITE, 0.35) * 1.25
	panel.add_theme_stylebox_override("panel", box)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	panel.add_child(v)
	var head := HBoxContainer.new()
	head.add_child(_label(Loc.t("hero.%s.name" % c["id"]), FONT + 2, PAPER))
	var rarity_label := _label(Loc.t("rarity." + rarity), SMALL, RARITY_COLORS[rarity])
	rarity_label.size_flags_horizontal = Control.SIZE_SHRINK_END
	head.add_child(rarity_label)
	v.add_child(head)
	v.add_child(_label(Loc.t("hero.%s.desc" % c["id"]), SMALL, MUTED, true))
	var owned: Variant = c["owned"]
	var status := Loc.t("heroes.level", {"level": Fmt.amount(lang, owned["level"])}) if owned is Dictionary else Loc.t("heroes.notRecruited")
	if c["busy"]:
		status += " · " + Loc.t("heroes.busy")
	v.add_child(_label(status, SMALL, PAPER))
	var need: int = c["next_shards"]
	if owned is Dictionary:
		v.add_child(_label(Loc.t("heroes.shards", {"have": Fmt.amount(lang, owned["shards"]), "need": Fmt.amount(lang, need) if need > 0 else "—"}), SMALL, PAPER))
		var bar := ProgressBar.new()
		bar.show_percentage = false
		bar.custom_minimum_size.y = 18
		bar.value = (minf(1.0, float(owned["shards"]) / float(need)) if need > 0 else 1.0) * 100.0
		v.add_child(bar)
	v.add_child(_label("%s: %s" % [Loc.t("heroes.specialty"), Loc.t("troop.%s.name" % c["def"]["specialty"])], SMALL, MUTED))
	for line: Dictionary in HeroesModel.skill_lines(c):
		var effect := Loc.t("hero.skill.attack_pct", {"troop": Loc.t("troop.%s.name" % c["def"]["specialty"]), "pct": Fmt.amount(lang, line["pct"])}) if line["stat"] == "attack" else Loc.t("hero.skill.defense_pct", {"pct": Fmt.amount(lang, line["pct"])})
		v.add_child(_label("%s · %s: %s" % [Loc.t("hero.skill." + String(line["slot"])), Loc.t("skill.%s.name" % line["id"]), effect], SMALL, PAPER, true))
	if owned is Dictionary:
		if need < 0:
			v.add_child(_label(Loc.t("heroes.maxed"), SMALL, MUTED))
		else:
			var button := Button.new()
			button.text = Loc.t("heroes.levelUp")
			button.add_theme_font_size_override("font_size", FONT)
			button.disabled = c["level_up"] != ""
			button.pressed.connect(_on_level_up.bind(button, String(c["id"])))
			v.add_child(button)
			var why := String(_notes.get(c["id"], c["level_up"]))
			if why != "":
				v.add_child(_label(Loc.t("reason." + why, {"cap": Fmt.amount(lang, c["cap"])}), SMALL, LACKING, true))
	return panel

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
