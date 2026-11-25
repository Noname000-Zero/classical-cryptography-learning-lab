BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS runner_executions(
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 card_id TEXT NOT NULL REFERENCES challenge_cards(id),
 mode TEXT NOT NULL CHECK(mode IN ('training','match','exam')),
 action TEXT NOT NULL CHECK(action IN ('run','submit')),
 code TEXT NOT NULL,
 stdin TEXT NOT NULL,
 status TEXT NOT NULL,
 result TEXT NOT NULL CHECK(json_valid(result)),
 created_at TEXT NOT NULL,
 ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_runner_card ON runner_executions(card_id,created_at);
INSERT OR IGNORE INTO migration VALUES(3,datetime('now'));
COMMIT;
