/** Ordered migrations. `PRAGMA user_version` records how many have run. Append only. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE tracks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    artist      TEXT NOT NULL,
    artist_id   TEXT,
    album       TEXT,
    album_id    TEXT,
    duration    INTEGER NOT NULL DEFAULT 0,
    art_url     TEXT,
    lastfm_mbid TEXT,
    deezer_id   TEXT,
    tags_json   TEXT,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE match_cache (
    source_key TEXT PRIMARY KEY,
    video_id   TEXT,
    confidence REAL NOT NULL,
    at         INTEGER NOT NULL
  );

  CREATE TABLE playlists (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    source_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE playlist_tracks (
    entry_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id    TEXT NOT NULL REFERENCES tracks(id),
    position    INTEGER NOT NULL,
    added_at    INTEGER NOT NULL
  );
  CREATE INDEX idx_playlist_tracks ON playlist_tracks(playlist_id, position);

  CREATE TABLE history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id    TEXT NOT NULL REFERENCES tracks(id),
    played_at   INTEGER NOT NULL,
    listened_ms INTEGER NOT NULL,
    completed   INTEGER NOT NULL,
    skipped     INTEGER NOT NULL,
    station_id  INTEGER
  );
  CREATE INDEX idx_history_played ON history(played_at DESC);

  CREATE TABLE feedback (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id   TEXT NOT NULL REFERENCES tracks(id),
    station_id INTEGER,
    value      INTEGER NOT NULL,
    at         INTEGER NOT NULL
  );
  CREATE INDEX idx_feedback_track ON feedback(track_id, station_id);

  -- Derived scores. station_id 0 = global. Stored scores decay from updated_at.
  CREATE TABLE artist_affinity (
    key        TEXT NOT NULL,
    station_id INTEGER NOT NULL DEFAULT 0,
    score      REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (key, station_id)
  );

  CREATE TABLE tag_affinity (
    key        TEXT NOT NULL,
    station_id INTEGER NOT NULL DEFAULT 0,
    score      REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (key, station_id)
  );

  CREATE TABLE artist_tags (
    artist    TEXT PRIMARY KEY,
    tags_json TEXT NOT NULL,
    at        INTEGER NOT NULL
  );

  CREATE TABLE stations (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    seed_type      TEXT NOT NULL,
    seed_ref       TEXT NOT NULL,
    seed_json      TEXT,
    name           TEXT NOT NULL,
    art_url        TEXT,
    created_at     INTEGER NOT NULL,
    last_played_at INTEGER
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  -- Files found in the user's music folder. Served by id, never by path from the renderer.
  CREATE TABLE local_tracks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    path       TEXT NOT NULL UNIQUE,
    mtime      INTEGER NOT NULL,
    size       INTEGER NOT NULL,
    title      TEXT NOT NULL,
    artist     TEXT NOT NULL,
    album      TEXT,
    track_no   INTEGER,
    disc_no    INTEGER,
    year       INTEGER,
    duration   REAL NOT NULL DEFAULT 0,
    scanned_at INTEGER NOT NULL
  );
  CREATE INDEX idx_local_tracks_order ON local_tracks(artist, album, disc_no, track_no);
  `
]
