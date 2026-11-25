class_name Loc
extends RefCounted
## Translation lookup. Keys are the dotted i18n keys from the TypeScript locales (exported to locale/*.po).
## Background-specific text overrides the shared key: `background.<id>.<key>` beats `<key>`
## (same rule as bgKeys in apps/client/src/i18n/bg-keys.ts). `{name}` placeholders are filled from `vars`.
## A missing key returns the key itself so it is visible on screen.

## The account's background, set by Session when the server says it; texts follow it unless a call names another.
static var background_id := ""

static func t(key: String, vars: Dictionary = {}, background: String = "") -> String:
	if background == "":
		background = background_id
	var candidates: Array[String] = [key]
	if background != "" and not key.begins_with("background."):
		candidates.push_front("background.%s.%s" % [background, key])
	for candidate in candidates:
		var text := TranslationServer.translate(candidate)
		if text != candidate:
			return text.format(vars) if not vars.is_empty() else text
	return key
