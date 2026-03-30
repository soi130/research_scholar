import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { scanFolder } from '@/lib/ingest';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'approved';
  const q = (searchParams.get('q') || '').trim();
  const limitParam = Number.parseInt(searchParams.get('limit') || '', 10);
  const offsetParam = Number.parseInt(searchParams.get('offset') || '', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : null;
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;
  
  const db = await getDb();
  type PaperRow = Record<string, unknown>;
  let papers: PaperRow[] = [];
  let total = 0;

  if (q) {
    try {
      const filters = ['p.status = ?'];
      const params: (string | number)[] = [status, q];

      let sql = `
        SELECT p.*
        FROM papers_fts f
        JOIN papers p ON p.id = f.rowid
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
          WHERE p.status = ?
            AND f MATCH ?
        `,
        [status, q]
      );
      total = Number(totalRow?.total || 0);
    } catch {
      const like = `%${q.toLowerCase()}%`;
      const params: (string | number)[] = [status, like, like, like, like, like];
      let sql = `
        SELECT *
        FROM papers
        WHERE status = ?
          AND (
            LOWER(title) LIKE ?
            OR LOWER(authors) LIKE ?
            OR LOWER(publisher) LIKE ?
            OR LOWER(tags) LIKE ?
            OR LOWER(abstract) LIKE ?
          )
        ORDER BY created_at DESC
      `;
      if (limit !== null) {
        sql += ` LIMIT ? OFFSET ?`;
        params.push(limit, offset);
      }
      papers = await db.all(sql, params);

      const totalRow = await db.get(
        `
          SELECT COUNT(*) AS total
          FROM papers
          WHERE status = ?
            AND (
              LOWER(title) LIKE ?
              OR LOWER(authors) LIKE ?
              OR LOWER(publisher) LIKE ?
              OR LOWER(tags) LIKE ?
              OR LOWER(abstract) LIKE ?
            )
        `,
        [status, like, like, like, like, like]
      );
      total = Number(totalRow?.total || 0);
    }
  } else {
    const baseParams: (string | number)[] = [status];
    let sql = `SELECT * FROM papers WHERE status = ? ORDER BY created_at DESC`;

    if (limit !== null) {
      sql += ` LIMIT ? OFFSET ?`;
      baseParams.push(limit, offset);
    }

    papers = await db.all(sql, baseParams);
    const totalRow = await db.get(`SELECT COUNT(*) AS total FROM papers WHERE status = ?`, [status]);
    total = Number(totalRow?.total || 0);
  }
  
  const parsedPapers = papers.map((p) => ({
    ...p,
    authors: p.authors ? JSON.parse(String(p.authors)) : [],
    key_findings: p.key_findings ? JSON.parse(String(p.key_findings)) : [],
    tags: p.tags ? JSON.parse(String(p.tags)) : [],
    forecasts: p.forecasts ? JSON.parse(String(p.forecasts)) : {},
  }));

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

export async function POST(request: Request) {
  const storagePath = process.env.PAPERS_STORAGE_PATH || path.join(process.cwd(), '..', 'papres_storage');
  
  console.log(`Starting background scan for: ${storagePath}`);
  
  // Fire-and-forget — do NOT await. The request returns immediately.
  scanFolder(storagePath).catch(err => console.error('Scan error:', err));
  
  return NextResponse.json({ message: 'Scan started in background. Check the Review Queue in a few minutes.' });
}
