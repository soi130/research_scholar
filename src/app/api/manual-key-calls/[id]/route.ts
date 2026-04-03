import { NextResponse } from 'next/server';
import { getDb, runInTransaction } from '@/lib/db';
import { buildManualKeyCallRecord, validateManualKeyCallRecord } from '@/lib/manual-key-calls';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  const row = await db.get(
    `
      SELECT
        id, paper_id, paper_name, publish_date, indicator, indicator_code, house, value, unit, forecast_period,
        source_text, source_type, is_deleted, created_at, updated_at
      FROM manual_key_calls
      WHERE id = ?
    `,
    [id]
  );

  if (!row) {
    return NextResponse.json({ error: 'Manual key call not found' }, { status: 404 });
  }

  return NextResponse.json(row);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const result = await runInTransaction(async (db) => {
    const current = await db.get<{
      id: number;
      paper_id: number | null;
      paper_name: string;
      publish_date: string;
      indicator: string;
      indicator_code: string | null;
      house: string;
      value: string;
      unit: string;
      forecast_period: string;
      source_text: string;
      is_deleted: number;
    }>(
      `
        SELECT id, paper_id, paper_name, publish_date, indicator, indicator_code, house, value, unit, forecast_period, source_text, is_deleted
        FROM manual_key_calls
        WHERE id = ?
      `,
      [id]
    );

    if (!current) return { type: 'missing' as const };

    const record = await buildManualKeyCallRecord(db, body as Record<string, unknown>, current);
    const validationError = validateManualKeyCallRecord(record);
    if (validationError) return { type: 'invalid' as const, error: validationError };

    await db.run(
      `
        UPDATE manual_key_calls
        SET
          paper_id = ?,
          paper_name = ?,
          publish_date = ?,
          indicator = ?,
          indicator_code = ?,
          house = ?,
          value = ?,
          unit = ?,
          forecast_period = ?,
          source_text = ?,
          is_deleted = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
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
        id,
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
      [id]
    );

    return { type: 'updated' as const, row };
  });

  if (result.type === 'missing') {
    return NextResponse.json({ error: 'Manual key call not found' }, { status: 404 });
  }
  if (result.type === 'invalid') {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: 'Manual key call updated', row: result.row });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;

  const result = await runInTransaction(async (db) => {
    const existing = await db.get(`SELECT id FROM manual_key_calls WHERE id = ?`, [id]);
    if (!existing) return { type: 'missing' as const };

    await db.run(
      `
        UPDATE manual_key_calls
        SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [id]
    );
    return { type: 'deleted' as const };
  });

  if (result.type === 'missing') {
    return NextResponse.json({ error: 'Manual key call not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'Manual key call deleted' });
}
