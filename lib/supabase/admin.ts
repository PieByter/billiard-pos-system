import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. HANYA dipakai di server action (owner) untuk
 * provisioning staff. Jangan pernah diimpor dari komponen client.
 */
export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
