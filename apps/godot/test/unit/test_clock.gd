extends GutTest

func test_follows_the_server_plus_elapsed_ticks() -> void:
	var c := Clock.new()
	c.sync(1_000_000, 50_000)
	assert_eq(c.now_ms(50_000), 1_000_000)
	assert_eq(c.now_ms(52_500), 1_002_500)

func test_resync_replaces_the_old_anchor() -> void:
	var c := Clock.new()
	c.sync(1_000_000, 0)
	c.sync(2_000_000, 10_000)
	assert_eq(c.now_ms(10_500), 2_000_500)

func test_unsynced_clock_reports_not_synced() -> void:
	var c := Clock.new()
	assert_false(c.is_synced())
	assert_eq(c.now_ms(123), 0)

func test_ticks_going_backwards_never_move_time_back() -> void:
	var c := Clock.new()
	c.sync(1_000_000, 5_000)
	assert_eq(c.now_ms(1_000), 1_000_000)

func test_device_wall_clock_is_not_used() -> void:
	# The only inputs are the server's now and monotonic ticks; there is no wall-clock parameter or call.
	var src := FileAccess.get_file_as_string("res://scripts/clock.gd")
	assert_false(src.contains("Time.get_unix_time") or src.contains("Time.get_datetime"), "clock.gd reads the wall clock")
