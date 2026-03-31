import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Note: In a real production environment, we should pre-generate these or cache them.
// For this prototype, we'll return a placeholder or use a fast-rendering strategy if possible.
// Since server-side PDF rendering is heavy, we'll use a stylized SVG/Image placeholder 
// that mimics the first page if we can't easily use pdfjs-dist on the server.
// HOWEVER, we have pdfjs-dist installed. Let's try to use it if we can.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getDb();
  const paper = await db.get('SELECT file_path FROM papers WHERE id = ?', [id]);

  if (!paper) {
    return new NextResponse('Paper not found', { status: 404 });
  }

  // Placeholder strategy for now to avoid server-side canvas dependency issues in this environment
  // We'll return a dynamic SVG that looks like a document preview
  const svg = `
    <svg width="600" height="800" viewBox="0 0 600 800" xmlns="http://www.w3.org/2000/svg">
      <rect width="600" height="800" fill="#f8fafc"/>
      <rect x="50" y="50" width="500" height="40" fill="#e2e8f0" rx="4"/>
      <rect x="50" y="110" width="300" height="20" fill="#cbd5e1" rx="2"/>
      <rect x="50" y="180" width="500" height="10" fill="#f1f5f9" rx="1"/>
      <rect x="50" y="200" width="500" height="10" fill="#f1f5f9" rx="1"/>
      <rect x="50" y="220" width="500" height="10" fill="#f1f5f9" rx="1"/>
      <rect x="50" y="240" width="400" height="10" fill="#f1f5f9" rx="1"/>
      <rect x="50" y="300" width="500" height="200" fill="#f1f5f9" rx="8"/>
      <text x="300" y="410" font-family="sans-serif" font-size="24" fill="#94a3b8" text-anchor="middle" font-weight="bold">PREVIEW</text>
      <path d="M50 550 H550" stroke="#e2e8f0" stroke-width="2"/>
    </svg>
  `;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
