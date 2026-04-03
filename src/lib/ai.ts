import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const geminiKey = process.env.GEMINI_API_KEY;
const openAIKey = process.env.OPENAI_API_KEY;

const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
const openai = openAIKey ? new OpenAI({ apiKey: openAIKey }) : null;
export const EXTRACTION_PROMPT_VERSION = '2026-04-03-v3-major-indicator-key-calls';
const LOCAL_PROMPT_VERSION_SUFFIX = '-local-fallback';
const KNOWN_PUBLISHERS = [
  'Goldman Sachs',
  'JPMorgan',
  'JP Morgan',
  'Bank of America',
  'BofA',
  'Morgan Stanley',
  'Nomura',
  'UOB',
  'Citi',
  'Citigroup',
  'UBS',
  'HSBC',
  'Macquarie',
  'Maybank',
  'KBank',
  'Kasikornbank',
  'SCB',
  'Krungsri',
  'KKPS',
  'PIER',
  'MAS',
  'Mizuho',
  'Deutsche Bank',
  'Barclays',
];
const DATE_PATTERNS = [
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/i,
  /\b\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b/i,
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b/i,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
];
const TAG_RULES: Array<{ tag: string; pattern: RegExp }> = [
  { tag: 'macro', pattern: /\b(gdp|inflation|cpi|macro|economy|growth|exports?|imports?|consumption|tourism)\b/i },
  { tag: 'rates', pattern: /\b(rate|rates|yield|bond|policy rate|cut|hike|bps)\b/i },
  { tag: 'FX', pattern: /\b(fx|foreign exchange|usd\/thb|baht|dollar|currency)\b/i },
  { tag: 'equity', pattern: /\b(equity|equities|stocks?|shares?|set index)\b/i },
  { tag: 'fixed-income', pattern: /\b(fixed income|treasury|government bond|credit spread)\b/i },
  { tag: 'credit', pattern: /\b(credit|default|spread|loan)\b/i },
  { tag: 'commodities', pattern: /\b(oil|gold|commodity|commodities|gas)\b/i },
  { tag: 'Thailand', pattern: /\b(thailand|thai|bot|bank of thailand|baht)\b/i },
  { tag: 'Asia', pattern: /\b(asia|asian|asean|china|india|indonesia|malaysia|philippines|vietnam)\b/i },
  { tag: 'EM', pattern: /\b(emerging markets?|em\b)\b/i },
];

export function getActiveExtractionEngine() {
  if (openai) {
    return {
      provider: 'openai',
      model: 'gpt-4o-mini',
      promptVersion: EXTRACTION_PROMPT_VERSION,
    };
  }

  if (genAI) {
    return {
      provider: 'google',
      model: 'gemini-1.5-flash',
      promptVersion: EXTRACTION_PROMPT_VERSION,
    };
  }

  return {
    provider: 'local',
    model: 'heuristic-parser',
    promptVersion: `${EXTRACTION_PROMPT_VERSION}${LOCAL_PROMPT_VERSION_SUFFIX}`,
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean)));
}

function splitLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function stripLeadingJunk(value: string) {
  return normalizeWhitespace(value)
    .replace(/^[\d\s._-]+/, '')
    .replace(/^(?:page\s+\d+|confidential|economics?|research|report)\b[:\-\s]*/i, '')
    .trim();
}

function isDisclaimerLine(value: string) {
  return /\b(issued by|distributed locally|research co\s*-\s*operation|important disclosures|investors should be aware|copyright|all rights reserved|refer to important disclosures|merrill lynch|kiatnakin phatra securities|conflict of interest|objectivity of this report|single factor in making their investment decision|do business with companies covered|consider this report as)\b/i.test(value);
}

function inferPublisher(text: string) {
  const normalized = normalizeWhitespace(text);
  for (const publisher of KNOWN_PUBLISHERS) {
    const pattern = new RegExp(`\\b${escapeRegExp(publisher)}\\b`, 'i');
    if (pattern.test(normalized)) {
      if (/^jp morgan$/i.test(publisher)) return 'JPMorgan';
      if (/^bank of america$/i.test(publisher)) return 'BofA';
      if (/^citigroup$/i.test(publisher)) return 'Citi';
      if (/^kasikornbank$/i.test(publisher)) return 'KBank';
      return publisher;
    }
  }
  return '';
}

function inferPublishedDate(text: string) {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return normalizeWhitespace(match[0]);
  }
  return '';
}

function inferTitle(lines: string[], firstPage: string, seriesName: string, publisher: string) {
  const candidateLines = lines.slice(0, 40).map((line) => stripLeadingJunk(line)).filter(Boolean);
  const inferredSeriesIndex = candidateLines.findIndex((line) => !isDisclaimerLine(line) && likelySeriesLabel(line));

  if (inferredSeriesIndex >= 0) {
    const inferredSeries = candidateLines[inferredSeriesIndex].replace(/[:\-–\s]+$/g, '');
    const headlineParts: string[] = [];

    for (const line of candidateLines.slice(inferredSeriesIndex + 1, inferredSeriesIndex + 6)) {
      if (isDisclaimerLine(line)) continue;
      if (!line || line === '-') continue;
      if (inferPublishedDate(line)) continue;
      if (!/[A-Za-z]/.test(line)) continue;
      if (/^[’'s-]+$/i.test(line)) continue;
      headlineParts.push(line);
      if (headlineParts.join(' ').length >= 30) break;
    }

    if (headlineParts.length > 0) {
      return `${inferredSeries}: ${normalizeWhitespace(headlineParts.join(' ').replace(/\s*-\s*/g, '-'))}`;
    }
  }

  if (seriesName) {
    const seriesIndex = candidateLines.findIndex((line) => new RegExp(`^${escapeRegExp(seriesName)}$`, 'i').test(line));
    if (seriesIndex >= 0) {
      for (const line of candidateLines.slice(seriesIndex + 1, seriesIndex + 6)) {
        if (isDisclaimerLine(line)) continue;
        if (line.length < 8 || line.length > 180) continue;
        if (!/[A-Za-z]/.test(line)) continue;
        return `${seriesName}: ${line}`;
      }
    }
  }

  for (const line of candidateLines) {
    if (isDisclaimerLine(line)) continue;
    if (publisher && new RegExp(`^${escapeRegExp(publisher)}$`, 'i').test(line)) continue;
    if (seriesName && new RegExp(`^${escapeRegExp(seriesName)}$`, 'i').test(line)) continue;
    if (/^(?:published|date|authors?|analysts?|source|economics?|research|strategy|global|asia|thailand)$/i.test(line)) continue;
    if (line.length < 12 || line.length > 180) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    if (inferPublishedDate(line)) continue;
    return line;
  }

  const firstSentence = normalizeWhitespace(firstPage).match(/[^.!?]{20,180}[.!?]/);
  return firstSentence ? normalizeWhitespace(firstSentence[0]) : '';
}

function inferAuthors(lines: string[], title: string, publisher: string, publishedDate: string) {
  const blocked = new Set(
    [title, publisher, publishedDate]
      .map((value) => normalizeWhitespace(value).toLowerCase())
      .filter(Boolean)
  );

  const authors = uniqueStrings(
    lines
      .slice(0, 18)
      .flatMap((line) => line.split(/(?:,|;|\band\b)/i))
      .map((part) => stripLeadingJunk(part))
      .filter((part) => /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(part))
      .filter((part) => !blocked.has(part.toLowerCase()))
  );

  return authors.slice(0, 5);
}

function inferSeriesName(lines: string[], title: string) {
  const inferred = inferSeriesFromTitle(title);
  if (inferred) return inferred;

  for (const line of lines.slice(0, 40)) {
    const candidate = stripLeadingJunk(line);
    if (!candidate || isDisclaimerLine(candidate)) continue;
    if (likelySeriesLabel(candidate)) return candidate.replace(/[:\-–\s]+$/g, '');
  }

  return inferSeriesFromFirstPage(lines.join('\n'), title);
}

function inferAbstract(text: string, title: string) {
  const sentences = normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 260)
    .filter((sentence) => !title || !sentence.toLowerCase().includes(title.toLowerCase()));

  return sentences.slice(0, 2).join(' ').trim();
}

function inferKeyFindings(text: string, title: string) {
  const findings = uniqueStrings(
    normalizeWhitespace(text)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.replace(/^[•\-*]\s*/, '').trim())
      .filter((sentence) => sentence.length >= 35 && sentence.length <= 200)
      .filter((sentence) => !title || !sentence.toLowerCase().includes(title.toLowerCase()))
  );

  return findings.slice(0, 3);
}

function inferForecasts(text: string) {
  const forecasts: Record<string, string> = {};
  const patterns: Array<{ key: string; pattern: RegExp }> = [
    { key: 'GDP', pattern: /\bGDP[^.\n]{0,50}?(\d+(?:\.\d+)?)\s*%/i },
    { key: 'CPI', pattern: /\b(?:CPI|inflation)[^.\n]{0,50}?(\d+(?:\.\d+)?)\s*%/i },
    { key: 'Rates', pattern: /\b(?:policy rate|terminal rate|benchmark rate)[^.\n]{0,50}?(\d+(?:\.\d+)?)\s*%/i },
    { key: 'FX', pattern: /\b(?:USD\/THB|THB|baht)[^.\n]{0,50}?(\d+(?:\.\d+)?)/i },
  ];

  for (const { key, pattern } of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      forecasts[key] = key === 'FX' ? match[1] : `${match[1]}%`;
    }
  }

  return forecasts;
}

function inferTags(text: string) {
  const tags = TAG_RULES
    .filter(({ pattern }) => pattern.test(text))
    .map(({ tag }) => tag);
  return tags.slice(0, 5);
}

function buildLocalMetadata(pdfText: string) {
  const firstPage = pdfText.substring(0, 10000);
  const lines = splitLines(firstPage);
  const publisher = inferPublisher(firstPage);
  const publishedDate = inferPublishedDate(firstPage) || inferPublishedDate(pdfText);
  const provisionalTitle = inferTitle(lines, firstPage, '', publisher);
  const seriesName = inferSeriesFromFirstPage(firstPage, provisionalTitle) || inferSeriesName(lines, provisionalTitle);
  const title = inferTitle(lines, firstPage, seriesName, publisher) || provisionalTitle || 'Untitled paper';

  return postProcessMetadata(
    {
      _generated_locally: true,
      title,
      authors: inferAuthors(lines, title, publisher, publishedDate),
      published_date: publishedDate,
      publisher,
      series_name: seriesName,
      journal: '',
      abstract: inferAbstract(pdfText, title),
      key_findings: inferKeyFindings(pdfText, title),
      tags: inferTags(pdfText),
      forecasts: inferForecasts(pdfText),
      key_calls: [],
      research_facts: [],
      topic_labels: [],
      topic_summary: {
        core_topics: [],
        top_positive_topics: [],
        top_negative_topics: [],
      },
    },
    firstPage
  );
}

const SERIES_KEYWORDS = [
  'watch',
  'viewpoint',
  'outlook',
  'daily',
  'weekly',
  'monthly',
  'update',
  'monitor',
  'focus',
  'insight',
  'insights',
  'tracker',
  'review',
  'strategy',
  'pulse',
  'report',
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectFirstPageLines(firstPage: string) {
  return firstPage
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function isSeriesOnlyTitle(title: string, seriesName: string) {
  if (!title || !seriesName) return false;
  const normalizedTitle = normalizeWhitespace(title).toLowerCase().replace(/[:\-–\s]+$/g, '');
  const normalizedSeries = normalizeWhitespace(seriesName).toLowerCase().replace(/[:\-–\s]+$/g, '');
  return normalizedTitle === normalizedSeries;
}

function likelySeriesLabel(value: string) {
  const normalized = normalizeWhitespace(value).replace(/[:\-–\s]+$/g, '');
  if (!normalized) return false;
  if (normalized.length < 6 || normalized.length > 60) return false;
  if (!/[A-Za-z]/.test(normalized)) return false;
  const words = normalized.split(/\s+/);
  if (words.length > 5) return false;

  const lower = normalized.toLowerCase();
  if (SERIES_KEYWORDS.some((keyword) => lower.includes(keyword))) return true;

  const titleCaseRatio = words.filter((word) => /^[A-Z][A-Za-z&/.-]*$/.test(word)).length / words.length;
  return titleCaseRatio >= 0.75;
}

function inferSeriesFromTitle(title: string) {
  const normalizedTitle = normalizeWhitespace(title);
  if (!normalizedTitle) return '';

  const prefixedMatch = normalizedTitle.match(/^([^:]{3,60})\s*[:\-–]\s+(.+)$/);
  if (!prefixedMatch) return '';

  const candidate = normalizeWhitespace(prefixedMatch[1]);
  return likelySeriesLabel(candidate) ? candidate : '';
}

function inferSeriesFromFirstPage(firstPage: string, title: string) {
  const normalizedTitle = normalizeWhitespace(title);
  const lines = collectFirstPageLines(firstPage);

  for (const line of lines) {
    const candidate = normalizeWhitespace(line);
    if (!candidate || candidate === normalizedTitle) continue;
    if (likelySeriesLabel(candidate)) return candidate;

    const prefixedMatch = candidate.match(/^([^:]{3,60})\s*[:\-–]\s+(.+)$/);
    if (prefixedMatch?.[1] && likelySeriesLabel(prefixedMatch[1])) {
      return normalizeWhitespace(prefixedMatch[1]);
    }
  }

  return '';
}

function deriveTitleFromSeries(firstPage: string, title: string, seriesName: string) {
  const normalizedTitle = normalizeWhitespace(title);
  const normalizedSeries = normalizeWhitespace(seriesName);
  if (!normalizedSeries) return normalizedTitle;

  const lines = collectFirstPageLines(firstPage);
  const seriesPattern = escapeRegExp(normalizedSeries);

  for (const line of lines) {
    const sameLineMatch = line.match(new RegExp(`^${seriesPattern}\\s*[:\\-–]\\s*(.+)$`, 'i'));
    if (sameLineMatch?.[1]) {
      return `${normalizedSeries}: ${normalizeWhitespace(sameLineMatch[1])}`;
    }
  }

  const seriesIndex = lines.findIndex((line) => new RegExp(`^${seriesPattern}\\s*[:\\-–]?$`, 'i').test(line));
  if (seriesIndex >= 0) {
    const nextLine = lines.slice(seriesIndex + 1).find((line) => line.length > 6);
    if (nextLine) {
      return `${normalizedSeries}: ${normalizeWhitespace(nextLine)}`;
    }
  }

  return normalizedTitle;
}

function postProcessMetadata(metadata: Record<string, unknown>, firstPage: string) {
  const next = { ...metadata };
  let title = normalizeWhitespace(String(metadata.title || ''));
  let seriesName = normalizeWhitespace(String(metadata.series_name || ''));

  if (!seriesName) {
    seriesName = inferSeriesFromTitle(title) || inferSeriesFromFirstPage(firstPage, title);
    if (seriesName) {
      next.series_name = seriesName;
    }
  }

  if (isSeriesOnlyTitle(title, seriesName)) {
    title = deriveTitleFromSeries(firstPage, title, seriesName);
    next.title = title;
  }

  if (!seriesName) {
    const derivedSeries = inferSeriesFromTitle(title) || inferSeriesFromFirstPage(firstPage, title);
    if (derivedSeries) {
      next.series_name = derivedSeries;
      seriesName = derivedSeries;
    }
  }

  return next;
}

export async function extractMetadataFromPDF(pdfText: string) {
  const firstPage = pdfText.substring(0, 5000);
  const body = pdfText.substring(0, 50000);

  const prompt = `
You are a metadata extraction assistant for a financial research paper library.

Analyze the text below and return a single JSON object (no markdown):

- "title": Main title.
- "authors": Array of analyst/writer names.
- "published_date": Publication date (e.g. "January 2025").
- "publisher": The 'House' (e.g. "Goldman Sachs", "JPMorgan", "BofA", "Nomura", "UOB"). Look in FIRST PAGE TEXT.
- "series_name": Report series (e.g. "Global Markets Daily").
- "journal": Journal name or blank.
- "abstract": Exactly one concise paragraph summary of the paper.
- "key_findings": Array of exactly 3 key takeaways. Keep each takeaway short and specific.
- "tags": Array of 2-5 keywords (equity, rates, EM, FX, macro, etc).
- "forecasts": Object of major forecast indicators and values if present. Use key/value form.
- "key_calls": Array of structured forecast or table rows for comparison across houses. Each row must be an object with:
  - "publish_date": date for the call if visible, otherwise use paper date if implied, otherwise blank
  - "indicator": metric or call name
  - "house": publisher/house making the call
  - "value": forecast value or view as text
  - "unit": optional unit such as %, bps, USD, x, etc
  - "forecast_period": optional period such as 2026, Q4 2025, 12M target, etc
  - "source_text": short verbatim supporting snippet or table cell text
  For V1 comparison coverage, prioritize these major indicators whenever they appear as explicit forward-looking calls:
  - GDP forecast
    aliases include: GDP, real GDP, GDP growth, growth forecast
  - Inflation forecast
    aliases include: CPI, headline inflation, core inflation, inflation forecast
  - Policy Rate forecast
    aliases include: policy rate, repo rate, terminal rate, Fed funds, FFR, Bank of Thailand rate
  - 10Y yield forecast
    aliases include: 10Y yield, 10-year yield, 10yr yield, 10YY, 10Y government bond yield, 10Y Treasury yield
  When one of these appears, use the exact indicator labels above in "indicator" so rows are comparable across houses.
- "research_facts": Array of normalized atomic investment-research facts. Focus on explicit, comparable facts only.
  Prioritize these fact types first: "macro_actual", "macro_forecast", "forecast_revision", "policy_expectation", "target_price", "rating_change".
  You may also use: "earnings_estimate", "thesis", "catalyst", "risk", "market_implication".
  Each item must be an object with:
  - "source_house": publisher/house making the call. Use paper publisher if it is the same house.
  - "fact_type": one of ["macro_actual","macro_forecast","forecast_revision","policy_expectation","earnings_estimate","target_price","rating_change","thesis","catalyst","risk","market_implication"]
  - "stance": one of ["actual","forecast","revision","recommendation","scenario","opinion"]
  - "subject": what is being measured or claimed
  - "entity_or_scope": country, company, central bank, sector, asset group, or scope
  - "metric": how it is measured, e.g. "YoY", "policy rate change", "target price", "annual growth"
  - "value_number": numeric value if explicit, otherwise null
  - "unit": unit such as "%", "bps", "THB", "USD", "rating", or a short textual unit
  - "time_reference": period or horizon such as "March 2026", "Q3 2026", "FY2027", "current"
  - "evidence_text": short supporting snippet
  - "evidence_page": page number if visible/inferable from the extracted text layout, otherwise null
  - "confidence": decimal between 0 and 1
  - "ambiguity_flags": array using only:
    ["missing_subject","missing_entity_or_scope","missing_metric","missing_value","missing_unit","missing_time_reference","missing_evidence_text","mixed_actual_and_forecast","unclear_number_metric_mapping","multiple_numbers_in_sentence","multiple_entities_in_context","weak_stance_signal","table_parse_uncertain","ocr_noise","unsupported_inference"]
  - "review_status": one of ["accepted","needs_review","rejected"]
- "topic_labels": Array of topic sentiment labels using ONLY these topics:
  ["GDP_GROWTH","INFLATION","RATES","EQUITY","CREDIT","OIL","GOLD","FX_USDTHB","FX_USD_BROAD","FX_ASIA","FX_EM"]
  Each item must be an object with:
  - "topic": one topic from the allowed list
  - "relevance": integer 0-3
  - "direction": integer -2 to 2
  - "confidence": integer 0-3
  - "evidence": short supporting snippet or concise explanation
  - "regime": optional for FX topics only, one of ["range_bound","trending","volatile","event_driven"]
  - "drivers": optional array for FX topics only, using only:
    ["Fed","BoT","yield_differential","oil","tourism","exports","capital_flows","risk_sentiment","intervention"]
- "topic_summary": object with:
  - "core_topics": array of topic codes
  - "top_positive_topics": array of topic codes
  - "top_negative_topics": array of topic codes

Rules:
- Prefer precision over coverage.
- If the cover has both a series label and a report title, "title" must be the full report title, not just the series label.
- "series_name" should contain only the reusable series label such as "Thailand Watch" or "Thailand Viewpoint".
- If the title is written like "Thailand Watch: January export surge led by electronics", then:
  - "series_name" should be "Thailand Watch"
  - "title" should stay the full visible title, not be reduced to only the suffix
- Do not return only the series label as the title unless that is truly the only title shown.
- "key_calls" are required whenever the paper contains an explicit forward-looking major-indicator forecast for GDP, inflation, policy rate, or 10Y yield.
- For the four major indicators above, search both tables and prose. Do not omit a row just because the forecast appears in a paragraph, bullet, chart caption, or forecast summary rather than a table.
- Prefer one row per indicator and forecast horizon when the paper gives explicit comparable values, for example 2026 GDP, Q4 2026 policy rate, or year-end 10Y yield.
- Only include "key_calls" rows for explicit numbers, targets, rates, table values, or clearly comparable house calls.
- Do not create a "key_calls" row from backward-looking actual data alone. Example: "December CPI was -0.28% YoY" is an actual print, not a forecast row unless the paper also gives an explicit forward-looking inflation call.
- If the paper gives both actual and forecast values for the same indicator, include only the forward-looking forecast in "key_calls" and use the actual number only in "research_facts" if relevant.
- Preserve the forecast horizon in "forecast_period" whenever visible. This is required for major indicators when the period is stated.
- Keep "source_text" close to the cited wording or table cell. Prefer the shortest snippet that still proves the forecast.
- If there are no such rows, return an empty array.
- For "forecasts", when present, prefer these keys for major indicators: "GDP forecast", "Inflation forecast", "Policy Rate forecast", "10Y yield forecast".
- For "research_facts":
  - Each fact must be atomic and citeable.
  - Never output a naked number without subject, entity_or_scope, metric, and time_reference.
  - If a sentence mixes actual and forecast values, split them into separate facts or flag "mixed_actual_and_forecast".
  - Use "needs_review" when critical context is missing or ambiguous.
  - If the evidence is too weak or noisy to trust, either flag it heavily or omit it.
- For topic sentiment:
  - relevance 0 means not related
  - if relevance is 0, direction must be 0
  - direction 0 means neutral/mixed/unclear, not "not related"
  - when relevance > 0, evidence must be non-empty
  - Evidence should be a short near-verbatim snippet from the paper when possible, not a softened rewrite. Preserve directional wording such as "limited", "weaker", "lower", "tighter", "delay", "downside", "flattening", "higher", or "hawkish".
  - If the evidence is too vague to support a directional label, set direction to 0.
  - Use market/topic direction, not normative judgment. "Positive" does not mean "good news for the economy" or "desirable for policymakers"; it means supportive/bullish for that specific topic.
  - Apply these topic-specific direction definitions:
    - GDP_GROWTH:
      + positive = stronger growth, upside growth surprise, better activity momentum
      + negative = weaker growth, downside growth surprise, softer activity momentum
    - INFLATION:
      + positive = hotter inflation, more price pressure, upside inflation risk
      + negative = cooler inflation, disinflation, downside inflation pressure
    - RATES:
      + positive = yields/rates moving higher, hawkish repricing, tighter rate conditions
      + negative = yields/rates moving lower, dovish repricing, easing rate conditions
      + examples: "flattening pressure from limited policy space" is usually negative for RATES if it implies less upside in yields/rates
    - EQUITY:
      + positive = bullish equities, stronger earnings/risk appetite, upside for stock prices
      + negative = bearish equities, weaker earnings/risk appetite, downside for stock prices
    - CREDIT:
      + positive = tighter spreads, easier financing, supportive credit conditions, improving credit outlook
      + negative = wider spreads, tighter lending/financing conditions, restrictive credit impulse, deteriorating credit outlook
      + examples: "fiscal constraints may limit expansive credit policies" is negative for CREDIT
    - OIL:
      + positive = oil prices/upside oil pressure/supportive oil market balance
      + negative = oil prices/downside oil pressure/weaker oil market balance
    - GOLD:
      + positive = bullish for gold / gold prices higher
      + negative = bearish for gold / gold prices lower
  - For FX_USDTHB:
    +2 = USD/THB strongly up = THB weakening significantly
    +1 = USD/THB mildly up = THB weakening
     0 = neutral / range-bound / mixed
    -1 = USD/THB mildly down = THB strengthening
    -2 = USD/THB strongly down = THB strengthening significantly
  - For FX_USD_BROAD:
    positive means USD broadly stronger, negative means USD broadly weaker
  - For FX_ASIA:
    positive means Asia FX broadly stronger, negative means Asia FX broadly weaker
  - For FX_EM:
    positive means EM FX broadly stronger / better EM FX risk sentiment, negative means EM FX broadly weaker / worse EM FX risk sentiment
  - If the evidence describes constraint, weakness, downside risk, tighter conditions, or reduced policy space for a topic, that is usually negative for that topic unless the text clearly says the market price/view is rising.
- Return valid JSON only.

=== FIRST PAGE TEXT ===
${firstPage}

=== FULL TEXT ===
${body}
  `;

  if (openai) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    return {
      ...postProcessMetadata(JSON.parse(response.choices[0].message.content || "{}"), firstPage),
      _generated_locally: false,
    };
  }

  if (genAI) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return {
        ...postProcessMetadata(JSON.parse(jsonMatch[0]), firstPage),
        _generated_locally: false,
      };
    }
    throw new Error('Gemini returned no JSON payload.');
  }

  return buildLocalMetadata(pdfText);
}
