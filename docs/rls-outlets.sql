-- Template RLS multi-outlet untuk Supabase/Postgres.
-- Aplikasi Cue & Tap sudah melakukan scoping outlet_id di query server.
-- Aktifkan file ini HANYA jika setiap request/transaksi men-set:
--   select set_config('app.outlet_id', '<uuid-outlet-aktif>', true);
--
-- Jangan jalankan langsung di database demo PGlite: PGlite memakai satu
-- koneksi dan tidak memiliki konteks JWT Supabase.
--
-- Untuk Supabase, set variabel di Postgres:
--   alter database postgres set app.outlet_id = '00000000-0000-4000-8000-000000000001';
-- lalu sesuaikan per request dari server (service role) sebelum query.

create or replace function public.cuetap_current_outlet()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.outlet_id', true), '')::uuid;
$$;

do $$
declare
  target record;
begin
  for target in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'outlet_id'
      and table_name not in ('outlets')
  loop
    execute format('drop policy if exists outlet_isolation on public.%I', target.table_name);
    execute format(
      'create policy outlet_isolation on public.%I
         using (outlet_id = public.cuetap_current_outlet())
         with check (outlet_id = public.cuetap_current_outlet())',
      target.table_name
    );
  end loop;
end $$;

-- Tabel outlets sendiri dibatasi lewat service role / admin panel.
-- Untuk profiles, pastikan policy tambahan mengizinkan user membaca profil
-- miliknya sendiri jika memakai Supabase Auth langsung:
-- create policy profiles_self_read on public.profiles
--   for select using (id = auth.uid());
