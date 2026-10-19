-- M4: public handles, alliances, membership, and help requests.

-- A short public name per player (never an email), unique per server. Rows from before M4 get the first
-- six hex digits of their id; new accounts get a random handle from the tag alphabet.
ALTER TABLE accounts ADD COLUMN handle TEXT;
UPDATE accounts SET handle = upper(substr(replace(id, '-', ''), 1, 6)) WHERE handle IS NULL;
CREATE UNIQUE INDEX accounts_handle ON accounts(server, handle);

-- `name_key` is the NFC, lower-cased name: the uniqueness check. SQLite folds only ASCII case, which is
-- why the key is computed in code. Tags are ASCII, upper-cased by the rules before they get here.
CREATE TABLE alliances (
  id TEXT PRIMARY KEY,
  server TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX alliances_name ON alliances(server, name_key);
CREATE UNIQUE INDEX alliances_tag ON alliances(server, tag);

-- One alliance per account (the primary key). `rank` is leader, officer or member.
CREATE TABLE alliance_members (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  alliance_id TEXT NOT NULL REFERENCES alliances(id),
  rank TEXT NOT NULL,
  joined_at INTEGER NOT NULL
);
CREATE INDEX alliance_members_alliance ON alliance_members(alliance_id, joined_at);

-- A call for help on one running job. `ends_at` follows the job as helps shorten it, so listing open
-- requests is one `ends_at > now` query. Old rows are dropped by the daily cleanup.
CREATE TABLE help_requests (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL,
  job_started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  helps INTEGER NOT NULL DEFAULT 0,
  -- The helper whose help was applied last. A helper can help a request only once (help_given's key), so
  -- "last_helper is me" can only be true because of my own batch: how a batch recognises its own effect.
  last_helper TEXT,
  UNIQUE (account_id, kind, job_started_at)
);
CREATE INDEX help_requests_ends ON help_requests(ends_at);

CREATE TABLE help_given (
  request_id TEXT NOT NULL REFERENCES help_requests(id),
  helper_id TEXT NOT NULL REFERENCES accounts(id),
  PRIMARY KEY (request_id, helper_id)
);

-- A D1 batch is one transaction, but an UPDATE that changes no row does not abort it. A statement that
-- inserts 0 here fails the CHECK, which rolls the whole batch back: the way to say "all of this or none".
CREATE TABLE batch_assert (ok INTEGER NOT NULL CHECK (ok = 1));
