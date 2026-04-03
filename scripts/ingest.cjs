#!/usr/bin/env node
// Standalone ingestion script (CommonJS + dynamic ESM import for pdfjs)
// Usage: node scripts/ingest.cjs

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

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
const LOCAL_PROMPT_VERSION = '2026-04-01-v1-research-facts-local-fallback';

if (!STORAGE_PATH) { console.error('PAPERS_STORAGE_PATH not set'); process.exit(1); }

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { default: OpenAI } = require('openai');

const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;
const KNOWN_PUBLISHERS = [
  'Goldman Sachs',
  'JPMorgan',
  'JP Morgan',
  'Bank of America',
  'BofA',
  'Morgan Stanley',
  'Nomura',
  'UOB',
  'Citi',
  'Citigroup',
  'UBS',
  'HSBC',
  'Maybank',
  'Macquarie',
  'KBank',
  'Kasikornbank',
  'KKPS',
  'PIER',
  'MAS',
];
const TAG_RULES = [
  { tag: 'macro', pattern: /\b(gdp|inflation|cpi|macro|economy|growth|exports?|imports?|consumption|tourism)\b/i },
  { tag: 'rates', pattern: /\b(rate|rates|yield|bond|policy rate|cut|hike|bps)\b/i },
  { tag: 'FX', pattern: /\b(fx|foreign exchange|usd\/thb|baht|dollar|currency)\b/i },
  { tag: 'equity', pattern: /\b(equity|equities|stocks?|shares?)\b/i },
  { tag: 'fixed-income', pattern: /\b(fixed income|treasury|government bond|credit spread)\b/i },
  { tag: 'credit', pattern: /\b(credit|default|spread|loan)\b/i },
  { tag: 'commodities', pattern: /\b(oil|gold|commodity|commodities|gas)\b/i },
  { tag: 'Thailand', pattern: /\b(thailand|thai|bot|bank of thailand|baht)\b/i },
  { tag: 'Asia', pattern: /\b(asia|asian|asean|china|india|indonesia|malaysia|philippines|vietnam)\b/i },
  { tag: 'EM', pattern: /\b(emerging markets?|em\b)\b/i },
];
const OPENAI_MODEL = 'gpt-4o-mini';

function logOpenAIRequest(context) {
  console.log(`[OPENAI] Request starting`);
  console.log(`[OPENAI] file=${context.filename}`);
  console.log(`[OPENAI] model=${context.model}`);
  console.log(`[OPENAI] first_page_chars=${context.firstPageChars}`);
  console.log(`[OPENAI] full_text_chars=${context.bodyChars}`);
}

function logOpenAISuccess(context, response) {
  console.log(`[OPENAI] Request succeeded`);
  console.log(`[OPENAI] file=${context.filename}`);
  console.log(`[OPENAI] model=${context.model}`);
  console.log(`[OPENAI] completion_id=${response?.id || 'n/a'}`);
}

function logOpenAIError(context, error) {
  const status = error?.status || error?.response?.status || 'n/a';
  const code = error?.code || error?.error?.code || 'n/a';
  const type = error?.type || error?.error?.type || 'n/a';
  const message = error?.message || String(error);
  const requestId =
    error?.request_id
    || error?.headers?.['x-request-id']
    || error?.response?.headers?.['x-request-id']
    || 'n/a';

  console.error(`[OPENAI] Request failed`);
  console.error(`[OPENAI] file=${context.filename}`);
  console.error(`[OPENAI] model=${context.model}`);
  console.error(`[OPENAI] status=${status}`);
  console.error(`[OPENAI] code=${code}`);
  console.error(`[OPENAI] type=${type}`);
  console.error(`[OPENAI] request_id=${requestId}`);
  console.error(`[OPENAI] message=${message}`);
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function splitLines(text) {
  return text.split(/\n+/).map(normalizeWhitespace).filter(Boolean);
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map(normalizeWhitespace).filter(Boolean)));
}

function stripLeadingJunk(value) {
  return normalizeWhitespace(value)
    .replace(/^[\d\s._-]+/, '')
    .replace(/^(?:page\s+\d+|confidential|economics?|research|report)\b[:\-\s]*/i, '')
    .trim();
}

function isDisclaimerLine(value) {
  return /\b(issued by|distributed locally|research co\s*-\s*operation|important disclosures|investors should be aware|copyright|all rights reserved|refer to important disclosures|merrill lynch|kiatnakin phatra securities|conflict of interest|objectivity of this report|single factor in making their investment decision|do business with companies covered|consider this report as)\b/i.test(value);
}

function collectPdfFiles(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const pdfFiles = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(folderPath, entry.name);

    if (entry.isDirectory()) {
      pdfFiles.push(...collectPdfFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      pdfFiles.push(fullPath);
    }
  }

  return pdfFiles.sort((left, right) => left.localeCompare(right));
}

function inferPublisher(text) {
  const normalized = normalizeWhitespace(text);
  for (const publisher of KNOWN_PUBLISHERS) {
    const pattern = new RegExp(`\\b${publisher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(normalized)) {
      if (/^JP Morgan$/i.test(publisher)) return 'JPMorgan';
      if (/^Bank of America$/i.test(publisher)) return 'BofA';
      if (/^Citigroup$/i.test(publisher)) return 'Citi';
      if (/^Kasikornbank$/i.test(publisher)) return 'KBank';
      return publisher;
    }
  }
  return '';
}

function inferPublishedDate(text) {
  const patterns = [
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/i,
    /\b\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b/i,
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b/i,
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return normalizeWhitespace(match[0]);
  }
  return '';
}

function inferSeriesName(title, lines) {
  const titleMatch = normalizeWhitespace(title).match(/^([^:]{3,60})\s*[:\-–]\s+(.+)$/);
  if (titleMatch && /\b(watch|viewpoint|outlook|daily|weekly|monthly|update|monitor|focus|insight|review|strategy|pulse|report)\b/i.test(titleMatch[1])) {
    return normalizeWhitespace(titleMatch[1]);
  }

  for (const line of lines.slice(0, 40)) {
    const candidate = stripLeadingJunk(line);
    if (!candidate || isDisclaimerLine(candidate)) continue;
    if (
      candidate.length >= 6 &&
      candidate.length <= 60 &&
      /\b(watch|viewpoint|outlook|daily|weekly|monthly|update|monitor|focus|insight|review|strategy|pulse|report)\b/i.test(candidate)
    ) {
      return candidate.replace(/[:\-–\s]+$/g, '');
    }
  }

  return '';
}

function inferTitle(lines, firstPage, seriesName, publisher) {
  const candidateLines = lines.slice(0, 40).map(stripLeadingJunk).filter(Boolean);
  const inferredSeriesIndex = candidateLines.findIndex((line) => !isDisclaimerLine(line) && /\b(watch|viewpoint|outlook|daily|weekly|monthly|update|monitor|focus|insight|review|strategy|pulse|report)\b/i.test(line));

  if (inferredSeriesIndex >= 0) {
    const inferredSeries = candidateLines[inferredSeriesIndex].replace(/[:\-–\s]+$/g, '');
    const headlineParts = [];

    for (const line of candidateLines.slice(inferredSeriesIndex + 1, inferredSeriesIndex + 6)) {
      if (isDisclaimerLine(line)) continue;
      if (!line || line === '-') continue;
      if (inferPublishedDate(line)) continue;
      if (!/[A-Za-z]/.test(line)) continue;
      if (/^[’'s-]+$/i.test(line)) continue;
      headlineParts.push(line);
      if (headlineParts.join(' ').length >= 30) break;
    }

    if (headlineParts.length > 0) {
      return `${inferredSeries}: ${normalizeWhitespace(headlineParts.join(' ').replace(/\s*-\s*/g, '-'))}`;
    }
  }

  if (seriesName) {
    const seriesIndex = candidateLines.findIndex((line) => new RegExp(`^${seriesName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(line));
    if (seriesIndex >= 0) {
      for (const line of candidateLines.slice(seriesIndex + 1, seriesIndex + 6)) {
        if (isDisclaimerLine(line)) continue;
        if (line.length < 8 || line.length > 180) continue;
        if (!/[A-Za-z]/.test(line)) continue;
        return `${seriesName}: ${line}`;
      }
    }
  }

  for (const line of candidateLines) {
    if (isDisclaimerLine(line)) continue;
    if (publisher && new RegExp(`^${publisher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(line)) continue;
    if (seriesName && new RegExp(`^${seriesName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(line)) continue;
    if (/^(?:published|date|authors?|analysts?|source|economics?|research|strategy|global|asia|thailand)$/i.test(line)) continue;
    if (line.length < 12 || line.length > 180) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    if (inferPublishedDate(line)) continue;
    return line;
  }

  const firstSentence = normalizeWhitespace(firstPage).match(/[^.!?]{20,180}[.!?]/);
  return firstSentence ? normalizeWhitespace(firstSentence[0]) : '';
}

function inferAuthors(lines, title, publisher, publishedDate) {
  const blocked = new Set(
    [title, publisher, publishedDate]
      .map((value) => normalizeWhitespace(value).toLowerCase())
      .filter(Boolean)
  );

  return uniqueStrings(
    lines
      .slice(0, 18)
      .flatMap((line) => line.split(/(?:,|;|\band\b)/i))
      .map(stripLeadingJunk)
      .filter((part) => /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(part))
      .filter((part) => !blocked.has(part.toLowerCase()))
  ).slice(0, 5);
}

function inferAbstract(text, title) {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 260)
    .filter((sentence) => !title || !sentence.toLowerCase().includes(title.toLowerCase()))
    .slice(0, 2)
    .join(' ')
    .trim();
}

function inferKeyFindings(text, title) {
  return uniqueStrings(
    normalizeWhitespace(text)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.replace(/^[•\-*]\s*/, '').trim())
      .filter((sentence) => sentence.length >= 35 && sentence.length <= 200)
      .filter((sentence) => !title || !sentence.toLowerCase().includes(title.toLowerCase()))
  ).slice(0, 3);
}

function inferForecasts(text) {
  const forecasts = {};
  const patterns = [
    { key: 'GDP', pattern: /\bGDP[^.\n]{0,50}?(\d+(?:\.\d+)?)\s*%/i },
    { key: 'CPI', pattern: /\b(?:CPI|inflation)[^.\n]{0,50}?(\d+(?:\.\d+)?)\s*%/i },
    { key: 'Rates', pattern: /\b(?:policy rate|terminal rate|benchmark rate)[^.\n]{0,50}?(\d+(?:\.\d+)?)\s*%/i },
    { key: 'FX', pattern: /\b(?:USD\/THB|THB|baht)[^.\n]{0,50}?(\d+(?:\.\d+)?)/i },
  ];

  for (const { key, pattern } of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      forecasts[key] = key === 'FX' ? match[1] : `${match[1]}%`;
    }
  }

  return forecasts;
}

function inferTags(text) {
  return TAG_RULES.filter(({ pattern }) => pattern.test(text)).map(({ tag }) => tag).slice(0, 5);
}

function extractMetadataLocally(text) {
  const firstPage = text.substring(0, 10000);
  const lines = splitLines(firstPage);
  const publisher = inferPublisher(firstPage);
  const publishedDate = inferPublishedDate(firstPage) || inferPublishedDate(text);
  const provisionalTitle = inferTitle(lines, firstPage, '', publisher);
  const seriesName = inferSeriesName(provisionalTitle, lines);
  const title = inferTitle(lines, firstPage, seriesName, publisher) || provisionalTitle || 'Untitled paper';

  return {
    _generated_locally: true,
    title,
    authors: inferAuthors(lines, title, publisher, publishedDate),
    published_date: publishedDate,
    publisher,
    series_name: seriesName,
    journal: '',
    abstract: inferAbstract(text, title),
    key_findings: inferKeyFindings(text, title),
    forecasts: inferForecasts(text),
    tags: inferTags(text),
  };
}

// --- Robust PDF Text Extraction with preserved line breaks ---
async function extractText(filepath) {
  try {
    const raw = execFileSync(process.execPath, [path.join(__dirname, '_extractor.cjs'), filepath], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    const jsonStart = raw.indexOf('"');
    if (jsonStart >= 0) {
      return JSON.parse(raw.slice(jsonStart));
    }
  } catch (error) {
    console.warn('Line-preserving extractor failed, falling back to empty text:', error.message || error);
  }
  return '';
}

// --- AI Extraction ---
async function extractMetadata(text, context = { filename: 'unknown.pdf' }) {
  if (!openai) {
    return extractMetadataLocally(text);
  }

  const requestContext = {
    filename: context.filename,
    model: OPENAI_MODEL,
    firstPageChars: Math.min(text.length, 5000),
    bodyChars: Math.min(text.length, 40000),
  };

  logOpenAIRequest(requestContext);

  try {
    const res = await openai.chat.completions.create({
      model: OPENAI_MODEL,
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

    logOpenAISuccess(requestContext, res);

    return {
      ...JSON.parse(res.choices[0].message.content || '{}'),
      _generated_locally: false,
    };
  } catch (error) {
    logOpenAIError(requestContext, error);
    throw error;
  }
}

async function main() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT UNIQUE, filename TEXT, filepath TEXT,
      title TEXT, authors TEXT, published_date TEXT, journal TEXT,
      publisher TEXT, series_name TEXT, abstract TEXT, key_findings TEXT,
      forecasts TEXT, tags TEXT, latest_extraction_id INTEGER, status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  `);

  // Ensure column exists for older DBs
  try { await db.exec('ALTER TABLE papers ADD COLUMN forecasts TEXT'); } catch(e) {}
  try { await db.exec('ALTER TABLE papers ADD COLUMN latest_extraction_id INTEGER'); } catch(e) {}

  const allFiles = collectPdfFiles(STORAGE_PATH);

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
      const text = await extractText(filepath);
      if (!text || text.trim().length < 30) {
        console.log('⚠️  No text');
        failed++;
        continue;
      }

      const meta = await extractMetadata(text, { filename });

      const generatedLocally = Boolean(meta._generated_locally);
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

      const insertedPaper = await db.get(`SELECT id FROM papers WHERE hash = ?`, [hash]);
      const paperId = Number(insertedPaper?.id || 0);
      if (Number.isFinite(paperId) && paperId > 0) {
        const extractionResult = await db.run(
          `
            INSERT INTO paper_extractions (
              paper_id, file_hash, provider, model, prompt_version, extraction_payload
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            paperId,
            hash,
            generatedLocally ? 'local' : 'openai',
            generatedLocally ? 'heuristic-parser' : 'gpt-4o-mini',
            generatedLocally ? LOCAL_PROMPT_VERSION : '2026-04-01-v1-research-facts',
            JSON.stringify({
              ...meta,
              filepath,
              filename,
              hash,
            }),
          ]
        );

        const extractionId = Number(extractionResult.lastID || 0);
        if (Number.isFinite(extractionId) && extractionId > 0) {
          await db.run(
            `UPDATE papers SET latest_extraction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [extractionId, paperId]
          );
        }
      }

      const sourceLabel = openai ? 'ai/local-fallback' : 'local';
      console.log(`✅ (${sourceLabel}) ${meta.publisher ? '[' + meta.publisher + '] ' : ''}${(meta.title || filename).substring(0, 50)}`);
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
