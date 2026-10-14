CREATE TABLE availability_state (
 site_id TEXT PRIMARY KEY, checked_at INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0, down INTEGER NOT NULL DEFAULT 0, detail TEXT NOT NULL DEFAULT ''
);
CREATE TABLE availability_emails (
 id TEXT PRIMARY KEY, site_id TEXT NOT NULL, recipient TEXT NOT NULL,
 state TEXT NOT NULL, detail TEXT NOT NULL, detected_at INTEGER NOT NULL,
 lease_until INTEGER NOT NULL DEFAULT 0, sent_at INTEGER
);
