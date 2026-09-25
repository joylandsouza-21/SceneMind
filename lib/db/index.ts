import { IStore } from './store.interface';
import { PgStore } from './pg-store';
import { SqliteStore } from './sqlite-store';
import { JsonStore } from './json-store';

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

  if (databaseUrl && (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://'))) {
    // Docker / Production — use PostgreSQL with pgvector
    try {
      return new PgStore(databaseUrl);
    } catch (err) {
      console.error('[db] PostgreSQL store failed to initialize:', (err as Error).message);
      // Fall through to SQLite/JSON
    }
  }

  // Local development — use SQLite
  try {
    return new SqliteStore();
  } catch (err) {
    console.warn('[db] SQLite unavailable, falling back to JSON file store:', (err as Error).message);
    return new JsonStore();
  }
}

// Global singleton preserved across Next.js hot-reloads
const globalForStore = globalThis as unknown as { __scenemind_db: IStore };

if (!globalForStore.__scenemind_db) {
  globalForStore.__scenemind_db = createStore();
}

export const db: IStore = globalForStore.__scenemind_db;
