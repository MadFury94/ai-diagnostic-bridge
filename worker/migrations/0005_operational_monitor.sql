CREATE TABLE operational_states (
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  checked_at INTEGER NOT NULL DEFAULT 0,
  since_at INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unknown',
  evidence TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (site_id, source)
);
