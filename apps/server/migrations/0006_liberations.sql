-- Regions the movement holds (GDD §4.5), mirrored from each map's Durable Object so the Worker can settle
-- production with the server-wide bonus without asking the map. The map DO is the source of truth and writes
-- here whenever a region is liberated. `from_at`/`until_at` are the time the map recorded the change;
-- `until_at` is NULL while the region is held. `alliance_id` is the credited alliance (it may be gone later).
CREATE TABLE liberations (
  server TEXT NOT NULL,
  region INTEGER NOT NULL,
  alliance_id TEXT,
  from_at INTEGER NOT NULL,
  until_at INTEGER,
  PRIMARY KEY (server, region, from_at)
);
