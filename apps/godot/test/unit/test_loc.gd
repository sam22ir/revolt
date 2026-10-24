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
	# Complete literal keys only: `Loc.t("a.b")` or `Loc.t("a.b", ...)`. Keys built from ids are covered by
	# test_every_mechanical_id_has_its_keys.
	var re := RegEx.create_from_string('Loc\\.t\\("([^"]+)"\\s*[,)]')
	var missing: Array[String] = []
	for path in _gd_files("res://scripts"):
		for m in re.search_all(FileAccess.get_file_as_string(path)):
			var key := m.get_string(1)
			if not known.has(key):
				missing.append("%s: %s" % [path, key])
	assert_eq(missing, [] as Array[String], "keys used but missing from the locales")

func test_every_mechanical_id_has_its_keys() -> void:
	var known := _po_keys("en")
	var data := Balance.data()
	var missing: Array[String] = []
	for id: String in data["resourceIds"]:
		if not known.has("resource." + id):
			missing.append("resource." + id)
	for id: String in data["buildingIds"]:
		for suffix in ["name", "desc"]:
			if not known.has("building.%s.%s" % [id, suffix]):
				missing.append("building.%s.%s" % [id, suffix])
	for id: String in data["troopIds"]:
		for suffix in ["name", "desc"]:
			if not known.has("troop.%s.%s" % [id, suffix]):
				missing.append("troop.%s.%s" % [id, suffix])
	for lang in ["en", "ar", "fr"]:
		if not known.has("language." + lang):
			missing.append("language." + lang)
	assert_eq(missing, [] as Array[String], "mechanical ids without translation keys")

func _gd_files(dir: String) -> Array[String]:
	var out: Array[String] = []
	for f in DirAccess.get_files_at(dir):
		if f.ends_with(".gd"):
			out.append("%s/%s" % [dir, f])
	for d in DirAccess.get_directories_at(dir):
		out.append_array(_gd_files("%s/%s" % [dir, d]))
	return out

func test_the_active_background_applies_to_every_lookup() -> void:
	TranslationServer.set_locale("en")
	var shared := Loc.t("resource.food")
	Loc.background_id = "vietnam"
	assert_eq(Loc.t("resource.food"), "Rice", "Vietnam renames food")
	assert_eq(Loc.t("resource.funds"), Loc.t("resource.funds", {}, "algeria"), "a key with no override keeps the shared text")
	assert_eq(Loc.t("resource.food", {}, "algeria"), shared, "a call can still name another background")
	Loc.background_id = ""
	assert_eq(Loc.t("resource.food"), shared)

## The keys the Reports screen and the report toast build from ids, checked against the real id lists (rule 5 for dynamic keys).
func test_report_keys_built_from_ids_exist_in_every_language() -> void:
	var data := Balance.data()
	var keys: Array[String] = []
	for result in ["victory", "defeat", "target_gone"]:
		keys.append("march.result." + result)
	for row: Dictionary in data["npcLevels"]:
		keys.append("npc.%s.name" % row["kind"])
	for id: String in data["heroes"].keys():
		keys.append("hero.%s.name" % id)
	for id: String in data["troopIds"]:
		keys.append("troop.%s.name" % id)
	for id: String in data["resourceIds"]:
		keys.append("resource." + id)
	for lang in ["en", "ar"]:
		var known := _po_keys(lang)
		var missing: Array[String] = []
		for key in keys:
			if not known.has(key):
				missing.append(key)
		assert_eq(missing, [] as Array[String], "%s is missing report keys" % lang)

## The keys the training form builds from ids or reason codes, checked against the real id lists (rule 5 for dynamic keys).
func test_training_keys_built_from_ids_exist_in_every_language() -> void:
	var data := Balance.data()
	var keys: Array[String] = []
	for id: String in data["troopIds"]:
		keys.append("troop.%s.desc" % id)
	for code in ["bad_count", "training_busy", "barracks_level", "insufficient"]:
		keys.append("reason." + code)
	for lang in ["en", "ar"]:
		var known := _po_keys(lang)
		var missing: Array[String] = []
		for key in keys:
			if not known.has(key):
				missing.append(key)
		assert_eq(missing, [] as Array[String], "%s is missing training keys" % lang)

## The reason codes a help request can come back with (the give path's are listed too; they cost nothing to check here).
func test_help_reason_keys_exist_in_every_language() -> void:
	var keys: Array[String] = []
	for code in ["not_member", "no_job", "already_requested", "help_full", "request_gone", "own_request", "unreachable"]:
		keys.append("reason." + code)
	for id in ["upgrade", "training"]:
		keys.append("help.kind." + id)
	for lang in ["en", "ar"]:
		var known := _po_keys(lang)
		var missing: Array[String] = []
		for key in keys:
			if not known.has(key):
				missing.append(key)
		assert_eq(missing, [] as Array[String], "%s is missing help keys" % lang)
