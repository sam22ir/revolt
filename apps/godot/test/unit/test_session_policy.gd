extends GutTest

func test_no_saved_token_creates_a_guest() -> void:
	assert_eq(SessionPolicy.after_state_check(false, false, 0), SessionPolicy.Action.CREATE_GUEST)

func test_valid_token_is_used() -> void:
	assert_eq(SessionPolicy.after_state_check(true, true, 200), SessionPolicy.Action.USE_STATE)

func test_unknown_token_creates_a_guest() -> void:
	assert_eq(SessionPolicy.after_state_check(true, false, 401), SessionPolicy.Action.CREATE_GUEST)

func test_transient_failures_never_replace_the_account() -> void:
	for status in [0, 429, 500, 502, 503, 504, 408]:
		assert_eq(SessionPolicy.after_state_check(true, false, status), SessionPolicy.Action.UNREACHABLE, "status %d" % status)

func test_start_up_failures_worth_retrying() -> void:
	for status in [0, 429, 500, 502, 503]:
		assert_true(SessionPolicy.is_transient(status), str(status))
	for status in [200, 400, 401, 403, 404]:
		assert_false(SessionPolicy.is_transient(status), str(status))

func test_start_up_backoff_follows_the_client_and_repeats_the_last_value() -> void:
	var waits := []
	for i in 6:
		waits.append(SessionPolicy.start_backoff_ms(i))
	assert_eq(waits, [1000, 2000, 5000, 10_000, 10_000, 10_000])
