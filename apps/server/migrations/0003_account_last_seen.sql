-- When the account's last session was given up (logout, or the device switched accounts).
-- Session rows go away then, so the stale-guest cleanup needs this to keep its 30-day grace.
ALTER TABLE accounts ADD COLUMN last_seen_at INTEGER;
