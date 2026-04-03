import type { Database } from 'sqlite';
import { FORECAST_INDICATORS, inferForecastIndicatorCode } from './forecast-indicators';

type StoredKeyCallRow = {
  publish_date: string;
  indicator: string;
  house: string;
  value: string;
  unit: string;
  forecast_period: string;
  source_text: string;
};

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

type StoredForecastEntry = {
  value: string;
  unit: string;
  forecast_period: string;
};

export function normalizeStoredKeyCalls(value: unknown, defaults: { publish_date: string; house: string }): StoredKeyCallRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const record = row as Record<string, unknown>;
      const indicator = normalizeString(record.indicator);
      const rowValue = normalizeString(record.value);
      if (!indicator || !rowValue) return null;

      return {
        publish_date: normalizeString(record.publish_date) || defaults.publish_date,
        indicator,
        house: normalizeString(record.house) || defaults.house,
        value: rowValue,
        unit: normalizeString(record.unit),
        forecast_period: normalizeString(record.forecast_period),
        source_text: normalizeString(record.source_text),
      };
    })
    .filter((row): row is StoredKeyCallRow => Boolean(row));
}

function normalizeStoredForecasts(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, StoredForecastEntry>;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, rawValue]) => {
        const normalizedKey = normalizeString(key);
        if (!normalizedKey) return null;

        if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
          const record = rawValue as Record<string, unknown>;
          const entry = {
            value: normalizeString(record.value),
            unit: normalizeString(record.unit),
            forecast_period: normalizeString(record.forecast_period),
          };
          return entry.value ? [normalizedKey, entry] : null;
        }

        const normalizedValue = normalizeString(rawValue);
        if (!normalizedValue) return null;

        return [
          normalizedKey,
          {
            value: normalizedValue,
            unit: '',
            forecast_period: '',
          },
        ];
      })
      .filter((entry): entry is [string, StoredForecastEntry] => Boolean(entry))
  );
}

function buildKeyCallsFromForecasts(
  forecasts: Record<string, StoredForecastEntry>,
  defaults: { publish_date: string; house: string }
): StoredKeyCallRow[] {
  return FORECAST_INDICATORS.flatMap((indicator) => {
    const matchingEntry = Object.entries(forecasts).find(([key]) => inferForecastIndicatorCode(key) === indicator.code);
    if (!matchingEntry) return [];

    const [, forecast] = matchingEntry;
    return [
      {
        publish_date: defaults.publish_date,
        indicator: indicator.label,
        house: defaults.house,
        value: forecast.value,
        unit: forecast.unit,
        forecast_period: forecast.forecast_period,
        source_text: 'Manual review edit',
      },
    ];
  });
}

export async function syncPaperKeyCalls(database: Database, paperId: number) {
  const paper = await database.get<{
    id: number;
    title: string | null;
    filepath: string | null;
    published_date: string | null;
    publisher: string | null;
    forecasts: string | null;
    latest_extraction_id: number | null;
  }>(
    `
      SELECT id, title, filepath, published_date, publisher, forecasts, latest_extraction_id
      FROM papers
      WHERE id = ?
    `,
    [paperId]
  );

  if (!paper) return;

  await database.run(`DELETE FROM paper_key_calls WHERE paper_id = ?`, [paperId]);

  const latestExtractionId = Number(paper.latest_extraction_id || 0);
  if (!Number.isFinite(latestExtractionId) || latestExtractionId <= 0) return;

  const extraction = await database.get<{ extraction_payload: string | null }>(
    `
      SELECT extraction_payload
      FROM paper_extractions
      WHERE id = ?
    `,
    [latestExtractionId]
  );

  if (!extraction?.extraction_payload) return;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(extraction.extraction_payload) as Record<string, unknown>;
  } catch {
    return;
  }

  const keyCalls = normalizeStoredKeyCalls(payload.key_calls, {
    publish_date: normalizeString(paper.published_date),
    house: normalizeString(paper.publisher),
  });
  const normalizedForecasts = normalizeStoredForecasts(
    paper.forecasts ? JSON.parse(paper.forecasts) : {}
  );
  const manualKeyCalls = buildKeyCallsFromForecasts(normalizedForecasts, {
    publish_date: normalizeString(paper.published_date),
    house: normalizeString(paper.publisher),
  });
  const manualCodes = new Set(
    manualKeyCalls
      .map((keyCall) => inferForecastIndicatorCode(keyCall.indicator))
      .filter((code): code is NonNullable<ReturnType<typeof inferForecastIndicatorCode>> => Boolean(code))
  );
  const extractedKeyCalls = keyCalls.filter((keyCall) => {
    const code = inferForecastIndicatorCode(keyCall.indicator);
    return !(code && manualCodes.has(code));
  });
  const rowsToInsert = [...manualKeyCalls, ...extractedKeyCalls];

  for (const keyCall of rowsToInsert) {
    await database.run(
      `
        INSERT INTO paper_key_calls (
          paper_id, paper_name, filepath, publish_date, indicator, indicator_code, house, value, unit, forecast_period, source_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        paperId,
        normalizeString(paper.title),
        normalizeString(paper.filepath),
        keyCall.publish_date,
        keyCall.indicator,
        inferForecastIndicatorCode(keyCall.indicator),
        keyCall.house,
        keyCall.value,
        keyCall.unit,
        keyCall.forecast_period,
        keyCall.source_text,
      ]
    );
  }
}
