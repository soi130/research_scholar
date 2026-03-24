import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import PDFParser from 'pdf2json';
import { getDb } from './db';
import { extractMetadataFromPDF } from './ai';

async function extractTextFromPDF(filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new (PDFParser as any)();
    
    // Set a 30-second timeout for PDF parsing itself
    const timeout = setTimeout(() => {
      pdfParser.removeAllListeners();
      reject(new Error("PDF Parsing timed out"));
    }, 30000);

    pdfParser.on("pdfParser_dataError", (errData: any) => {
      clearTimeout(timeout);
      reject(errData.parserError);
    });

    pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
      clearTimeout(timeout);
      let text = "";
      try {
        for (const page of pdfData.Pages) {
          for (const line of page.Texts) {
            for (const t of line.R) {
              try {
                text += decodeURIComponent(t.T) + " ";
              } catch (e) {
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
    return;
  }
  
  try {
    const fileBuffer = fs.readFileSync(filepath);
    const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    
    const existing = await db.get('SELECT id FROM papers WHERE hash = ?', [hash]);
    if (existing) {
      console.log(`[INGEST] Skipping (Already exists): ${filename}`);
      return;
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
    ]) as any;
    
    if (!result) {
      console.error(`[INGEST] AI Error for ${filename}`);
      return;
    }

    await db.run(`
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
    
    console.log(`[INGEST] Success: ${filename}`);
  } catch (err) {
    console.error(`[INGEST] Failed ${filename}:`, err);
  }
}

export async function scanFolder(folderPath: string) {
  console.log(`[SCAN] Starting: ${folderPath}`);
  if (!fs.existsSync(folderPath)) return;
  
  const files = fs.readdirSync(folderPath)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(folderPath, f));

  console.log(`[SCAN] Total papers: ${files.length}`);
  
  const CONCURRENCY = 2; // Reduced to 2 to be very safe
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    console.log(`[SCAN] Batch ${Math.floor(i/CONCURRENCY) + 1}/${Math.ceil(files.length/CONCURRENCY)}`);
    // Run batch with individual timeouts
    await Promise.all(batch.map(file => ingestPaper(file)));
    // Mini delay between batches to breathe
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`[SCAN] Finished everything.`);
}
