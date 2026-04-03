import type { Database } from 'sqlite';
import { getForecastIndicatorDefinition, inferForecastIndicatorCode } from './forecast-indicators';

export type ManualKeyCallRecord = {
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
};

function normalizeString(value: unknown) {
  return String(value ?? '').trim();
}

export async function buildManualKeyCallRecord(
  database: Database,
  input: Record<string, unknown>,
  current?: Partial<ManualKeyCallRecord>
): Promise<ManualKeyCallRecord> {
  const incomingPaperId = input.paper_id === null || input.paper_id === undefined || input.paper_id === ''
    ? current?.paper_id ?? null
    : Number(input.paper_id);
  const paperId = Number.isFinite(incomingPaperId) ? Number(incomingPaperId) : null;

  let paperDefaults: { title: string; published_date: string; publisher: string } | null = null;
  if (paperId !== null) {
    const paper = await database.get<{
      title: string | null;
      published_date: string | null;
      publisher: string | null;
    }>(
      `SELECT title, published_date, publisher FROM papers WHERE id = ?`,
      [paperId]
    );
    if (paper) {
      paperDefaults = {
        title: normalizeString(paper.title),
        published_date: normalizeString(paper.published_date),
        publisher: normalizeString(paper.publisher),
      };
    }
  }

  const rawIndicator = normalizeString(input.indicator ?? current?.indicator);
  const indicatorDefinition = getForecastIndicatorDefinition(rawIndicator);
  const normalizedIndicator = indicatorDefinition?.label || rawIndicator;
  const normalizedIndicatorCode = indicatorDefinition?.code || inferForecastIndicatorCode(rawIndicator);

  return {
    paper_id: paperId,
    paper_name: normalizeString(input.paper_name ?? current?.paper_name) || paperDefaults?.title || '',
    publish_date: normalizeString(input.publish_date ?? current?.publish_date) || paperDefaults?.published_date || '',
    indicator: normalizedIndicator,
    indicator_code: normalizedIndicatorCode,
    house: normalizeString(input.house ?? current?.house) || paperDefaults?.publisher || '',
    value: normalizeString(input.value ?? current?.value),
    unit: normalizeString(input.unit ?? current?.unit),
    forecast_period: normalizeString(input.forecast_period ?? current?.forecast_period),
    source_text: normalizeString(input.source_text ?? current?.source_text),
    is_deleted: input.is_deleted === undefined
      ? Number(current?.is_deleted || 0)
      : Number(input.is_deleted) ? 1 : 0,
  };
}

export function validateManualKeyCallRecord(record: ManualKeyCallRecord) {
  if (!record.indicator) return 'Indicator is required.';
  if (!record.house) return 'House is required.';
  if (record.is_deleted) return null;
  if (!record.value) return 'Value is required.';
  if (!record.publish_date) return 'Publish date is required.';
  return null;
}
