class_name BaseScreen
extends Node
## The base screen as the shell sees it: the picture (BaseView in its own CanvasLayer), the round action buttons over a tapped
## building (ActionRing) and the building card they open (BuildingPanel on a dimmed backdrop, `card_layer`), both put in the HUD
## by the shell, and the upgrade request. It reads the Session and never decides anything: the button sends the
## intent, the server's answer replaces the state, and a refusal's reason is shown under the button.

## The hero hall sheet asked for the Heroes screen.
signal heroes_requested

## Space kept between the building sheet and the top box or nav bar, in viewport px.
const SHEET_GAP := 16.0

var view := BaseView.new()
var panel := BuildingPanel.new()
var ring := ActionRing.new()
## The building card's layer: a dim backdrop that closes the card on a tap and keeps taps off the camp, with the card centred on it.
var card_layer := Control.new()
var _backdrop := ColorRect.new()
## The band between the top HUD and the nav bar, in viewport px (from `refit`): the ring stays inside it.
var _band_top := 0.0
var _band_bottom := 0.0
var layer := CanvasLayer.new()

var _session: Session
var _built := false

func setup(session: Session) -> void:
	_session = session

func _ready() -> void:
	# Below the HUD layer (1), above the map's default canvas, which is hidden while this screen shows.
	layer.layer = 0
	add_child(layer)
	view.layer = layer
	layer.add_child(view)
	view.building_tapped.connect(select)
	view.ground_tapped.connect(deselect)
	panel.upgrade_pressed.connect(_on_upgrade_pressed)
	panel.train_pressed.connect(_on_train_pressed)
	panel.training.help_pressed.connect(_on_training_help_pressed)
	panel.upgrade_speedup.pressed.connect(_on_speedup_pressed.bind("upgrade", panel.upgrade_speedup))
	panel.training.speedup.pressed.connect(_on_speedup_pressed.bind("training", panel.training.speedup))
	panel.closed.connect(deselect)
	ring.action.connect(_on_ring_action)
	_backdrop.color = Color(0, 0, 0, 0.45)
	_backdrop.mouse_filter = Control.MOUSE_FILTER_STOP
	_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	_backdrop.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
			deselect())
	card_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card_layer.visible = false
	card_layer.add_child(_backdrop)

## Loads the art. Called once, when the first state is in.
func build() -> void:
	if _built:
		return
	view.build()
	_built = true

func is_built() -> bool:
	return _built

## Shows or hides the screen. A hidden base takes no input and closes its sheet.
func set_active(active: bool) -> void:
	layer.visible = active
	view.process_mode = Node.PROCESS_MODE_INHERIT if active else Node.PROCESS_MODE_DISABLED
	if not active:
		deselect()

## A tapped building: outlined, with its round buttons over it. The card opens from a button.
func select(id: String) -> void:
	view.set_selected(id)
	panel.close()
	card_layer.visible = false
	ring.show_for(id)

## Opens building `id`'s card on `mode` ("upgrade", "info" or "train"); the ring makes way for it.
func open_card(id: String, mode := "upgrade") -> void:
	view.set_selected(id)
	ring.hide_ring()
	panel.open_for(id, mode)
	card_layer.visible = true

## Closing the card, a tap on empty ground or leaving the screen: nothing selected, no ring, no card.
func deselect() -> void:
	view.set_selected("")
	ring.hide_ring()
	panel.close()
	card_layer.visible = false

func _on_ring_action(kind: String) -> void:
	var id := ring.shown_id
	if kind == "heroes":
		deselect()
		heroes_requested.emit()
	else:
		open_card(id, kind)

## Fits the picture between the HUD above (`top` px) and the nav bar below (`nav` px) of a `viewport` px screen.
func refit(viewport: Vector2, top: float, nav: float) -> void:
	view.apply_fit(viewport, top, nav)
	_band_top = top
	_band_bottom = viewport.y - nav
	# The sheet keeps a gap to the top box and the nav bar; a sheet taller than that scrolls.
	panel.set_max_height(viewport.y - top - nav - SHEET_GAP * 2.0)

## Call every frame while the screen shows. `resources` are the amounts accrued to `now_ms`, as the counters show them.
func update(now_ms: int, resources: Dictionary) -> void:
	if not _built or _session.levels.is_empty():
		return
	var queue: Variant = _session.queue()
	view.background = _session.background
	view.set_state(_session.levels, queue, now_ms)
	if ring.visible:
		var anchors := view.ring_anchors(ring.shown_id)
		ring.place(anchors[0], anchors[1], _band_top, _band_bottom)
	if panel.is_open():
		panel.update_model(BuildingPanelModel.build(panel.shown_id(), _session.levels, resources, queue, now_ms), _session.background)
		panel.update_training({
			"barracks": int(_session.levels["barracks"]),
			"troops": _session.state.get("troops", {}),
			"wounded": _session.state.get("wounded", {}),
			"training": _session.state.get("training"),
			"amounts": resources,
			"now_ms": now_ms,
			"lang": Fmt.lang(),
			"can_help": HelpModel.can_ask(_session.alliance, _session.help, "training", now_ms),
			"speedup": SpeedupModel.view("training", _session.state.get("training"), _session.wallet, now_ms),
		})
		panel.update_speedup(SpeedupModel.view("upgrade", queue, _session.wallet, now_ms))

func _on_upgrade_pressed(id: String) -> void:
	# A second press before the sheet is rebuilt (one frame) must not send a second intent.
	if panel.is_pending():
		return
	panel.set_pending(true)
	var verdict := await _session.send_intent({"type": "upgrade", "building": id})
	panel.set_pending(false)
	if not verdict["ok"]:
		panel.set_notice(String(verdict["reason"]))

## The training intent: the same flow as an upgrade (one request at a time; a refusal's reason is shown under the button).
func _on_train_pressed(troop: String, count: int) -> void:
	if panel.is_pending():
		return
	panel.set_pending(true)
	panel.training.set_pending(true)
	var verdict := await _session.send_intent({"type": "train", "troop": troop, "count": count})
	panel.set_pending(false)
	panel.training.set_pending(false)
	panel.training.set_notice("" if verdict["ok"] else String(verdict["reason"]))

## Asks the alliance for help with the running batch; a refusal's reason shows under the batch for a moment.
func _on_training_help_pressed() -> void:
	var verdict := await _session.request_help("training")
	if not verdict["ok"] and verdict["reason"] != "":
		panel.training.show_help_note(String(verdict["reason"]))

## One token on the running job; the button is off until the answer is in, and a refusal's reason shows under it for a moment.
func _on_speedup_pressed(kind: String, row: SpeedupRow) -> void:
	row.set_pending(true)
	var verdict := await _session.speed_up(kind)
	row.set_pending(false)
	if not verdict["ok"] and verdict["reason"] != "":
		row.show_note(String(verdict["reason"]))
