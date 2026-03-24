#!/usr/bin/env node
// Standalone ingestion script (CommonJS + dynamic ESM import for pdfjs)
// Usage: node scripts/ingest.cjs

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- Load env ---
const envPath = path.join(__dirname, '..', '.env.local');
const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
for (const line of envLines) {
  const idx = line.indexOf('=');
  if (idx > 1) {
    const key = line.substring(0, idx).trim();
    const value = line.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}

const STORAGE_PATH = process.env.PAPERS_STORAGE_PATH;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const DB_PATH = path.join(__dirname, '..', 'papers.db');

if (!STORAGE_PATH) { console.error('PAPERS_STORAGE_PATH not set'); process.exit(1); }
if (!OPENAI_KEY)   { console.error('OPENAI_API_KEY not set'); process.exit(1); }

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { default: OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: OPENAI_KEY });

// --- Robust PDF Text Extraction (pdfjs-dist v5+) ---
async function extractText(filepath, pdfjs) {
  const data = new Uint8Array(fs.readFileSync(filepath));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;
  let text = '';
  // Limit to first 20 pages for metadata extraction to save time/tokens
  const pages = Math.min(doc.numPages, 20);
  for (let i = 1; i <= pages; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    } catch (e) {
      // Skip bad pages
    }
  }
  return text;
}

// --- AI Extraction ---
async function extractMetadata(text) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `You are a metadata extraction assistant for a financial research paper library.
Return ONLY a valid JSON object with these exact fields:
- "title": Main title
- "authors": Array of writer/analyst names  
- "published_date": Publication date string
- "publisher": The financial institution 'House'. Examples: "Goldman Sachs", "JPMorgan", "BofA", "Nomura", "UOB", "Citi", "KKPS", "PIER", "MAS", "UBS", "KBank". Look in FIRST PAGE TEXT.
- "series_name": Report series name if present (e.g. "Global Markets Daily")
- "journal": Academic journal or empty string
- "abstract": 2-3 sentence summary
- "key_findings": Array of 3-5 key bullet points
- "tags": Array of 2-5 tags from: equity, rates, EM, FX, macro, fixed-income, Thailand, Asia, commodities, credit
- "forecasts": Structured object of indicators (e.g. {"GDP": "3.5%", "CPI": "2.1%", "Rates": "Hold", "FX": "34.5", "Equities": "Neutral"}). Only include mentioned values.

=== FIRST PAGE TEXT ===
${text.substring(0, 5000)}

=== FULL TEXT ===
${text.substring(0, 40000)}`
    }],
    response_format: { type: 'json_object' }
  });
  return JSON.parse(res.choices[0].message.content || '{}');
}

async function main() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT UNIQUE, filename TEXT, filepath TEXT,
      title TEXT, authors TEXT, published_date TEXT, journal TEXT,
      publisher TEXT, series_name TEXT, abstract TEXT, key_findings TEXT,
      forecasts TEXT, tags TEXT, status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure column exists for older DBs
  try { await db.exec('ALTER TABLE papers ADD COLUMN forecasts TEXT'); } catch(e) {}

  const allFiles = fs.readdirSync(STORAGE_PATH)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(STORAGE_PATH, f));

  const existing = await db.all('SELECT hash FROM papers');
  const knownHashes = new Set(existing.map(r => r.hash));

  const toProcess = [];
  for (const f of allFiles) {
    const hash = crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
    if (!knownHashes.has(hash)) toProcess.push({ filepath: f, hash });
  }

  console.log(`\n📚 Total PDFs: ${allFiles.length}`);
  console.log(`✅ Already in DB: ${allFiles.length - toProcess.length}`);
  console.log(`⏳ To process: ${toProcess.length}\n`);

  let done = 0, failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const { filepath, hash } = toProcess[i];
    const filename = path.basename(filepath);

    process.stdout.write(`[${i+1}/${toProcess.length}] ${filename.substring(0, 55)}... `);

    try {
      const text = await extractText(filepath, pdfjs);
      if (!text || text.trim().length < 30) {
        console.log('⚠️  No text');
        failed++;
        continue;
      }

      const meta = await extractMetadata(text);

      await db.run(`
        INSERT OR IGNORE INTO papers (hash, filename, filepath, title, authors, published_date, publisher, series_name, journal, abstract, key_findings, forecasts, tags, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
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
        JSON.stringify(meta.forecasts || {}),
        JSON.stringify(meta.tags || [])
      ]);

      console.log(`✅ ${meta.publisher ? '[' + meta.publisher + '] ' : ''}${(meta.title || filename).substring(0, 50)}`);
      done++;
    } catch (err) {
      console.log(`❌ ${String(err.message || err).substring(0, 80)}`);
      failed++;
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n🎉 Done! Added: ${done} | Failed: ${failed}`);
  await db.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
