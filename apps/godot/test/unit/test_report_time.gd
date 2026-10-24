extends GutTest
## ReportTime against the golden cases written from formatReportTime (data/report-time-fixtures.json, UTC). The device offset is
## added on top: the same instant at +60 and +420 minutes reads one and seven hours later.

const FIXTURES := "res://data/report-time-fixtures.json"

func _cases() -> Array:
	var parsed: Variant = JSON.new()
	var err := (parsed as JSON).parse(FileAccess.get_file_as_string(FIXTURES))
	assert_eq(err, OK, "fixtures parse")
	return (parsed as JSON).data["cases"]

func test_every_fixture_matches_the_client_text() -> void:
	var cases := _cases()
	assert_gt(cases.size(), 0)
	for c: Dictionary in cases:
		assert_eq(ReportTime.format(c["lang"], int(c["at"]), 0), c["text"], "%s at %d" % [c["lang"], int(c["at"])])

func test_the_device_offset_shifts_the_fields() -> void:
	var at := 1792857900000  # 24 Oct 2026, 16:05 UTC
	assert_eq(ReportTime.format("en", at, 60), "10/24/26, 5:05 PM")
	assert_eq(ReportTime.format("en", at, 420), "10/24/26, 11:05 PM")
	assert_eq(ReportTime.format("en", at, -300), "10/24/26, 11:05 AM")

func test_the_offset_can_move_the_day() -> void:
	var at := Time.get_unix_time_from_datetime_dict({"year": 2026, "month": 1, "day": 3, "hour": 23, "minute": 30}) * 1000
	assert_eq(ReportTime.format("en", int(at), 60), "1/4/26, 12:30 AM", "23:30 UTC plus an hour is the next day")

func test_arabic_uses_latin_digits_and_the_arabic_markers() -> void:
	var at := Time.get_unix_time_from_datetime_dict({"year": 2026, "month": 7, "day": 14, "hour": 12, "minute": 0}) * 1000
	assert_eq(ReportTime.format("ar", int(at), 0), "14\u200f/7\u200f/2026\u060c 12:00 م")

func test_device_offset_is_minutes_east_of_utc() -> void:
	var bias := ReportTime.device_offset_min()
	assert_true(bias >= -720 and bias <= 840, "a real zone offset, got %d" % bias)
