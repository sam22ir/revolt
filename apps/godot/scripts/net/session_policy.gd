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
