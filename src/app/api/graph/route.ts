import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildKnowledgeGraph, type PaperGraphSource } from '@/lib/graph';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'approved';

  const db = await getDb();
  const papers = await db.all(
    `
      SELECT id, title, authors, publisher, series_name, published_date, abstract, tags, status
      FROM papers
      WHERE status = ?
      ORDER BY created_at DESC
    `,
    [status]
  );

  const graph = buildKnowledgeGraph(papers as PaperGraphSource[]);
  return NextResponse.json(graph);
}
