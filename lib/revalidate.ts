import { revalidatePath } from 'next/cache';

/** Semua layar operasional menarik data live; invalidasi seluruh tree. */
export function revalidateOps(): void {
  revalidatePath('/', 'layout');
}
