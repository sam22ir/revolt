class_name Privacy
extends RefCounted
## The player's choice to share crash reports (Settings). Off until they turn it on (GDD §10, docs/release.md); kept on
## the device only.

const FILE := "user://settings.cfg"

static func crash_reports_on(path := FILE) -> bool:
	var cfg := ConfigFile.new()
	if cfg.load(path) != OK:
		return false
	return cfg.get_value("privacy", "crash_reports", false) == true

static func set_crash_reports(on: bool, path := FILE) -> void:
	var cfg := ConfigFile.new()
	cfg.load(path)
	cfg.set_value("privacy", "crash_reports", on)
	cfg.save(path)
