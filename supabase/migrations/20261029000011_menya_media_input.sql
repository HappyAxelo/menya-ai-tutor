-- ============================================================
-- Voice and image input: a per-learner daily allowance, kept apart from
-- tutor requests so it neither uses up the tutoring quota nor inflates
-- tutoring statistics. media_allow() checks and records in one step.
-- Rollback: drop function public.media_allow(uuid, text, int); drop table public.media_usage;
-- ============================================================
create table public.media_usage (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('transcribe', 'read_image')),
  created_at timestamptz not null default now()
);
create index media_usage_user_day_idx on public.media_usage(user_id, kind, created_at);
alter table public.media_usage enable row level security;
revoke all on public.media_usage from anon, authenticated;

create or replace function public.media_allow(p_user uuid, p_kind text, p_cap int) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text || p_kind));
  if (select count(*) from public.media_usage
      where user_id = p_user and kind = p_kind and created_at >= date_trunc('day', now())) >= p_cap then
    return false;
  end if;
  insert into public.media_usage (user_id, kind) values (p_user, p_kind);
  return true;
end $$;
revoke execute on function public.media_allow(uuid, text, int) from public, anon, authenticated;
grant execute on function public.media_allow(uuid, text, int) to service_role;
