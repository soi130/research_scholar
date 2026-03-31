export type TopicCategory = 'MACRO' | 'ASSETS' | 'FX';

export type TopicCode =
  | 'GDP_GROWTH'
  | 'INFLATION'
  | 'RATES'
  | 'EQUITY'
  | 'CREDIT'
  | 'OIL'
  | 'GOLD'
  | 'FX_USDTHB'
  | 'FX_USD_BROAD'
  | 'FX_ASIA'
  | 'FX_EM';

export type FxRegime = 'range_bound' | 'trending' | 'volatile' | 'event_driven';

export const FX_DRIVER_OPTIONS = [
  'Fed',
  'BoT',
  'yield_differential',
  'oil',
  'tourism',
  'exports',
  'capital_flows',
  'risk_sentiment',
  'intervention',
] as const;

export type FxDriver = (typeof FX_DRIVER_OPTIONS)[number];

export type TopicDefinition = {
  code: TopicCode;
  label: string;
  category: TopicCategory;
  description: string;
};

export const TOPIC_TAXONOMY: TopicDefinition[] = [
  { code: 'GDP_GROWTH', label: 'GDP Growth', category: 'MACRO', description: 'Economic growth outlook and activity momentum.' },
  { code: 'INFLATION', label: 'Inflation', category: 'MACRO', description: 'Inflation trends, price pressure, and disinflation.' },
  { code: 'RATES', label: 'Rates', category: 'MACRO', description: 'Policy rates, bond yields, and rate-path views.' },
  { code: 'EQUITY', label: 'Equity', category: 'ASSETS', description: 'Equity markets, earnings, positioning, and valuation.' },
  { code: 'CREDIT', label: 'Credit', category: 'ASSETS', description: 'Credit spreads, carry, defaults, and debt-market views.' },
  { code: 'OIL', label: 'Oil', category: 'ASSETS', description: 'Oil supply, demand, prices, and energy-market calls.' },
  { code: 'GOLD', label: 'Gold', category: 'ASSETS', description: 'Gold prices, demand, and safe-haven positioning.' },
  { code: 'FX_USDTHB', label: 'USD/THB', category: 'FX', description: 'Directional view on USD/THB with explicit THB interpretation.' },
  { code: 'FX_USD_BROAD', label: 'Broad USD', category: 'FX', description: 'Broad USD strength or weakness against major peers.' },
  { code: 'FX_ASIA', label: 'Asia FX', category: 'FX', description: 'Regional Asian FX trend and relative performance.' },
  { code: 'FX_EM', label: 'EM FX', category: 'FX', description: 'Emerging-market FX risk sentiment and direction.' },
] as const;

export const TOPIC_CODE_SET = new Set<TopicCode>(TOPIC_TAXONOMY.map((topic) => topic.code));

export const TOPIC_LABELS: Record<TopicCode, string> = Object.fromEntries(
  TOPIC_TAXONOMY.map((topic) => [topic.code, topic.label])
) as Record<TopicCode, string>;

export function isTopicCode(value: string): value is TopicCode {
  return TOPIC_CODE_SET.has(value as TopicCode);
}
