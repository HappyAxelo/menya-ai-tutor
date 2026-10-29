-- ============================================================
-- Reply feedback (Bad / Fair / Good) and the administrator's analytics.
-- A learner rates a tutor reply; one rating per reply (a new click replaces
-- it). The reply and the question it answered are copied as short excerpts,
-- so the record stays readable after the 180-day message purge. Feedback is
-- deleted with the account.
-- Rollback: drop function public.admin_overview_json(uuid), public.admin_feedback_export(uuid),
-- public.admin_users_export(uuid), public.submit_feedback(uuid, bigint, text);
-- drop table public.tutor_feedback;
-- ============================================================
create table public.tutor_feedback (
  id               bigserial primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  session_id       uuid references public.tutoring_sessions(id) on delete set null,
  message_id       bigint references public.tutoring_messages(id) on delete set null,
  rating           text not null check (rating in ('bad', 'fair', 'good')),
  plan_id          text,                 -- the learner's plan when they rated
  reply_type       text,
  language         text,
  question_excerpt text,                 -- the learner's message the reply answered (first 500 characters)
  reply_excerpt    text,                 -- the tutor's reply (first 1000 characters)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, message_id)
);
create index tutor_feedback_created_idx on public.tutor_feedback(created_at desc);

alter table public.tutor_feedback enable row level security;
create policy tutor_feedback_self_read on public.tutor_feedback for select to authenticated using (user_id = auth.uid());
revoke all on public.tutor_feedback from anon;
revoke insert, update, delete on public.tutor_feedback from authenticated;
grant select on public.tutor_feedback to authenticated;

-- Rate a tutor reply. Only the learner's own assistant messages can be rated.
create or replace function public.submit_feedback(p_user uuid, p_message bigint, p_rating text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m public.tutoring_messages;
  q text;
  s public.tutoring_sessions;
begin
  if p_rating not in ('bad', 'fair', 'good') then raise exception 'invalid_rating' using errcode = '22023'; end if;
  select * into m from public.tutoring_messages where id = p_message and user_id = p_user and role = 'assistant';
  if not found then raise exception 'message_not_found' using errcode = '22023'; end if;
  select * into s from public.tutoring_sessions where id = m.session_id;
  select content into q from public.tutoring_messages
    where session_id = m.session_id and role = 'user' and id < m.id order by id desc limit 1;
  insert into public.tutor_feedback (user_id, session_id, message_id, rating, plan_id, reply_type, language, question_excerpt, reply_excerpt)
  values (p_user, m.session_id, m.id, p_rating, (select plan_id from public.resolve_entitlement(p_user)),
          m.meta->>'type', s.language, left(q, 500), left(m.content, 1000))
  on conflict (user_id, message_id) do update set rating = excluded.rating, updated_at = now();
  return jsonb_build_object('ok', true, 'rating', p_rating);
end $$;

-- Dashboard numbers: learners by plan, activity, learning and feedback.
create or replace function public.admin_overview_json(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  perform public.require_platform_admin(p_actor);
  with learners as (
    select p.id, p.created_at, e.plan_id, e.source,
           (select max(created_at) from public.usage_records u where u.user_id = p.id and u.status = 'success') as last_active
    from public.profiles p cross join lateral public.resolve_entitlement(p.id) e
  )
  select jsonb_build_object(
    'users_total', (select count(*) from learners),
    'by_plan', coalesce((select jsonb_agg(jsonb_build_object(
        'plan_id', pl.id,
        'users', (select count(*) from learners l where l.plan_id = pl.id),
        'via_institution', (select count(*) from learners l where l.plan_id = pl.id and l.source = 'organization'),
        'active_7d', (select count(*) from learners l where l.plan_id = pl.id and l.last_active > now() - interval '7 days'),
        'active_30d', (select count(*) from learners l where l.plan_id = pl.id and l.last_active > now() - interval '30 days'),
        'new_30d', (select count(*) from learners l where l.plan_id = pl.id and l.created_at > now() - interval '30 days'))
      order by pl.rank) from public.plans pl), '[]'::jsonb),
    'sessions_30d', (select count(*) from public.tutoring_sessions where created_at > now() - interval '30 days'),
    'requests_30d', (select count(*) from public.usage_records where status = 'success' and created_at > now() - interval '30 days'),
    'verified_solves_30d', (select count(*) from public.learning_events where created_at > now() - interval '30 days'),
    'independent_solves_30d', (select count(*) from public.learning_events
        where created_at > now() - interval '30 days' and hints_used = 0 and examples_used = 0),
    'feedback', jsonb_build_object(
        'good', (select count(*) from public.tutor_feedback where rating = 'good'),
        'fair', (select count(*) from public.tutor_feedback where rating = 'fair'),
        'bad', (select count(*) from public.tutor_feedback where rating = 'bad'),
        'last_30d', (select count(*) from public.tutor_feedback where created_at > now() - interval '30 days')),
    'daily_active', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'users', d.users) order by d.day)
        from (select date_trunc('day', created_at)::date as day, count(distinct user_id) as users
              from public.usage_records where status = 'success' and created_at > now() - interval '30 days'
              group by 1) d), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- Feedback rows for the Excel download, newest first.
create or replace function public.admin_feedback_export(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_platform_admin(p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'created_at', f.created_at, 'email', p.email, 'plan', f.plan_id, 'rating', f.rating, 'language', f.language,
      'reply_type', f.reply_type, 'question', f.question_excerpt, 'reply', f.reply_excerpt, 'session_id', f.session_id)
    order by f.created_at desc)
    from (select * from public.tutor_feedback order by created_at desc limit 20000) f
    left join public.profiles p on p.id = f.user_id), '[]'::jsonb);
end $$;

-- Every learner with plan and activity, for the Excel download.
create or replace function public.admin_users_export(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_platform_admin(p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'email', p.email, 'plan', e.plan_id, 'plan_source', e.source, 'role', p.platform_role, 'joined', p.created_at,
      'last_active', (select max(created_at) from public.usage_records u where u.user_id = p.id and u.status = 'success'),
      'requests_30d', (select count(*) from public.usage_records u where u.user_id = p.id and u.status = 'success'
                         and u.created_at > now() - interval '30 days'),
      'conversations', (select count(*) from public.tutoring_sessions s where s.user_id = p.id),
      'verified_solves', (select count(*) from public.learning_events l where l.user_id = p.id),
      'feedback_given', (select count(*) from public.tutor_feedback f where f.user_id = p.id))
    order by p.created_at desc)
    from public.profiles p cross join lateral public.resolve_entitlement(p.id) e), '[]'::jsonb);
end $$;

revoke execute on function public.submit_feedback(uuid, bigint, text), public.admin_overview_json(uuid),
  public.admin_feedback_export(uuid), public.admin_users_export(uuid) from public, anon, authenticated;
grant execute on function public.submit_feedback(uuid, bigint, text), public.admin_overview_json(uuid),
  public.admin_feedback_export(uuid), public.admin_users_export(uuid) to service_role;

-- Data portability now includes the learner's own ratings.
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
    'feedback', coalesce((select jsonb_agg(jsonb_build_object('rating', rating, 'reply', reply_excerpt, 'at', created_at) order by id)
      from public.tutor_feedback where user_id = p_user), '[]'::jsonb),
    'usage', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'premium', premium, 'status', status))
      from public.usage_records where user_id = p_user), '[]'::jsonb));
$$;
revoke execute on function public.export_my_data(uuid) from public, anon, authenticated;
grant execute on function public.export_my_data(uuid) to service_role;
