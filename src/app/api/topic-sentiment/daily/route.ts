import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { aggregateTopicSentiment, normalizeTopicLabel, type TopicLabel } from '@/lib/topic-sentiment';

type TopicLabelRow = {
  topic_code: string;
  relevance: number;
  direction: number;
  confidence: number;
  evidence: string;
  regime: string | null;
  drivers: string | null;
  display_json: string | null;
};

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedDate = (searchParams.get('date') || '').trim();
  const db = await getDb();

  const rows = await db.all<(TopicLabelRow & { published_date: string | null })[]>(
    `
      SELECT p.published_date, l.topic_code, l.relevance, l.direction, l.confidence, l.evidence, l.regime, l.drivers, l.display_json
      FROM paper_topic_labels l
      JOIN papers p ON p.id = l.paper_id
      WHERE p.status = 'approved'
      ORDER BY p.published_date DESC, l.topic_code ASC
    `
  );

  const buckets = new Map<string, TopicLabel[]>();

  for (const row of rows) {
    const normalizedDate = normalizePublishedDate(row.published_date);
    if (!normalizedDate) continue;
    if (requestedDate && normalizedDate !== requestedDate) continue;

    const normalizedLabel = normalizeTopicLabel({
      topic: row.topic_code,
      relevance: row.relevance,
      direction: row.direction,
      confidence: row.confidence,
      evidence: row.evidence,
      regime: row.regime,
      drivers: row.drivers ? JSON.parse(row.drivers) : [],
    });
    if (!normalizedLabel) continue;

    const bucket = buckets.get(normalizedDate) || [];
    bucket.push({
      ...normalizedLabel,
      display: row.display_json ? JSON.parse(row.display_json) : normalizedLabel.display,
    });
    buckets.set(normalizedDate, bucket);
  }

  const dates = Array.from(buckets.keys()).sort((left, right) => right.localeCompare(left));
  const payload = dates.map((date) => ({
    date,
    topics: aggregateTopicSentiment(buckets.get(date) || []),
  }));

  if (requestedDate) {
    return NextResponse.json(payload[0] || { date: requestedDate, topics: [] });
  }

  return NextResponse.json(payload);
}
