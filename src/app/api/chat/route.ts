import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { getDb } from '@/lib/db';

const geminiKey = process.env.GEMINI_API_KEY;
const openAIKey = process.env.OPENAI_API_KEY;

const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
const openai = openAIKey ? new OpenAI({ apiKey: openAIKey }) : null;

function buildFtsQuery(input: string): string {
  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where',
    'which', 'about', 'into', 'over', 'under', 'than', 'have', 'has', 'had', 'are',
    'was', 'were', 'will', 'would', 'could', 'should', 'can', 'you', 'your', 'our',
    'how', 'why', 'who', 'their', 'them', 'they', 'its', 'also', 'across', 'among',
    'amid', 'after', 'before', 'does', 'did', 'done', 'been', 'show', 'tell', 'give',
    'explain', 'summarize', 'compare'
  ]);

  const terms = input
    .toLowerCase()
    .replace(/[^\w\s/-]/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !stopwords.has(term))
    .slice(0, 8);

  if (terms.length === 0) return '';
  return terms.map((term) => `"${term}"*`).join(' OR ');
}

export async function POST(request: Request) {
  const { messages, paperIds } = await request.json();
  const db = await getDb();

  type PaperContextRow = {
    id: number;
    title: string | null;
    authors: string | null;
    publisher: string | null;
    published_date: string | null;
    abstract: string | null;
    key_findings: string | null;
  };

  let papers: PaperContextRow[] = [];
  const userMessage = messages[messages.length - 1]?.content || '';

  if (paperIds && paperIds.length > 0) {
    // Use specifically selected papers
    const placeholders = paperIds.map(() => '?').join(',');
    papers = await db.all(
      `SELECT id, title, authors, publisher, published_date, abstract, key_findings FROM papers WHERE id IN (${placeholders}) AND status = 'approved'`,
      paperIds
    );
  } else {
    // Retrieval mode for scale: pull top relevant papers, not the whole library.
    const ftsQuery = buildFtsQuery(userMessage);

    if (ftsQuery) {
      try {
        papers = await db.all(
          `
            SELECT p.id, p.title, p.authors, p.publisher, p.published_date, p.abstract, p.key_findings
            FROM papers_fts f
            JOIN papers p ON p.id = f.rowid
            WHERE p.status = 'approved'
              AND f MATCH ?
            ORDER BY p.created_at DESC
            LIMIT 18
          `,
          [ftsQuery]
        );
      } catch (err) {
        console.warn('FTS retrieval failed, falling back to recency.', err);
      }
    }

    if (papers.length === 0) {
      papers = await db.all(
        `SELECT id, title, authors, publisher, published_date, abstract, key_findings
         FROM papers
         WHERE status = 'approved'
         ORDER BY created_at DESC
         LIMIT 12`
      );
    }
  }

  const context = papers.map((p) => {
    const authors = p.authors ? JSON.parse(p.authors) : [];
    const keyFindings = p.key_findings ? JSON.parse(p.key_findings) : [];
    return `
=== PAPER: ${p.title} (ID: ${p.id}) ===
Publisher/House: ${p.publisher || 'Unknown'}
Authors: ${authors.join(', ') || 'Unknown'}
Date: ${p.published_date || 'Unknown'}

Abstract:
${p.abstract}

Key Findings:
${keyFindings.map((f: string, i: number) => `${i+1}. ${f}`).join('\n')}
    `.trim();
  }).join('\n\n---\n\n');

  const paperCount = papers.length;
  const selectedNote = paperIds?.length > 0 
    ? `${paperCount} selected papers` 
    : `${paperCount} retrieved approved papers from the library (relevance + recency)`;
  const systemPrompt = `You are a research assistant for a financial research paper library.
You have access to ${selectedNote}. Answer questions STRICTLY based on the content of these papers.
If you cannot find the answer in the papers, say "Based on the ${paperCount} papers in context, I cannot find specific information about this. The papers available are: [list titles]."
Do NOT use general knowledge as a substitute for paper content.

VERY IMPORTANT: Whenever you reference or cite a specific paper, you MUST provide a markdown link to it using its exact ID from the context.
Format your link EXACTLY like this: [Paper Title](paper://<id>)
Example: [Global Market Outlook 2026](paper://4)

PAPERS IN CONTEXT:
${context}`;

  const userPrompt = `${userMessage}`;

  if (openai) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });
    return NextResponse.json({ role: 'assistant', content: response.choices[0].message.content });
  } else if (genAI) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(`${systemPrompt}\n\nUser question: ${userPrompt}`);
    const response = await result.response;
    return NextResponse.json({ role: 'assistant', content: response.text() });
  } else {
    return NextResponse.json({ error: "No AI provider configured" }, { status: 500 });
  }
}
