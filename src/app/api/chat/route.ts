import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { getDb } from '@/lib/db';

const geminiKey = process.env.GEMINI_API_KEY;
const openAIKey = process.env.OPENAI_API_KEY;

const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
const openai = openAIKey ? new OpenAI({ apiKey: openAIKey }) : null;

export async function POST(request: Request) {
  const { messages, paperIds } = await request.json();
  const db = await getDb();

  let papers: any[] = [];

  if (paperIds && paperIds.length > 0) {
    // Use specifically selected papers
    const placeholders = paperIds.map(() => '?').join(',');
    papers = await db.all(
      `SELECT title, authors, publisher, published_date, abstract, key_findings FROM papers WHERE id IN (${placeholders}) AND status = 'approved'`,
      paperIds
    );
  } else {
    // Auto-load latest 10 approved papers when nothing is selected
    papers = await db.all(
      `SELECT title, authors, publisher, published_date, abstract, key_findings FROM papers WHERE status = 'approved' ORDER BY created_at DESC LIMIT 10`
    );
  }

  const context = papers.map((p: any) => {
    const authors = p.authors ? JSON.parse(p.authors) : [];
    const keyFindings = p.key_findings ? JSON.parse(p.key_findings) : [];
    return `
=== PAPER: ${p.title} ===
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
    : `${paperCount} most recent approved papers from the library`;

  const userMessage = messages[messages.length - 1].content;
  const systemPrompt = `You are a research assistant for a financial research paper library.
You have access to ${selectedNote}. Answer questions STRICTLY based on the content of these papers.
If you cannot find the answer in the papers, say "Based on the ${paperCount} papers in context, I cannot find specific information about this. The papers available are: [list titles]."
Do NOT use general knowledge as a substitute for paper content.

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
