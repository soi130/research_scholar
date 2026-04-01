import path from 'path';
import { NextResponse } from 'next/server';
import { resetDatabaseFile } from '@/lib/db';
import { scanFolder } from '@/lib/ingest';

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Dev reset is not available in production.' }, { status: 403 });
  }

  const storagePath = process.env.PAPERS_STORAGE_PATH || path.join(process.cwd(), '..', 'papres_storage');

  await resetDatabaseFile();

  const startAttempt = await scanFolder(storagePath);

  if (!startAttempt.started && startAttempt.reason === 'missing-folder') {
    return NextResponse.json(
      { error: 'Configured paper storage path was not found.' },
      { status: 404 }
    );
  }

  if (!startAttempt.started && startAttempt.reason === 'already-running') {
    return NextResponse.json(
      { message: 'Database reset completed, but a scan is already running.', state: startAttempt.state },
      { status: 409 }
    );
  }

  return NextResponse.json({
    message: 'Database wiped and reingest started.',
  });
}
