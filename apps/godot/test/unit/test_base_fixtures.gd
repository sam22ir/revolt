extends GutTest
## The number and countdown text must reproduce the TypeScript (data/base-fixtures.json).

const FIXTURES := "res://data/base-fixtures.json"
const TOL := 1e-9

func after_each() -> void:
	TranslationServer.set_locale("en")

func _fx() -> Dictionary:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(FIXTURES))
	assert_true(parsed is Dictionary, "fixtures missing")
	return parsed

func test_numbers_match_the_client_text() -> void:
	for lang in ["en", "ar"]:
		for pair: Array in _fx()["format"][lang]["amounts"]:
			assert_eq(Fmt.amount(lang, float(pair[0])), pair[1], "%s amount %s" % [lang, pair[0]])

func test_countdowns_match_the_client_text() -> void:
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		for pair: Array in _fx()["format"][lang]["durations"]:
			assert_eq(Fmt.duration(float(pair[0])), pair[1], "%s duration %s ms" % [lang, pair[0]])

func test_french_numbers_use_a_space_the_font_has() -> void:
	assert_eq(Fmt.amount("fr", 1234567.0), "1 234 567")
