extends GutTest

func test_offset_follows_server() -> void:
	var c := Clock.new()
	c.sync(1_000_000, 400_000)
	assert_eq(c.now_ms(450_000), 1_050_000)

func test_unsynced_clock_uses_device_time() -> void:
	assert_eq(Clock.new().now_ms(123), 123)
