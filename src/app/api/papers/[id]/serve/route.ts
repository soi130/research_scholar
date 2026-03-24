import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  
  const paper = await db.get('SELECT filepath FROM papers WHERE id = ?', [id]);
  if (!paper || !fs.existsSync(paper.filepath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(paper.filepath);
  
  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${path.basename(paper.filepath)}"`,
      'Cache-Control': 'public, max-age=3600',
    }
  });
}
