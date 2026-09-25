import { IStore } from './store.interface';

/**
 * Database Factory — auto-selects the right store backend:
 *
 *  • DATABASE_URL set     → PostgreSQL + pgvector  (Docker)
 *  • DATABASE_URL not set → SQLite                 (Local dev)
 *
 * Falls back to JSON file store if SQLite fails to initialize.
 */
function createStore(): IStore {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    // Docker / Production — use PostgreSQL with pgvector
    try {
      const { PgStore } = require('./pg-store');
      return new PgStore(databaseUrl);
    } catch (err) {
      console.error('[db] PostgreSQL store failed to initialize:', (err as Error).message);
      // Fall through to SQLite/JSON
    }
  }

  // Local development — use SQLite
  try {
    const { SqliteStore } = require('./sqlite-store');
    return new SqliteStore();
  } catch (err) {
    console.warn('[db] SQLite unavailable, falling back to JSON file store:', (err as Error).message);
    const { JsonStore } = require('./json-store');
    return new JsonStore();
  }
}

// Global singleton preserved across Next.js hot-reloads
const globalForStore = globalThis as unknown as { __scenemind_db: IStore };

if (!globalForStore.__scenemind_db) {
  globalForStore.__scenemind_db = createStore();
}

export const db: IStore = globalForStore.__scenemind_db;
