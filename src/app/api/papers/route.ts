import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { scanFolder } from '@/lib/ingest';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'approved';
  
  const db = await getDb();
  const papers = await db.all('SELECT * FROM papers WHERE status = ? ORDER BY created_at DESC', [status]);
  
  const parsedPapers = papers.map(p => ({
    ...p,
    authors: p.authors ? JSON.parse(p.authors) : [],
    key_findings: p.key_findings ? JSON.parse(p.key_findings) : [],
    tags: p.tags ? JSON.parse(p.tags) : [],
    forecasts: p.forecasts ? JSON.parse(p.forecasts) : {},
  }));

  return NextResponse.json(parsedPapers);
}

export async function POST(request: Request) {
  const storagePath = process.env.PAPERS_STORAGE_PATH || path.join(process.cwd(), '..', 'papres_storage');
  
  console.log(`Starting background scan for: ${storagePath}`);
  
  // Fire-and-forget — do NOT await. The request returns immediately.
  scanFolder(storagePath).catch(err => console.error('Scan error:', err));
  
  return NextResponse.json({ message: 'Scan started in background. Check the Review Queue in a few minutes.' });
}
