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
