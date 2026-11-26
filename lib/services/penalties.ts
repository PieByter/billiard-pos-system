import { and, desc, eq } from 'drizzle-orm';
import { dbNow, getDb } from '@/lib/db';
import { billSplits, bills, payments, penalties, penaltyRules } from '@/lib/db/schema';
import { AppError } from '@/lib/errors';
import { getActiveOutletId } from '@/lib/outlet';
import { recalcBillTotals } from './bill';
import { audit } from './audit';

export type PenaltyRuleInput = {
  id?: string;
  name: string;
  type: 'overtime' | 'no_show' | 'cancellation' | 'damage' | 'loss' | 'other';
  defaultAmount: number;
  maxAmount?: number | null;
  graceMinutes?: number;
  ratePerHour?: number | null;
  autoApply?: boolean;
  active?: boolean;
};

export async function savePenaltyRule(staffId: string, input: PenaltyRuleInput) {
  const name = input.name.trim();
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama denda wajib diisi.');
  if (input.defaultAmount < 0) throw new AppError('INVALID_AMOUNT', 'Nominal denda tidak valid.');
  const outletId = await getActiveOutletId();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    if (input.id) {
      const [updated] = await tx
        .update(penaltyRules)
        .set({
          name,
          type: input.type,
          defaultAmount: Math.round(input.defaultAmount),
          maxAmount: input.maxAmount ? Math.round(input.maxAmount) : null,
          graceMinutes: Math.max(0, Math.round(input.graceMinutes ?? 0)),
          ratePerHour: input.ratePerHour ? Math.round(input.ratePerHour) : null,
          autoApply: input.autoApply ?? false,
          active: input.active ?? true,
        })
        .where(and(eq(penaltyRules.id, input.id), eq(penaltyRules.outletId, outletId)))
        .returning();
      if (!updated) throw new AppError('RULE_NOT_FOUND', 'Aturan denda tidak ditemukan.');
      await audit(tx, {
        staffId,
        action: 'penalty_rule.updated',
        entityType: 'penalty_rule',
        entityId: updated.id,
        detail: { name, type: input.type, amount: input.defaultAmount },
        at: now,
      });
      return { id: updated.id };
    }
    const [created] = await tx
      .insert(penaltyRules)
      .values({
        outletId,
        name,
        type: input.type,
        defaultAmount: Math.round(input.defaultAmount),
        maxAmount: input.maxAmount ? Math.round(input.maxAmount) : null,
        graceMinutes: Math.max(0, Math.round(input.graceMinutes ?? 0)),
        ratePerHour: input.ratePerHour ? Math.round(input.ratePerHour) : null,
        autoApply: input.autoApply ?? false,
        active: input.active ?? true,
      })
      .returning();
    await audit(tx, {
      staffId,
      action: 'penalty_rule.created',
      entityType: 'penalty_rule',
      entityId: created.id,
      detail: { name, type: input.type, amount: input.defaultAmount },
      at: now,
    });
    return { id: created.id };
  });
}

export async function togglePenaltyRule(staffId: string, ruleId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [rule] = await tx.select().from(penaltyRules).where(eq(penaltyRules.id, ruleId)).limit(1);
    if (!rule) throw new AppError('RULE_NOT_FOUND', 'Aturan denda tidak ditemukan.');
    const [updated] = await tx
      .update(penaltyRules)
      .set({ active: !rule.active })
      .where(eq(penaltyRules.id, ruleId))
      .returning();
    await audit(tx, {
      staffId,
      action: updated.active ? 'penalty_rule.activated' : 'penalty_rule.deactivated',
      entityType: 'penalty_rule',
      entityId: ruleId,
      detail: { name: rule.name },
      at: now,
    });
    return { active: updated.active };
  });
}

export async function applyPenalty(
  staffId: string,
  billId: string,
  input: { ruleId?: string | null; type: PenaltyRuleInput['type']; amount: number; reason: string },
) {
  const reason = input.reason.trim();
  const amount = Math.round(Number(input.amount));
  if (!reason) throw new AppError('REASON_REQUIRED', 'Alasan denda wajib diisi.');
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('INVALID_AMOUNT', 'Nominal denda tidak valid.');
  }

  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    const [paymentCount] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.billId, billId))
      .limit(1);
    if (paymentCount) throw new AppError('BILL_HAS_PAYMENT', 'Denda harus sebelum pembayaran.');
    const [split] = await tx
      .select({ id: billSplits.id })
      .from(billSplits)
      .where(eq(billSplits.billId, billId))
      .limit(1);
    if (split) throw new AppError('BILL_SPLIT_LOCKED', 'Denda harus sebelum split.');

    if (input.ruleId) {
      const [rule] = await tx
        .select()
        .from(penaltyRules)
        .where(and(eq(penaltyRules.id, input.ruleId), eq(penaltyRules.active, true)))
        .limit(1);
      if (!rule) throw new AppError('RULE_NOT_FOUND', 'Aturan denda tidak aktif.');
      if (rule.maxAmount && amount > rule.maxAmount) {
        throw new AppError('PENALTY_TOO_LARGE', `Maksimal denda ${rule.maxAmount}.`);
      }
    }

    const [penalty] = await tx
      .insert(penalties)
      .values({
        outletId: bill.outletId,
        billId,
        ruleId: input.ruleId ?? null,
        type: input.type,
        amount,
        reason,
        status: 'approved',
        approvedBy: staffId,
        createdAt: now,
      })
      .returning();
    await tx
      .update(bills)
      .set({ penaltyAmount: bill.penaltyAmount + amount })
      .where(eq(bills.id, billId));
    const updated = await recalcBillTotals(tx, billId, now);
    await audit(tx, {
      staffId,
      action: 'bill.penalty_applied',
      entityType: 'bill',
      entityId: billId,
      detail: { billNumber: bill.billNumber, type: input.type, amount, reason },
      at: now,
    });
    return { penaltyId: penalty.id, amount, total: updated.total };
  });
}

export async function waivePenalty(staffId: string, penaltyId: string, reason: string) {
  const waivedReason = reason.trim();
  if (!waivedReason) throw new AppError('REASON_REQUIRED', 'Alasan waive wajib diisi.');
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [penalty] = await tx.select().from(penalties).where(eq(penalties.id, penaltyId)).limit(1);
    if (!penalty) throw new AppError('PENALTY_NOT_FOUND', 'Denda tidak ditemukan.');
    if (penalty.status !== 'approved') throw new AppError('PENALTY_LOCKED', 'Denda sudah final.');
    if (!penalty.billId) throw new AppError('BILL_NOT_FOUND', 'Denda tidak terhubung ke bill.');
    const [bill] = await tx.select().from(bills).where(eq(bills.id, penalty.billId)).limit(1);
    if (!bill || bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    await tx
      .update(penalties)
      .set({ status: 'waived', waivedReason })
      .where(eq(penalties.id, penaltyId));
    await tx
      .update(bills)
      .set({ penaltyAmount: Math.max(0, bill.penaltyAmount - penalty.amount) })
      .where(eq(bills.id, bill.id));
    await recalcBillTotals(tx, bill.id, now);
    await audit(tx, {
      staffId,
      action: 'bill.penalty_waived',
      entityType: 'penalty',
      entityId: penaltyId,
      detail: { billNumber: bill.billNumber, amount: penalty.amount, reason: waivedReason },
      at: now,
    });
    return { penaltyId, waived: true };
  });
}

export async function getPenaltyData() {
  const db = await getDb();
  const outletId = await getActiveOutletId();
  const [ruleRows, penaltyRows] = await Promise.all([
    db
      .select()
      .from(penaltyRules)
      .where(eq(penaltyRules.outletId, outletId))
      .orderBy(desc(penaltyRules.createdAt)),
    db
      .select({ penalty: penalties, billNumber: bills.billNumber })
      .from(penalties)
      .leftJoin(bills, eq(penalties.billId, bills.id))
      .where(eq(penalties.outletId, outletId))
      .orderBy(desc(penalties.createdAt))
      .limit(50),
  ]);
  return {
    rules: ruleRows.map((rule) => ({
      id: rule.id,
      name: rule.name,
      type: rule.type,
      defaultAmount: rule.defaultAmount,
      maxAmount: rule.maxAmount,
      graceMinutes: rule.graceMinutes,
      ratePerHour: rule.ratePerHour,
      autoApply: rule.autoApply,
      active: rule.active,
    })),
    penalties: penaltyRows.map((row) => ({
      id: row.penalty.id,
      billId: row.penalty.billId,
      billNumber: row.billNumber,
      type: row.penalty.type,
      amount: row.penalty.amount,
      reason: row.penalty.reason,
      status: row.penalty.status,
      autoGenerated: row.penalty.autoGenerated,
      createdAt: row.penalty.createdAt.toISOString(),
    })),
  };
}
