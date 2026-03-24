import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const geminiKey = process.env.GEMINI_API_KEY;
const openAIKey = process.env.OPENAI_API_KEY;

const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
const openai = openAIKey ? new OpenAI({ apiKey: openAIKey }) : null;

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
- "abstract": 2-3 sentence summary.
- "key_findings": Array of 3-5 points.
- "tags": Array of 2-5 keywords (equity, rates, EM, FX, macro, etc).

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
    return JSON.parse(response.choices[0].message.content || "{}");
  } else if (genAI) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } else {
    throw new Error("No AI provider configured.");
  }
}
