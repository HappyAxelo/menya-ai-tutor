-- ============================================================
-- Real progress: a learning event is written only when the server has
-- confirmed that the student's own answer matches the tutor's private,
-- verified answer. Messages, hints and explanations never create one.
-- Sessions also track the current problem (attempts, practice, solved)
-- so worked solutions and practice checks are decided server-side.
-- Rollback: drop table public.learning_events; alter table
-- public.tutoring_sessions drop column attempts, drop column practice,
-- drop column solved, drop column examples_used, drop column problems_solved;
-- ============================================================
alter table public.tutoring_sessions
  add column attempts        integer not null default 0,  -- student answers on the current problem
  add column practice        boolean not null default false, -- current problem is a practice question
  add column solved          boolean not null default false, -- current problem solved (verified)
  add column examples_used   integer not null default 0,     -- worked examples shown on the current problem
  add column problems_solved integer not null default 0;

create table public.learning_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Deleting a conversation keeps the progress record (no message content is stored here).
  session_id  uuid references public.tutoring_sessions(id) on delete set null,
  kind        text not null check (kind in ('problem_solved', 'practice_solved')),
  concepts    text[] not null default '{}',
  hints_used  integer not null default 0 check (hints_used between 0 and 3),
  examples_used integer not null default 0,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index learning_events_user_idx on public.learning_events(user_id, created_at desc);

alter table public.learning_events enable row level security;
create policy learning_events_self_read on public.learning_events for select to authenticated using (user_id = auth.uid());
revoke all on public.learning_events from anon;
revoke insert, update, delete on public.learning_events from authenticated;
grant select on public.learning_events to authenticated;

-- Data portability now includes learning events.
create or replace function public.export_my_data(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where id = p_user),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('plan', plan_id, 'status', status, 'interval', billing_interval,
        'period_end', current_period_end, 'provider', provider)) from public.subscriptions where user_id = p_user), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'created_at', s.created_at,
        'messages', (select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'content', m.content, 'at', m.created_at) order by m.id), '[]'::jsonb)
                     from public.tutoring_messages m where m.session_id = s.id)))
      from public.tutoring_sessions s where s.user_id = p_user), '[]'::jsonb),
    'learning_events', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'concepts', concepts, 'hints_used', hints_used,
        'examples_used', examples_used, 'attempts', attempts, 'at', created_at) order by id) from public.learning_events where user_id = p_user), '[]'::jsonb),
    'usage', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'premium', premium, 'status', status))
      from public.usage_records where user_id = p_user), '[]'::jsonb));
$$;
revoke execute on function public.export_my_data(uuid) from public, anon, authenticated;
grant execute on function public.export_my_data(uuid) to service_role;
