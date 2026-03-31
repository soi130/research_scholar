import { NextResponse } from 'next/server';
import { runInTransaction } from '@/lib/db';

type ApprovalItem = {
  id: number;
  expectedUpdatedAt?: string | null;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body?.items) ? (body.items as ApprovalItem[]) : [];

  if (items.length === 0) {
    return NextResponse.json({ error: 'No papers supplied' }, { status: 400 });
  }

  const result = await runInTransaction(async (db) => {
    const approvedIds: number[] = [];
    const conflicts: Array<{ id: number; reason: string }> = [];
    const missingIds: number[] = [];

    for (const item of items) {
      const id = Number(item.id);
      if (!Number.isFinite(id)) continue;

      const paper = await db.get<{ id: number; updated_at: string | null; status: string | null }>(
        `SELECT id, updated_at, status
         FROM papers
         WHERE id = ?`,
        [id]
      );

      if (!paper) {
        missingIds.push(id);
        continue;
      }

      if (item.expectedUpdatedAt && paper.updated_at !== item.expectedUpdatedAt) {
        conflicts.push({ id, reason: 'stale' });
        continue;
      }

      if (paper.status === 'approved') {
        conflicts.push({ id, reason: 'already-approved' });
        continue;
      }

      await db.run(
        `UPDATE papers
         SET status = 'approved', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [id]
      );
      approvedIds.push(id);
    }

    return { approvedIds, conflicts, missingIds };
  });

  return NextResponse.json(result);
}
