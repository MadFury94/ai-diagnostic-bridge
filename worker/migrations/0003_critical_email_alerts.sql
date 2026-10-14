ALTER TABLE sites ADD COLUMN alert_email TEXT NOT NULL DEFAULT 'webdeveloperbrian@gmail.com';
ALTER TABLE sites ADD COLUMN alert_severity TEXT NOT NULL DEFAULT 'high';
CREATE TABLE finding_scan_baselines (
  site_id TEXT PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  finding_ids TEXT NOT NULL,
  started_at INTEGER NOT NULL
);
CREATE TABLE finding_email_alerts (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  finding_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  route TEXT NOT NULL,
  site_name TEXT NOT NULL,
  recipient TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX finding_email_pending ON finding_email_alerts(site_id, sent_at, lease_until);
