class_name RewardPopup
extends Control
## The moment a reward is earned: over a dimmed screen, a gold burst behind a medal, "Mission complete!", what was done, and the reward
## as big tiles that pop in one by one, with a Collect button. Collect sends the claim (the caller's `collect`, which returns
## {"ok", "reason"}); once the server says yes, each resource flies up into its counter in the top bar and the popup fades. A refusal
## stays on the card with its reason and the button becomes Close. A tap outside closes it before collecting (nothing is lost: the
## reward stays to claim). Generic: any reward the game hands out can open it.

signal collected
signal closed

## Seconds.
const POP_IN := 0.32
const TILE_STAGGER := 0.09
const FLY := 0.55
const FADE := 0.22

var title := UiKit.label("", UiKit.BIG + 6.0, HudTheme.GOLD, true)
var subtitle := UiKit.label("", UiKit.BODY + 1.0, HudTheme.TEXT, false, true)
var button := UiKit.primary_button("")
var tiles := HFlowContainer.new()
var note := UiKit.warning("")
var overflow_note := UiKit.warning("")
## Where an item flies on collect: `fly_target.call(item)` returns a global position, or null to float up and fade instead.
var fly_target: Callable
## Called as each flying item lands, with the item (the top bar pulses its counter).
var on_arrive: Callable

var _dim := ColorRect.new()
var _centre := CenterContainer.new()
var _card := PanelContainer.new()
var _burst := RewardBurst.new()
var _medal := HudIcon.new("victory", 92.0)
var _items: Array = []
var _collect: Callable
## "open" (waiting for Collect), "collecting", "failed" (the button closes) or "done".
var state := "done"

func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	_dim.color = Color(0, 0, 0, 0.68)
	_dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_dim)
	_centre.set_anchors_preset(Control.PRESET_FULL_RECT)
	_centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_centre)
	_card.custom_minimum_size.x = HudTheme.px(310)
	_card.mouse_filter = Control.MOUSE_FILTER_STOP
	_card.add_theme_stylebox_override("panel", HudTheme.sheet(18.0, 16.0))
	_centre.add_child(_card)
	var box := VBoxContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	_card.add_child(box)
	# The medal stands in the burst, which is drawn behind it and may spill past the card.
	var top := Control.new()
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.custom_minimum_size.y = HudTheme.px(96)
	_burst.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_child(_burst)
	top.add_child(_medal)
	top.resized.connect(func() -> void:
		var c := top.size / 2.0
		_medal.size = _medal.custom_minimum_size
		_medal.position = c - _medal.size / 2.0
		_medal.pivot_offset = _medal.size / 2.0
		_burst.position = c
	)
	box.add_child(top)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_color_override("font_outline_color", HudTheme.BUTTON_INK)
	title.add_theme_constant_override("outline_size", roundi(HudTheme.px(3)))
	box.add_child(title)
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(subtitle)
	tiles.alignment = FlowContainer.ALIGNMENT_CENTER
	tiles.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tiles.add_theme_constant_override("h_separation", roundi(HudTheme.px(8)))
	tiles.add_theme_constant_override("v_separation", roundi(HudTheme.px(8)))
	box.add_child(tiles)
	overflow_note.visible = false
	box.add_child(overflow_note)
	note.visible = false
	box.add_child(note)
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(_on_button)
	box.add_child(button)

## Opens on a reward. `items` are MissionsModel.reward_items; `collect` is awaited on Collect and returns {"ok", "reason"} (a reason
## of "" with ok false means nothing was sent). `overflow_building` names the building to upgrade when some resources will not fit
## ("" hides the warning).
func open(title_text: String, subtitle_text: String, items: Array, collect: Callable, overflow_building := "") -> void:
	_items = items
	_collect = collect
	state = "open"
	title.text = title_text
	subtitle.text = subtitle_text
	subtitle.visible = subtitle_text != ""
	note.visible = false
	overflow_note.visible = overflow_building != ""
	if overflow_note.visible:
		UiKit.set_warning(overflow_note, Loc.t("reward.overflow", {"building": Loc.t("building.%s.name" % overflow_building)}))
	button.text = Loc.t("reward.collect")
	button.disabled = false
	for child in tiles.get_children():
		tiles.remove_child(child)
		child.queue_free()
	for item: Dictionary in items:
		tiles.add_child(_tile(item))
	visible = true
	modulate = Color.WHITE
	_dim.modulate = Color.WHITE
	_centre.modulate = Color.WHITE
	_animate_in()

func close() -> void:
	if not visible:
		return
	state = "done"
	visible = false
	closed.emit()

func is_open() -> bool:
	return visible

## The tile of one item (for tests and for the flight's start).
func tile_at(i: int) -> Control:
	return tiles.get_child(i) as Control

static func item_icon(item: Dictionary) -> String:
	return String(item["id"])

static func item_amount(item: Dictionary) -> String:
	return "+" + Fmt.amount(Fmt.lang(), item["amount"])

static func item_name(item: Dictionary) -> String:
	match String(item["kind"]):
		"resource":
			return Loc.t("resource." + String(item["id"]))
		"shards":
			return Loc.t("reward.itemShards")
		"tokens":
			return Loc.t("reward.itemTokens")
		"pass_xp":
			return Loc.t("reward.itemPassXp")
	return ""

## True when a resource of the reward will not all fit: the server fills each store only up to its cap. `amounts` are the amounts
## now, `caps` the caps (Balance.storage_cap).
static func overflows(items: Array, amounts: Dictionary, caps: Dictionary) -> bool:
	for item: Dictionary in items:
		if item["kind"] != "resource":
			continue
		var id := String(item["id"])
		if float(amounts.get(id, 0.0)) + float(item["amount"]) > float(caps.get(id, INF)):
			return true
	return false

func _tile(item: Dictionary) -> Control:
	var tile := PanelContainer.new()
	tile.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tile.custom_minimum_size = Vector2(HudTheme.px(80), 0)
	tile.add_theme_stylebox_override("panel", HudTheme.inset(6.0, 6.0))
	var v := VBoxContainer.new()
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override("separation", roundi(HudTheme.px(2)))
	var icon := HudIcon.new(item_icon(item), 44.0)
	icon.name = "Icon"
	icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	v.add_child(icon)
	var amount := UiKit.label(item_amount(item), UiKit.BODY + 2.0, HudTheme.GOLD, true)
	amount.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(amount)
	var name_label := UiKit.label(item_name(item), UiKit.SMALL, HudTheme.TEXT_SECOND)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(name_label)
	tile.add_child(v)
	return tile

func _animate_in() -> void:
	_card.pivot_offset = _card.size / 2.0
	_card.scale = Vector2.ONE * 0.6
	_card.modulate.a = 0.0
	var t := create_tween().set_parallel(true)
	t.tween_property(_card, "scale", Vector2.ONE, POP_IN).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(_card, "modulate:a", 1.0, POP_IN * 0.6)
	_medal.scale = Vector2.ZERO
	t.tween_property(_medal, "scale", Vector2.ONE, POP_IN * 1.4).set_delay(POP_IN * 0.4).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	_burst.flare()
	for i in tiles.get_child_count():
		var tile := tile_at(i)
		tile.modulate.a = 0.0
		var delay := POP_IN + i * TILE_STAGGER
		t.tween_property(tile, "modulate:a", 1.0, 0.18).set_delay(delay)
	# The card is laid out after this frame: centre the pivot once it has its size.
	_card.resized.connect(func() -> void: _card.pivot_offset = _card.size / 2.0, CONNECT_ONE_SHOT)

func _gui_input(event: InputEvent) -> void:
	# A tap on the dim, outside the card.
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		if state == "open" or state == "failed":
			close()

func _on_button() -> void:
	if state == "failed":
		close()
		return
	if state != "open":
		return
	state = "collecting"
	button.disabled = true
	button.text = Loc.t("reward.collecting")
	var verdict: Variant = await _collect.call()
	if not visible or state != "collecting":
		return
	var v: Dictionary = verdict if verdict is Dictionary else {}
	if bool(v.get("ok", false)):
		state = "done"
		collected.emit()
		_fly_and_close()
		return
	var reason := String(v.get("reason", ""))
	if reason == "":
		close()
		return
	state = "failed"
	UiKit.set_warning(note, Loc.t("reason." + ("unreachable" if reason == "error" else reason)))
	note.visible = true
	button.text = Loc.t("reward.close")
	button.disabled = false

## Each item leaves its tile: resources fly to their counters (fly_target), the rest float up; the card and the dim fade.
func _fly_and_close() -> void:
	var fade := create_tween().set_parallel(true)
	fade.tween_property(_centre, "modulate:a", 0.0, FADE)
	fade.tween_property(_dim, "modulate:a", 0.0, FADE + FLY * 0.5)
	var last: Tween = fade
	for i in _items.size():
		var item: Dictionary = _items[i]
		var icon := tile_at(i).find_child("Icon", true, false) as Control
		if icon == null:
			continue
		var flyer := HudIcon.new(item_icon(item), 44.0)
		flyer.size = icon.size
		flyer.pivot_offset = flyer.size / 2.0
		add_child(flyer)
		flyer.global_position = icon.global_position
		var target: Variant = fly_target.call(item) if fly_target.is_valid() else null
		var t := create_tween()
		var delay := i * 0.06
		if target is Vector2:
			var end: Vector2 = target - flyer.size / 2.0
			t.tween_property(flyer, "global_position", end, FLY).set_delay(delay).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
			t.parallel().tween_property(flyer, "scale", Vector2.ONE * 0.55, FLY).set_delay(delay)
		else:
			t.tween_property(flyer, "global_position", flyer.global_position + Vector2(0, -HudTheme.px(80)), FLY).set_delay(delay).set_ease(Tween.EASE_OUT)
			t.parallel().tween_property(flyer, "modulate:a", 0.0, FLY).set_delay(delay)
		t.tween_callback(func() -> void:
			if on_arrive.is_valid():
				on_arrive.call(item)
			flyer.queue_free())
		last = t
	await last.finished
	if state == "done" and visible:
		visible = false
		closed.emit()


## The gold burst behind the medal: soft rays that turn slowly and a glow, flaring when the popup opens.
class RewardBurst:
	extends Control

	const RAYS := 14
	var _turn := 0.0
	var _flare := 0.0

	func flare() -> void:
		_flare = 1.0

	func _process(delta: float) -> void:
		if not is_visible_in_tree():
			return
		_turn = fmod(_turn + delta * 0.35, TAU)
		_flare = maxf(0.0, _flare - delta * 1.6)
		queue_redraw()

	func _draw() -> void:
		var r := HudTheme.px(150.0) * (1.0 + 0.25 * _flare)
		var inner := HudTheme.px(30.0)
		for i in RAYS:
			var a := _turn + TAU * i / RAYS
			var w := TAU / RAYS * 0.28
			var pts := PackedVector2Array([
				Vector2.from_angle(a - w) * inner, Vector2.from_angle(a - w * 1.6) * r,
				Vector2.from_angle(a + w * 1.6) * r, Vector2.from_angle(a + w) * inner])
			var cols := PackedColorArray([Color(HudTheme.GOLD, 0.55), Color(HudTheme.GOLD, 0.0), Color(HudTheme.GOLD, 0.0), Color(HudTheme.GOLD, 0.55)])
			draw_polygon(pts, cols)
		for k in 4:
			draw_circle(Vector2.ZERO, HudTheme.px(58.0 - k * 10.0), Color(1.0, 0.85, 0.45, 0.07 + 0.05 * k + 0.1 * _flare))
