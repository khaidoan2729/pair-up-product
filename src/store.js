import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newRoom } from './pairing.js';

export function createStore({ mode = 'sqlite', directory = './data' } = {}) {
  if (!['sqlite', 'memory'].includes(mode)) throw new Error('STORAGE_MODE must be sqlite or memory');
  if (mode === 'sqlite') mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(mode === 'memory' ? ':memory:' : join(directory, 'pair-up.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL);');
  let state = JSON.parse(db.prepare('SELECT value FROM state WHERE id=1').get()?.value || 'null') || { users: [], rooms: { live: newRoom() } };
  return {
    mode, db,
    get: () => state,
    save: () => db.prepare('INSERT INTO state VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(state)),
    close: () => db.close()
  };
}
