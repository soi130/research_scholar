import { NextResponse } from 'next/server';
import { getScanState } from '@/lib/scan-state';

export async function GET() {
  return NextResponse.json(await getScanState());
}
