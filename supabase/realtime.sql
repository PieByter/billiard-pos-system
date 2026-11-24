-- ============================================================================
-- Cue & Tap — Supabase Realtime + RLS SELECT policies untuk layar staff.
-- Jalankan di Supabase SQL Editor setelah migration Drizzle.
-- Drizzle memakai role postgres (bypass RLS); policy ini hanya untuk
-- PostgREST + Supabase Realtime yang memakai anon/authenticated key.
-- ============================================================================

-- Helpers: cek staff/owner tanpa rekursi RLS.
create or replace function public.cuetap_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true
  );
$$;

create or replace function public.cuetap_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'owner'
  );
$$;

revoke all on function public.cuetap_is_staff() from public;
revoke all on function public.cuetap_is_owner() from public;
grant execute on function public.cuetap_is_staff() to authenticated;
grant execute on function public.cuetap_is_owner() to authenticated;

-- Profiles: staff hanya bisa membaca row-nya sendiri.
drop policy if exists "cuetap_staff_read_self" on public.profiles;
create policy "cuetap_staff_read_self"
  on public.profiles for select to authenticated
  using (id = auth.uid());

-- Tabel operasional: SELECT untuk staff yang login.
do $$
declare
  t text;
begin
  foreach t in array array[
    'venue_tables','bills','billiard_sessions','orders','order_items',
    'payments','service_requests'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'cuetap_staff_read_' || t, t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.cuetap_is_staff())',
      'cuetap_staff_read_' || t, t
    );
  end loop;
end $$;

-- Shifts & audit log: owner only.
drop policy if exists "cuetap_owner_read_shifts" on public.shifts;
create policy "cuetap_owner_read_shifts"
  on public.shifts for select to authenticated
  using (public.cuetap_is_owner());

drop policy if exists "cuetap_owner_read_audit" on public.audit_log;
create policy "cuetap_owner_read_audit"
  on public.audit_log for select to authenticated
  using (public.cuetap_is_owner());

-- Tambahkan tabel ke publication Realtime (abaikan jika sudah ada).
do $$
declare
  t text;
begin
  foreach t in array array[
    'venue_tables','bills','billiard_sessions','orders','order_items',
    'payments','service_requests','shifts','audit_log'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when others then
        raise notice 'Realtime publication untuk % dilewati: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- Catatan:
-- 1. Jangan membuat policy untuk role anon. Customer memakai polling API
--    ber-token (bukan Postgres Changes), sesuai PRD.
-- 2. Semua write tetap lewat Next.js server actions (Drizzle, bypass RLS).
-- 3. Realtime di aplikasi hanya memicu router.refresh(); data tetap dibaca
--    dari server action/query, bukan langsung dari payload PostgREST.
