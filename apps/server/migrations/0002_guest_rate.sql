-- Guest creations per client IP bucket per hour (POST /v1/guest). `bucket` is a SHA-256, never a raw IP.
-- Old windows are deleted by the daily cleanup.
CREATE TABLE guest_rate (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
