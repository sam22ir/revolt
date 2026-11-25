extends GutTest
## Every game script and scene must load: a parse error in a script that no other test touches would
## otherwise only show up at runtime.

func _files(dir: String, extension: String) -> Array[String]:
	var out: Array[String] = []
	for f in DirAccess.get_files_at(dir):
		if f.ends_with(extension):
			out.append("%s/%s" % [dir, f])
	for d in DirAccess.get_directories_at(dir):
		out.append_array(_files("%s/%s" % [dir, d], extension))
	return out

func test_all_scripts_load() -> void:
	var failed: Array[String] = []
	for path in _files("res://scripts", ".gd"):
		var script := load(path) as GDScript
		if script == null or not script.can_instantiate() and not script.is_abstract():
			failed.append(path)
	assert_eq(failed, [] as Array[String], "scripts that do not load")

func test_all_scenes_load() -> void:
	var failed: Array[String] = []
	for path in _files("res://scenes", ".tscn"):
		if load(path) == null:
			failed.append(path)
	assert_eq(failed, [] as Array[String], "scenes that do not load")
