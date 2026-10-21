-- M7: events, leaderboards, battle pass, store. No table here references `accounts` with a foreign key; the daily
-- cleanup (src/cleanup.ts) deletes an account's rows from each of them explicitly.

-- One row per (march, scoring key): the append-only ledger event scores and pass XP are summed from. A key is an
-- event window (`supply_route:3`) or a pass season (`pass:0`). Written with INSERT OR IGNORE in the same D1 batch as the
-- battle report, so a retried delivery cannot count twice. `server` keeps boards from mixing backgrounds.
CREATE TABLE live_awards (
  march_id TEXT NOT NULL,
  key TEXT NOT NULL,
  account_id TEXT NOT NULL,
  server TEXT NOT NULL,
  points INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (march_id, key)
);
CREATE INDEX live_awards_board ON live_awards(key, server, account_id);
CREATE INDEX live_awards_account ON live_awards(account_id, key);
CREATE INDEX live_awards_at ON live_awards(at);

-- Every one-time grant: an event reward, a pass tier, a purchase. `granted` is 0 (claimed, nothing handed out yet),
-- 2 (inside a grant batch) or 1 (done). Only a batch that sees 0 may grant, which is what makes grants idempotent.
CREATE TABLE claims (
  account_id TEXT NOT NULL,
  key TEXT NOT NULL,
  granted INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  PRIMARY KEY (account_id, key)
);

-- Speed-up tokens, and today's speed-up use (the daily cap, GDD §8).
CREATE TABLE wallet (
  account_id TEXT PRIMARY KEY,
  speedup_tokens INTEGER NOT NULL DEFAULT 0,
  speedup_day INTEGER NOT NULL DEFAULT 0,
  speedup_used_ms INTEGER NOT NULL DEFAULT 0
);

-- Cosmetics an account owns, and which is equipped (at most one per slot, kept by the equip statement).
CREATE TABLE cosmetics (
  account_id TEXT NOT NULL,
  cosmetic TEXT NOT NULL,
  equipped INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, cosmetic)
);

-- Seasons whose premium pass track the account unlocked.
CREATE TABLE pass_premium (
  account_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  PRIMARY KEY (account_id, season)
);

-- Redeemed purchases. (provider, provider_txn) is unique, so one store transaction pays out once, whoever presents it.
CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_txn TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (provider, provider_txn)
);
CREATE INDEX purchases_account ON purchases(account_id, sku, created_at);

-- Power and regions per account, refreshed whenever the player's base is read or saved. The power and regions boards and
-- the alliance ranking read this instead of recomputing every base. `updated_at` moves only when a value changes, so it
-- is "when this score was reached" for tie-breaks.
CREATE TABLE score_snapshots (
  account_id TEXT PRIMARY KEY,
  server TEXT NOT NULL,
  power INTEGER NOT NULL,
  regions INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX score_snapshots_power ON score_snapshots(server, power DESC, updated_at);
