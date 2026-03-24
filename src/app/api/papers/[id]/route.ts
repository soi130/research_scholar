import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();

  const paper = await db.get('SELECT * FROM papers WHERE id = ?', [id]);
  if (!paper) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
  }

  await db.run('UPDATE papers SET status = ? WHERE id = ?', ['approved', id]);
  console.log(`Paper ${id} approved.`);
  return NextResponse.json({ message: 'Paper approved' });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const db = await getDb();

  const { title, authors, published_date, publisher, series_name, journal, abstract, key_findings, forecasts, tags } = body;

  await db.run(`
    UPDATE papers 
    SET 
      title = ?, authors = ?, published_date = ?,
      publisher = ?, series_name = ?, journal = ?,
      abstract = ?, key_findings = ?, forecasts = ?, tags = ?
    WHERE id = ?
  `, [
    title,
    JSON.stringify(authors || []),
    published_date,
    publisher,
    series_name,
    journal,
    abstract,
    JSON.stringify(key_findings || []),
    JSON.stringify(forecasts || {}),
    JSON.stringify(tags || []),
    id
  ]);

  return NextResponse.json({ message: 'Paper updated' });
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  const paper = await db.get('SELECT * FROM papers WHERE id = ?', [id]);
  if (!paper) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
  }
  return NextResponse.json({
    ...paper,
    authors: paper.authors ? JSON.parse(paper.authors) : [],
    key_findings: paper.key_findings ? JSON.parse(paper.key_findings) : [],
    tags: paper.tags ? JSON.parse(paper.tags) : [],
    forecasts: paper.forecasts ? JSON.parse(paper.forecasts) : {},
  });
}
