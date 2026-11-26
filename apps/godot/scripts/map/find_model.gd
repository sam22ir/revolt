class_name FindModel
extends RefCounted
## What the Find sheet searches: a coordinate typed in any of the app's digits, camps by tag, and targets of one level from the nearest out.

const ARABIC_DIGITS := "٠١٢٣٤٥٦٧٨٩"
const PERSIAN_DIGITS := "۰۱۲۳۴۵۶۷۸۹"
const MAX_CAMPS := 5

## The coordinate in `text` (Western, Arabic-Indic or Persian digits, spaces round it allowed), or -1 if it is not a whole number in 0..size-1.
static func parse_coord(text: String, size: int) -> int:
	var ascii := ""
	for ch in text.strip_edges():
		var i := ARABIC_DIGITS.find(ch)
		if i < 0:
			i = PERSIAN_DIGITS.find(ch)
		ascii += str(i) if i >= 0 else ch
	if ascii == "" or ascii.length() > 4 or not ascii.is_valid_int():
		return -1
	var n := ascii.to_int()
	return n if n >= 0 and n < size else -1

## Camps whose tag holds `query` (letters in any case), the closest match first: exact, then tags starting with it, then the rest,
## each by tag. At most MAX_CAMPS; nothing for an empty query.
static func match_camps(bases: Array, query: String) -> Array:
	var q := query.strip_edges().to_upper()
	if q == "":
		return []
	var hits: Array = []
	for b: Dictionary in bases:
		var tag := String(b["tag"]).to_upper()
		if tag.contains(q):
			hits.append(b)
	hits.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var ra := _rank(String(a["tag"]).to_upper(), q)
		var rb := _rank(String(b["tag"]).to_upper(), q)
		return ra < rb if ra != rb else String(a["tag"]) < String(b["tag"]))
	return hits.slice(0, MAX_CAMPS)

static func _rank(tag: String, q: String) -> int:
	if tag == q:
		return 0
	return 1 if tag.begins_with(q) else 2

## The NPC targets of `level`, nearest to `from` first (ties by id), so Next walks outward.
static func targets_of_level(npcs: Array, level: int, from: Vector2i) -> Array:
	var out := npcs.filter(func(n: Dictionary) -> bool: return int(n["level"]) == level)
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var da := Vector2i(int(a["x"]), int(a["y"])).distance_squared_to(from)
		var db := Vector2i(int(b["x"]), int(b["y"])).distance_squared_to(from)
		return da < db if da != db else String(a["id"]) < String(b["id"]))
	return out
