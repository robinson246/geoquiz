import crypto from 'node:crypto';
import http from 'node:http';
import { db } from './db.js';
import { createToken, hashPassword, verifyPassword, verifyToken } from './auth.js';

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

function now() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomUUID();
}

function send(res, status, body = {}) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': CLIENT_ORIGIN,
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function safeName(value, fallback = '') {
  return String(value || fallback).trim().slice(0, 32);
}

function makeGuestName() {
  return `Guest-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.display_name,
    email: row.email,
    createdAt: row.created_at,
  };
}

function parseJsonField(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapResult(row) {
  return {
    id: row.id,
    userId: row.user_id,
    playerType: row.player_type,
    displayName: row.display_name,
    userName: row.display_name,
    score: row.score,
    total: row.total,
    accuracy: row.accuracy,
    mode: row.mode,
    questions: row.question_count,
    questionCount: row.question_count,
    continents: parseJsonField(row.continents, []),
    mistakes: parseJsonField(row.mistakes, []),
    playedAt: Date.parse(row.played_at),
  };
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    quizMode: row.quiz_mode,
    questionCount: row.question_count,
    allowedContinents: parseJsonField(row.allowed_continents, []),
    quiz: parseJsonField(row.quiz_payload, []),
    currentIndex: row.current_index,
    score: row.score,
    mistakes: parseJsonField(row.mistakes, []),
    updatedAt: row.updated_at,
  };
}

function getUserFromRequest(req) {
  const auth = req.headers.authorization || '';
  const userId = verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (!userId) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null;
}

function requireUser(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    send(res, 401, { message: 'Authentication required.' });
    return null;
  }
  return user;
}

function validateResult(body) {
  const score = Number(body.score);
  const total = Number(body.total);
  const accuracy = Number(body.accuracy);
  if (!Number.isInteger(score) || !Number.isInteger(total) || total <= 0 || score < 0 || score > total) {
    return null;
  }
  return {
    score,
    total,
    accuracy: Number.isInteger(accuracy) ? accuracy : Math.round((score / total) * 100),
    mode: safeName(body.mode, 'Flags + Capitals'),
    questionCount: Number(body.questionCount || body.questions || total),
    continents: Array.isArray(body.continents) ? body.continents : String(body.continents || '').split(',').map((item) => item.trim()).filter(Boolean),
    mistakes: Array.isArray(body.mistakes) ? body.mistakes : [],
  };
}

const routes = {
  'POST /auth/signup': async (req, res) => {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const name = safeName(body.name || body.displayName);
    const password = String(body.password || '');
    if (!email || !name || password.length < 1) {
      send(res, 400, { message: 'Name, email, and password are required.' });
      return;
    }
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      send(res, 409, { message: 'An account with this email already exists.' });
      return;
    }
    const { hash, salt } = hashPassword(password);
    const userId = id();
    const timestamp = now();
    db.prepare('INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, email, name, hash, salt, timestamp, timestamp);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    send(res, 201, { token: createToken(userId), user: publicUser(user) });
  },

  'POST /auth/login': async (req, res) => {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      send(res, 401, { message: 'Invalid email or password.' });
      return;
    }
    send(res, 200, { token: createToken(user.id), user: publicUser(user) });
  },

  'POST /auth/logout': async (_req, res) => send(res, 200, { ok: true }),

  'GET /auth/me': async (req, res) => {
    const user = getUserFromRequest(req);
    send(res, 200, { user: publicUser(user) });
  },

  'POST /quiz-results': async (req, res) => {
    const body = await readJson(req);
    const result = validateResult(body);
    if (!result) {
      send(res, 400, { message: 'Invalid quiz result.' });
      return;
    }
    const user = getUserFromRequest(req);
    const playerType = user ? 'user' : 'guest';
    const displayName = user ? user.display_name : makeGuestName();
    const resultId = id();
    db.prepare('INSERT INTO quiz_results (id, user_id, player_type, display_name, score, total, accuracy, mode, question_count, continents, mistakes, played_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(resultId, user?.id || null, playerType, displayName, result.score, result.total, result.accuracy, result.mode, result.questionCount, JSON.stringify(result.continents), JSON.stringify(result.mistakes), now());
    send(res, 201, { result: mapResult(db.prepare('SELECT * FROM quiz_results WHERE id = ?').get(resultId)) });
  },

  'GET /quiz-results/me': async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const rows = db.prepare('SELECT * FROM quiz_results WHERE user_id = ? ORDER BY played_at DESC LIMIT 100').all(user.id);
    send(res, 200, { results: rows.map(mapResult) });
  },

  'GET /leaderboard': async (_req, res) => {
    const rows = db.prepare('SELECT * FROM quiz_results ORDER BY accuracy DESC, score DESC, played_at DESC LIMIT 30').all();
    send(res, 200, { entries: rows.map(mapResult) });
  },

  'GET /quiz-sessions/active': async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const row = db.prepare("SELECT * FROM quiz_sessions WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").get(user.id);
    send(res, 200, { session: mapSession(row) });
  },

  'POST /quiz-sessions': async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readJson(req);
    const timestamp = now();
    const sessionId = id();
    db.prepare("UPDATE quiz_sessions SET status = 'abandoned', updated_at = ? WHERE user_id = ? AND status = 'active'").run(timestamp, user.id);
    db.prepare('INSERT INTO quiz_sessions (id, user_id, status, quiz_mode, question_count, allowed_continents, quiz_payload, current_index, score, mistakes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(sessionId, user.id, 'active', safeName(body.quizMode, 'mixed'), Number(body.questionCount || 10), JSON.stringify(body.allowedContinents || []), JSON.stringify(body.quiz || []), Number(body.currentIndex || 0), Number(body.score || 0), JSON.stringify(body.mistakes || []), timestamp, timestamp);
    send(res, 201, { session: mapSession(db.prepare('SELECT * FROM quiz_sessions WHERE id = ?').get(sessionId)) });
  },
};

async function handleDynamic(req, res, pathname) {
  const sessionMatch = pathname.match(/^\/quiz-sessions\/([^/]+)$/);
  const completeMatch = pathname.match(/^\/quiz-sessions\/([^/]+)\/complete$/);
  const abandonMatch = pathname.match(/^\/quiz-sessions\/([^/]+)\/abandon$/);
  const progressMatch = pathname.match(/^\/study-progress\/([^/]+)$/);

  if (req.method === 'PATCH' && sessionMatch) {
    const user = requireUser(req, res);
    if (!user) return true;
    const body = await readJson(req);
    db.prepare('UPDATE quiz_sessions SET quiz_payload = ?, current_index = ?, score = ?, mistakes = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(JSON.stringify(body.quiz || []), Number(body.currentIndex || 0), Number(body.score || 0), JSON.stringify(body.mistakes || []), now(), sessionMatch[1], user.id);
    send(res, 200, { session: mapSession(db.prepare('SELECT * FROM quiz_sessions WHERE id = ? AND user_id = ?').get(sessionMatch[1], user.id)) });
    return true;
  }

  if (req.method === 'POST' && (completeMatch || abandonMatch)) {
    const user = requireUser(req, res);
    if (!user) return true;
    const match = completeMatch || abandonMatch;
    const status = completeMatch ? 'completed' : 'abandoned';
    db.prepare('UPDATE quiz_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(status, now(), match[1], user.id);
    send(res, 200, { ok: true });
    return true;
  }

  if (req.method === 'GET' && pathname === '/study-progress') {
    const user = requireUser(req, res);
    if (!user) return true;
    const rows = db.prepare('SELECT * FROM study_progress WHERE user_id = ?').all(user.id);
    send(res, 200, {
      progress: rows.map((row) => ({
        countryCode: row.country_code,
        bookmarked: Boolean(row.bookmarked),
        confidence: row.confidence,
        lastStudiedAt: row.last_studied_at,
      })),
    });
    return true;
  }

  if (req.method === 'PUT' && progressMatch) {
    const user = requireUser(req, res);
    if (!user) return true;
    const body = await readJson(req);
    const progressId = id();
    const timestamp = now();
    db.prepare('INSERT INTO study_progress (id, user_id, country_code, bookmarked, confidence, last_studied_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, country_code) DO UPDATE SET bookmarked = excluded.bookmarked, confidence = excluded.confidence, last_studied_at = excluded.last_studied_at')
      .run(progressId, user.id, progressMatch[1].toUpperCase(), body.bookmarked ? 1 : 0, body.confidence ?? null, timestamp);
    send(res, 200, { ok: true });
    return true;
  }

  return false;
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204);
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const key = `${req.method} ${url.pathname}`;
    const route = routes[key];
    if (route) {
      await route(req, res);
      return;
    }
    if (await handleDynamic(req, res, url.pathname)) {
      return;
    }
    send(res, 404, { message: 'Not found.' });
  } catch (error) {
    console.error(error);
    send(res, 500, { message: 'Server error.' });
  }
}).listen(PORT, () => {
  console.log(`GeoQuiz API listening on http://localhost:${PORT}`);
});
