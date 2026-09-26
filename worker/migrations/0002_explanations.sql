CREATE TABLE IF NOT EXISTS explanations (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  finding_snapshot TEXT NOT NULL,
  original_output TEXT NOT NULL,
  current_output TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'verified-as-is', 'corrected')),
  reviewer_note TEXT,
  reviewer_identity TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS explanations_finding_idx ON explanations(site_id, finding_id, updated_at DESC);
