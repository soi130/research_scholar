export type ResearchFactType =
  | 'macro_actual'
  | 'macro_forecast'
  | 'forecast_revision'
  | 'policy_expectation'
  | 'earnings_estimate'
  | 'target_price'
  | 'rating_change'
  | 'thesis'
  | 'catalyst'
  | 'risk'
  | 'market_implication';

export type ResearchFactStance =
  | 'actual'
  | 'forecast'
  | 'revision'
  | 'recommendation'
  | 'scenario'
  | 'opinion';

export type ResearchFactReviewStatus =
  | 'accepted'
  | 'needs_review'
  | 'rejected';

export type ResearchFactAmbiguityFlag =
  | 'missing_subject'
  | 'missing_entity_or_scope'
  | 'missing_metric'
  | 'missing_value'
  | 'missing_unit'
  | 'missing_time_reference'
  | 'missing_evidence_text'
  | 'mixed_actual_and_forecast'
  | 'unclear_number_metric_mapping'
  | 'multiple_numbers_in_sentence'
  | 'multiple_entities_in_context'
  | 'weak_stance_signal'
  | 'table_parse_uncertain'
  | 'ocr_noise'
  | 'unsupported_inference';

export type ResearchFact = {
  source_house: string;
  fact_type: ResearchFactType;
  stance: ResearchFactStance;
  subject: string;
  entity_or_scope: string;
  metric: string;
  value_number: number | null;
  unit: string;
  time_reference: string;
  evidence_text: string;
  evidence_page: number | null;
  confidence: number;
  ambiguity_flags: ResearchFactAmbiguityFlag[];
  review_status: ResearchFactReviewStatus;
};

const VALID_FACT_TYPES = new Set<ResearchFactType>([
  'macro_actual',
  'macro_forecast',
  'forecast_revision',
  'policy_expectation',
  'earnings_estimate',
  'target_price',
  'rating_change',
  'thesis',
  'catalyst',
  'risk',
  'market_implication',
]);

const VALID_STANCES = new Set<ResearchFactStance>([
  'actual',
  'forecast',
  'revision',
  'recommendation',
  'scenario',
  'opinion',
]);

const VALID_REVIEW_STATUSES = new Set<ResearchFactReviewStatus>([
  'accepted',
  'needs_review',
  'rejected',
]);

const VALID_AMBIGUITY_FLAGS = new Set<ResearchFactAmbiguityFlag>([
  'missing_subject',
  'missing_entity_or_scope',
  'missing_metric',
  'missing_value',
  'missing_unit',
  'missing_time_reference',
  'missing_evidence_text',
  'mixed_actual_and_forecast',
  'unclear_number_metric_mapping',
  'multiple_numbers_in_sentence',
  'multiple_entities_in_context',
  'weak_stance_signal',
  'table_parse_uncertain',
  'ocr_noise',
  'unsupported_inference',
]);

const BLOCKER_FLAGS = new Set<ResearchFactAmbiguityFlag>([
  'missing_subject',
  'missing_entity_or_scope',
  'missing_metric',
  'missing_time_reference',
  'missing_evidence_text',
  'mixed_actual_and_forecast',
  'unclear_number_metric_mapping',
  'unsupported_inference',
]);

function normalizeString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeConfidence(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePage(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAmbiguityFlags(value: unknown) {
  if (!Array.isArray(value)) return [] as ResearchFactAmbiguityFlag[];

  const flags = value
    .map((flag) => normalizeString(flag) as ResearchFactAmbiguityFlag)
    .filter((flag) => VALID_AMBIGUITY_FLAGS.has(flag));

  return Array.from(new Set(flags));
}

function inferReviewStatus(
  provided: unknown,
  ambiguityFlags: ResearchFactAmbiguityFlag[],
  confidence: number
): ResearchFactReviewStatus {
  const normalized = normalizeString(provided) as ResearchFactReviewStatus;
  if (VALID_REVIEW_STATUSES.has(normalized)) {
    return normalized;
  }

  if (ambiguityFlags.some((flag) => BLOCKER_FLAGS.has(flag))) {
    return 'needs_review';
  }

  return confidence >= 0.85 ? 'accepted' : 'needs_review';
}

export function normalizeResearchFacts(value: unknown, defaults: { source_house: string }): ResearchFact[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;

      const factType = normalizeString(record.fact_type) as ResearchFactType;
      const stance = normalizeString(record.stance) as ResearchFactStance;
      if (!VALID_FACT_TYPES.has(factType) || !VALID_STANCES.has(stance)) {
        return null;
      }

      const sourceHouse = normalizeString(record.source_house) || defaults.source_house;
      const ambiguityFlags = normalizeAmbiguityFlags(record.ambiguity_flags);
      const confidence = normalizeConfidence(record.confidence);

      const fact: ResearchFact = {
        source_house: sourceHouse,
        fact_type: factType,
        stance,
        subject: normalizeString(record.subject),
        entity_or_scope: normalizeString(record.entity_or_scope),
        metric: normalizeString(record.metric),
        value_number: normalizeNullableNumber(record.value_number),
        unit: normalizeString(record.unit),
        time_reference: normalizeString(record.time_reference),
        evidence_text: normalizeString(record.evidence_text),
        evidence_page: normalizePage(record.evidence_page),
        confidence,
        ambiguity_flags: ambiguityFlags,
        review_status: inferReviewStatus(record.review_status, ambiguityFlags, confidence),
      };

      if (!fact.subject && !fact.ambiguity_flags.includes('missing_subject')) {
        fact.ambiguity_flags.push('missing_subject');
      }
      if (!fact.entity_or_scope && !fact.ambiguity_flags.includes('missing_entity_or_scope')) {
        fact.ambiguity_flags.push('missing_entity_or_scope');
      }
      if (!fact.metric && !fact.ambiguity_flags.includes('missing_metric')) {
        fact.ambiguity_flags.push('missing_metric');
      }
      if (fact.value_number === null && !fact.ambiguity_flags.includes('missing_value')) {
        fact.ambiguity_flags.push('missing_value');
      }
      if (!fact.unit && !fact.ambiguity_flags.includes('missing_unit')) {
        fact.ambiguity_flags.push('missing_unit');
      }
      if (!fact.time_reference && !fact.ambiguity_flags.includes('missing_time_reference')) {
        fact.ambiguity_flags.push('missing_time_reference');
      }
      if (!fact.evidence_text && !fact.ambiguity_flags.includes('missing_evidence_text')) {
        fact.ambiguity_flags.push('missing_evidence_text');
      }

      if (fact.ambiguity_flags.some((flag) => BLOCKER_FLAGS.has(flag))) {
        fact.review_status = 'needs_review';
      }

      return fact;
    })
    .filter((fact): fact is ResearchFact => Boolean(fact));
}

