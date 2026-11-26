import { NextRequest, NextResponse } from 'next/server';
import { claimPrintJobs, completePrintJob } from '@/lib/services/printing';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const token = process.env.PRINT_AGENT_TOKEN?.trim();
  if (!token) return process.env.NODE_ENV !== 'production';
  const bearer = request.headers.get('authorization');
  const header = request.headers.get('x-print-token');
  const query = request.nextUrl.searchParams.get('token');
  return bearer === `Bearer ${token}` || header === token || query === token;
}

function agentId(request: NextRequest): string {
  return (
    request.headers.get('x-agent-id')?.trim() ||
    request.nextUrl.searchParams.get('agent')?.trim() ||
    'local-agent'
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const agent = agentId(request);
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 10);
  const jobs = await claimPrintJobs(agent, Number.isFinite(limit) ? limit : 10);
  return NextResponse.json({
    ok: true,
    agent,
    jobs: jobs.map((job) => ({
      id: job.id,
      type: job.type,
      title: job.title,
      attempts: job.attempts,
      payload: job.payload,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  type PrintResultBody = { id?: string; ok?: boolean; error?: string | null };
  let body: PrintResultBody | null = null;
  try {
    body = (await request.json()) as PrintResultBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Body JSON tidak valid.' }, { status: 400 });
  }
  if (!body?.id) {
    return NextResponse.json({ ok: false, error: 'id wajib diisi.' }, { status: 400 });
  }
  try {
    const result = await completePrintJob(
      body.id,
      agentId(request),
      Boolean(body.ok),
      body.error ?? null,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Gagal update job.' },
      { status: 400 },
    );
  }
}
