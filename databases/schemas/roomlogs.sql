CREATE TABLE IF NOT EXISTS public.roomlogs (
	type TEXT NOT NULL,
	roomid TEXT NOT NULL,
	userid TEXT NULL,
	time TIMESTAMP(6) NOT NULL,
	log TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS linecount ON roomlogs (userid, roomid, time);
CREATE INDEX IF NOT EXISTS month ON roomlogs (roomid, time);
CREATE INDEX IF NOT EXISTS type ON roomlogs (roomid, type, time);
CREATE INDEX IF NOT EXISTS rename_idx ON roomlogs (roomid);
-- computed columns have to be added after apparently
-- use DO block to handle case where column/type already exists from a previous partial run
DO $$ BEGIN
	ALTER TABLE roomlogs ADD COLUMN content TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', log)) STORED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.roomlog_dates (
	roomid TEXT NOT NULL,
	-- YYYY-MM
	month TEXT NOT NULL,
	-- YYYY-MM-DD
	date TEXT NOT NULL,
	PRIMARY KEY (roomid, date)
);