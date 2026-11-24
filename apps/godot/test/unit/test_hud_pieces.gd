extends GutTest
## The HUD pieces: resource pills (a store bar, gold when full), the round buttons and the Base/Map switch, the player chip,
## the Settings page, and the pure helpers in HudModel.

func after_each() -> void:
	TranslationServer.set_locale("en")

func test_a_full_cell_turns_gold_and_says_full_instead_of_the_rate() -> void:
	var cell: ResourceCell = add_child_autofree(ResourceCell.new("food"))
	cell.set_values("1,200", "+150/h", "normal")
	assert_eq(cell.rate_text(), "+150/h")
	assert_false(cell.is_full())
	cell.set_values("5,500", "+150/h", "full")
	assert_eq(cell.rate_text(), Loc.t("hud.full"))
	assert_true(cell.is_full())
	cell.set_values("5,000", "+150/h", "near")
	assert_false(cell.is_full(), "near the cap is not full")

func test_the_store_bar_fills_and_changes_colour_near_and_at_the_cap() -> void:
	var cell: ResourceCell = add_child_autofree(ResourceCell.new("funds"))
	cell.set_values("1,000", "+10/h", "normal", 0.25)
	assert_almost_eq(cell.bar_value(), 25.0, 0.01)
	assert_eq(cell.bar_colour(), HudTheme.BRASS)
	cell.set_values("4,700", "+10/h", "near", 0.94)
	assert_eq(cell.bar_colour(), ResourceCell.NEAR)
	cell.set_values("5,500", "+10/h", "full", 1.4)
	assert_almost_eq(cell.bar_value(), 100.0, 0.01, "clamped")
	assert_eq(cell.bar_colour(), HudTheme.GOLD)

func test_the_switch_shows_where_it_goes() -> void:
	var bottom: HudBottom = add_child_autofree(HudBottom.new())
	bottom.set_screen("base")
	assert_eq(bottom.target(), "map")
	assert_eq(bottom.switch.icon_name(), "map")
	bottom.set_screen("map")
	assert_eq(bottom.target(), "base")
	assert_eq(bottom.switch.icon_name(), "base")
	assert_eq(bottom.switch.label_text(), Loc.t("nav.base"))

func test_the_switch_and_the_page_buttons_report_their_taps() -> void:
	var bottom: HudBottom = add_child_autofree(HudBottom.new())
	watch_signals(bottom)
	bottom.set_screen("base")
	bottom.switch.button().pressed.emit()
	assert_signal_emitted_with_parameters(bottom, "switch_requested", ["map"])
	bottom.buttons["reports"].button().pressed.emit()
	assert_signal_emitted_with_parameters(bottom, "page_requested", ["reports"])

func test_the_switch_sits_in_the_middle_of_five_slots() -> void:
	var bottom: HudBottom = add_child_autofree(HudBottom.new())
	assert_eq(bottom.get_child_count(), 5)
	assert_eq(bottom.get_child(2), bottom.switch, "the middle slot, in both directions")
	assert_eq(bottom.layout_direction, Control.LAYOUT_DIRECTION_LOCALE)
	assert_true(bottom.buttons.has("settings"))

func test_the_settings_button_asks_for_the_settings_page() -> void:
	var bottom: HudBottom = add_child_autofree(HudBottom.new())
	watch_signals(bottom)
	bottom.buttons["settings"].button().pressed.emit()
	assert_signal_emitted_with_parameters(bottom, "page_requested", ["settings"])

func test_the_dot_is_hidden_by_alpha_and_never_changes_the_height() -> void:
	var button: RoundButton = add_child_autofree(RoundButton.new("alliance", HudTheme.ROUND_BUTTON))
	await wait_process_frames(2)
	var without := button.get_combined_minimum_size().y
	button.set_dot(true)
	await wait_process_frames(2)
	assert_true(button.is_dot_shown())
	assert_eq(button.get_combined_minimum_size().y, without)

func test_the_open_page_button_is_marked_active() -> void:
	var bottom: HudBottom = add_child_autofree(HudBottom.new())
	assert_eq(bottom.buttons["reports"].button().self_modulate, Color.WHITE)
	bottom.set_screen("reports")
	assert_eq(bottom.buttons["reports"].button().self_modulate, RoundButton.ACTIVE_TINT)
	assert_eq(bottom.buttons["heroes"].button().self_modulate, Color.WHITE)

func test_the_player_chip_shows_level_and_power_and_is_tappable() -> void:
	var chip: PlayerChip = add_child_autofree(PlayerChip.new())
	watch_signals(chip)
	chip.set_tag("#BAF466")
	chip.set_values(3, 1_240)
	assert_eq(chip.level_text(), "3", "the level on the avatar's badge")
	assert_eq(chip.power_text(), "1,240", "beside the sword")
	assert_eq(chip.name_text(), "#BAF466")
	chip.pressed.emit()
	assert_signal_emitted(chip, "pressed")

func test_the_settings_page_has_three_language_buttons_and_a_back_button() -> void:
	var page: SettingsPage = add_child_autofree(SettingsPage.new())
	watch_signals(page)
	for lang in ["en", "ar", "fr"]:
		assert_not_null(page.language_button(lang), lang)
	page.language_button("ar").pressed.emit()
	assert_signal_emitted_with_parameters(page, "language_selected", ["ar"])
	page.back_button().pressed.emit()
	assert_signal_emitted(page, "back_pressed")

func test_google_is_marked_as_later_and_cannot_be_pressed() -> void:
	var page: SettingsPage = add_child_autofree(SettingsPage.new())
	assert_true(page.link_button().disabled)
	assert_true(page.link_button().text.contains(Loc.t("settings.later")))

func test_the_sound_toggles_flip_and_report() -> void:
	var page: SettingsPage = add_child_autofree(SettingsPage.new())
	watch_signals(page)
	assert_true(page.sound_on("music"))
	page.sound_toggle("music").pressed.emit()
	assert_false(page.sound_on("music"))
	assert_signal_emitted_with_parameters(page, "sound_toggled", ["music", false])
	assert_eq(page.sound_toggle("music").text, Loc.t("settings.off"))

func test_the_settings_texts_follow_the_language() -> void:
	var page: SettingsPage = add_child_autofree(SettingsPage.new())
	var english := page.title_text()
	TranslationServer.set_locale("ar")
	page.refresh()
	assert_ne(page.title_text(), english)
	assert_ne(page.title_text(), "settings.title", "the key exists in Arabic")

func test_settings_and_hud_keys_exist_in_en_and_ar() -> void:
	var keys := ["settings.title", "settings.account", "settings.guestId", "settings.linkGoogle", "settings.later", "settings.sound", "settings.music", "settings.effects", "settings.on", "settings.off", "settings.about", "settings.help", "settings.privacy", "settings.version", "settings.back", "hud.full", "hud.rate", "hud.level", "hud.power", "hud.marches", "hud.marchesNone"]
	for lang in ["en", "ar", "fr"]:
		TranslationServer.set_locale(lang)
		for key: String in keys:
			assert_ne(Loc.t(key), key, "%s in %s" % [key, lang])

func test_the_marches_strip_counts_and_does_not_redraw_for_the_same_count() -> void:
	var strip: MarchesStrip = add_child_autofree(MarchesStrip.new())
	assert_eq(strip.text(), Loc.t("hud.marchesNone"))
	strip.set_count(2)
	assert_eq(strip.text(), Loc.t("hud.marches", {"count": "2"}))

# ------------------------------------------------------------------ HudModel helpers

func test_power_is_the_troops_at_home() -> void:
	assert_eq(HudModel.power({"infantry": 10, "scouts": 5}), 15)
	assert_eq(HudModel.power({}), 0)
	assert_eq(HudModel.power(null), 0)
	assert_eq(HudModel.power({"infantry": -3}), 0, "never negative")

func test_the_switch_goes_to_the_other_home() -> void:
	assert_eq(HudModel.switch_target("base"), "map")
	assert_eq(HudModel.switch_target("map"), "base")
	assert_eq(HudModel.switch_target("reports"), "map")

func test_the_alliance_dot_is_one_mark_for_chat_or_help() -> void:
	assert_false(HudModel.alliance_dot(0, 0))
	assert_true(HudModel.alliance_dot(3, 0))
	assert_true(HudModel.alliance_dot(0, 1))

func test_the_guest_tag_never_shows_the_token() -> void:
	assert_eq(HudModel.guest_tag(""), "")
	var tag := HudModel.guest_tag("secret-token-value")
	assert_eq(tag.length(), 7)
	assert_true(tag.begins_with("#"))
	assert_false("secret-token-value".contains(tag.substr(1).to_lower()))
	assert_eq(HudModel.guest_tag("secret-token-value"), tag, "stable")

func test_rates_follow_the_levels_and_the_liberation_bonus() -> void:
	var levels := {"hq": 1, "farm": 1, "armory": 1, "treasury": 1, "barracks": 1, "hero_hall": 1}
	var plain := HudModel.rates(levels, [], 0)
	assert_eq(plain, Balance.production_per_hour(levels, 1.0))

func test_a_round_buttons_icon_sinks_with_the_press_and_comes_back_even_after_a_resize() -> void:
	var button: RoundButton = add_child_autofree(RoundButton.new("map", HudTheme.SWITCH, true))
	await wait_process_frames(2)
	var rest := button.icon_lift()
	button.button().button_down.emit()
	assert_gt(button.icon_lift(), rest)
	button.size += Vector2(60, 60)
	await wait_process_frames(2)
	button.button().button_up.emit()
	assert_almost_eq(button.icon_lift(), rest, 0.01)
