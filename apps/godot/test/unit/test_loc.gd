extends GutTest

func after_each() -> void:
	TranslationServer.set_locale("en")

func _po_keys(lang: String) -> Array[String]:
	var keys: Array[String] = []
	var re := RegEx.create_from_string('(?m)^msgid "(.+)"$')
	for m in re.search_all(FileAccess.get_file_as_string("res://locale/%s.po" % lang)):
		keys.append(m.get_string(1))
	return keys

func test_english() -> void:
	TranslationServer.set_locale("en")
	assert_eq(Loc.t("resource.food"), "Provisions")

func test_arabic() -> void:
	TranslationServer.set_locale("ar")
	assert_eq(Loc.t("resource.food"), "المؤن")

func test_placeholders_are_filled() -> void:
	TranslationServer.set_locale("en")
	assert_eq(Loc.t("panel.level", {"level": 3}), "Level 3")

func test_missing_key_returns_the_key() -> void:
	assert_eq(Loc.t("no.such.key"), "no.such.key")

func test_background_override_beats_shared_key() -> void:
	var bg_keys := _po_keys("en").filter(func(k: String) -> bool: return k.begins_with("background.vietnam.building."))
	assert_gt(bg_keys.size(), 0, "expected at least one vietnam building override")
	var override_key: String = bg_keys[0]
	var shared_key := override_key.trim_prefix("background.vietnam.")
	assert_ne(Loc.t(shared_key, {}, "vietnam"), Loc.t(shared_key, {}, "algeria"))
	assert_eq(Loc.t(shared_key, {}, "vietnam"), Loc.t(override_key))

func test_all_languages_have_the_same_keys() -> void:
	var en := _po_keys("en")
	en.sort()
	for lang in ["ar", "fr"]:
		var other := _po_keys(lang)
		other.sort()
		assert_eq(other, en, "%s.po key set differs from en.po" % lang)

func test_no_empty_translations() -> void:
	for lang in ["en", "ar", "fr"]:
		var text := FileAccess.get_file_as_string("res://locale/%s.po" % lang)
		assert_false(text.contains('msgstr ""\n\n'), "%s.po has an empty msgstr" % lang)

func test_every_key_used_in_scripts_exists() -> void:
	var known := _po_keys("en")
	var re := RegEx.create_from_string('Loc\\.t\\("([^"]+)"')
	var missing: Array[String] = []
	for path in _gd_files("res://scripts"):
		for m in re.search_all(FileAccess.get_file_as_string(path)):
			var key := m.get_string(1)
			if not known.has(key):
				missing.append("%s: %s" % [path, key])
	assert_eq(missing, [] as Array[String], "keys used but missing from the locales")

func _gd_files(dir: String) -> Array[String]:
	var out: Array[String] = []
	for f in DirAccess.get_files_at(dir):
		if f.ends_with(".gd"):
			out.append("%s/%s" % [dir, f])
	for d in DirAccess.get_directories_at(dir):
		out.append_array(_gd_files("%s/%s" % [dir, d]))
	return out
