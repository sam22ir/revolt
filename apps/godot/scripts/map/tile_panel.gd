class_name TilePanel
extends PanelContainer
## The sheet over the map for the tapped tile: your camp, another camp, an alliance HQ, a target (name, level, defenders, the
## rally-only note, the Send march, Start rally and Join rally buttons), a resource site (what it yields, its holder, the Harvest or
## Recall button) or just land (its terrain). It draws TileModel.view and sends nothing itself: the buttons ask the screen to open a
## sheet or to recall a march. It takes input, so a press on it never reaches the map, and it redraws only when what it shows changes.

signal closed
## The Send march button on a target: the snapshot's entry for it ({id, kind, level, x, y, region}).
signal march_requested(npc: Dictionary)
## Start rally on a target (leader or officer) and Join rally on a rally gathering at it (any member).
## Place or move the alliance HQ on the shown land tile (the leader only).
signal hq_requested(tile: Vector2i)
signal rally_start_requested(npc: Dictionary)
signal rally_join_requested(npc: Dictionary, rally: Dictionary)
## Harvest on a free resource site (the snapshot's entry for it).
signal harvest_requested(site: Dictionary)
## Recall on your harvest march at the site, by the march's id.
signal recall_requested(march_id: String)

const ICON := 56.0

var _tile := Vector2i(-1, -1)
var _key := ""
var _rallies: Array = []
var _rank := ""
var _now := 0.0
var _snapshot: Dictionary = {}
var _marches: Array = []
## Why the last HQ placement here was refused (a reason code), shown under the button until another tile is shown.
var _notice := ""
var _body := VBoxContainer.new()

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	visible = false
	add_theme_stylebox_override("panel", HudTheme.sheet(21.0, 19.0))
	_body.add_theme_constant_override("separation", roundi(HudTheme.px(7)))
	add_child(_body)

## Shows the panel for a tile (and forgets what was drawn).
func show_tile(tile: Vector2i) -> void:
	_tile = tile
	_notice = ""
	_key = ""
	visible = tile.x >= 0

func hide_tile() -> void:
	show_tile(Vector2i(-1, -1))

func tile() -> Vector2i:
	return _tile

## Call every frame while a tile is selected: the snapshot, the terrain under the tile, the player's own alliance name (or ""), their rank in
## it ("" for none), the synced server time in ms (a rally stops being joinable when its gathering ends) and the player's marches (a
## harvest's Recall shows only while it is at its site).
func update_view(snapshot: Dictionary, terrain: String, own_alliance_name: String, rank := "", now_ms := 0.0, marches: Array = []) -> void:
	if not visible:
		return
	_rank = rank
	_now = now_ms
	_rallies = snapshot.get("rallies", [])
	_marches = marches
	_snapshot = snapshot
	var info := TileModel.info(snapshot, _tile.x, _tile.y, terrain)
	var key := _signature(info, own_alliance_name)
	if key == _key:
		return
	_key = key
	_render(info, own_alliance_name)

## Says why placing the HQ here was refused.
func show_notice(reason: String) -> void:
	_notice = reason
	_key = ""

func refresh() -> void:
	_key = ""

func _signature(info: Dictionary, alliance_name: String) -> String:
	var what: Array = [info["kind"], info["terrain"]]
	for k in ["base", "hq", "npc", "site"]:
		if info.has(k):
			what.append(JSON.stringify(info[k]))
	if info["kind"] == "empty":
		what.append("%s|%s|%s" % [TileModel.can_place_hq(_rank), TileModel.hq_button_key(_snapshot), _notice])
	if info["kind"] == "site":
		what.append("%s|%s" % [TileModel.site_holder(info["site"], _marches, _now), TileModel.recall_march(info["site"], _marches, _now)])
	if info["kind"] == "npc":
		what.append(str(RallyModel.can_start(_rank)))
		for r: Dictionary in RallyModel.open_at(_rallies, String(info["npc"]["id"]), _now):
			what.append(RallyModel.row_key(r, _now))
	return "%s|%s|%s|%s|%s" % [TranslationServer.get_locale(), Loc.background_id, str(_tile), alliance_name, "|".join(what.map(func(v: Variant) -> String: return str(v)))]

func _render(info: Dictionary, own_alliance_name: String) -> void:
	for child in _body.get_children():
		_body.remove_child(child)
		child.queue_free()
	var v := TileModel.view(info, _tile.x, _tile.y, own_alliance_name, _marches, _now)
	_body.add_child(_head(info, v))
	for line: String in _about(v):
		_body.add_child(UiKit.label(line, UiKit.BODY, HudTheme.TEXT, false, true))
	if info["kind"] == "site":
		_body.add_child(_site_chips(info["site"], v["lines"]))
	if v["defenders"] is Dictionary:
		_body.add_child(UiKit.label(Loc.t("map.defenders"), UiKit.SMALL, HudTheme.RING, true))
		_body.add_child(troop_chips(v["defenders"]))
	if v["rally_only"]:
		_body.add_child(UiKit.warning(Loc.t("rally.needed")))
	if _notice != "":
		_body.add_child(UiKit.warning(Loc.t("reason." + _notice)))
	var actions := _actions(info, v)
	if actions.get_child_count() > 0:
		_body.add_child(actions)
	else:
		actions.free()

## The medallion of what is here, its name and level, where it is, and the close button.
func _head(info: Dictionary, v: Dictionary) -> Control:
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", roundi(HudTheme.px(11)))
	var icon := HudIcon.new(icon_of(info), ICON)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(icon)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	words.add_theme_constant_override("separation", roundi(HudTheme.px(1)))
	var title := UiKit.label(String(v["title"]), UiKit.TITLE, HudTheme.TEXT, true, true)
	words.add_child(title)
	var facts: Array = [UiKit.label(String(v["coords"]), UiKit.SMALL, HudTheme.TEXT_SECOND)]
	if int(v["level"]) >= 0:
		facts.push_front(UiKit.badge(Loc.t("panel.level", {"level": Fmt.amount(Fmt.lang(), v["level"])}), Color("575148")))
	words.add_child(UiKit.chips(facts))
	head.add_child(words)
	var close := Button.new()
	close.text = "×"
	close.tooltip_text = Loc.t("panel.close")
	close.focus_mode = Control.FOCUS_NONE
	close.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BIG + 2.0))
	close.custom_minimum_size = Vector2.ONE * HudTheme.px(UiKit.TAP)
	close.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	HudTheme.make_round(close, "round_red")
	close.pressed.connect(func() -> void: closed.emit())
	head.add_child(close)
	return head

## What stands for the thing on a tile.
static func icon_of(info: Dictionary) -> String:
	match info["kind"]:
		"own":
			return "base"
		"camp":
			return "avatar"
		"hq":
			return "alliance"
		"npc":
			return "npc_" + String(info["npc"]["kind"])
		"site":
			return SitesModel.kind_resource(String(info["site"]["kind"]))
	return "map"

## The plain sentences: what it is, and the player's own alliance by name (player text, after the translated word, never in a template).
func _about(v: Dictionary) -> Array:
	var out: Array = []
	if String(v["desc"]) != "":
		out.append(String(v["desc"]))
	if String(v["alliance_name"]) != "":
		out.append("%s: %s" % [Loc.t("map.allianceName"), String(v["alliance_name"])])
	return out

## A site's lines (what it yields, how fast, who holds it) as chips.
func _site_chips(site: Dictionary, lines: Array) -> Control:
	return UiKit.chips([
		UiKit.stat_chip(SitesModel.kind_resource(String(site["kind"])), String(lines[0])),
		UiKit.stat_chip("clock", String(lines[1])),
		UiKit.stat_chip("marches", String(lines[2])),
	])

## Troops as their medallions and counts, the ones there are none of left out.
static func troop_chips(troops: Dictionary) -> HFlowContainer:
	var out: Array = []
	for id: String in Balance.data()["troopIds"]:
		if int(troops.get(id, 0)) > 0:
			out.append(UiKit.stat_chip("troop_" + id, Fmt.amount(Fmt.lang(), int(troops[id]))))
	return UiKit.chips(out)

## The buttons, side by side while they fit: the main one in green, the rest in wood.
func _actions(info: Dictionary, v: Dictionary) -> HFlowContainer:
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", roundi(HudTheme.px(8)))
	row.add_theme_constant_override("v_separation", roundi(HudTheme.px(6)))
	if v["can_march"]:
		_action(row, Loc.t("map.sendMarch"), "green", func() -> void: march_requested.emit(info["npc"]))
	if info["kind"] == "empty" and TileModel.can_place_hq(_rank) and MapMath.base_site_ok(int(_snapshot.get("terrainSeed", 0)), int(_snapshot.get("size", 0)), _tile.x, _tile.y):
		var place := _action(row, Loc.t(TileModel.hq_button_key(_snapshot)), "green", func() -> void:
			_notice = ""
			hq_requested.emit(_tile))
		place.pressed.connect(func() -> void: place.disabled = true)
	if v["harvest_action"] == "harvest":
		_action(row, Loc.t("harvest.button"), "green", func() -> void: harvest_requested.emit(info["site"]))
	elif v["harvest_action"] == "recall":
		var march := String(v["recall_march"])
		var recall := _action(row, Loc.t("harvest.recall"), "blue", func() -> void: recall_requested.emit(march))
		recall.pressed.connect(func() -> void: recall.disabled = true)
	if info["kind"] == "npc":
		# Joining is for each rally still gathering at it; starting one, for every target (it is the only way at a rally-only one).
		for r: Dictionary in RallyModel.open_at(_rallies, String(info["npc"]["id"]), _now):
			_action(row, Loc.t("rally.join"), "blue", func() -> void: rally_join_requested.emit(info["npc"], r))
		if RallyModel.can_start(_rank):
			_action(row, Loc.t("rally.start"), "wood" if v["can_march"] else "green", func() -> void: rally_start_requested.emit(info["npc"]))
	return row

func _action(row: Container, text: String, kind: String, then: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.focus_mode = Control.FOCUS_NONE
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size.y = HudTheme.px(UiKit.BUTTON)
	button.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BODY + 2.0))
	button.add_theme_font_override("font", load(UiKit.BOLD))
	HudTheme.dress(button, kind)
	button.pressed.connect(then)
	row.add_child(button)
	return button
