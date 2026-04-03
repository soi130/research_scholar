import crypto from 'crypto';
import { getDb, runInTransaction, runSerializedWrite } from './db';

const SCAN_STATE_KEY = 'scan_state';
const STALE_SCAN_MS = 1000 * 60 * 60 * 4;
const STALE_SCAN_NO_PROGRESS_MS = 1000 * 60 * 2;

export type ScanState = {
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  token: string | null;
  message: string | null;
  stats: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
  };
};

const DEFAULT_SCAN_STATE: ScanState = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  token: null,
  message: null,
  stats: {
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
  },
};

function safeParseScanState(raw: string | null | undefined): ScanState {
  if (!raw) return DEFAULT_SCAN_STATE;

  try {
    const parsed = JSON.parse(raw) as Partial<ScanState>;
    return {
      status: parsed.status === 'running' || parsed.status === 'completed' || parsed.status === 'failed' ? parsed.status : 'idle',
      startedAt: parsed.startedAt || null,
      finishedAt: parsed.finishedAt || null,
      token: parsed.token || null,
      message: parsed.message || null,
      stats: {
        total: Number(parsed.stats?.total || 0),
        processed: Number(parsed.stats?.processed || 0),
        succeeded: Number(parsed.stats?.succeeded || 0),
        failed: Number(parsed.stats?.failed || 0),
      },
    };
  } catch {
    return DEFAULT_SCAN_STATE;
  }
}

function isStaleRunningScan(state: ScanState) {
  if (state.status !== 'running' || !state.startedAt) return false;

  const startedAt = new Date(state.startedAt).getTime();
  if (!Number.isFinite(startedAt)) return false;

  const ageMs = Date.now() - startedAt;
  if (ageMs >= STALE_SCAN_MS) return true;

  if ((state.stats.processed || 0) === 0 && ageMs >= STALE_SCAN_NO_PROGRESS_MS) {
    return true;
  }

  return false;
}

function staleFailureState(state: ScanState): ScanState {
  return {
    ...state,
    status: 'failed',
    finishedAt: new Date().toISOString(),
    token: null,
    message: 'Previous scan stalled before making progress. Ready to retry.',
  };
}

async function persistScanState(nextState: ScanState) {
  const db = await getDb();
  await db.run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [SCAN_STATE_KEY, JSON.stringify(nextState)]
  );
}

export async function getScanState(): Promise<ScanState> {
  const db = await getDb();
  const row = await db.get<{ value?: string }>(`SELECT value FROM app_meta WHERE key = ?`, [SCAN_STATE_KEY]);
  const current = safeParseScanState(row?.value);

  if (isStaleRunningScan(current)) {
    const nextState = staleFailureState(current);
    await db.run(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [SCAN_STATE_KEY, JSON.stringify(nextState)]
    );
    return nextState;
  }

  return current;
}

export async function tryStartScan(total: number) {
  return runInTransaction(async (db) => {
    const row = await db.get<{ value?: string }>(`SELECT value FROM app_meta WHERE key = ?`, [SCAN_STATE_KEY]);
    const current = safeParseScanState(row?.value);
    const now = new Date().toISOString();

    if (current.status === 'running' && !isStaleRunningScan(current)) {
      return { started: false as const, state: current };
    }

    const nextState: ScanState = {
      status: 'running',
      startedAt: now,
      finishedAt: null,
      token: crypto.randomUUID(),
      message: 'Scan in progress',
      stats: {
        total,
        processed: 0,
        succeeded: 0,
        failed: 0,
      },
    };

    await db.run(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [SCAN_STATE_KEY, JSON.stringify(nextState)]
    );

    return { started: true as const, state: nextState };
  });
}

export async function updateScanProgress(
  token: string,
  partial: Partial<ScanState['stats']> & { message?: string | null }
) {
  await runSerializedWrite(async () => {
    const current = await getScanState();
    if (current.token !== token || current.status !== 'running') return;

    const nextState: ScanState = {
      ...current,
      message: partial.message === undefined ? current.message : partial.message,
      stats: {
        total: partial.total ?? current.stats.total,
        processed: partial.processed ?? current.stats.processed,
        succeeded: partial.succeeded ?? current.stats.succeeded,
        failed: partial.failed ?? current.stats.failed,
      },
    };

    await persistScanState(nextState);
  });
}

export async function finishScan(
  token: string,
  status: 'completed' | 'failed',
  message: string,
  partial: Partial<ScanState['stats']> = {}
) {
  await runSerializedWrite(async () => {
    const current = await getScanState();
    if (current.token !== token) return;

    const nextState: ScanState = {
      ...current,
      status,
      finishedAt: new Date().toISOString(),
      message,
      token: null,
      stats: {
        total: partial.total ?? current.stats.total,
        processed: partial.processed ?? current.stats.processed,
        succeeded: partial.succeeded ?? current.stats.succeeded,
        failed: partial.failed ?? current.stats.failed,
      },
    };

    await persistScanState(nextState);
  });
}
