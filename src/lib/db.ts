import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { inferForecastIndicatorCode } from './forecast-indicators';

type DbState = {
  db: Database | null;
  dbPromise: Promise<Database> | null;
  writeQueue: Promise<unknown>;
  dbInode: number | null;
};

const globalDbState = globalThis as typeof globalThis & {
  __paperLibraryDbState?: DbState;
};

const state =
  globalDbState.__paperLibraryDbState ??
  (globalDbState.__paperLibraryDbState = {
    db: null,
    dbPromise: null,
    writeQueue: Promise.resolve(),
    dbInode: null,
  });

function getDbInode(dbPath: string) {
  try {
    return fs.statSync(dbPath).ino;
  } catch {
    return null;
  }
}

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

  const currentInode = getDbInode(dbPath);

  if (state.db && (!currentInode || (state.dbInode !== null && currentInode !== state.dbInode))) {
    console.log("Database file was deleted, resetting connection...");
    try { await state.db.close(); } catch {}
    state.db = null;
    state.dbPromise = null;
    state.dbInode = null;
  }

  if (state.db) return state.db;
  if (state.dbPromise) return state.dbPromise;

  state.dbPromise = (async () => {
    console.log(`Connecting to database at: ${dbPath}`);

    const database = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    await configureDb(database);

    await database.exec(`
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
      forecasts TEXT,
      topic_labels TEXT,
      topic_summary TEXT,
      tags TEXT,
      latest_extraction_id INTEGER,
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
    CREATE TABLE IF NOT EXISTS scan_file_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_token TEXT,
      filename TEXT NOT NULL DEFAULT '',
      filepath TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS paper_key_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      paper_name TEXT,
      filepath TEXT,
      publish_date TEXT,
      indicator TEXT,
      indicator_code TEXT,
      house TEXT,
      value TEXT,
      unit TEXT,
      forecast_period TEXT,
      source_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS manual_key_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER,
      paper_name TEXT,
      publish_date TEXT NOT NULL DEFAULT '',
      indicator TEXT NOT NULL DEFAULT '',
      indicator_code TEXT,
      house TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT '',
      forecast_period TEXT NOT NULL DEFAULT '',
      source_text TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'manual_input',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS paper_extractions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      file_hash TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      prompt_version TEXT,
      extraction_payload TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS paper_topic_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      topic_code TEXT NOT NULL,
      relevance INTEGER NOT NULL DEFAULT 0,
      direction INTEGER NOT NULL DEFAULT 0,
      confidence INTEGER NOT NULL DEFAULT 0,
      evidence TEXT NOT NULL DEFAULT '',
      regime TEXT,
      drivers TEXT,
      display_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS research_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      source_house TEXT NOT NULL DEFAULT '',
      fact_type TEXT NOT NULL DEFAULT '',
      stance TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      entity_or_scope TEXT NOT NULL DEFAULT '',
      metric TEXT NOT NULL DEFAULT '',
      value_number REAL,
      unit TEXT NOT NULL DEFAULT '',
      time_reference TEXT NOT NULL DEFAULT '',
      evidence_text TEXT NOT NULL DEFAULT '',
      evidence_page INTEGER,
      confidence REAL NOT NULL DEFAULT 0,
      ambiguity_flags TEXT NOT NULL DEFAULT '[]',
      review_status TEXT NOT NULL DEFAULT 'needs_review',
      reviewed_fact_type TEXT,
      reviewed_stance TEXT,
      reviewed_subject TEXT,
      reviewed_entity_or_scope TEXT,
      reviewed_metric TEXT,
      reviewed_value_number REAL,
      reviewed_unit TEXT,
      reviewed_time_reference TEXT,
      reviewed_by TEXT,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_papers_status_created_at ON papers(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_papers_hash ON papers(hash);
    CREATE INDEX IF NOT EXISTS idx_papers_published_date ON papers(published_date);
    CREATE INDEX IF NOT EXISTS idx_papers_publisher ON papers(publisher);
    CREATE INDEX IF NOT EXISTS idx_papers_latest_extraction_id ON papers(latest_extraction_id);
    CREATE INDEX IF NOT EXISTS idx_papers_topic_summary ON papers(status, published_date);
    CREATE INDEX IF NOT EXISTS idx_scan_file_logs_scan_token ON scan_file_logs(scan_token, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scan_file_logs_status ON scan_file_logs(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scan_file_logs_filepath ON scan_file_logs(filepath);
    CREATE INDEX IF NOT EXISTS idx_paper_key_calls_paper_id ON paper_key_calls(paper_id);
    CREATE INDEX IF NOT EXISTS idx_paper_key_calls_publish_date ON paper_key_calls(publish_date);
    CREATE INDEX IF NOT EXISTS idx_paper_key_calls_indicator ON paper_key_calls(indicator);
    CREATE INDEX IF NOT EXISTS idx_paper_key_calls_house ON paper_key_calls(house);
    CREATE INDEX IF NOT EXISTS idx_manual_key_calls_paper_id ON manual_key_calls(paper_id);
    CREATE INDEX IF NOT EXISTS idx_manual_key_calls_indicator_code ON manual_key_calls(indicator_code);
    CREATE INDEX IF NOT EXISTS idx_manual_key_calls_house ON manual_key_calls(house);
    CREATE INDEX IF NOT EXISTS idx_manual_key_calls_publish_date ON manual_key_calls(publish_date);
    CREATE INDEX IF NOT EXISTS idx_paper_extractions_paper_id_created_at ON paper_extractions(paper_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_paper_extractions_file_hash ON paper_extractions(file_hash);
    CREATE INDEX IF NOT EXISTS idx_paper_topic_labels_paper_id ON paper_topic_labels(paper_id);
    CREATE INDEX IF NOT EXISTS idx_paper_topic_labels_topic_code ON paper_topic_labels(topic_code);
    CREATE INDEX IF NOT EXISTS idx_research_facts_paper_id ON research_facts(paper_id);
    CREATE INDEX IF NOT EXISTS idx_research_facts_fact_type ON research_facts(fact_type);
    CREATE INDEX IF NOT EXISTS idx_research_facts_review_status ON research_facts(review_status);
    CREATE INDEX IF NOT EXISTS idx_research_facts_source_house ON research_facts(source_house);
  `);

  const paperKeyCallColumns = await database.all<Array<{ name: string }>>(`PRAGMA table_info(paper_key_calls)`);
  const hasIndicatorCode = paperKeyCallColumns.some((column) => column.name === 'indicator_code');

  if (!hasIndicatorCode) {
    try {
      await database.exec(`ALTER TABLE paper_key_calls ADD COLUMN indicator_code TEXT`);
    } catch {}
  }
  try {
    await database.exec(`ALTER TABLE papers ADD COLUMN publisher TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE papers ADD COLUMN series_name TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE papers ADD COLUMN forecasts TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE papers ADD COLUMN latest_extraction_id INTEGER`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE papers ADD COLUMN topic_labels TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE papers ADD COLUMN topic_summary TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE research_facts ADD COLUMN reviewed_fact_type TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE research_facts ADD COLUMN reviewed_stance TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE research_facts ADD COLUMN reviewed_subject TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE research_facts ADD COLUMN reviewed_entity_or_scope TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE research_facts ADD COLUMN reviewed_metric TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE research_facts ADD COLUMN reviewed_value_number REAL`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE research_facts ADD COLUMN reviewed_unit TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE research_facts ADD COLUMN reviewed_time_reference TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE research_facts ADD COLUMN reviewed_by TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE research_facts ADD COLUMN reviewed_at DATETIME`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE research_facts ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE manual_key_calls ADD COLUMN indicator_code TEXT`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE manual_key_calls ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual_input'`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE manual_key_calls ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
  } catch {}
  try {
    await database.exec(`ALTER TABLE manual_key_calls ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`);
  } catch {}

  const migratedPaperKeyCallColumns = await database.all<Array<{ name: string }>>(`PRAGMA table_info(paper_key_calls)`);
  const hasIndicatorCodeAfterMigration = migratedPaperKeyCallColumns.some((column) => column.name === 'indicator_code');

  if (hasIndicatorCodeAfterMigration) {
    await database.exec(`CREATE INDEX IF NOT EXISTS idx_paper_key_calls_indicator_code ON paper_key_calls(indicator_code)`);

    const existingKeyCalls = await database.all<Array<{ id: number; indicator: string; indicator_code: string | null }>>(
      `SELECT id, indicator, indicator_code FROM paper_key_calls`
    );
    for (const keyCall of existingKeyCalls) {
      const inferredCode = inferForecastIndicatorCode(String(keyCall.indicator ?? ''));
      if ((keyCall.indicator_code ?? '') === (inferredCode ?? '')) continue;
      await database.run(`UPDATE paper_key_calls SET indicator_code = ? WHERE id = ?`, [inferredCode, keyCall.id]);
    }
  }

  const existingManualKeyCalls = await database.all<Array<{ id: number; indicator: string; indicator_code: string | null }>>(
    `SELECT id, indicator, indicator_code FROM manual_key_calls`
  );
  for (const keyCall of existingManualKeyCalls) {
    const inferredCode = inferForecastIndicatorCode(String(keyCall.indicator ?? ''));
    if ((keyCall.indicator_code ?? '') === (inferredCode ?? '')) continue;
    await database.run(`UPDATE manual_key_calls SET indicator_code = ? WHERE id = ?`, [inferredCode, keyCall.id]);
  }

    // Full-text search index for scalable paper search and retrieval.
  try {
    await database.exec(`
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

    await database.exec(`
      CREATE TRIGGER IF NOT EXISTS papers_ai AFTER INSERT ON papers BEGIN
        INSERT INTO papers_fts(rowid, title, authors, publisher, abstract, key_findings, tags)
        VALUES (new.id, new.title, new.authors, new.publisher, new.abstract, new.key_findings, new.tags);
      END;
    `);

    await database.exec(`
      CREATE TRIGGER IF NOT EXISTS papers_ad AFTER DELETE ON papers BEGIN
        INSERT INTO papers_fts(papers_fts, rowid, title, authors, publisher, abstract, key_findings, tags)
        VALUES ('delete', old.id, old.title, old.authors, old.publisher, old.abstract, old.key_findings, old.tags);
      END;
    `);

    await database.exec(`
      CREATE TRIGGER IF NOT EXISTS papers_au AFTER UPDATE ON papers BEGIN
        INSERT INTO papers_fts(papers_fts, rowid, title, authors, publisher, abstract, key_findings, tags)
        VALUES ('delete', old.id, old.title, old.authors, old.publisher, old.abstract, old.key_findings, old.tags);
        INSERT INTO papers_fts(rowid, title, authors, publisher, abstract, key_findings, tags)
        VALUES (new.id, new.title, new.authors, new.publisher, new.abstract, new.key_findings, new.tags);
      END;
    `);

    const ftsBuilt = await database.get(`SELECT value FROM app_meta WHERE key = 'papers_fts_built'`);
    if (!ftsBuilt?.value) {
      await database.exec(`INSERT INTO papers_fts(papers_fts) VALUES ('rebuild')`);
      await database.run(
        `INSERT INTO app_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ['papers_fts_built', '1']
      );
    }
  } catch (e) {
    // Keep app functional if FTS5 is unavailable in a local SQLite build.
    console.warn('FTS5 setup skipped:', e);
  }

    state.db = database;
    state.dbInode = getDbInode(dbPath);
    return database;
  })().catch((error) => {
    state.dbPromise = null;
    throw error;
  });

  return state.dbPromise;
}

export async function runSerializedWrite<T>(operation: (database: Database) => Promise<T>): Promise<T> {
  const run = state.writeQueue.then(async () => operation(await getDb()));
  state.writeQueue = run.catch(() => undefined);
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

export async function resetDatabaseFile() {
  const dbPath = path.join(process.cwd(), 'papers.db');

  if (state.db) {
    try {
      await state.db.close();
    } catch {}
    state.db = null;
  }
  state.dbPromise = null;
  state.dbInode = null;

  for (const suffix of ['', '-shm', '-wal']) {
    const target = `${dbPath}${suffix}`;
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    } catch (error) {
      console.warn(`Failed to remove database file ${target}:`, error);
    }
  }

  state.writeQueue = Promise.resolve();
}
