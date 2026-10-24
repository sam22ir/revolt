class_name SpeedupModel
extends RefCounted
## Whether the speed-up button may be pressed, and why not. The reasons and their order are the server's (`speedUp` in
## packages/rules/src/store.ts; golden cases in data/speedup-fixtures.json). The server decides everything else: the time one
## token removes, the day's allowance and whether the job changes at all (`reduceJob` may refuse, which only the server can tell);
## this only shows the button and a refusal it can see coming. Nothing is hard-coded: the cap comes from the wallet.

## A UTC day, for the daily allowance resetting at midnight (a calendar fact, not balance data).
const DAY_MS := 86_400_000

## The wallet as the server sends it ({speedupTokens, usedTodayMs, dailyCapMs}) plus `at`, the server time of that answer.
static func is_wallet(v: Variant) -> bool:
	return v is Dictionary and WireCheck.is_num(v.get("speedupTokens")) and WireCheck.is_num(v.get("usedTodayMs")) and WireCheck.is_num(v.get("dailyCapMs"))

## Speed-up time used today at `now_ms`: the stored figure, or nothing once a new UTC day began since the answer
## (a day in the past resets, as `usedToday` in the rules does). Never negative.
static func used_today_ms(wallet: Dictionary, now_ms: int) -> float:
	if now_ms / DAY_MS > int(wallet.get("at", now_ms)) / DAY_MS:
		return 0.0
	return maxf(0.0, float(wallet["usedTodayMs"]))

## What the day still allows, in ms.
static func allowance_ms(wallet: Dictionary, now_ms: int) -> float:
	return maxf(0.0, float(wallet["dailyCapMs"]) - used_today_ms(wallet, now_ms))

## "" when one token may be spent on `job` ({endsAt, building?}, or null) of `kind` ("upgrade" or "training"), else the reason, in
## the server's order: too_few_tokens, no_speedup_job, hq_job, daily_cap.
static func reason(kind: String, job: Variant, wallet: Dictionary, now_ms: int) -> String:
	if int(wallet["speedupTokens"]) < 1:
		return "too_few_tokens"
	if not job is Dictionary or float(job["endsAt"]) <= now_ms:
		return "no_speedup_job"
	if kind == "upgrade" and String(job.get("building", "")) == "hq":
		return "hq_job"
	if not allowance_ms(wallet, now_ms) > 0.0:
		return "daily_cap"
	return ""

## What the row shows: {"visible", "reason", "tokens", "left_ms"}. Hidden while the wallet is unknown (not zero tokens) or no job runs.
static func view(kind: String, job: Variant, wallet: Dictionary, now_ms: int) -> Dictionary:
	if wallet.is_empty() or not job is Dictionary or float(job["endsAt"]) <= now_ms:
		return {"visible": false, "reason": "", "tokens": 0, "left_ms": 0.0}
	return {"visible": true, "reason": reason(kind, job, wallet, now_ms), "tokens": int(wallet["speedupTokens"]), "left_ms": allowance_ms(wallet, now_ms)}
