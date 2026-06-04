CREATE TABLE IF NOT EXISTS replays (
	id TEXT PRIMARY KEY,
	format TEXT NOT NULL,
	players TEXT NOT NULL,
	log TEXT NOT NULL,
	inputlog TEXT,
	uploadtime BIGINT NOT NULL,
	views INTEGER NOT NULL DEFAULT 0,
	formatid TEXT NOT NULL,
	rating INTEGER,
	private INTEGER NOT NULL DEFAULT 0,
	password TEXT
);

CREATE TABLE IF NOT EXISTS replayplayers (
	playerid TEXT NOT NULL,
	formatid TEXT NOT NULL,
	id TEXT NOT NULL,
	rating INTEGER,
	uploadtime BIGINT NOT NULL,
	private INTEGER NOT NULL DEFAULT 0,
	password TEXT,
	format TEXT NOT NULL,
	players TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_replayplayers_playerid ON replayplayers(playerid);
CREATE INDEX IF NOT EXISTS idx_replayplayers_id ON replayplayers(id);
