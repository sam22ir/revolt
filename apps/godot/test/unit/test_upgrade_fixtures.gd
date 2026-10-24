extends GutTest
## UpgradeView must give the same answer as the real checkUpgrade for every case of data/upgrade-fixtures.json.

const FIXTURES := "res://data/upgrade-fixtures.json"

func _cases() -> Array:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(FIXTURES))
	assert_true(parsed is Dictionary, "fixtures missing")
	return parsed["cases"]

func test_there_are_fixtures_for_every_reason() -> void:
	var reasons := {}
	for c: Dictionary in _cases():
		reasons[c["expected"].get("reason", "ok")] = true
	for r in ["ok", "queue_busy", "max_level", "hq_gate", "insufficient"]:
		assert_true(reasons.has(r), "no fixture case for " + r)

func test_the_check_matches_the_rules() -> void:
	for c: Dictionary in _cases():
		var got := UpgradeView.check(c["levels"], c["resources"], c["queue"], c["building"])
		var want: Dictionary = c["expected"]
		var label: String = c["name"]
		assert_eq(got["ok"], want["ok"], label + " ok")
		assert_eq(got.get("reason", ""), want.get("reason", ""), label + " reason")
		assert_eq(got.has("toLevel"), want.has("toLevel"), label + " has a quote")
		if want.has("toLevel"):
			assert_eq(int(got["toLevel"]), int(want["toLevel"]), label + " toLevel")
			assert_eq(int(got["durationMs"]), int(want["durationMs"]), label + " duration")
			for id: String in want["cost"]:
				assert_eq(float(got["cost"][id]), float(want["cost"][id]), "%s cost %s" % [label, id])

func test_every_reason_the_check_can_give_has_text_in_en_and_ar() -> void:
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		for r in UpgradeView.REASONS:
			assert_ne(Loc.t("reason." + r), "reason." + r, "%s: reason.%s" % [lang, r])
		assert_ne(Loc.t("reason.unreachable"), "reason.unreachable", lang + ": reason.unreachable")
	TranslationServer.set_locale("en")
