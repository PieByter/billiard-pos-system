import { AppError, errorMessage } from './errors';

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; code?: string };

export function actionOk<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function actionFail(error: unknown): ActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  const digest = (error as { digest?: string })?.digest;
  if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND')) {
    throw error;
  }
  console.error('[action]', error);
  return { ok: false, error: errorMessage(error) || 'Terjadi kesalahan pada server.' };
}

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return actionOk(await fn());
  } catch (error) {
    return actionFail(error);
  }
}

/** Validasi ringan untuk input server action agar error konsisten. */
export function assert(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new AppError(code, message);
}
