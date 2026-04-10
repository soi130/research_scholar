import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type StoredScanState = {
  token?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  status?: string | null;
};

function safeParseScanState(raw: string | null | undefined): StoredScanState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredScanState;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Dev scan logs are not available in production.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get('limit') || 30);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(200, Math.floor(limitParam))) : 30;

  const db = await getDb();
  const scanStateRow = await db.get<{ value?: string }>(
    `SELECT value FROM app_meta WHERE key = 'scan_state'`
  );
  const scanState = safeParseScanState(scanStateRow?.value);

  let activeToken = scanState?.token || null;
  if (!activeToken) {
    const latestLog = await db.get<{ scan_token: string | null }>(
      `SELECT scan_token FROM scan_file_logs
       WHERE TRIM(COALESCE(scan_token, '')) <> ''
       ORDER BY id DESC
       LIMIT 1`
    );
    activeToken = latestLog?.scan_token || null;
  }

  const rows = activeToken
    ? await db.all(
        `
          SELECT
            id,
            scan_token,
            filename,
            filepath,
            status,
            stage,
            reason,
            error_message,
            created_at
          FROM scan_file_logs
          WHERE scan_token = ?
          ORDER BY id DESC
          LIMIT ?
        `,
        [activeToken, limit]
      )
    : await db.all(
        `
          SELECT
            id,
            scan_token,
            filename,
            filepath,
            status,
            stage,
            reason,
            error_message,
            created_at
          FROM scan_file_logs
          ORDER BY id DESC
          LIMIT ?
        `,
        [limit]
      );

  return NextResponse.json({
    latestScanToken: activeToken,
    scanState: scanState || null,
    rows: Array.isArray(rows) ? rows : [],
  });
}
