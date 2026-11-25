class_name ActionRing
extends Control
## The round buttons that come up over a tapped building (docs/design/ui-pass-plan.md): Upgrade and Info on every building,
## Train on the barracks and Heroes on the hero hall. They sit on a shallow arch above the building, or below it when the top HUD
## leaves no room, kept on screen; the shell moves them every frame so they follow the building while the camp pans. In Arabic
## the order is reversed, so Upgrade stays at the reading start. A press sends `action` with the action's id; this never decides
## anything itself.

signal action(kind: String)

## Mockup px: the buttons' diameter, the room each takes with its label, how far the arch sits from the building and how much
## its ends drop.
const DIAMETER := 46.0
const CELL := Vector2(72.0, 70.0)
const GAP := 8.0
const ARCH := 10.0
const MARGIN := 8.0
const ICONS := {"upgrade": "upgrade", "info": "info", "train": "train", "heroes": "heroes"}

var shown_id := ""
var _buttons: Array[RoundButton] = []
var _kinds: Array = []

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false

## What the ring offers on building `id`, in reading order.
static func actions_for(id: String) -> Array:
	var out := ["upgrade", "info"]
	if id == "barracks":
		out.append("train")
	if id == "hero_hall":
		out.append("heroes")
	return out

## The centres of `count` buttons for a building whose top edge is at `top_anchor` and bottom edge at `bottom_anchor` (screen
## px), with `low` px of HUD above and `high` the lowest y the ring may reach, on a screen `width` px wide. Above the building when
## it fits under the HUD, otherwise below it; the row is clamped to the screen's sides. The middle buttons sit highest (an arch).
static func layout(count: int, top_anchor: Vector2, bottom_anchor: Vector2, low: float, high: float, width: float) -> Array:
	var cell := CELL * HudTheme.SCALE
	var gap := GAP * HudTheme.SCALE
	var margin := MARGIN * HudTheme.SCALE
	var arch := ARCH * HudTheme.SCALE
	var row := count * cell.x
	var above := top_anchor.y - gap - cell.y * 0.5 - arch >= low + cell.y * 0.5
	var y := top_anchor.y - gap - cell.y * 0.5 if above else bottom_anchor.y + gap + cell.y * 0.5
	# Never over the HUD or the nav bar (a panned camp can carry the building past them): their taps stay theirs.
	y = clampf(y, low + cell.y * 0.5 + arch, maxf(low + cell.y * 0.5 + arch, high - cell.y * 0.5 - arch))
	var x0 := clampf(top_anchor.x - row * 0.5, margin, maxf(margin, width - margin - row))
	var out := []
	for i in count:
		# 0 at the middle, 1 at the ends: the ends sit lower above the building and higher below it.
		var t := 0.0 if count < 2 else absf(float(i) / float(count - 1) * 2.0 - 1.0)
		var drop := arch * t * t
		out.append(Vector2(x0 + cell.x * (i + 0.5), y + (drop if above else -drop)))
	return out

## Shows the buttons for building `id` (a new building rebuilds them; the labels follow the language).
func show_for(id: String) -> void:
	shown_id = id
	for b in _buttons:
		b.queue_free()
	_buttons.clear()
	_kinds = actions_for(id)
	if Fmt.lang() == "ar":
		_kinds.reverse()
	for kind: String in _kinds:
		var b := RoundButton.new(ICONS[kind], DIAMETER)
		b.set_label(label_for(kind))
		b.use_plate()
		b.custom_minimum_size.x = CELL.x * HudTheme.SCALE
		b.pressed.connect(func() -> void: action.emit(kind))
		add_child(b)
		_buttons.append(b)
	visible = true

func hide_ring() -> void:
	shown_id = ""
	visible = false

static func label_for(kind: String) -> String:
	match kind:
		"upgrade":
			return Loc.t("panel.upgrade")
		"info":
			return Loc.t("panel.info")
		"train":
			return Loc.t("train.start")
		_:
			return Loc.t("nav.heroes")

## Puts the buttons around the building; see `layout`.
func place(top_anchor: Vector2, bottom_anchor: Vector2, low: float, high: float) -> void:
	if not visible:
		return
	var centres := layout(_buttons.size(), top_anchor, bottom_anchor, low, high, size.x)
	for i in _buttons.size():
		var b := _buttons[i]
		b.size = b.get_combined_minimum_size()
		b.position = centres[i] - b.size * 0.5

## The action ids in the order shown (for tests).
func kinds() -> Array:
	return _kinds.duplicate()

func button(kind: String) -> RoundButton:
	var i := _kinds.find(kind)
	return _buttons[i] if i >= 0 else null
