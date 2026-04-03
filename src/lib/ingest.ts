import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import PDFParser from 'pdf2json';
import { getDb, runInTransaction } from './db';
import { extractMetadataFromPDF, getActiveExtractionEngine } from './ai';
import { finishScan, tryStartScan, updateScanProgress } from './scan-state';
import { normalizeTopicSentiment } from './topic-sentiment';
import { normalizeResearchFacts } from './research-facts';
import { normalizeStoredKeyCalls } from './key-calls';

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

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeKeyFindings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeForecasts(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, raw]) => [normalizeString(key), normalizeString(raw)])
      .filter(([key, raw]) => key && raw)
  );
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
            text += "\n";
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

    const normalizedTitle = normalizeString(result.title) || filename;
    const normalizedPublishedDate = normalizeString(result.published_date);
    const normalizedPublisher = normalizeString(result.publisher);
    const normalizedSummary = normalizeString(result.abstract);
    const normalizedKeyFindings = normalizeKeyFindings(result.key_findings);
    const normalizedForecasts = normalizeForecasts((result as Record<string, unknown>).forecasts);
    const normalizedKeyCalls = normalizeStoredKeyCalls((result as Record<string, unknown>).key_calls, {
      publish_date: normalizedPublishedDate,
      house: normalizedPublisher,
    });
    const normalizedTopicSentiment = normalizeTopicSentiment(
      (result as Record<string, unknown>).topic_labels,
      (result as Record<string, unknown>).topic_summary
    );
    const normalizedResearchFacts = normalizeResearchFacts(
      (result as Record<string, unknown>).research_facts,
      { source_house: normalizedPublisher }
    );
    const extractionEngine = getActiveExtractionEngine();
    const generatedLocally = Boolean((result as Record<string, unknown>)._generated_locally);
    const extractionPayload = {
      ...result,
      title: normalizedTitle,
      published_date: normalizedPublishedDate,
      publisher: normalizedPublisher,
      abstract: normalizedSummary,
      key_findings: normalizedKeyFindings,
      forecasts: normalizedForecasts,
      key_calls: normalizedKeyCalls,
      research_facts: normalizedResearchFacts,
      topic_labels: normalizedTopicSentiment.labels,
      topic_summary: normalizedTopicSentiment.summary,
      filepath,
      filename,
      hash,
    };

    await runInTransaction(async (database) => {
      const insertResult = await database.run(`
        INSERT INTO papers (
          hash, filename, filepath, title, authors, published_date, publisher, series_name, journal, abstract, key_findings, forecasts, topic_labels, topic_summary, tags, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        hash, filename, filepath,
        normalizedTitle,
        JSON.stringify(result.authors || []),
        normalizedPublishedDate,
        normalizedPublisher,
        normalizeString(result.series_name),
        normalizeString(result.journal),
        normalizedSummary,
        JSON.stringify(normalizedKeyFindings),
        JSON.stringify(normalizedForecasts),
        JSON.stringify(normalizedTopicSentiment.labels),
        JSON.stringify(normalizedTopicSentiment.summary),
        JSON.stringify(result.tags || []),
        'pending'
      ]);

      const paperId = Number(insertResult.lastID);
      if (!Number.isFinite(paperId)) return;

      const extractionResult = await database.run(
        `
          INSERT INTO paper_extractions (
            paper_id, file_hash, provider, model, prompt_version, extraction_payload
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
          [
          paperId,
          hash,
          generatedLocally ? 'local' : extractionEngine.provider,
          generatedLocally ? 'heuristic-parser' : extractionEngine.model,
          generatedLocally ? `${extractionEngine.promptVersion}-local-fallback` : extractionEngine.promptVersion,
          JSON.stringify(extractionPayload),
        ]
      );

      const extractionId = Number(extractionResult.lastID);

      await database.run(
        `UPDATE papers
         SET forecasts = ?, topic_labels = ?, topic_summary = ?, latest_extraction_id = ?
         WHERE id = ?`,
        [
          JSON.stringify(normalizedForecasts),
          JSON.stringify(normalizedTopicSentiment.labels),
          JSON.stringify(normalizedTopicSentiment.summary),
          Number.isFinite(extractionId) ? extractionId : null,
          paperId,
        ]
      );

      for (const topicLabel of normalizedTopicSentiment.labels) {
        await database.run(
          `
            INSERT INTO paper_topic_labels (
              paper_id, topic_code, relevance, direction, confidence, evidence, regime, drivers, display_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            paperId,
            topicLabel.topic,
            topicLabel.relevance,
            topicLabel.direction,
            topicLabel.confidence,
            topicLabel.evidence,
            topicLabel.regime || null,
            JSON.stringify(topicLabel.drivers || []),
            JSON.stringify(topicLabel.display || {}),
          ]
        );
      }

      for (const fact of normalizedResearchFacts) {
        await database.run(
          `
            INSERT INTO research_facts (
              paper_id,
              source_house,
              fact_type,
              stance,
              subject,
              entity_or_scope,
              metric,
              value_number,
              unit,
              time_reference,
              evidence_text,
              evidence_page,
              confidence,
              ambiguity_flags,
              review_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            paperId,
            fact.source_house,
            fact.fact_type,
            fact.stance,
            fact.subject,
            fact.entity_or_scope,
            fact.metric,
            fact.value_number,
            fact.unit,
            fact.time_reference,
            fact.evidence_text,
            fact.evidence_page,
            fact.confidence,
            JSON.stringify(fact.ambiguity_flags),
            fact.review_status,
          ]
        );
      }
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
