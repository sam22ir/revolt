-- M3: battle reports, delivered when a march arrives. `id` is the march id, so a report is written once.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  report TEXT NOT NULL
);
CREATE INDEX reports_account ON reports(account_id, created_at);

-- The server (one shared map per background, GDD §5) the account plays on. Algeria only for now.
ALTER TABLE accounts ADD COLUMN server TEXT NOT NULL DEFAULT 'algeria-1';
