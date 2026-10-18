-- Accounts: one per player. A guest has no google_sub until linked.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  google_sub TEXT UNIQUE,
  google_email TEXT,
  imported_m1 INTEGER NOT NULL DEFAULT 0
);

-- Bearer sessions. Only the SHA-256 of the token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
CREATE INDEX sessions_account ON sessions(account_id);

-- The base, as JSON BaseState. `version` guards concurrent writes.
CREATE TABLE bases (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  state TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
