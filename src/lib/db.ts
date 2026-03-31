import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

let db: Database | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

async function configureDb(database: Database) {
  await database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
  `);
}

export async function getDb(): Promise<Database> {
  const dbPath = path.join(process.cwd(), 'papers.db');
  
  if (db && !fs.existsSync(dbPath)) {
    console.log("Database file was deleted, resetting connection...");
    try { await db.close(); } catch {}
    db = null;
  }

  if (db) return db;

  console.log(`Connecting to database at: ${dbPath}`);
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await configureDb(db);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT UNIQUE,
      filename TEXT,
      filepath TEXT,
      title TEXT,
      authors TEXT,
      published_date TEXT,
      journal TEXT,
      publisher TEXT,
      series_name TEXT,
      abstract TEXT,
      key_findings TEXT,
      tags TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS master_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_papers_status_created_at ON papers(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_papers_hash ON papers(hash);
    CREATE INDEX IF NOT EXISTS idx_papers_published_date ON papers(published_date);
    CREATE INDEX IF NOT EXISTS idx_papers_publisher ON papers(publisher);
  `);

  try {
    await db.exec(`ALTER TABLE papers ADD COLUMN publisher TEXT`);
  } catch {}
  try {
    await db.exec(`ALTER TABLE papers ADD COLUMN series_name TEXT`);
  } catch {}
  try {
    await db.exec(`ALTER TABLE papers ADD COLUMN forecasts TEXT`);
  } catch {}

  // Full-text search index for scalable paper search and retrieval.
  try {
    await db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
        title,
        authors,
        publisher,
        abstract,
        key_findings,
        tags,
        content='papers',
        content_rowid='id'
      );
    `);

    await db.exec(`
      CREATE TRIGGER IF NOT EXISTS papers_ai AFTER INSERT ON papers BEGIN
        INSERT INTO papers_fts(rowid, title, authors, publisher, abstract, key_findings, tags)
        VALUES (new.id, new.title, new.authors, new.publisher, new.abstract, new.key_findings, new.tags);
      END;
    `);

    await db.exec(`
      CREATE TRIGGER IF NOT EXISTS papers_ad AFTER DELETE ON papers BEGIN
        INSERT INTO papers_fts(papers_fts, rowid, title, authors, publisher, abstract, key_findings, tags)
        VALUES ('delete', old.id, old.title, old.authors, old.publisher, old.abstract, old.key_findings, old.tags);
      END;
    `);

    await db.exec(`
      CREATE TRIGGER IF NOT EXISTS papers_au AFTER UPDATE ON papers BEGIN
        INSERT INTO papers_fts(papers_fts, rowid, title, authors, publisher, abstract, key_findings, tags)
        VALUES ('delete', old.id, old.title, old.authors, old.publisher, old.abstract, old.key_findings, old.tags);
        INSERT INTO papers_fts(rowid, title, authors, publisher, abstract, key_findings, tags)
        VALUES (new.id, new.title, new.authors, new.publisher, new.abstract, new.key_findings, new.tags);
      END;
    `);

    const ftsBuilt = await db.get(`SELECT value FROM app_meta WHERE key = 'papers_fts_built'`);
    if (!ftsBuilt?.value) {
      await db.exec(`INSERT INTO papers_fts(papers_fts) VALUES ('rebuild')`);
      await db.run(
        `INSERT INTO app_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ['papers_fts_built', '1']
      );
    }
  } catch (e) {
    // Keep app functional if FTS5 is unavailable in a local SQLite build.
    console.warn('FTS5 setup skipped:', e);
  }

  return db;
}

export async function runSerializedWrite<T>(operation: (database: Database) => Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => operation(await getDb()));
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function runInTransaction<T>(operation: (database: Database) => Promise<T>): Promise<T> {
  return runSerializedWrite(async (database) => {
    await database.exec('BEGIN IMMEDIATE');
    try {
      const result = await operation(database);
      await database.exec('COMMIT');
      return result;
    } catch (error) {
      await database.exec('ROLLBACK');
      throw error;
    }
  });
}
