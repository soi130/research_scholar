import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  const dbPath = path.join(process.cwd(), 'papers.db');
  
  if (db && !fs.existsSync(dbPath)) {
    console.log("Database file was deleted, resetting connection...");
    try { await db.close(); } catch (e) {}
    db = null;
  }

  if (db) return db;

  console.log(`Connecting to database at: ${dbPath}`);
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

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
  `);

  try {
    await db.exec(`ALTER TABLE papers ADD COLUMN publisher TEXT`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE papers ADD COLUMN series_name TEXT`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE papers ADD COLUMN forecasts TEXT`);
  } catch (e) {}

  return db;
}
