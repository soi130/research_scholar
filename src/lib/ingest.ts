import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import PDFParser from 'pdf2json';
import { getDb, runSerializedWrite } from './db';
import { extractMetadataFromPDF } from './ai';
import { finishScan, tryStartScan, updateScanProgress } from './scan-state';

type PdfTextToken = { T: string };
type PdfTextLine = { R: PdfTextToken[] };
type PdfPage = { Texts: PdfTextLine[] };
type PdfReadyPayload = { Pages: PdfPage[] };
type PdfErrorPayload = Error | { parserError: Error };
type ExtractedMetadata = Awaited<ReturnType<typeof extractMetadataFromPDF>>;

function shouldIgnoreEntry(name: string) {
  return name.startsWith('.');
}

function collectPdfFiles(folderPath: string): string[] {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const pdfFiles: string[] = [];

  for (const entry of entries) {
    if (shouldIgnoreEntry(entry.name)) continue;

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

async function extractTextFromPDF(filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    
    // Set a 30-second timeout for PDF parsing itself
    const timeout = setTimeout(() => {
      pdfParser.removeAllListeners();
      reject(new Error("PDF Parsing timed out"));
    }, 30000);

    pdfParser.on("pdfParser_dataError", (errData: PdfErrorPayload) => {
      clearTimeout(timeout);
      reject(errData instanceof Error ? errData : errData.parserError);
    });

    pdfParser.on("pdfParser_dataReady", (pdfData: PdfReadyPayload) => {
      clearTimeout(timeout);
      let text = "";
      try {
        for (const page of pdfData.Pages) {
          for (const line of page.Texts) {
            for (const t of line.R) {
              try {
                text += decodeURIComponent(t.T) + " ";
              } catch {
                text += t.T + " ";
              }
            }
          }
          text += "\n";
        }
        resolve(text);
      } catch (err) {
        reject(err);
      }
    });

    try {
      pdfParser.loadPDF(filepath);
    } catch (e) {
      clearTimeout(timeout);
      reject(e);
    }
  });
}

export async function ingestPaper(filepath: string) {
  const filename = path.basename(filepath);
  let db;
  try {
    db = await getDb();
  } catch (err) {
    console.error(`[INGEST] CRITICAL: DB Error:`, err);
    return { status: 'failed' as const, reason: 'db' };
  }
  
  try {
    const fileBuffer = fs.readFileSync(filepath);
    const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    
    const existing = await db.get('SELECT id FROM papers WHERE hash = ?', [hash]);
    if (existing) {
      console.log(`[INGEST] Skipping (Already exists): ${filename}`);
      return { status: 'skipped' as const, reason: 'duplicate' };
    }

    console.log(`[INGEST] Processing: ${filename}`);
    
    // Race with a total timeout for this paper (60 seconds)
    const result = await Promise.race([
      (async () => {
        const text = await extractTextFromPDF(filepath);
        const metadata = await extractMetadataFromPDF(text);
        return metadata;
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 60000))
    ]) as ExtractedMetadata;
    
    if (!result) {
      console.error(`[INGEST] AI Error for ${filename}`);
      return { status: 'failed' as const, reason: 'ai' };
    }

    await runSerializedWrite(async (database) => {
      await database.run(`
        INSERT INTO papers (
          hash, filename, filepath, title, authors, published_date, publisher, series_name, journal, abstract, key_findings, tags, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        hash, filename, filepath,
        result.title || filename,
        JSON.stringify(result.authors || []),
        result.published_date || '',
        result.publisher || '',
        result.series_name || '',
        result.journal || '',
        result.abstract || '',
        JSON.stringify(result.key_findings || []),
        JSON.stringify(result.tags || []),
        'pending'
      ]);
    });
    
    console.log(`[INGEST] Success: ${filename}`);
    return { status: 'ingested' as const };
  } catch (err) {
    console.error(`[INGEST] Failed ${filename}:`, err);
    return { status: 'failed' as const, reason: 'unexpected' };
  }
}

async function runScanFolder(folderPath: string, token: string) {
  console.log(`[SCAN] Starting: ${folderPath}`);
  if (!fs.existsSync(folderPath)) return { started: false as const, reason: 'missing-folder' as const };
  
  const files = collectPdfFiles(folderPath);

  console.log(`[SCAN] Total papers: ${files.length}`);
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  
  const CONCURRENCY = 2; // Reduced to 2 to be very safe
  try {
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      console.log(`[SCAN] Batch ${Math.floor(i/CONCURRENCY) + 1}/${Math.ceil(files.length/CONCURRENCY)}`);
      const outcomes = await Promise.all(batch.map(file => ingestPaper(file)));
      processed += batch.length;
      for (const outcome of outcomes) {
        if (outcome?.status === 'failed') failed += 1;
        if (outcome?.status === 'ingested' || outcome?.status === 'skipped') succeeded += 1;
      }
      await updateScanProgress(token!, {
        processed,
        succeeded,
        failed,
        message: `Processed ${processed} of ${files.length} files`,
      });
      await new Promise(r => setTimeout(r, 2000));
    }
    await finishScan(token!, 'completed', `Processed ${processed} file(s)`, {
      processed,
      succeeded,
      failed,
    });
  } catch (error) {
    await finishScan(token!, 'failed', 'Scan failed before completion', {
      processed,
      succeeded,
      failed,
    });
    throw error;
  }
  
  console.log(`[SCAN] Finished everything.`);
  return { started: true as const };
}

export async function scanFolder(folderPath: string) {
  console.log(`[SCAN] Scheduling background scan for: ${folderPath}`);
  if (!fs.existsSync(folderPath)) return { started: false as const, reason: 'missing-folder' as const };

  const files = collectPdfFiles(folderPath);
  const lock = await tryStartScan(files.length);
  if (!lock.started) {
    return { started: false as const, reason: 'already-running' as const, state: lock.state };
  }

  void (async () => {
    try {
      await updateScanProgress(lock.state.token!, { message: 'Scan in progress' });
      await runScanFolder(folderPath, lock.state.token!);
    } catch (error) {
      console.error('Scan error:', error);
      await finishScan(lock.state.token!, 'failed', 'Scan failed before completion');
    }
  })();

  return { started: true as const, state: lock.state };
}
