class_name BaseScreen
extends Node
## The base screen as the shell sees it: the picture (BaseView in its own CanvasLayer), the building sheet (BuildingPanel, put
## in the HUD by the shell) and the upgrade request. It reads the Session and never decides anything: the button sends the
## intent, the server's answer replaces the state, and a refusal's reason is shown under the button.

## Space kept between the building sheet and the top box or nav bar, in viewport px.
const SHEET_GAP := 16.0

var view := BaseView.new()
var panel := BuildingPanel.new()
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
	panel.closed.connect(deselect)

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

func select(id: String) -> void:
	view.set_selected(id)
	panel.open_for(id)

func deselect() -> void:
	view.set_selected("")
	panel.close()

## Fits the picture between the HUD above (`top` px) and the nav bar below (`nav` px) of a `viewport` px screen.
func refit(viewport: Vector2, top: float, nav: float) -> void:
	view.apply_fit(viewport, top, nav)
	# The sheet keeps a gap to the top box and the nav bar; a sheet taller than that scrolls.
	panel.set_max_height(viewport.y - top - nav - SHEET_GAP)

## Call every frame while the screen shows. `resources` are the amounts accrued to `now_ms`, as the counters show them.
func update(now_ms: int, resources: Dictionary) -> void:
	if not _built or _session.levels.is_empty():
		return
	var queue: Variant = _session.queue()
	view.set_state(_session.levels, queue, now_ms)
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
		})

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
