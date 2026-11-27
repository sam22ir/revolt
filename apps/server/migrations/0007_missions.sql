-- Daily missions (GDD §4.8). One row per (account, counted action, metric key): the append-only ledger a day's mission
-- progress is summed from. `key` is `daily:<day>:<metric>`; `source` is unique per action (an upgrade or training
-- intent, a battle report, a help), so a retried write counts once. Claims use the `claims` table like every other grant.
CREATE TABLE mission_ticks (
  account_id TEXT NOT NULL,
  source TEXT NOT NULL,
  key TEXT NOT NULL,
  points INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (account_id, source, key)
);
CREATE INDEX mission_ticks_key ON mission_ticks(account_id, key);
CREATE INDEX mission_ticks_at ON mission_ticks(at);
