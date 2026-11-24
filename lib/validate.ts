import type { z } from 'zod';
import { AppError } from './errors';

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AppError('VALIDATION', first?.message ?? 'Input tidak valid.');
  }
  return parsed.data;
}
