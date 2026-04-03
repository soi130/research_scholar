import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getForecastIndicatorDefinition, getForecastIndicatorOptions } from '@/lib/forecast-indicators';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const indicatorParam = (searchParams.get('indicator') || '').trim();
  const status = (searchParams.get('status') || '').trim();

  if (!indicatorParam) {
    return NextResponse.json(
      {
        error: 'Missing indicator parameter.',
        supported_indicators: getForecastIndicatorOptions(),
      },
      { status: 400 }
    );
  }

  const indicator = getForecastIndicatorDefinition(indicatorParam);
  if (!indicator) {
    return NextResponse.json(
      {
        error: 'Unsupported indicator parameter.',
        supported_indicators: getForecastIndicatorOptions(),
      },
      { status: 400 }
    );
  }

  const db = await getDb();
  const extractedClauses = [`k.indicator_code = ?`, `TRIM(COALESCE(k.house, '')) <> ''`];
  const manualClauses = [`m.indicator_code = ?`, `TRIM(COALESCE(m.house, '')) <> ''`];
  const params: Array<string | number> = [indicator.code];
  const manualParams: Array<string | number> = [indicator.code];

  if (status) {
    extractedClauses.push('p.status = ?');
    params.push(status);
  }

  const rows = await db.all(
    `
      WITH extracted_rows AS (
        SELECT
          k.id,
          k.paper_id,
          k.paper_name,
          k.filepath,
          COALESCE(NULLIF(k.publish_date, ''), p.published_date) AS effective_date,
          k.publish_date,
          k.indicator,
          k.indicator_code,
          k.house,
          k.value,
          k.unit,
          k.forecast_period,
          k.source_text,
          p.published_date AS paper_published_date,
          'extracted' AS source_type,
          0 AS is_deleted,
          k.created_at AS created_at,
          k.created_at AS updated_at
        FROM paper_key_calls k
        JOIN papers p ON p.id = k.paper_id
        WHERE ${extractedClauses.join(' AND ')}
      ),
      manual_rows AS (
        SELECT
          m.id,
          m.paper_id,
          m.paper_name,
          p.filepath AS filepath,
          COALESCE(NULLIF(m.publish_date, ''), p.published_date) AS effective_date,
          m.publish_date,
          m.indicator,
          m.indicator_code,
          m.house,
          m.value,
          m.unit,
          m.forecast_period,
          m.source_text,
          p.published_date AS paper_published_date,
          m.source_type AS source_type,
          m.is_deleted AS is_deleted,
          m.created_at AS created_at,
          m.updated_at AS updated_at
        FROM manual_key_calls m
        LEFT JOIN papers p ON p.id = m.paper_id
        WHERE ${manualClauses.join(' AND ')}
      ),
      merged_rows AS (
        SELECT
          *,
          1 AS source_priority
        FROM manual_rows
        UNION ALL
        SELECT
          *,
          2 AS source_priority
        FROM extracted_rows
      ),
      effective_rows AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY
              LOWER(TRIM(COALESCE(house, ''))),
              COALESCE(indicator_code, ''),
              LOWER(TRIM(COALESCE(forecast_period, '')))
            ORDER BY source_priority ASC, effective_date DESC, updated_at DESC, id DESC
          ) AS row_num
        FROM merged_rows
      ),
      latest_by_house AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(COALESCE(house, '')))
            ORDER BY effective_date DESC, updated_at DESC, id DESC
          ) AS house_row_num
        FROM effective_rows
        WHERE row_num = 1 AND is_deleted = 0
      )
      SELECT
        id,
        paper_id,
        paper_name,
        filepath,
        effective_date AS as_of_date,
        publish_date,
        paper_published_date,
        indicator,
        indicator_code,
        house,
        value,
        unit,
        forecast_period,
        source_text,
        source_type,
        is_deleted,
        created_at,
        updated_at
      FROM latest_by_house
      WHERE house_row_num = 1
      ORDER BY house ASC
    `,
    [...params, ...manualParams]
  );

  const allRows = await db.all(
    `
      WITH extracted_rows AS (
        SELECT
          k.id,
          k.paper_id,
          k.paper_name,
          k.filepath,
          COALESCE(NULLIF(k.publish_date, ''), p.published_date) AS effective_date,
          k.publish_date,
          k.indicator,
          k.indicator_code,
          k.house,
          k.value,
          k.unit,
          k.forecast_period,
          k.source_text,
          p.published_date AS paper_published_date,
          'extracted' AS source_type,
          0 AS is_deleted,
          k.created_at AS created_at,
          k.created_at AS updated_at
        FROM paper_key_calls k
        JOIN papers p ON p.id = k.paper_id
        WHERE ${extractedClauses.join(' AND ')}
      ),
      manual_rows AS (
        SELECT
          m.id,
          m.paper_id,
          m.paper_name,
          p.filepath AS filepath,
          COALESCE(NULLIF(m.publish_date, ''), p.published_date) AS effective_date,
          m.publish_date,
          m.indicator,
          m.indicator_code,
          m.house,
          m.value,
          m.unit,
          m.forecast_period,
          m.source_text,
          p.published_date AS paper_published_date,
          m.source_type AS source_type,
          m.is_deleted AS is_deleted,
          m.created_at AS created_at,
          m.updated_at AS updated_at
        FROM manual_key_calls m
        LEFT JOIN papers p ON p.id = m.paper_id
        WHERE ${manualClauses.join(' AND ')}
      ),
      merged_rows AS (
        SELECT
          *,
          1 AS source_priority
        FROM manual_rows
        UNION ALL
        SELECT
          *,
          2 AS source_priority
        FROM extracted_rows
      ),
      effective_rows AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY
              LOWER(TRIM(COALESCE(house, ''))),
              COALESCE(indicator_code, ''),
              LOWER(TRIM(COALESCE(forecast_period, '')))
            ORDER BY source_priority ASC, effective_date DESC, updated_at DESC, id DESC
          ) AS row_num
        FROM merged_rows
      )
      SELECT
        id,
        paper_id,
        paper_name,
        filepath,
        effective_date AS as_of_date,
        publish_date,
        paper_published_date,
        indicator,
        indicator_code,
        house,
        value,
        unit,
        forecast_period,
        source_text,
        source_type,
        is_deleted,
        created_at,
        updated_at
      FROM effective_rows
      WHERE row_num = 1 AND is_deleted = 0
      ORDER BY house ASC, as_of_date DESC, forecast_period ASC, id DESC
    `,
    [...params, ...manualParams]
  );

  return NextResponse.json({
    supported_indicators: getForecastIndicatorOptions(),
    indicator: {
      code: indicator.code,
      label: indicator.label,
    },
    rows: Array.isArray(rows) ? rows : [],
    all_rows: Array.isArray(allRows) ? allRows : [],
  });
}
