export type ForecastIndicatorCode = 'GDP' | 'INFLATION' | 'POLICY_RATE' | 'YIELD_10Y';

type ForecastIndicatorDefinition = {
  code: ForecastIndicatorCode;
  label: string;
  aliases: RegExp[];
};

export const FORECAST_INDICATORS: ForecastIndicatorDefinition[] = [
  {
    code: 'GDP',
    label: 'GDP forecast',
    aliases: [/\bgdp\b/i, /gross\s+domestic\s+product/i, /real\s+gdp/i],
  },
  {
    code: 'INFLATION',
    label: 'Inflation forecast',
    aliases: [/\bcpi\b/i, /headline\s+inflation/i, /\binflation\b/i],
  },
  {
    code: 'POLICY_RATE',
    label: 'Policy rate forecast',
    aliases: [/\bpolicy\s+rate\b/i, /\brepo\s+rate\b/i, /\bfed\s+funds?\b/i, /\bffr\b/i, /\bterminal\s+rate\b/i],
  },
  {
    code: 'YIELD_10Y',
    label: '10Y yield forecast',
    aliases: [/\b10\s*y(?:ea)?r?\b.*\byield\b/i, /\b10yy\b/i, /\b10[\s-]?year\b.*\byield\b/i, /\b10y\b.*\b(?:gov(?:ernment)?|treasury|bond)\b/i],
  },
];

function normalizeIndicatorInput(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function getForecastIndicatorDefinition(codeOrLabel: string) {
  const normalized = normalizeIndicatorInput(codeOrLabel);
  return FORECAST_INDICATORS.find((indicator) => {
    if (indicator.code === normalized) return true;
    return normalizeIndicatorInput(indicator.label) === normalized;
  }) ?? null;
}

export function getForecastIndicatorOptions() {
  return FORECAST_INDICATORS.map(({ code, label }) => ({ code, label }));
}

export function inferForecastIndicatorCode(indicatorText: string): ForecastIndicatorCode | null {
  const normalized = String(indicatorText ?? '').trim();
  if (!normalized) return null;

  for (const indicator of FORECAST_INDICATORS) {
    if (indicator.aliases.some((pattern) => pattern.test(normalized))) {
      return indicator.code;
    }
  }

  return null;
}
