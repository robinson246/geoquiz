import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.resolve(process.env.DATA_DIR || 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'geoquiz.sqlite'));
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_results (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  player_type TEXT NOT NULL CHECK (player_type IN ('guest', 'user')),
  display_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  accuracy INTEGER NOT NULL,
  mode TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  continents TEXT NOT NULL,
  mistakes TEXT NOT NULL,
  played_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS quiz_results_user_idx ON quiz_results(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS quiz_results_leaderboard_idx ON quiz_results(accuracy DESC, score DESC, played_at DESC);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
  quiz_mode TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  allowed_continents TEXT NOT NULL,
  quiz_payload TEXT NOT NULL,
  current_index INTEGER NOT NULL,
  score INTEGER NOT NULL,
  mistakes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS quiz_sessions_active_idx ON quiz_sessions(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS study_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  bookmarked INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER,
  last_studied_at TEXT NOT NULL,
  UNIQUE(user_id, country_code)
);
`);
