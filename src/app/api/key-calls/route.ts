import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || '').trim();
  const indicator = (searchParams.get('indicator') || '').trim().toLowerCase();
  const house = (searchParams.get('house') || '').trim().toLowerCase();
  const limitParam = Number.parseInt(searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200;

  const db = await getDb();
  const clauses = ['1 = 1'];
  const params: Array<string | number> = [];

  if (status) {
    clauses.push('p.status = ?');
    params.push(status);
  }

  if (indicator) {
    clauses.push(`LOWER(COALESCE(k.indicator, '')) LIKE ? ESCAPE '\\'`);
    params.push(`%${indicator.replace(/[%_]/g, '\\$&')}%`);
  }

  if (house) {
    clauses.push(`LOWER(COALESCE(k.house, '')) LIKE ? ESCAPE '\\'`);
    params.push(`%${house.replace(/[%_]/g, '\\$&')}%`);
  }

  const rows = await db.all(
    `
      SELECT
        k.id,
        k.paper_id,
        k.paper_name,
        k.filepath,
        k.publish_date,
        k.indicator,
        k.indicator_code,
        k.house,
        k.value,
        k.unit,
        k.forecast_period,
        k.source_text
      FROM paper_key_calls k
      JOIN papers p ON p.id = k.paper_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY COALESCE(k.publish_date, p.published_date) DESC, k.house ASC, k.indicator ASC
      LIMIT ?
    `,
    [...params, limit]
  );

  return NextResponse.json(Array.isArray(rows) ? rows : []);
}
