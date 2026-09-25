import { IStore } from './store.interface';
// Static import so webpack resolves PgStore correctly in the production bundle.
// Dynamic require() of local modules inside function bodies can be mangled by
// Next.js/webpack, causing the class export to become undefined at runtime.
import { PgStore } from './pg-store';

/**
 * Database Factory — auto-selects the right store backend:
 *
 *  • DATABASE_URL set     → PostgreSQL + pgvector  (Docker)
 *  • DATABASE_URL not set → SQLite                 (Local dev)
 *
 * Falls back to JSON file store if SQLite fails to initialize.
 * IMPORTANT: Never falls back to SQLite when DATABASE_URL is set, because
 * better-sqlite3's native binary causes SIGSEGV on Alpine Linux (Docker).
 */
function createStore(): IStore {
  const databaseUrl = process.env.DATABASE_URL;

  // Only use PgStore for real PostgreSQL URLs (Docker / production).
  // .env.local may set DATABASE_URL=file:./data/... for local SQLite dev —
  // passing that to pg causes a SASL/password error.
  const isPostgres = databaseUrl?.startsWith('postgresql://') || databaseUrl?.startsWith('postgres://');

  if (isPostgres) {
    // Docker / Production — use PostgreSQL with pgvector
    console.log('[db] Using PostgreSQL store (pgvector)');
    return new PgStore(databaseUrl!);
  }

  // Local development — use SQLite, fall back to JSON if unavailable.
  // These use dynamic require so their native binaries are never loaded
  // in the production Docker image (where DATABASE_URL is always set).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SqliteStore } = require('./sqlite-store') as { SqliteStore: new () => IStore };
    return new SqliteStore();
  } catch (err) {
    console.warn('[db] SQLite unavailable, falling back to JSON file store:', (err as Error).message);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { JsonStore } = require('./json-store') as { JsonStore: new () => IStore };
    return new JsonStore();
  }
}

// Global singleton — lazily initialized on first access via a Proxy.
// The Proxy defers createStore() until the first actual db method call,
// preventing better-sqlite3 from loading at module import time during
// Next.js build-time static analysis (which causes SIGSEGV on Alpine).
const globalForStore = globalThis as unknown as { __scenemind_db: IStore | undefined };

function getDb(): IStore {
  if (!globalForStore.__scenemind_db) {
    globalForStore.__scenemind_db = createStore();
  }
  return globalForStore.__scenemind_db;
}

export const db: IStore = new Proxy({} as IStore, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});
