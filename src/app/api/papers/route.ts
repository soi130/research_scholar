import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { scanFolder } from '@/lib/ingest';
import { MULTI_SELECT_SEARCH_FIELDS, type AdvancedSearchFilters, type MultiSelectSearchField } from '@/lib/search';
import path from 'path';

type PaperRow = Record<string, unknown>;

function parseJsonArrayParam(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    return [];
  }

  return [];
}

function normalizePublishedDate(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  const isoPrefix = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseAdvancedSearchFilters(searchParams: URLSearchParams): AdvancedSearchFilters {
  const filters = {
    authors: [] as string[],
    publisher: [] as string[],
    series_name: [] as string[],
    tags: [] as string[],
    published_from: (searchParams.get('published_from') || '').trim(),
    published_to: (searchParams.get('published_to') || '').trim(),
  };

  for (const field of MULTI_SELECT_SEARCH_FIELDS) {
    filters[field] = parseJsonArrayParam(searchParams.get(field));
  }

  return filters;
}

function hasAdvancedFilters(filters: AdvancedSearchFilters) {
  return MULTI_SELECT_SEARCH_FIELDS.some((field) => filters[field].length > 0)
    || Boolean(filters.published_from)
    || Boolean(filters.published_to);
}

function buildLikePattern(value: string) {
  return `%${value.toLowerCase().replace(/[%_]/g, '\\$&')}%`;
}

function buildQuickSearchClause(query: string) {
  const like = buildLikePattern(query);
  return {
    clause: `(
      LOWER(COALESCE(p.title, '')) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(p.authors, '')) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(p.publisher, '')) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(p.series_name, '')) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(p.published_date, '')) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(p.tags, '')) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(p.abstract, '')) LIKE ? ESCAPE '\\'
    )`,
    params: [like, like, like, like, like, like, like],
  };
}

function buildMultiSelectClause(field: MultiSelectSearchField, values: string[]) {
  const clauses = values.map(() => `LOWER(COALESCE(p.${field}, '')) LIKE ? ESCAPE '\\'`);
  return {
    clause: `(${clauses.join(' OR ')})`,
    params: values.map(buildLikePattern),
  };
}

function matchesPublishedDateRange(row: PaperRow, filters: AdvancedSearchFilters) {
  if (!filters.published_from && !filters.published_to) return true;

  const normalized = normalizePublishedDate(row.published_date);
  if (!normalized) return false;
  if (filters.published_from && normalized < filters.published_from) return false;
  if (filters.published_to && normalized > filters.published_to) return false;
  return true;
}

function parsePaperRow(row: PaperRow) {
  const extractionProvider = String(row.extraction_provider || '').trim().toLowerCase();
  const extractionPromptVersion = String(row.extraction_prompt_version || '').trim().toLowerCase();

  return {
    ...row,
    generated_locally: extractionProvider === 'local' || extractionPromptVersion.includes('local-fallback'),
    authors: row.authors ? JSON.parse(String(row.authors)) : [],
    key_findings: row.key_findings ? JSON.parse(String(row.key_findings)) : [],
    tags: row.tags ? JSON.parse(String(row.tags)) : [],
    forecasts: row.forecasts ? JSON.parse(String(row.forecasts)) : {},
    topic_labels: row.topic_labels ? JSON.parse(String(row.topic_labels)) : [],
    topic_summary: row.topic_summary ? JSON.parse(String(row.topic_summary)) : {
      core_topics: [],
      top_positive_topics: [],
      top_negative_topics: [],
    },
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'approved';
  const q = (searchParams.get('q') || '').trim();
  const advancedFilters = parseAdvancedSearchFilters(searchParams);
  const usingAdvancedSearch = hasAdvancedFilters(advancedFilters);
  const limitParam = Number.parseInt(searchParams.get('limit') || '', 10);
  const offsetParam = Number.parseInt(searchParams.get('offset') || '', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : null;
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;

  const db = await getDb();
  let papers: PaperRow[] = [];
  let total = 0;

  if (q && !usingAdvancedSearch) {
    try {
      const filters = ['p.status = ?'];
      const params: (string | number)[] = [status, q];

      let sql = `
        SELECT p.*, e.provider AS extraction_provider, e.prompt_version AS extraction_prompt_version
        FROM papers_fts f
        JOIN papers p ON p.id = f.rowid
        LEFT JOIN paper_extractions e ON e.id = p.latest_extraction_id
        WHERE ${filters.join(' AND ')}
          AND f MATCH ?
        ORDER BY p.created_at DESC
      `;

      if (limit !== null) {
        sql += ` LIMIT ? OFFSET ?`;
        params.push(limit, offset);
      }

      papers = await db.all(sql, params);

      const totalRow = await db.get(
        `
          SELECT COUNT(*) AS total
          FROM papers_fts f
          JOIN papers p ON p.id = f.rowid
          LEFT JOIN paper_extractions e ON e.id = p.latest_extraction_id
          WHERE p.status = ?
            AND f MATCH ?
        `,
        [status, q]
      );
      total = Number(totalRow?.total || 0);
    } catch {
      const { clause, params } = buildQuickSearchClause(q);
      const sqlParams: (string | number)[] = [status, ...params];
      let sql = `
        SELECT p.*, e.provider AS extraction_provider, e.prompt_version AS extraction_prompt_version
        FROM papers AS p
        LEFT JOIN paper_extractions e ON e.id = p.latest_extraction_id
        WHERE p.status = ?
          AND ${clause}
        ORDER BY p.created_at DESC
      `;

      if (limit !== null) {
        sql += ` LIMIT ? OFFSET ?`;
        sqlParams.push(limit, offset);
      }

      papers = await db.all(sql, sqlParams);

      const totalRow = await db.get(
        `
          SELECT COUNT(*) AS total
          FROM papers AS p
          LEFT JOIN paper_extractions e ON e.id = p.latest_extraction_id
          WHERE p.status = ?
            AND ${clause}
        `,
        [status, ...params]
      );
      total = Number(totalRow?.total || 0);
    }
  } else {
    const clauses: string[] = ['p.status = ?'];
    const params: (string | number)[] = [status];

    if (q) {
      const quickSearch = buildQuickSearchClause(q);
      clauses.push(quickSearch.clause);
      params.push(...quickSearch.params);
    }

    for (const field of MULTI_SELECT_SEARCH_FIELDS) {
      const values = advancedFilters[field];
      if (values.length === 0) continue;
      const fieldClause = buildMultiSelectClause(field, values);
      clauses.push(fieldClause.clause);
      params.push(...fieldClause.params);
    }

    papers = await db.all(
      `
        SELECT p.*, e.provider AS extraction_provider, e.prompt_version AS extraction_prompt_version
        FROM papers AS p
        LEFT JOIN paper_extractions e ON e.id = p.latest_extraction_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY p.created_at DESC
      `,
      params
    );

    papers = papers.filter((row) => matchesPublishedDateRange(row, advancedFilters));
    total = papers.length;

    if (limit !== null) {
      papers = papers.slice(offset, offset + limit);
    }
  }

  const parsedPapers = papers.map(parsePaperRow);

  if (limit === null) {
    return NextResponse.json(parsedPapers);
  }

  return NextResponse.json({
    items: parsedPapers,
    total,
    limit,
    offset,
    hasMore: offset + parsedPapers.length < total,
  });
}

export async function POST() {
  const storagePath = process.env.PAPERS_STORAGE_PATH || path.join(process.cwd(), '..', 'papres_storage');
  
  console.log(`Starting background scan for: ${storagePath}`);
  
  const startAttempt = await scanFolder(storagePath);
  if (!startAttempt.started && startAttempt.reason === 'already-running') {
    return NextResponse.json(
      { message: 'A scan is already running.', state: startAttempt.state },
      { status: 409 }
    );
  }

  if (!startAttempt.started && startAttempt.reason === 'missing-folder') {
    return NextResponse.json(
      { message: 'Configured paper storage path was not found.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'Scan started in background. Check the Review Queue in a few minutes.' });
}
