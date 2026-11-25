class_name ReportTime
extends RefCounted
## A battle report's time as formatReportTime (apps/client/src/format.ts) writes it: the short date and time in the device's
## time zone. Golden cases for `en` and `ar` are in data/report-time-fixtures.json (written in UTC; the device offset is added
## here). Node's Intl puts a plain space before AM/PM (browsers may put U+202F, which the bundled font cannot draw; the fixtures
## map it to a plain space too). Arabic has U+200F marks. French follows the 24-hour form of its Intl output, not fixtured.
## The device offset is read once per call and ignores DST, which Algeria and Vietnam do not observe.

const SPACE := " "
const RLM := "\u200f"
const ARABIC_COMMA := "\u060c"

## The device's offset from UTC in minutes, east positive (Africa/Algiers gives 60, Asia/Ho_Chi_Minh 420).
static func device_offset_min() -> int:
	return int(Time.get_time_zone_from_system()["bias"])

## `at_ms` (epoch ms) as text in `lang`, at `offset_min` minutes from UTC.
static func format(lang: String, at_ms: int, offset_min: int) -> String:
	var local := Time.get_datetime_dict_from_unix_time(int(floor((at_ms + offset_min * 60000) / 1000.0)))
	var h24: int = local["hour"]
	var h12 := 12 if h24 % 12 == 0 else h24 % 12
	var minute: int = local["minute"]
	var day: int = local["day"]
	var month: int = local["month"]
	var year: int = local["year"]
	match lang:
		"ar":
			var marker := "م" if h24 >= 12 else "ص"
			return "%d%s/%d%s/%d%s %d:%02d %s" % [day, RLM, month, RLM, year, ARABIC_COMMA, h12, minute, marker]
		"fr":
			return "%02d/%02d/%d %02d:%02d" % [day, month, year, h24, minute]
	var marker := "PM" if h24 >= 12 else "AM"
	return "%d/%d/%02d, %d:%02d%s%s" % [month, day, year % 100, h12, minute, SPACE, marker]

## The time of day on a chat line as clockTime (apps/client/src/ui/alliance-rows.ts) writes it: two-digit hours, 12-hour with the
## language's AM/PM marker in `en` and `ar`, 24-hour in `fr` (not fixtured). Golden cases are the `clock` list of the same fixtures.
static func clock(lang: String, at_ms: int, offset_min: int) -> String:
	var local := Time.get_datetime_dict_from_unix_time(int(floor((at_ms + offset_min * 60000) / 1000.0)))
	var h24: int = local["hour"]
	var minute: int = local["minute"]
	var h12 := 12 if h24 % 12 == 0 else h24 % 12
	match lang:
		"ar":
			return "%02d:%02d %s" % [h12, minute, "م" if h24 >= 12 else "ص"]
		"fr":
			return "%02d:%02d" % [h24, minute]
	return "%02d:%02d%s%s" % [h12, minute, SPACE, "PM" if h24 >= 12 else "AM"]
