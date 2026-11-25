import { NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/auth';
import { getReportData } from '@/lib/queries/admin';

export const dynamic = 'force-dynamic';

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(',');
}

export async function GET(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (staff.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const parsed = Number(params.get('range'));
  const range = [7, 14, 30].includes(parsed) ? parsed : 7;
  const data = await getReportData(range);

  const lines: string[] = [
    csvRow(['Cue & Tap POS - Laporan Penjualan']),
    csvRow(['Periode', `${range} hari`]),
    csvRow(['Dibuat', new Date().toISOString()]),
    '',
    csvRow(['RINGKASAN']),
    csvRow(['Total omzet', data.totals.revenue]),
    csvRow(['Transaksi settled', data.totals.transactions]),
    csvRow(['Rata-rata per bill', data.totals.avgBill]),
    csvRow(['Omzet billiard', data.totals.billiard]),
    csvRow(['Omzet F&B', data.totals.fnb]),
    '',
    csvRow(['HARIAN']),
    csvRow(['Tanggal', 'Transaksi', 'Billiard', 'F&B', 'Total']),
    ...data.days.map((day) =>
      csvRow([day.date, day.transactionCount, day.billiardRevenue, day.fnbRevenue, day.revenue]),
    ),
    '',
    csvRow(['METODE PEMBAYARAN']),
    csvRow(['Metode', 'Transaksi', 'Nominal', 'Share %']),
    ...data.paymentMix.map((method) =>
      csvRow([method.method, method.count, method.amount, method.share]),
    ),
    '',
    csvRow(['MENU TERLARIS']),
    csvRow(['Menu', 'Qty', 'Omzet']),
    ...data.topItems.map((item) => csvRow([item.name, item.qty, item.revenue])),
    '',
    csvRow(['MEJA TERLARIS']),
    csvRow(['Meja', 'Zona', 'Sesi', 'Omzet']),
    ...data.topTables.map((table) =>
      csvRow([table.code, table.zone, table.sessions, table.revenue]),
    ),
    '',
  ];

  const filename = `cuetap-laporan-${range}-hari-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(`\uFEFF${lines.join('\r\n')}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
