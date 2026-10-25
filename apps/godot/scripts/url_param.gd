class_name UrlParam
extends RefCounted
## A query parameter of the page URL on the web build (`?ground=a`); "" elsewhere (the editor, headless tests, a phone build).

static func value(name: String) -> String:
	if not OS.has_feature("web"):
		return ""
	var v: Variant = JavaScriptBridge.eval("new URLSearchParams(window.location.search).get(%s)" % JSON.stringify(name))
	return v if v is String else ""
