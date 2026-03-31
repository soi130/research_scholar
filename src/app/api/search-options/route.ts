import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  DEFAULT_PUBLISHED_FROM,
  DEFAULT_PUBLISHED_TO,
  type MultiSelectSearchField,
  type SearchOptions,
} from '@/lib/search';

function safeParseList(value: unknown): string[] {
  if (!value) return [];
  const text = String(value).trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Fall through to comma-separated parsing.
  }

  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  const isoPrefix = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function sortAlphabetically(values: Iterable<string>) {
  return Array.from(values).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

export async function GET() {
  const db = await getDb();
  const paperRows = await db.all<{
    authors: string | null;
    publisher: string | null;
    series_name: string | null;
    tags: string | null;
    published_date: string | null;
  }>(`
    SELECT authors, publisher, series_name, tags, published_date
    FROM papers
  `);
  const papers = Array.isArray(paperRows) ? paperRows : [];

  const collected: Record<MultiSelectSearchField, Set<string>> = {
    authors: new Set<string>(),
    publisher: new Set<string>(),
    series_name: new Set<string>(),
    tags: new Set<string>(),
  };
  const dates: string[] = [];

  for (const paper of papers) {
    safeParseList(paper.authors).forEach((value) => collected.authors.add(value));
    safeParseList(paper.tags).forEach((value) => collected.tags.add(value));
    if (paper.publisher?.trim()) collected.publisher.add(paper.publisher.trim());
    if (paper.series_name?.trim()) collected.series_name.add(paper.series_name.trim());

    const normalizedDate = normalizeDate(paper.published_date);
    if (normalizedDate) dates.push(normalizedDate);
  }

  const minDate = dates.length > 0 ? dates.reduce((min, current) => (current < min ? current : min)) : DEFAULT_PUBLISHED_FROM;
  const maxDate = dates.length > 0 ? dates.reduce((max, current) => (current > max ? current : max)) : DEFAULT_PUBLISHED_TO;

  const response: SearchOptions = {
    authors: sortAlphabetically(collected.authors),
    publisher: sortAlphabetically(collected.publisher),
    series_name: sortAlphabetically(collected.series_name),
    tags: sortAlphabetically(collected.tags),
    dateBounds: {
      min: minDate < DEFAULT_PUBLISHED_FROM ? minDate : DEFAULT_PUBLISHED_FROM,
      max: maxDate > DEFAULT_PUBLISHED_TO ? maxDate : DEFAULT_PUBLISHED_TO,
    },
  };

  return NextResponse.json(response);
}
