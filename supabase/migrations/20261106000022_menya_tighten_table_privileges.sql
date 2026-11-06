-- ============================================================
-- Browser roles keep only what row-level security governs. Supabase's default grants gave anon and
-- authenticated TRUNCATE, TRIGGER, REFERENCES and (Postgres 17) MAINTAIN on some tables. None is used by
-- the website, none is reachable through Supabase's REST API, and TRUNCATE and MAINTAIN ignore row-level
-- security, so they are removed from every public table and from the defaults for tables created later.
-- SELECT, INSERT, UPDATE and DELETE grants are unchanged. No data is touched.
-- Rollback: grant truncate, trigger, references [, maintain] on the affected tables to the two roles.
-- ============================================================
do $$
declare t record; extra text := case when current_setting('server_version_num')::int >= 170000 then ', maintain' else '' end;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke truncate, trigger, references%s on public.%I from anon, authenticated', extra, t.relname);
  end loop;
  execute format('alter default privileges for role postgres in schema public revoke truncate, trigger, references%s on tables from anon, authenticated', extra);
end $$;
