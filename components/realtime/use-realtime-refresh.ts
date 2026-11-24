'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Realtime Postgres Changes untuk layar staf (Supabase Auth).
 * Polling tetap berjalan sebagai fallback jika Realtime belum diaktifkan.
 */
export function useRealtimeRefresh(tables: string[]): void {
  const router = useRouter();
  const timerRef = useRef<number | null>(null);
  const key = tables.join(',');

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const scheduleRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => router.refresh(), 350);
    };

    const channel = supabase.channel(`cuetap-live-${key.replaceAll(',', '-')}`);
    for (const table of key.split(',')) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRefresh,
      );
    }
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.debug('[realtime] channel error — fallback polling aktif');
      }
    });

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [key, router]);
}
