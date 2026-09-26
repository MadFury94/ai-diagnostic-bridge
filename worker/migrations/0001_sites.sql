CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  verified_at TEXT NOT NULL
);
