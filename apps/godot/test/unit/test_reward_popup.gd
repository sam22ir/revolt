extends GutTest
## The reward popup: what it shows, Collect (success flies the rewards home, a refusal keeps its reason), a tap outside, and the
## storage warning.

var popup: RewardPopup
var _verdict: Dictionary = {}
var _calls := 0

const ITEMS := [
	{"kind": "resource", "id": "food", "amount": 200},
	{"kind": "resource", "id": "funds", "amount": 300},
	{"kind": "pass_xp", "id": "power", "amount": 30},
]

func before_each() -> void:
	TranslationServer.set_locale("en")
	popup = RewardPopup.new()
	add_child_autofree(popup)
	_calls = 0
	_verdict = {"ok": true, "reason": ""}

func _collect() -> Dictionary:
	_calls += 1
	await get_tree().process_frame
	return _verdict

func _texts() -> Array:
	return popup.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func test_it_shows_the_title_the_goal_and_a_tile_per_item() -> void:
	popup.open(Loc.t("reward.missionDone"), "Train 10 troops", ITEMS, _collect)
	assert_true(popup.is_open())
	assert_eq(popup.tiles.get_child_count(), 3)
	var texts := _texts()
	for t: String in [Loc.t("reward.missionDone"), "Train 10 troops", "+200", "+300", "+30", Loc.t("resource.food"), Loc.t("reward.itemPassXp")]:
		assert_has(texts, t)
	assert_eq(popup.button.text, Loc.t("reward.collect"))
	assert_false(popup.overflow_note.visible)

func test_collect_claims_once_then_flies_home_and_closes() -> void:
	var landed: Array = []
	popup.fly_target = func(item: Dictionary) -> Variant: return Vector2(10, 10) if item["kind"] == "resource" else null
	popup.on_arrive = func(item: Dictionary) -> void: landed.append(item["id"])
	popup.open("t", "", ITEMS, _collect)
	watch_signals(popup)
	popup.button.pressed.emit()
	popup.button.pressed.emit()
	assert_eq(popup.state, "collecting")
	assert_true(popup.button.disabled)
	await wait_for_signal(popup.closed, 3.0)
	assert_eq(_calls, 1, "a second press while collecting sends nothing")
	assert_signal_emitted(popup, "collected")
	assert_false(popup.is_open())
	landed.sort()
	assert_eq(landed, ["food", "funds", "power"], "every item finishes its flight")

func test_a_refusal_shows_its_reason_and_the_button_closes() -> void:
	_verdict = {"ok": false, "reason": "already_claimed"}
	popup.open("t", "", ITEMS, _collect)
	popup.button.pressed.emit()
	await wait_until(func() -> bool: return popup.state == "failed", 2.0)
	assert_true(popup.note.visible)
	assert_has(_texts(), Loc.t("reason.already_claimed"))
	assert_eq(popup.button.text, Loc.t("reward.close"))
	popup.button.pressed.emit()
	assert_false(popup.is_open())
	assert_eq(_calls, 1)

func test_a_failed_request_reads_as_unreachable() -> void:
	_verdict = {"ok": false, "reason": "error"}
	popup.open("t", "", ITEMS, _collect)
	popup.button.pressed.emit()
	await wait_until(func() -> bool: return popup.state == "failed", 2.0)
	assert_has(_texts(), Loc.t("reason.unreachable"))

func test_nothing_sent_just_closes() -> void:
	_verdict = {"ok": false, "reason": ""}
	popup.open("t", "", ITEMS, _collect)
	popup.button.pressed.emit()
	await wait_until(func() -> bool: return not popup.is_open(), 2.0)
	assert_false(popup.is_open())

func test_a_tap_outside_closes_before_collecting_but_not_during() -> void:
	popup.open("t", "", ITEMS, _collect)
	var up := InputEventMouseButton.new()
	up.button_index = MOUSE_BUTTON_LEFT
	up.pressed = false
	popup.button.pressed.emit()
	popup._gui_input(up)
	assert_true(popup.is_open(), "a tap outside does not interrupt a claim on its way")
	await wait_for_signal(popup.closed, 3.0)
	popup.open("t", "", ITEMS, _collect)
	popup._gui_input(up)
	assert_false(popup.is_open())
	assert_eq(_calls, 1, "closing before Collect claims nothing")

func test_overflow_when_a_resource_will_not_fit() -> void:
	var caps := {"food": 2000, "materiel": 2000, "funds": 2000, "support": 300}
	assert_false(RewardPopup.overflows(ITEMS, {"food": 1800, "funds": 100}, caps))
	assert_true(RewardPopup.overflows(ITEMS, {"food": 1801, "funds": 100}, caps))
	assert_false(RewardPopup.overflows([{"kind": "pass_xp", "id": "power", "amount": 5000}], {}, caps), "only resources fill stores")
	popup.open("t", "", ITEMS, _collect, "hq")
	assert_true(popup.overflow_note.visible)
	assert_has(_texts(), Loc.t("reward.overflow", {"building": Loc.t("building.hq.name")}))

func test_arabic_texts_exist() -> void:
	TranslationServer.set_locale("ar")
	for key: String in ["reward.missionDone", "reward.questDone", "reward.collect", "reward.collecting", "reward.close", "reward.overflow", "reward.itemShards", "reward.itemTokens", "reward.itemPassXp"]:
		assert_ne(Loc.t(key), key, key)
	TranslationServer.set_locale("en")
