import { NextResponse } from 'next/server';
import { getDb, runInTransaction } from '@/lib/db';
import { buildManualKeyCallRecord, validateManualKeyCallRecord } from '@/lib/manual-key-calls';
import { getForecastIndicatorDefinition } from '@/lib/forecast-indicators';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const paperIdParam = searchParams.get('paper_id');
  const indicatorParam = (searchParams.get('indicator') || '').trim();
  const house = (searchParams.get('house') || '').trim().toLowerCase();
  const includeDeleted = searchParams.get('include_deleted') === '1';

  const clauses = ['1 = 1'];
  const params: Array<string | number> = [];

  if (!includeDeleted) {
    clauses.push('m.is_deleted = 0');
  }

  if (paperIdParam) {
    const paperId = Number(paperIdParam);
    if (Number.isFinite(paperId)) {
      clauses.push('m.paper_id = ?');
      params.push(paperId);
    }
  }

  if (indicatorParam) {
    const definition = getForecastIndicatorDefinition(indicatorParam);
    if (definition) {
      clauses.push('m.indicator_code = ?');
      params.push(definition.code);
    } else {
      clauses.push(`LOWER(COALESCE(m.indicator, '')) LIKE ? ESCAPE '\\'`);
      params.push(`%${indicatorParam.toLowerCase().replace(/[%_]/g, '\\$&')}%`);
    }
  }

  if (house) {
    clauses.push(`LOWER(COALESCE(m.house, '')) LIKE ? ESCAPE '\\'`);
    params.push(`%${house.replace(/[%_]/g, '\\$&')}%`);
  }

  const db = await getDb();
  const rows = await db.all(
    `
      SELECT
        m.id,
        m.paper_id,
        m.paper_name,
        m.publish_date,
        m.indicator,
        m.indicator_code,
        m.house,
        m.value,
        m.unit,
        m.forecast_period,
        m.source_text,
        m.source_type,
        m.is_deleted,
        m.created_at,
        m.updated_at
      FROM manual_key_calls m
      WHERE ${clauses.join(' AND ')}
      ORDER BY COALESCE(m.publish_date, '') DESC, m.house ASC, m.indicator ASC, m.id DESC
    `,
    params
  );

  return NextResponse.json(Array.isArray(rows) ? rows : []);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  const result = await runInTransaction(async (db) => {
    const record = await buildManualKeyCallRecord(db, body as Record<string, unknown>);
    const validationError = validateManualKeyCallRecord(record);
    if (validationError) {
      return { type: 'invalid' as const, error: validationError };
    }

    const inserted = await db.run(
      `
        INSERT INTO manual_key_calls (
          paper_id, paper_name, publish_date, indicator, indicator_code, house, value, unit, forecast_period, source_text, source_type, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual_input', ?)
      `,
      [
        record.paper_id,
        record.paper_name,
        record.publish_date,
        record.indicator,
        record.indicator_code,
        record.house,
        record.value,
        record.unit,
        record.forecast_period,
        record.source_text,
        record.is_deleted,
      ]
    );

    const row = await db.get(
      `
        SELECT
          id, paper_id, paper_name, publish_date, indicator, indicator_code, house, value, unit, forecast_period,
          source_text, source_type, is_deleted, created_at, updated_at
        FROM manual_key_calls
        WHERE id = ?
      `,
      [inserted.lastID]
    );

    return { type: 'created' as const, row };
  });

  if (result.type === 'invalid') {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: 'Manual key call created', row: result.row }, { status: 201 });
}
