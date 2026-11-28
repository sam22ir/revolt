extends GutTest

const PATH := "user://test_privacy_settings.cfg"

func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))

func after_all() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))

func test_crash_reports_are_off_until_the_player_turns_them_on() -> void:
	assert_false(Privacy.crash_reports_on(PATH))
	Privacy.set_crash_reports(true, PATH)
	assert_true(Privacy.crash_reports_on(PATH))
	Privacy.set_crash_reports(false, PATH)
	assert_false(Privacy.crash_reports_on(PATH))

func test_reporting_needs_consent_a_dsn_and_the_sdk() -> void:
	assert_true(CrashReporting.should_start(true, "https://k@o1.ingest.sentry.io/1", true))
	assert_false(CrashReporting.should_start(false, "https://k@o1.ingest.sentry.io/1", true), "no consent")
	assert_false(CrashReporting.should_start(true, "  ", true), "no dsn")
	assert_false(CrashReporting.should_start(true, "https://k@o1.ingest.sentry.io/1", false), "no sdk")

func test_the_repo_ships_no_dsn_and_sentry_never_starts_on_its_own() -> void:
	assert_eq(CrashReporting.dsn(), "")
	assert_eq(ProjectSettings.get_setting("sentry/options/auto_init", false), false)

func test_reports_never_carry_who_the_player_is() -> void:
	var src := FileAccess.get_file_as_string("res://scripts/platform/crash_reporting.gd")
	for word: String in ["set_user", "token", "guest_tag", "_api"]:
		assert_false(src.contains(word), word)

func test_turning_reports_on_first_says_what_is_sent() -> void:
	var page := SettingsPage.new()
	add_child_autofree(page)
	assert_false(page.crash_reports_on())
	watch_signals(page)
	page.crash_toggle().pressed.emit()
	assert_true(page.crash_dialog().visible, "asked first")
	assert_string_contains(page.crash_dialog().message.text, Loc.t("settings.analyticsNote"))
	assert_false(page.crash_reports_on(), "nothing on before the answer")
	page.crash_dialog().yes.pressed.emit()
	assert_false(page.crash_dialog().visible)
	assert_true(page.crash_reports_on())
	assert_signal_emitted_with_parameters(page, "crash_reports_toggled", [true])
	# Turning off needs no question.
	page.crash_toggle().pressed.emit()
	assert_false(page.crash_dialog().visible)
	assert_false(page.crash_reports_on())
	assert_signal_emit_count(page, "crash_reports_toggled", 2)

func test_saying_no_or_tapping_outside_keeps_reports_off() -> void:
	var page := SettingsPage.new()
	add_child_autofree(page)
	watch_signals(page)
	page.crash_toggle().pressed.emit()
	page.crash_dialog().no.pressed.emit()
	assert_false(page.crash_reports_on())
	assert_signal_not_emitted(page, "crash_reports_toggled")

func test_the_saved_choice_shows_without_reporting_a_change() -> void:
	var page := SettingsPage.new()
	add_child_autofree(page)
	watch_signals(page)
	page.set_crash_reports(true)
	assert_true(page.crash_reports_on())
	assert_signal_not_emitted(page, "crash_reports_toggled")
