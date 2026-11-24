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

const FONT := 30
const SMALL := 26
const INK := Color8(0x2b, 0x2a, 0x24)
const MUTED := Color8(0x4a, 0x44, 0x34)
const GOLD := Color8(0xe0, 0xb0, 0x40)
const PAPER := Color8(0xf4, 0xea, 0xd6)
const LACKING := Color8(0x8a, 0x26, 0x18)

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
	add_theme_stylebox_override("panel", HudTheme.parchment())
	_body.add_theme_constant_override("separation", 8)
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
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	head.add_child(_label(String(v["title"]), FONT + 2, INK, true))
	if int(v["level"]) >= 0:
		var level := _label(Loc.t("panel.level", {"level": Fmt.amount(Fmt.lang(), v["level"])}), SMALL, MUTED)
		level.size_flags_horizontal = Control.SIZE_SHRINK_END
		head.add_child(level)
	var close := Button.new()
	close.text = "×"
	close.tooltip_text = Loc.t("panel.close")
	close.add_theme_font_size_override("font_size", FONT + 4)
	close.custom_minimum_size = Vector2.ONE * HudTheme.px(40)
	HudTheme.make_round(close, "round_red")
	close.pressed.connect(func() -> void: closed.emit())
	head.add_child(close)
	_body.add_child(head)
	_body.add_child(_label(String(v["coords"]), SMALL, MUTED))
	if String(v["desc"]) != "":
		_body.add_child(_label(String(v["desc"]), SMALL, INK, true))
	for line: String in v["lines"]:
		_body.add_child(_label(line, SMALL, INK, true))
	if String(v["alliance_name"]) != "":
		_body.add_child(_label("%s: %s" % [Loc.t("map.allianceName"), String(v["alliance_name"])], SMALL, INK, true))
	if v["defenders"] is Dictionary:
		_body.add_child(_label("%s: %s" % [Loc.t("map.defenders"), TrainingModel.troop_list(v["defenders"], Fmt.lang())], SMALL, INK, true))
	if v["rally_only"]:
		_body.add_child(_label(Loc.t("rally.needed"), SMALL, LACKING, true))
	if v["can_march"]:
		var send := Button.new()
		send.text = Loc.t("map.sendMarch")
		send.add_theme_font_size_override("font_size", FONT)
		HudTheme.dress(send, "green")
		send.pressed.connect(func() -> void: march_requested.emit(info["npc"]))
		_body.add_child(send)
	if info["kind"] == "empty" and TileModel.can_place_hq(_rank):
		var place := Button.new()
		place.text = Loc.t(TileModel.hq_button_key(_snapshot))
		place.add_theme_font_size_override("font_size", FONT)
		HudTheme.dress(place, "green")
		place.pressed.connect(func() -> void:
			place.disabled = true
			_notice = ""
			hq_requested.emit(_tile))
		_body.add_child(place)
	if v["harvest_action"] == "harvest":
		var harvest := Button.new()
		harvest.text = Loc.t("harvest.button")
		harvest.add_theme_font_size_override("font_size", FONT)
		HudTheme.dress(harvest, "green")
		harvest.pressed.connect(func() -> void: harvest_requested.emit(info["site"]))
		_body.add_child(harvest)
	elif v["harvest_action"] == "recall":
		var recall := Button.new()
		recall.text = Loc.t("harvest.recall")
		recall.add_theme_font_size_override("font_size", FONT)
		var march := String(v["recall_march"])
		HudTheme.dress(recall, "blue")
		recall.pressed.connect(func() -> void:
			recall.disabled = true
			recall_requested.emit(march))
		_body.add_child(recall)
	if _notice != "":
		_body.add_child(_label(Loc.t("reason." + _notice), SMALL, LACKING, true))
	if info["kind"] == "npc":
		# Starting a rally is for every target (it is the only way at a rally-only one); joining, for each rally still gathering at it.
		if RallyModel.can_start(_rank):
			var start := Button.new()
			start.text = Loc.t("rally.start")
			start.add_theme_font_size_override("font_size", FONT)
			HudTheme.dress(start, "green")
			start.pressed.connect(func() -> void: rally_start_requested.emit(info["npc"]))
			_body.add_child(start)
		for r: Dictionary in RallyModel.open_at(_rallies, String(info["npc"]["id"]), _now):
			var join := Button.new()
			join.text = Loc.t("rally.join")
			join.add_theme_font_size_override("font_size", FONT)
			HudTheme.dress(join, "green")
			join.pressed.connect(func() -> void: rally_join_requested.emit(info["npc"], r))
			_body.add_child(join)

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
