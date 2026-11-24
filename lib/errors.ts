export class AppError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const candidate = current as { code?: string; cause?: unknown; message?: string };
    if (candidate.code === '23505') return true;
    if (
      typeof candidate.message === 'string' &&
      (candidate.message.includes('duplicate key value') ||
        candidate.message.includes('unique constraint'))
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

export function isForeignKeyViolation(error: unknown): boolean {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate?.code === '23503' || candidate?.cause?.code === '23503';
}

export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) {
    if (error.message.includes('NEXT_REDIRECT')) return error.message;
    return error.message || 'Terjadi kesalahan.';
  }
  return 'Terjadi kesalahan.';
}
