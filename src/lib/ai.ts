import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const geminiKey = process.env.GEMINI_API_KEY;
const openAIKey = process.env.OPENAI_API_KEY;

const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
const openai = openAIKey ? new OpenAI({ apiKey: openAIKey }) : null;
export const EXTRACTION_PROMPT_VERSION = '2026-04-01-v1-research-facts';

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
    provider: '',
    model: '',
    promptVersion: EXTRACTION_PROMPT_VERSION,
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
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
- Only include "key_calls" rows for explicit numbers, targets, rates, table values, or clearly comparable house calls.
- If there are no such rows, return an empty array.
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
  - For FX_USDTHB:
    +2 = USD/THB strongly up = THB weakening significantly
    +1 = USD/THB mildly up = THB weakening
     0 = neutral / range-bound / mixed
    -1 = USD/THB mildly down = THB strengthening
    -2 = USD/THB strongly down = THB strengthening significantly
  - For FX_USD_BROAD:
    positive means USD broadly stronger, negative means USD broadly weaker
- Return valid JSON only.

=== FIRST PAGE TEXT ===
${firstPage}

=== FULL TEXT ===
${body}
  `;

  if (openai) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Switched to mini for better rate limits & speed in batches
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    return postProcessMetadata(JSON.parse(response.choices[0].message.content || "{}"), firstPage);
  } else if (genAI) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? postProcessMetadata(JSON.parse(jsonMatch[0]), firstPage) : null;
  } else {
    throw new Error("No AI provider configured.");
  }
}
