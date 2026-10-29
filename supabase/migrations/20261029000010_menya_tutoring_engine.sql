-- ============================================================
-- Tutoring engine: per-conversation teaching state, the private bank item
-- being answered, and each learner's profile per learning objective.
--  - tutoring_sessions: mode (learn/explain), engine state, hint level, objective
--  - session_items: the current bank problem WITH its reference answer.
--    Service role only: learners can never read an answer key.
--  - served_items: every bank problem a learner has been shown (so "unseen" is true)
--  - assessment_attempts: every marked attempt (verdict, misconception, hints)
--  - learner_objectives: mastery estimate, evidence counts, misconceptions,
--    next review date. Readable by the learner (no answers in it).
-- Rollback: drop table public.learner_objectives, public.assessment_attempts,
-- public.served_items, public.session_items; alter table public.tutoring_sessions
-- drop column mode, drop column engine_state, drop column hint_level, drop column objective;
-- ============================================================
alter table public.tutoring_sessions
  add column mode         text not null default 'learn' check (mode in ('learn', 'explain')),
  add column engine_state text,
  add column hint_level   integer check (hint_level between 0 and 5),
  add column objective    text;

create table public.session_items (
  session_id uuid primary key references public.tutoring_sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('practice', 'verify', 'review')),
  item       jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.session_items enable row level security;
revoke all on public.session_items from anon, authenticated;

create table public.served_items (
  user_id     uuid not null references auth.users(id) on delete cascade,
  template_id text not null,
  seed        integer not null,
  kind        text not null,
  served_at   timestamptz not null default now(),
  primary key (user_id, template_id, seed)
);
alter table public.served_items enable row level security;
revoke all on public.served_items from anon, authenticated;

create table public.assessment_attempts (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  session_id    uuid references public.tutoring_sessions(id) on delete set null,
  objective_id  text not null,
  template_id   text,
  seed          integer,
  kind          text not null check (kind in ('guided', 'practice', 'verify', 'review')),
  verdict       text not null check (verdict in ('correct', 'incorrect')),
  misconception text,
  hints_used    integer not null default 0,
  unexplained   boolean not null default false,
  created_at    timestamptz not null default now()
);
create index assessment_attempts_user_idx on public.assessment_attempts(user_id, objective_id, created_at desc);
alter table public.assessment_attempts enable row level security;
create policy assessment_attempts_self_read on public.assessment_attempts for select to authenticated using (user_id = auth.uid());
revoke all on public.assessment_attempts from anon;
revoke insert, update, delete on public.assessment_attempts from authenticated;
grant select on public.assessment_attempts to authenticated;

create table public.learner_objectives (
  user_id             uuid not null references auth.users(id) on delete cascade,
  objective_id        text not null,
  alpha               numeric not null default 1,
  beta                numeric not null default 1,
  independent_correct integer not null default 0,
  guided_correct      integer not null default 0,
  incorrect           integer not null default 0,
  delayed_correct     integer not null default 0,
  last_success_at     timestamptz,
  last_seen_at        timestamptz,
  next_review_at      timestamptz,
  review_streak       integer not null default 0,
  misconceptions      jsonb not null default '{}'::jsonb,
  status              text not null default 'learning' check (status in ('learning', 'practising', 'mastered')),
  updated_at          timestamptz not null default now(),
  primary key (user_id, objective_id)
);
create index learner_objectives_review_idx on public.learner_objectives(user_id, next_review_at);
alter table public.learner_objectives enable row level security;
create policy learner_objectives_self_read on public.learner_objectives for select to authenticated using (user_id = auth.uid());
revoke all on public.learner_objectives from anon;
revoke insert, update, delete on public.learner_objectives from authenticated;
grant select on public.learner_objectives to authenticated;

-- Data portability now includes the learning profile and assessment attempts.
create or replace function public.export_my_data(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where id = p_user),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('plan', plan_id, 'status', status, 'interval', billing_interval,
        'period_end', current_period_end, 'provider', provider)) from public.subscriptions where user_id = p_user), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'created_at', s.created_at, 'mode', s.mode,
        'messages', (select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'content', m.content, 'at', m.created_at) order by m.id), '[]'::jsonb)
                     from public.tutoring_messages m where m.session_id = s.id)))
      from public.tutoring_sessions s where s.user_id = p_user), '[]'::jsonb),
    'learning_events', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'concepts', concepts, 'hints_used', hints_used,
        'examples_used', examples_used, 'attempts', attempts, 'at', created_at) order by id) from public.learning_events where user_id = p_user), '[]'::jsonb),
    'learning_profile', coalesce((select jsonb_agg(to_jsonb(o) - 'user_id') from public.learner_objectives o where user_id = p_user), '[]'::jsonb),
    'assessment_attempts', coalesce((select jsonb_agg(jsonb_build_object('objective', objective_id, 'kind', kind, 'verdict', verdict,
        'misconception', misconception, 'hints_used', hints_used, 'at', created_at) order by id) from public.assessment_attempts where user_id = p_user), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg(jsonb_build_object('rating', rating, 'reply', reply_excerpt, 'at', created_at) order by id)
      from public.tutor_feedback where user_id = p_user), '[]'::jsonb),
    'usage', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'premium', premium, 'status', status))
      from public.usage_records where user_id = p_user), '[]'::jsonb));
$$;
revoke execute on function public.export_my_data(uuid) from public, anon, authenticated;
grant execute on function public.export_my_data(uuid) to service_role;
