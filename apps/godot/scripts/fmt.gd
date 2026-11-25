class_name Fmt
extends RefCounted
## Number and countdown text, as apps/client/src/format.ts (golden cases for `en` and `ar` in data/base-fixtures.json).
## French groups digits with U+202F in the client; the bundled font has no glyph for it, so U+00A0 is used here (not fixtured:
## only `en` and `ar` are tested).

const GROUP_SEPARATOR := {"en": ",", "ar": ".", "fr": " "}

## The active language code (`en`, `ar`, `fr`).
static func lang() -> String:
	return TranslationServer.get_locale().substr(0, 2)

## A whole number with the language's digit grouping; the fraction is dropped, never rounded up (so 12.9 reads 12).
static func amount(language: String, value: float) -> String:
	var n := int(floor(value))
	var digits := str(absi(n))
	var sep: String = GROUP_SEPARATOR.get(language, ",")
	var out := ""
	for i in digits.length():
		if i > 0 and (digits.length() - i) % 3 == 0:
			out += sep
		out += digits[i]
	return ("-" if n < 0 else "") + out

## Countdown text such as "1 h 5 min" or "42 s". Rounds up so it never shows 0 early; seconds are left out from an hour on.
static func duration(ms: float) -> String:
	var total := int(ceil(maxf(0.0, ms) / 1000.0))
	if total == 0:
		return Loc.t("time.done")
	var h := total / 3600
	var m := (total % 3600) / 60
	var s := total % 60
	var parts: Array[String] = []
	if h > 0:
		parts.append(Loc.t("time.h", {"count": h}))
	if m > 0:
		parts.append(Loc.t("time.m", {"count": m}))
	if s > 0 and h == 0:
		parts.append(Loc.t("time.s", {"count": s}))
	return " ".join(parts)
