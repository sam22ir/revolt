extends GutTest

func test_accrues_over_time() -> void:
	# 3600/h for one minute = 60
	assert_eq(ResourceDisplay.amount(100.0, 3600.0, 1000.0, 0, 60_000), 160.0)

func test_cap_reached() -> void:
	assert_eq(ResourceDisplay.amount(900.0, 36000.0, 1000.0, 0, 60_000), 1000.0)

func test_time_going_backwards_does_not_lose_resources() -> void:
	assert_eq(ResourceDisplay.amount(100.0, 3600.0, 1000.0, 50_000, 10_000), 100.0)

func test_very_long_offline_gap_is_capped() -> void:
	var ten_years_ms := 10 * 365 * 24 * 3600 * 1000
	assert_eq(ResourceDisplay.amount(0.0, 3600.0, 5000.0, 0, ten_years_ms), 5000.0)

func test_stored_above_cap_is_kept_not_clamped_down() -> void:
	assert_eq(ResourceDisplay.amount(2000.0, 18000.0, 1000.0, 0, 60_000), 2000.0)

func test_stored_exactly_at_cap_stays() -> void:
	assert_eq(ResourceDisplay.amount(1000.0, 18000.0, 1000.0, 0, 60_000), 1000.0)
