class_name SessionPolicy
extends RefCounted
## What to do after checking a saved guest token against GET /v1/state. A new guest account replaces the player's
## base for good (a guest has no Google link to recover it), so it is created only when there is no token or the
## server says the token is unknown (401, the same rule as apps/client/src/state/game-store.ts). Any other failure
## (500, 429, timeout, no network) keeps the token and reports the server as unreachable.

enum Action { USE_STATE, CREATE_GUEST, UNREACHABLE }

static func after_state_check(has_token: bool, ok: bool, status: int) -> Action:
	if not has_token:
		return Action.CREATE_GUEST
	if ok:
		return Action.USE_STATE
	if status == 401:
		return Action.CREATE_GUEST
	return Action.UNREACHABLE

## Waits before the n-th retry of a start-up request (apps/client/src/main.ts RETRY_MS); the last value repeats.
const START_BACKOFF_MS: Array[int] = [1000, 2000, 5000, 10_000]

static func start_backoff_ms(attempt: int) -> int:
	return START_BACKOFF_MS[mini(attempt, START_BACKOFF_MS.size() - 1)]

## A failure worth retrying: no answer, rate limited, or a server error. Anything else (a refusal) will not change.
static func is_transient(status: int) -> bool:
	return status == 0 or status == 429 or status >= 500
