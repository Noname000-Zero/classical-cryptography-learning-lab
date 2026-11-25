BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS challenge_cards(
 id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lessons(id),
 ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
 definition TEXT NOT NULL CHECK(json_valid(definition)),
 UNIQUE(lesson_id,ordinal)
);
CREATE TABLE IF NOT EXISTS card_progress(
 user_id TEXT NOT NULL REFERENCES users(id),
 card_id TEXT NOT NULL REFERENCES challenge_cards(id),
 mode TEXT NOT NULL CHECK(mode IN ('training','match','exam')),
 code TEXT NOT NULL DEFAULT '',
 hints_used INTEGER NOT NULL DEFAULT 0 CHECK(hints_used BETWEEN 0 AND 3),
 solution_viewed INTEGER NOT NULL DEFAULT 0 CHECK(solution_viewed IN (0,1)),
 active_seconds INTEGER NOT NULL DEFAULT 0 CHECK(active_seconds >= 0),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,card_id,mode)
);
CREATE TABLE IF NOT EXISTS card_attempts(
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 card_id TEXT NOT NULL REFERENCES challenge_cards(id),
 mode TEXT NOT NULL CHECK(mode IN ('training','match','exam')),
 code TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('manual_match','manual_mismatch','correct','incorrect','compile_error','runtime_error','timeout','wrong_answer','accepted')),
 verified INTEGER NOT NULL CHECK(verified IN (0,1)),
 results TEXT NOT NULL CHECK(json_valid(results)),
 created_at TEXT NOT NULL,
 CHECK(verified=0 OR status IN ('correct','incorrect','compile_error','runtime_error','timeout','wrong_answer','accepted'))
);
CREATE TABLE IF NOT EXISTS card_completions(
 user_id TEXT NOT NULL REFERENCES users(id),
 card_id TEXT NOT NULL REFERENCES challenge_cards(id),
 attempt_id TEXT NOT NULL UNIQUE REFERENCES card_attempts(id),
 xp INTEGER NOT NULL CHECK(xp >= 0),
 completed_at TEXT NOT NULL,
 PRIMARY KEY(user_id,card_id)
);
CREATE INDEX IF NOT EXISTS idx_cards_lesson ON challenge_cards(lesson_id,ordinal);
CREATE INDEX IF NOT EXISTS idx_card_attempts ON card_attempts(user_id,card_id,created_at);
INSERT OR IGNORE INTO migration VALUES(2,datetime('now'));
COMMIT;
