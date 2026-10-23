class_name ResourceDisplay
extends RefCounted
## Display-only counter: min(cap, stored + rate * max(0, now - last)).
## The server owns the real numbers; this only interpolates between responses.

static func amount(stored: float, rate_per_ms: float, cap: float, last_ms: int, now_ms: int) -> float:
	var elapsed := maxi(0, now_ms - last_ms)
	return minf(cap, stored + rate_per_ms * elapsed)
