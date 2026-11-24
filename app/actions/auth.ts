'use server';

import { redirect } from 'next/navigation';
import { actionFail, actionOk, runAction, type ActionResult } from '@/lib/action-result';
import { signInWithEmail, signOut } from '@/lib/auth';
import { AppError } from '@/lib/errors';

export async function loginAction(
  email: string,
  password: string,
): Promise<ActionResult<{ redirectTo: string }>> {
  const result = await signInWithEmail(email, password);
  if (!result.ok) {
    return actionFail(new AppError('AUTH_FAILED', result.error));
  }
  return actionOk({ redirectTo: result.redirectTo });
}

export async function logoutAction(): Promise<void> {
  await signOut();
  redirect('/login');
}
