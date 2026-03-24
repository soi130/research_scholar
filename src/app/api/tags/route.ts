import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = await getDb();
  const tags = await db.all('SELECT name FROM master_tags ORDER BY name ASC');
  return NextResponse.json(tags.map(t => t.name));
}

export async function POST(request: Request) {
  const { name } = await request.json();
  const db = await getDb();
  
  try {
    await db.run('INSERT INTO master_tags (name) VALUES (?)', [name]);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Tag already exists' }, { status: 400 });
  }
}
