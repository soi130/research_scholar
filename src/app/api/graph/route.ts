import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildKnowledgeGraph, type PaperGraphSource } from '@/lib/graph';

function clampLimit(value: number | null, fallback: number, max: number) {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.min(Math.max(Number(value), 10), max);
}

function splitSearchTerms(value: string | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 6);
}

function collectFocusedTerms(paper: PaperGraphSource & { filename?: string | null; journal?: string | null }): string[] {
  const terms = new Set<string>();

  const add = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }

    const text = String(value).trim();
    if (!text) return;

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        parsed
          .map((item) => String(item).trim().toLowerCase())
          .filter((item) => item.length >= 2)
          .forEach((item) => terms.add(item));
        return;
      }
    } catch {
      // Fall back to comma-separated parsing below.
    }

    text
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((item) => item.replace(/^["']|["']$/g, '').trim().toLowerCase())
      .filter((item) => item.length >= 2)
      .forEach((item) => terms.add(item));
  };

  add(paper.title);
  add(paper.authors);
  add(paper.publisher);
  add(paper.series_name);
  add(paper.tags);
  add(paper.journal);

  return Array.from(terms).slice(0, 8);
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeDateFilter(value: string | null): string | null {
  if (!value) return null;
  const normalized = toIsoDate(value);
  return normalized;
}

function applyTemporalFilters(
  papers: Array<PaperGraphSource & { created_at?: string | null }>,
  options: { from: string | null; to: string | null; asOf: string | null }
): Array<PaperGraphSource & { created_at?: string | null }> {
  const effectiveTo = options.asOf || options.to;
  return papers.filter((paper) => {
    const paperDate = toIsoDate(paper.published_date) || toIsoDate(paper.created_at || null);
    if (!paperDate) return true;
    if (options.from && paperDate < options.from) return false;
    if (effectiveTo && paperDate > effectiveTo) return false;
    return true;
  });
}

function buildSearchClause(terms: string[]) {
  const columns = ['title', 'authors', 'publisher', 'series_name', 'abstract', 'tags'];
  const clauses: string[] = [];
  const params: string[] = [];

  for (const term of terms) {
    const pattern = `%${term.replace(/[%_]/g, '\\$&')}%`;
    const termClause = columns.map((column) => `LOWER(COALESCE(${column}, '')) LIKE ? ESCAPE '\\'`).join(' OR ');
    clauses.push(`(${termClause})`);
    params.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  return {
    clause: clauses.length > 0 ? clauses.join(' OR ') : '',
    params,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'approved';
  const q = searchParams.get('q');
  const tag = searchParams.get('tag');
  const paperId = searchParams.get('paperId');
  const limit = clampLimit(Number.parseInt(searchParams.get('limit') || '', 10), 120, 240);
  const asOf = normalizeDateFilter(searchParams.get('asOf'));
  const from = normalizeDateFilter(searchParams.get('from'));
  const to = normalizeDateFilter(searchParams.get('to'));

  const db = await getDb();

  let papers: Array<PaperGraphSource & { created_at?: string | null }> = [];

  if (paperId) {
    const center = await db.get<PaperGraphSource & { created_at?: string | null }>(
      `
        SELECT id, title, authors, publisher, series_name, published_date, abstract, tags, status, created_at
        FROM papers
        WHERE id = ? AND status = ?
      `,
      [paperId, status]
    );

    if (!center) {
      return NextResponse.json({
        nodes: [],
        edges: [],
        stats: { papers: 0, nodes: 0, edges: 0, relations: { authored_by: 0, tagged_with: 0, published_by: 0, series_of: 0, related_to: 0 } },
        focusRequired: false,
      });
    }

    const centeredTerms = collectFocusedTerms(center as PaperGraphSource & { journal?: string | null });
    const { clause, params } = buildSearchClause(centeredTerms);

    if (clause) {
      const related = await db.all<PaperGraphSource>(
        `
          SELECT id, title, authors, publisher, series_name, published_date, abstract, tags, status, created_at
          FROM papers
          WHERE status = ?
            AND id != ?
            AND (${clause})
          ORDER BY created_at DESC
          LIMIT ?
        `,
        [status, paperId, ...params, Math.max(limit - 1, 0)]
      );

      papers = [center, ...related];
    } else {
      papers = [center];
    }
    papers = applyTemporalFilters(papers, { from, to, asOf });
  } else {
    const queryTerms = splitSearchTerms(q);
    const tagTerms = splitSearchTerms(tag);
    const clauses: string[] = [];
    const params: string[] = [status];

    if (queryTerms.length > 0) {
      const { clause: queryClause, params: queryParams } = buildSearchClause(queryTerms);
      if (queryClause) {
        clauses.push(`(${queryClause})`);
        params.push(...queryParams);
      }
    }

    if (tagTerms.length > 0) {
      const { clause: tagClause, params: tagParams } = buildSearchClause(tagTerms);
      if (tagClause) {
        clauses.push(`(${tagClause})`);
        params.push(...tagParams);
      }
    }

    if (clauses.length === 0) {
      return NextResponse.json({
        nodes: [],
        edges: [],
        stats: { papers: 0, nodes: 0, edges: 0, relations: { authored_by: 0, tagged_with: 0, published_by: 0, series_of: 0, related_to: 0 } },
        focusRequired: true,
      });
    }

    papers = await db.all<PaperGraphSource & { created_at?: string | null }>(
      `
        SELECT id, title, authors, publisher, series_name, published_date, abstract, tags, status, created_at
        FROM papers
        WHERE status = ?
          AND (${clauses.join(' AND ')})
        ORDER BY created_at DESC
        LIMIT ?
      `,
      [...params, limit]
    );
    papers = applyTemporalFilters(papers, { from, to, asOf });
  }

  const graph = buildKnowledgeGraph(papers as PaperGraphSource[]);
  graph.time = {
    ...graph.time,
    from: from || graph.time.from,
    to: (asOf || to) || graph.time.to,
    asOf: asOf || graph.time.asOf,
  };
  return NextResponse.json(graph);
}
