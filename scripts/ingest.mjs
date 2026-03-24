#!/usr/bin/env node
// Standalone ingestion script - runs completely outside of Next.js
// Usage: node scripts/ingest.mjs

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// --- Load env ---
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) { console.error('.env.local not found!'); process.exit(1); }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx > 0) process.env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
  }
}
loadEnv();

const STORAGE_PATH = process.env.PAPERS_STORAGE_PATH;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const DB_PATH = path.join(ROOT, 'papers.db');

if (!STORAGE_PATH) { console.error('PAPERS_STORAGE_PATH not set'); process.exit(1); }
if (!OPENAI_KEY)   { console.error('OPENAI_API_KEY not set'); process.exit(1); }

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { default: sqlite3 } = await import('sqlite3');
const { open } = await import('sqlite');
const { default: OpenAI } = await import('openai');
const pdfParseModule = require('pdf-parse');
const pdfParse = pdfParseModule.default || pdfParseModule;

const openai = new OpenAI({ apiKey: OPENAI_KEY });
const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

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

// --- PDF Text Extraction (pdf-parse - robust) ---
async function extractText(filepath) {
  const buf = fs.readFileSync(filepath);
  const data = await pdfParse(buf, { max: 0 });
  return data.text || '';
}

// --- AI Metadata Extraction ---
async function extractMetadata(text) {
  const firstPage = text.substring(0, 5000);
  const body = text.substring(0, 40000);

  const prompt = `You are a metadata extraction assistant for a financial research paper library.
Return ONLY a valid JSON object with these fields:
- "title": Main title
- "authors": Array of writer/analyst names
- "published_date": Publication date string
- "publisher": The House name. Examples: "Goldman Sachs", "JPMorgan", "BofA", "Bank of America", "Nomura", "UOB", "Citi", "KKPS", "PIER", "MAS", "KBank". Look in FIRST PAGE TEXT below.
- "series_name": Report series name if present
- "journal": Academic journal name or blank
- "abstract": 2-3 sentence summary
- "key_findings": Array of 3-5 key points
- "tags": Array of 2-5 relevant keywords (equity, rates, EM, FX, macro, fixed-income, Thailand, Asia, commodities)

=== FIRST PAGE TEXT (find publisher here) ===
${firstPage}

=== FULL TEXT ===
${body}`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  });
  return JSON.parse(res.choices[0].message.content || '{}');
}

// --- Main ---
if (!fs.existsSync(STORAGE_PATH)) {
  console.error(`Storage path not found: ${STORAGE_PATH}`);
  process.exit(1);
}

const allFiles = fs.readdirSync(STORAGE_PATH)
  .filter(f => f.toLowerCase().endsWith('.pdf'))
  .map(f => path.join(STORAGE_PATH, f));

const existing = await db.all('SELECT hash FROM papers');
const knownHashes = new Set(existing.map(r => r.hash));

console.log(`\n📚 Total PDFs: ${allFiles.length}`);
console.log(`✅ Already in DB: ${knownHashes.size}`);
console.log(`⏳ To process: ${allFiles.length - knownHashes.size}\n`);

let done = 0, skipped = 0, failed = 0;

for (let i = 0; i < allFiles.length; i++) {
  const filepath = allFiles[i];
  const filename = path.basename(filepath);

  const buf = fs.readFileSync(filepath);
  const hash = crypto.createHash('md5').update(buf).digest('hex');

  if (knownHashes.has(hash)) { skipped++; continue; }

  process.stdout.write(`[${i+1}/${allFiles.length}] ${filename.substring(0, 60)}... `);

  try {
    const text = await extractText(filepath);
    if (!text || text.trim().length < 50) {
      console.log('⚠️  Too little text extracted, skipping');
      failed++;
      continue;
    }
    const meta = await extractMetadata(text);

    await db.run(`
      INSERT INTO papers (hash, filename, filepath, title, authors, published_date, publisher, series_name, journal, abstract, key_findings, tags, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      hash, filename, filepath,
      meta.title || filename,
      JSON.stringify(meta.authors || []),
      meta.published_date || '',
      meta.publisher || '',
      meta.series_name || '',
      meta.journal || '',
      meta.abstract || '',
      JSON.stringify(meta.key_findings || []),
      JSON.stringify(meta.tags || [])
    ]);

    console.log(`✅ ${meta.publisher ? '[' + meta.publisher + '] ' : ''}${(meta.title || filename).substring(0, 50)}`);
    done++;
  } catch (err) {
    console.log(`❌ ${err.message?.substring(0, 80)}`);
    failed++;
  }

  await new Promise(r => setTimeout(r, 300));
}

console.log(`\n🎉 Done! Added: ${done} | Skipped: ${skipped} | Failed: ${failed}`);
await db.close();
