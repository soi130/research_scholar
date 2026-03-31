import { NextResponse } from 'next/server';
import { getDb, runInTransaction } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

function paperResponse(paper: Record<string, unknown>) {
  return {
    ...paper,
    authors: paper.authors ? JSON.parse(String(paper.authors)) : [],
    key_findings: paper.key_findings ? JSON.parse(String(paper.key_findings)) : [],
    tags: paper.tags ? JSON.parse(String(paper.tags)) : [],
    forecasts: paper.forecasts ? JSON.parse(String(paper.forecasts)) : {},
  };
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const expectedUpdatedAt = typeof body?.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null;

  const result = await runInTransaction(async (db) => {
    const paper = await db.get<Record<string, unknown>>('SELECT * FROM papers WHERE id = ?', [id]);
    if (!paper) {
      return { type: 'missing' as const };
    }

    if (expectedUpdatedAt && String(paper.updated_at || '') !== expectedUpdatedAt) {
      return { type: 'conflict' as const, paper };
    }

    await db.run(
      `UPDATE papers
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ['approved', id]
    );

    const updated = await db.get<Record<string, unknown>>('SELECT * FROM papers WHERE id = ?', [id]);
    return { type: 'updated' as const, paper: updated! };
  });

  if (result.type === 'missing') {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
  }

  if (result.type === 'conflict') {
    return NextResponse.json(
      { error: 'Paper was updated by another reviewer.', paper: paperResponse(result.paper) },
      { status: 409 }
    );
  }

  console.log(`Paper ${id} approved.`);
  return NextResponse.json({ message: 'Paper approved', paper: paperResponse(result.paper) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const {
    title,
    authors,
    published_date,
    publisher,
    series_name,
    journal,
    abstract,
    key_findings,
    forecasts,
    tags,
    expectedUpdatedAt,
  } = body;

  const result = await runInTransaction(async (db) => {
    const current = await db.get<Record<string, unknown>>('SELECT * FROM papers WHERE id = ?', [id]);
    if (!current) {
      return { type: 'missing' as const };
    }

    if (expectedUpdatedAt && String(current.updated_at || '') !== expectedUpdatedAt) {
      return { type: 'conflict' as const, paper: current };
    }

    await db.run(`
      UPDATE papers 
      SET 
        title = ?, authors = ?, published_date = ?,
        publisher = ?, series_name = ?, journal = ?,
        abstract = ?, key_findings = ?, forecasts = ?, tags = ?,
        updated_at = CURRENT_TIMESTAMP
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

    const updated = await db.get<Record<string, unknown>>('SELECT * FROM papers WHERE id = ?', [id]);
    return { type: 'updated' as const, paper: updated! };
  });

  if (result.type === 'missing') {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
  }

  if (result.type === 'conflict') {
    return NextResponse.json(
      { error: 'Paper was updated by another reviewer.', paper: paperResponse(result.paper) },
      { status: 409 }
    );
  }

  return NextResponse.json({ message: 'Paper updated', paper: paperResponse(result.paper) });
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  const paper = await db.get('SELECT * FROM papers WHERE id = ?', [id]);
  if (!paper) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
  }
  return NextResponse.json(paperResponse(paper));
}
