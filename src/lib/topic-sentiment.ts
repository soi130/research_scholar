import { FX_DRIVER_OPTIONS, TOPIC_LABELS, type FxDriver, type FxRegime, type TopicCode } from './topic-taxonomy';

export type TopicDisplayLabel = 'Negative' | 'Neutral / Mixed' | 'Positive';

export type TopicLabel = {
  topic: TopicCode;
  relevance: number;
  direction: number;
  confidence: number;
  evidence: string;
  regime?: FxRegime | null;
  drivers?: FxDriver[];
  display?: {
    pair_move?: 'USDTHB_up' | 'USDTHB_down' | 'USDTHB_neutral';
    thb_view?: 'THB_weaker' | 'THB_stronger' | 'THB_neutral';
    label?: string;
  };
};

export type TopicSummary = {
  core_topics: TopicCode[];
  top_positive_topics: TopicCode[];
  top_negative_topics: TopicCode[];
};

export type DailyTopicAggregate = {
  topic: TopicCode;
  coverage_count: number;
  weighted_sentiment: number;
  average_confidence: number;
  bullish_count: number;
  bearish_count: number;
  neutral_count: number;
  dispersion: number;
};

type RawTopicLabel = Record<string, unknown>;

function clampInteger(value: unknown, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(Math.round(numeric), min), max);
}

function normalizeEvidence(value: unknown, topic: TopicCode, relevance: number) {
  const text = String(value ?? '').trim();
  if (relevance === 0) return '';
  return text || `${TOPIC_LABELS[topic]} is discussed in the paper.`;
}

function normalizeDrivers(value: unknown) {
  if (!Array.isArray(value)) return [] as FxDriver[];
  const allowed = new Set<string>(FX_DRIVER_OPTIONS);
  return value
    .map((item) => String(item || '').trim())
    .filter((item): item is FxDriver => allowed.has(item))
    .slice(0, 6);
}

function normalizeFxDisplay(topic: TopicCode, direction: number) {
  if (topic !== 'FX_USDTHB') return undefined;
  if (direction > 0) {
    return {
      pair_move: 'USDTHB_up' as const,
      thb_view: 'THB_weaker' as const,
      label: 'USD/THB: THB weaker',
    };
  }
  if (direction < 0) {
    return {
      pair_move: 'USDTHB_down' as const,
      thb_view: 'THB_stronger' as const,
      label: 'USD/THB: THB stronger',
    };
  }
  return {
    pair_move: 'USDTHB_neutral' as const,
    thb_view: 'THB_neutral' as const,
    label: 'USD/THB: Neutral',
  };
}

function normalizeRegime(value: unknown): FxRegime | null {
  const text = String(value ?? '').trim();
  if (text === 'range_bound' || text === 'trending' || text === 'volatile' || text === 'event_driven') {
    return text;
  }
  return null;
}

function inferUsdThbDirectionFromEvidence(evidence: string) {
  const normalized = evidence.toLowerCase();
  if (!normalized) return null;

  const strongerSignals = [
    'thb stronger',
    'baht stronger',
    'thb strength',
    'baht strength',
    'thb appreciation',
    'baht appreciation',
    'usd/thb lower',
    'usdthb lower',
    'usd/thb down',
    'usdthb down',
    'baht has outperformed',
    'thb has outperformed',
    'baht outperformed',
    'thb outperformed',
  ];

  const weakerSignals = [
    'thb weaker',
    'baht weaker',
    'thb weakness',
    'baht weakness',
    'thb depreciation',
    'baht depreciation',
    'usd/thb higher',
    'usdthb higher',
    'usd/thb up',
    'usdthb up',
    'baht underperformed',
    'thb underperformed',
  ];

  if (strongerSignals.some((signal) => normalized.includes(signal))) return -1;
  if (weakerSignals.some((signal) => normalized.includes(signal))) return 1;
  return null;
}

function sortTopics(topics: TopicLabel[], selector: (label: TopicLabel) => number) {
  return [...topics]
    .sort((left, right) => {
      const scoreDiff = selector(right) - selector(left);
      if (scoreDiff !== 0) return scoreDiff;
      const confidenceDiff = right.confidence - left.confidence;
      if (confidenceDiff !== 0) return confidenceDiff;
      return left.topic.localeCompare(right.topic);
    })
    .map((label) => label.topic);
}

export function getDirectionLabel(direction: number): TopicDisplayLabel {
  if (direction < 0) return 'Negative';
  if (direction > 0) return 'Positive';
  return 'Neutral / Mixed';
}

export function formatTopicDirection(label: TopicLabel) {
  if (label.topic === 'FX_USDTHB') {
    return label.display?.label || normalizeFxDisplay(label.topic, label.direction)?.label || 'USD/THB: Neutral';
  }
  return getDirectionLabel(label.direction);
}

export function normalizeTopicLabel(value: unknown): TopicLabel | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const raw = value as RawTopicLabel;
  const topic = String(raw.topic || '').trim() as TopicCode;
  if (!(topic in TOPIC_LABELS)) return null;

  const relevance = clampInteger(raw.relevance, 0, 3);
  const evidence = normalizeEvidence(raw.evidence, topic, relevance);
  let direction = relevance === 0 ? 0 : clampInteger(raw.direction, -2, 2);
  if (topic === 'FX_USDTHB' && relevance > 0) {
    const inferredDirection = inferUsdThbDirectionFromEvidence(evidence);
    if (inferredDirection !== null) {
      direction = inferredDirection;
    }
  }
  const confidence = clampInteger(raw.confidence, 0, 3);
  const regime = normalizeRegime(raw.regime);
  const drivers = normalizeDrivers(raw.drivers);

  return {
    topic,
    relevance,
    direction,
    confidence,
    evidence,
    regime: topic.startsWith('FX_') ? regime : null,
    drivers: topic.startsWith('FX_') ? drivers : [],
    display: topic === 'FX_USDTHB' ? normalizeFxDisplay(topic, direction) : undefined,
  };
}

function mergeTopicLabels(existing: TopicLabel, incoming: TopicLabel): TopicLabel {
  const winner = incoming.relevance > existing.relevance
    || (incoming.relevance === existing.relevance && incoming.confidence >= existing.confidence)
    ? incoming
    : existing;

  return {
    ...winner,
    evidence: winner.evidence || existing.evidence || incoming.evidence,
    drivers: Array.from(new Set([...(existing.drivers || []), ...(incoming.drivers || [])])) as FxDriver[],
    regime: winner.regime || existing.regime || incoming.regime || null,
    display: winner.display || existing.display || incoming.display,
  };
}

export function buildTopicSummary(labels: TopicLabel[]): TopicSummary {
  const related = labels.filter((label) => label.relevance > 0);
  const coreTopics = related.filter((label) => label.relevance >= 2);
  const positiveTopics = related.filter((label) => label.direction > 0);
  const negativeTopics = related.filter((label) => label.direction < 0);

  return {
    core_topics: sortTopics(coreTopics, (label) => label.relevance * 10 + label.confidence).slice(0, 4),
    top_positive_topics: sortTopics(positiveTopics, (label) => label.relevance * label.direction).slice(0, 3),
    top_negative_topics: sortTopics(negativeTopics, (label) => label.relevance * Math.abs(label.direction)).slice(0, 3),
  };
}

export function normalizeTopicSentiment(rawLabels: unknown, rawSummary?: unknown) {
  const labels = Array.isArray(rawLabels) ? rawLabels : [];
  const byTopic = new Map<TopicCode, TopicLabel>();

  for (const rawLabel of labels) {
    const normalized = normalizeTopicLabel(rawLabel);
    if (!normalized) continue;
    const existing = byTopic.get(normalized.topic);
    byTopic.set(normalized.topic, existing ? mergeTopicLabels(existing, normalized) : normalized);
  }

  const normalizedLabels = Array.from(byTopic.values()).sort((left, right) => {
    const relevanceDiff = right.relevance - left.relevance;
    if (relevanceDiff !== 0) return relevanceDiff;
    const confidenceDiff = right.confidence - left.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;
    return left.topic.localeCompare(right.topic);
  });

  const summaryFromLabels = buildTopicSummary(normalizedLabels);
  if (!rawSummary || typeof rawSummary !== 'object' || Array.isArray(rawSummary)) {
    return { labels: normalizedLabels, summary: summaryFromLabels };
  }

  const raw = rawSummary as Record<string, unknown>;
  const sanitizeTopicList = (value: unknown) =>
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || '').trim())
      .filter((item): item is TopicCode => item in TOPIC_LABELS && normalizedLabels.some((label) => label.topic === item));

  return {
    labels: normalizedLabels,
    summary: {
      core_topics: sanitizeTopicList(raw.core_topics).slice(0, 4).length > 0 ? sanitizeTopicList(raw.core_topics).slice(0, 4) : summaryFromLabels.core_topics,
      top_positive_topics: sanitizeTopicList(raw.top_positive_topics).slice(0, 3).length > 0 ? sanitizeTopicList(raw.top_positive_topics).slice(0, 3) : summaryFromLabels.top_positive_topics,
      top_negative_topics: sanitizeTopicList(raw.top_negative_topics).slice(0, 3).length > 0 ? sanitizeTopicList(raw.top_negative_topics).slice(0, 3) : summaryFromLabels.top_negative_topics,
    },
  };
}

function roundMetric(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

export function aggregateTopicSentiment(labels: TopicLabel[]): DailyTopicAggregate[] {
  const grouped = new Map<TopicCode, TopicLabel[]>();

  for (const label of labels) {
    if (label.relevance === 0) continue;
    const bucket = grouped.get(label.topic) || [];
    bucket.push(label);
    grouped.set(label.topic, bucket);
  }

  return Array.from(grouped.entries())
    .map(([topic, topicLabels]) => {
      const totalWeight = topicLabels.reduce((sum, label) => sum + label.relevance, 0);
      const weightedSentiment = totalWeight === 0
        ? 0
        : topicLabels.reduce((sum, label) => sum + label.relevance * label.direction, 0) / totalWeight;
      const averageConfidence = topicLabels.reduce((sum, label) => sum + label.confidence, 0) / topicLabels.length;
      const bullishCount = topicLabels.filter((label) => label.direction > 0).length;
      const bearishCount = topicLabels.filter((label) => label.direction < 0).length;
      const neutralCount = topicLabels.filter((label) => label.direction === 0).length;
      const meanDirection = topicLabels.reduce((sum, label) => sum + label.direction, 0) / topicLabels.length;
      const variance = topicLabels.reduce((sum, label) => sum + (label.direction - meanDirection) ** 2, 0) / topicLabels.length;

      return {
        topic,
        coverage_count: topicLabels.length,
        weighted_sentiment: roundMetric(weightedSentiment),
        average_confidence: roundMetric(averageConfidence),
        bullish_count: bullishCount,
        bearish_count: bearishCount,
        neutral_count: neutralCount,
        dispersion: roundMetric(Math.sqrt(variance)),
      };
    })
    .sort((left, right) => {
      const coverageDiff = right.coverage_count - left.coverage_count;
      if (coverageDiff !== 0) return coverageDiff;
      return left.topic.localeCompare(right.topic);
    });
}
