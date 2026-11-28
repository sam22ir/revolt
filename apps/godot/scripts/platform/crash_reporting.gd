class_name CrashReporting
extends RefCounted
## Crash and error reports through Sentry's Godot SDK (addons/sentry, docs/release.md). It starts only when the player
## turned on crash reports in Settings and a DSN is set for this build; otherwise nothing is sent. Auto-init is off in
## project.godot so the SDK never starts on its own before the player has chosen.
##
## Reports carry no account id, guest tag, name or typed text: no user is set and default PII stays off.

## Where the build's DSN lives. Empty in the repo; set it in the editor (or an export override) for a release build.
const DSN_SETTING := "revolt/crash/sentry_dsn"
const SDK := "SentrySDK"

## Whether reports would be sent: the player agreed, the build has a DSN, and the SDK is installed.
static func should_start(consented: bool, dsn: String, sdk_present: bool) -> bool:
	return consented and dsn.strip_edges() != "" and sdk_present

static func dsn() -> String:
	return String(ProjectSettings.get_setting(DSN_SETTING, ""))

static func sdk_present() -> bool:
	return Engine.has_singleton(SDK)

## Starts or stops reporting to match the player's choice. Safe to call again when the choice changes.
static func apply(consented: bool) -> void:
	if not sdk_present():
		return
	var sdk: Object = Engine.get_singleton(SDK)
	if not should_start(consented, dsn(), true):
		if sdk.has_method("is_enabled") and sdk.call("is_enabled") and sdk.has_method("close"):
			sdk.call("close")
		return
	if sdk.has_method("is_enabled") and sdk.call("is_enabled"):
		return
	var build_dsn := dsn()
	var release := "revolt@%s" % String(ProjectSettings.get_setting("application/config/version", "0"))
	sdk.call("init", func(options: Object) -> void:
		options.set("dsn", build_dsn)
		options.set("release", release)
		options.set("environment", "debug" if OS.is_debug_build() else "release")
		options.set("send_default_pii", false))
