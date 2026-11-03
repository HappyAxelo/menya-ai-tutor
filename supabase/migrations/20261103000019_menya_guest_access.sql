-- ============================================================
-- Guest access: try Menya without an account. A guest is a Supabase anonymous user: a real session
-- issued by the server, never an id chosen by the browser. Same tutor, same data rules, guest plan limits.
-- Limits are the 'guest' row in plans (Admin → Plan limits); total capacity and how long sessions last
-- are in app_settings. Nothing about existing accounts changes; nothing is deleted except guest sessions
-- past their expiry.
-- Rollback: delete from auth.users where is_anonymous; update the functions below from their earlier
-- migrations; drop table public.guest_claims, public.guest_sessions; delete from public.plans where
-- id = 'guest'; alter table public.profiles drop column is_guest; cron.unschedule('menya-purge-old-guests').
-- ============================================================
alter table public.profiles add column is_guest boolean not null default false;

insert into public.plans (id, name, tagline, price_monthly_cents, price_yearly_cents, currency, rank, daily_request_limit, monthly_request_limit,
                          monthly_premium_limit, premium_safety_margin, requests_per_minute, max_session_turns, context_turns, routing_policy,
                          analytics_level, features, is_public, daily_image_limit, material_limit, daily_exam_limit)
values ('guest', 'Guest', 'Try Menya without an account', null, null, 'USD', -10, 5, 5, 0, 0, 6, 10, 10, 'free', 'basic', '[]', false, 1, 0, 0)
on conflict (id) do nothing;

insert into public.app_settings (key, value, description) values
  ('guest_total_daily_messages', '500', 'Tutor messages all guests together may use in a day (protects the shared AI capacity)'),
  ('guest_session_days', '30', 'Guest sessions unused for this many days are deleted'),
  ('guest_claim_hours', '24', 'How long a guest has to finish signing up and keep their conversation')
on conflict (key) do nothing;

-- One row per guest session, kept after the session is deleted so sign-up numbers stay true. It holds no
-- personal information, and a session isn't a person: one student can have several.
create table public.guest_sessions (
  guest_id           uuid primary key,
  created_at         timestamptz not null default now(),
  limit_reached_at   timestamptz,
  signup_started_at  timestamptz,
  converted_at       timestamptz,
  converted_user_id  uuid references auth.users(id) on delete set null,
  into_existing      boolean
);
create index guest_sessions_created_idx on public.guest_sessions(created_at);
alter table public.guest_sessions enable row level security;
revoke all on public.guest_sessions from anon, authenticated;

-- Proof that whoever is signing in was this guest: issued to the guest's own session, stored only as a
-- hash, single use, short-lived.
create table public.guest_claims (
  ticket_hash  text primary key,
  guest_id     uuid not null,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.guest_claims enable row level security;
revoke all on public.guest_claims from anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, is_guest) values (new.id, new.email, coalesce(new.is_anonymous, false))
  on conflict (id) do nothing;
  if coalesce(new.is_anonymous, false) then
    insert into public.guest_sessions (guest_id) values (new.id) on conflict (guest_id) do nothing;
  end if;
  return new;
end $$;

create or replace function public.resolve_entitlement(p_user uuid)
returns table (
  plan_id text, source text, org_id uuid, subscription_id uuid, subscription_status public.subscription_status,
  period_end timestamptz, daily_request_limit int, monthly_request_limit int, monthly_premium_limit int,
  premium_safety_margin int, requests_per_minute int, max_session_turns int, context_turns int,
  routing_policy text, analytics_level text, worked_solutions boolean
)
language sql stable security definer set search_path = public as $$
  with candidates as (
    -- Personal subscription
    select s.plan_id, 'subscription'::text as source, null::uuid as org_id, s.id as subscription_id,
           s.status, s.current_period_end, true as worked_solutions
    from public.subscriptions s
    where s.user_id = p_user and public.subscription_is_live(s)
    union all
    -- Institutional seat: org must be in good standing and either a pilot
    -- (granted by a platform admin) or covered by a live org subscription.
    select o.plan_id, 'organization', o.id, os.id, os.status, os.current_period_end, o.worked_solutions
    from public.org_members m
    join public.organizations o on o.id = m.org_id
    left join lateral (
      select * from public.subscriptions s2
      where s2.org_id = o.id and public.subscription_is_live(s2)
      order by s2.current_period_end desc nulls first limit 1
    ) os on true
    where m.user_id = p_user and m.seat_assigned and o.status <> 'suspended'
      and (o.status = 'pilot' or os.id is not null)
    union all
    -- The fallback: a guest session gets the guest plan, an account gets Free.
    select case when exists (select 1 from public.profiles g where g.id = p_user and g.is_guest) then 'guest' else 'free' end,
           'free', null, null, null, null, true
  )
  select c.plan_id, c.source, c.org_id, c.subscription_id, c.status, c.current_period_end,
         p.daily_request_limit, p.monthly_request_limit, p.monthly_premium_limit, p.premium_safety_margin,
         p.requests_per_minute, p.max_session_turns, p.context_turns, p.routing_policy, p.analytics_level,
         c.worked_solutions
  from candidates c join public.plans p on p.id = c.plan_id
  order by p.rank desc, (c.source = 'subscription') desc
  limit 1;
$$;

create or replace function public.my_account() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  e record;
  d public.usage_counters;
  m public.usage_counters;
  pl public.plans;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into e from public.resolve_entitlement(v_user);
  select * into pl from public.plans where id = e.plan_id;
  select * into d from public.usage_counters where subject_type = 'user' and subject_id = v_user
    and period = 'day' and period_start = (now() at time zone 'utc')::date;
  select * into m from public.usage_counters where subject_type = 'user' and subject_id = v_user
    and period = 'month' and period_start = date_trunc('month', now() at time zone 'utc')::date;
  return jsonb_build_object(
    'plan', e.plan_id, 'source', e.source, 'org_id', e.org_id,
    'subscription_status', e.subscription_status, 'period_end', e.period_end,
    'cancel_at_period_end', (select cancel_at_period_end from public.subscriptions where id = e.subscription_id),
    'limits', jsonb_build_object('daily', e.daily_request_limit, 'monthly', e.monthly_request_limit,
      'premium', greatest(e.monthly_premium_limit - e.premium_safety_margin, 0),
      'session_turns', e.max_session_turns, 'analytics', e.analytics_level,
      'images', pl.daily_image_limit, 'notes', pl.material_limit),
    'used', jsonb_build_object('daily', coalesce(d.requests, 0), 'monthly', coalesce(m.requests, 0),
      'premium', coalesce(m.premium_requests, 0),
      'images', (select count(*) from public.media_usage where user_id = v_user and kind = 'diagram' and created_at >= date_trunc('day', now())),
      'notes', (select count(*) from public.course_materials where user_id = v_user)),
    -- The paid plan that most recently ended, so the dashboard can offer to renew it.
    'expired_plan', case when e.source = 'free' then (
       select jsonb_build_object('plan', s.plan_id, 'ended', s.current_period_end) from public.subscriptions s
       where s.user_id = v_user and s.plan_id <> 'free' and s.current_period_end <= now()
       order by s.current_period_end desc limit 1) end,
    'payment_pending', exists (select 1 from public.payments where user_id = v_user and status = 'pending' and created_at > now() - interval '25 hours'),
    'has_profile', exists (select 1 from public.learner_profiles where user_id = v_user),
    'is_admin', public.is_platform_admin(v_user),
    'org_admin_of', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name))
                              from public.org_members om join public.organizations o on o.id = om.org_id
                              where om.user_id = v_user and om.role = 'org_admin'), '[]'::jsonb));
end $$;

create or replace function public.guest_allow() returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) < public.setting_num('guest_total_daily_messages', 500)
  from public.usage_records where plan_id = 'guest' and status = 'success' and created_at >= date_trunc('day', now());
$$;

create or replace function public.guest_mark_limit(p_guest uuid) returns void
language sql security definer set search_path = public as $$
  update public.guest_sessions set limit_reached_at = coalesce(limit_reached_at, now()) where guest_id = p_guest;
$$;

create or replace function public.guest_start_signup(p_guest uuid, p_hash text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = p_guest and is_guest) then
    raise exception using errcode = '42501', message = 'not_a_guest';
  end if;
  delete from public.guest_claims where guest_id = p_guest and used_at is null;
  insert into public.guest_claims (ticket_hash, guest_id, expires_at)
  values (p_hash, p_guest, now() + make_interval(hours => public.setting_num('guest_claim_hours', 24)::int));
  update public.guest_sessions set signup_started_at = coalesce(signup_started_at, now()) where guest_id = p_guest;
end $$;

-- Moves a guest's learning to the account that just signed in, all or nothing. An account's existing data is
-- never overwritten: where both have something (a topic's level, a profile) the account's stays. Plans,
-- payments and usage counters don't move. An account that already has conversations must agree first.
create or replace function public.claim_guest(p_hash text, p_user uuid, p_consent boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.guest_claims; v_existing int; v_count int;
begin
  select * into c from public.guest_claims where ticket_hash = p_hash for update;
  if not found or c.expires_at < now() then return jsonb_build_object('status', 'expired'); end if;
  if c.used_at is not null then return jsonb_build_object('status', 'already_claimed'); end if;
  if c.guest_id = p_user or exists (select 1 from public.profiles where id = p_user and is_guest) then
    raise exception using errcode = '42501', message = 'account_required';
  end if;
  if not exists (select 1 from public.profiles where id = c.guest_id and is_guest) then return jsonb_build_object('status', 'expired'); end if;

  select count(*) into v_count from public.tutoring_sessions where user_id = c.guest_id;
  select count(*) into v_existing from public.tutoring_sessions where user_id = p_user;
  if v_existing > 0 and v_count > 0 and not p_consent then
    return jsonb_build_object('status', 'needs_consent', 'conversations', v_count);
  end if;

  update public.tutoring_sessions set user_id = p_user where user_id = c.guest_id;
  update public.tutoring_messages set user_id = p_user where user_id = c.guest_id;
  update public.session_items set user_id = p_user where user_id = c.guest_id;
  update public.learning_events set user_id = p_user where user_id = c.guest_id;
  update public.tutor_feedback set user_id = p_user where user_id = c.guest_id;
  update public.assessment_attempts set user_id = p_user where user_id = c.guest_id;
  update public.served_items g set user_id = p_user where g.user_id = c.guest_id
    and not exists (select 1 from public.served_items a where a.user_id = p_user and a.template_id = g.template_id and a.seed = g.seed);
  update public.learner_objectives g set user_id = p_user where g.user_id = c.guest_id
    and not exists (select 1 from public.learner_objectives a where a.user_id = p_user and a.objective_id = g.objective_id);
  update public.learner_profiles set user_id = p_user where user_id = c.guest_id
    and not exists (select 1 from public.learner_profiles a where a.user_id = p_user);

  update public.guest_claims set used_at = now() where ticket_hash = p_hash;
  update public.guest_sessions set converted_at = now(), converted_user_id = p_user, into_existing = v_existing > 0 where guest_id = c.guest_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_user, 'guest.converted', 'guest_session', c.guest_id::text, jsonb_build_object('conversations', v_count));
  delete from auth.users where id = c.guest_id;   -- what didn't move (counters, limits) goes with it
  return jsonb_build_object('status', 'claimed', 'conversations', v_count);
end $$;

-- Guest sessions nobody has used for a while, and old tickets. Only anonymous users are ever deleted.
create or replace function public.purge_old_guests() returns integer
language plpgsql security definer set search_path = public as $$
declare n int; v_days int := public.setting_num('guest_session_days', 30)::int;
begin
  delete from auth.users u using public.profiles p
  where p.id = u.id and p.is_guest and u.is_anonymous and p.created_at < now() - make_interval(days => v_days)
    and not exists (select 1 from public.usage_records r where r.user_id = u.id and r.created_at >= now() - make_interval(days => v_days));
  get diagnostics n = row_count;
  delete from public.guest_claims where expires_at < now() - interval '30 days';
  return n;
end $$;
select cron.schedule('menya-purge-old-guests', '45 3 * * *', $$select public.purge_old_guests()$$);

-- Guests never count as learners in the existing reports.
create or replace function public.admin_overview_json(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  perform public.require_platform_admin(p_actor);
  with learners as (
    select p.id, p.created_at, e.plan_id, e.source,
           (select max(created_at) from public.usage_records u where u.user_id = p.id and u.status = 'success') as last_active
    from public.profiles p cross join lateral public.resolve_entitlement(p.id) e
    where not p.is_guest
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
      order by pl.rank) from public.plans pl where pl.id <> 'guest'), '[]'::jsonb),
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
    from public.profiles p cross join lateral public.resolve_entitlement(p.id) e where not p.is_guest), '[]'::jsonb);
end $$;

create or replace function public.admin_list_users(p_actor uuid, p_search text, p_limit int)
returns table (user_id uuid, email text, platform_role public.platform_role, created_at timestamptz, plan_id text,
               plan_source text, requests_this_month bigint, cost_this_month numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_platform_admin(p_actor);
  return query
    select p.id, p.email, p.platform_role, p.created_at, e.plan_id, e.source,
           (select count(*) from public.usage_records u where u.user_id = p.id and u.status = 'success'
              and u.created_at >= date_trunc('month', now())),
           (select coalesce(sum(est_cost_usd), 0) from public.usage_records u where u.user_id = p.id
              and u.created_at >= date_trunc('month', now()))
    from public.profiles p
    cross join lateral public.resolve_entitlement(p.id) e
    where not p.is_guest and (p_search is null or p.email ilike '%' || p_search || '%')
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200);
end $$;

create or replace function public.admin_retention_json(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  perform public.require_platform_admin(p_actor);
  with activity as (
    select user_id, created_at::date as d from public.usage_records where user_id is not null and status = 'success'
    union
    select user_id, created_at::date from public.assessment_attempts
  ),
  cohort as (select id, created_at::date as d0 from public.profiles where not is_guest and created_at >= now() - interval '180 days'),
  active_between as (
    select c.id, c.d0,
      exists (select 1 from activity a where a.user_id = c.id and a.d between c.d0 and c.d0 + 6) as act7,
      exists (select 1 from activity a where a.user_id = c.id and a.d = c.d0 + 1) as d1,
      exists (select 1 from activity a where a.user_id = c.id and a.d between c.d0 + 7 and c.d0 + 13) as d7,
      exists (select 1 from activity a where a.user_id = c.id and a.d between c.d0 + 30 and c.d0 + 59) as d30
    from cohort c
  ),
  ind as (
    select count(*) as total, count(*) filter (where verdict = 'correct') as correct
    from public.assessment_attempts
    where kind in ('verify', 'review') and hints_used = 0 and created_at >= now() - interval '30 days'
  ),
  paid as (
    select distinct s.user_id from public.subscriptions s
    where s.user_id is not null and s.plan_id <> 'free' and s.provider not in ('manual', 'test') and public.subscription_is_live(s)
  ),
  lapsed as (
    select distinct s.user_id from public.subscriptions s
    where s.user_id is not null and s.plan_id <> 'free' and s.provider not in ('manual', 'test')
      and s.current_period_end between now() - interval '30 days' and now()
      and not exists (select 1 from paid p where p.user_id = s.user_id)
  ),
  mal as (select count(distinct user_id) as n from activity where d >= current_date - 29)
  select jsonb_build_object(
    'users', (select count(*) from public.profiles where not is_guest),
    'signups_30d', (select count(*) from public.profiles where not is_guest and created_at >= now() - interval '30 days'),
    'activation', jsonb_build_object('eligible', (select count(*) from active_between where d0 <= current_date - 7),
                                     'activated', (select count(*) from active_between where d0 <= current_date - 7 and act7)),
    'd1', jsonb_build_object('eligible', (select count(*) from active_between where d0 <= current_date - 2),
                             'retained', (select count(*) from active_between where d0 <= current_date - 2 and d1)),
    'd7', jsonb_build_object('eligible', (select count(*) from active_between where d0 <= current_date - 14),
                             'retained', (select count(*) from active_between where d0 <= current_date - 14 and d7)),
    'd30', jsonb_build_object('eligible', (select count(*) from active_between where d0 <= current_date - 60),
                              'retained', (select count(*) from active_between where d0 <= current_date - 60 and d30)),
    'wal', (select count(distinct user_id) from activity where d >= current_date - 6),
    'mal', (select n from mal),
    'independent_30d', (select jsonb_build_object('correct', correct, 'total', total) from ind),
    'reviews_done_30d', (select count(*) from public.assessment_attempts where kind = 'review' and created_at >= now() - interval '30 days'),
    'reviews_overdue', (select count(*) from public.learner_objectives where next_review_at < now() - interval '3 days'),
    'topics_mastered', (select count(*) from public.learner_objectives where status = 'mastered'),
    'topics_mastered_30d', (select count(*) from public.learner_objectives where status = 'mastered' and updated_at >= now() - interval '30 days'),
    'delayed_retention', jsonb_build_object(
      'topics_with_independent', (select count(*) from public.learner_objectives where independent_correct >= 1),
      'topics_retained_after_delay', (select count(*) from public.learner_objectives where delayed_correct >= 1)),
    'practice_exams_30d', (select count(*) from public.mock_exams where mode = 'exam' and submitted_at >= now() - interval '30 days'),
    'paid_users', (select count(*) from paid),
    'lapsed_30d', (select count(*) from lapsed),
    'ai_cost_30d_usd', (select coalesce(round(sum(est_cost_usd), 4), 0) from public.usage_records where created_at >= now() - interval '30 days'),
    'ai_cost_per_active_learner_usd', (select case when (select n from mal) > 0
        then round(coalesce(sum(est_cost_usd), 0) / (select n from mal), 4) end
      from public.usage_records where created_at >= now() - interval '30 days')
  ) into result;
  return result;
end $$;

create or replace function public.admin_revenue_json(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  perform public.require_platform_admin(p_actor);
  with paid as (select * from public.payments where status = 'paid'),
  recent as (select p.*, exists (select 1 from paid q where q.user_id = p.user_id and q.plan_id = p.plan_id and q.paid_at < p.paid_at) as is_renewal,
                    exists (select 1 from paid q where q.user_id = p.user_id and q.paid_at < p.paid_at) as paid_before
             from paid p where p.paid_at >= now() - interval '30 days'),
  live as (select distinct s.user_id, s.plan_id, s.provider from public.subscriptions s
           where s.user_id is not null and s.plan_id <> 'free' and public.subscription_is_live(s))
  select jsonb_build_object(
    'subscribers_by_plan', coalesce((select jsonb_agg(jsonb_build_object('plan', pl.id, 'name', pl.name,
        'paying', (select count(*) from live l where l.plan_id = pl.id and l.provider not in ('manual', 'test')),
        'granted', (select count(*) from live l where l.plan_id = pl.id and l.provider in ('manual', 'test'))) order by pl.rank)
      from public.plans pl where pl.id not in ('free', 'guest')), '[]'::jsonb),
    'revenue_30d', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', a, 'payments', n))
      from (select currency, sum(amount) as a, count(*) as n from recent group by currency) x), '[]'::jsonb),
    'monthly_plan_revenue_30d', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', a))
      from (select currency, sum(amount) as a from recent where billing_interval = 'month' group by currency) x), '[]'::jsonb),
    'exam_pass_sales_30d', (select count(*) from recent where plan_id = 'exam'),
    'new_subscriptions_30d', (select count(*) from recent where not paid_before),
    'renewals_30d', (select count(*) from recent where is_renewal),
    'expired_30d', (select count(distinct s.user_id) from public.subscriptions s
      where s.user_id is not null and s.plan_id <> 'free' and s.current_period_end between now() - interval '30 days' and now()
        and not exists (select 1 from live l where l.user_id = s.user_id)),
    'failed_payments_30d', (select count(*) from public.payments where status in ('failed', 'cancelled') and created_at >= now() - interval '30 days'),
    'pending_payments', (select count(*) from public.payments where status = 'pending' and created_at > now() - interval '25 hours'),
    'by_method_30d', coalesce((select jsonb_agg(jsonb_build_object('method', m, 'currency', currency, 'amount', a, 'payments', n))
      from (select coalesce(payment_method, 'unknown') as m, currency, sum(amount) as a, count(*) as n from recent group by 1, 2) x), '[]'::jsonb),
    'conversion', jsonb_build_object('users', (select count(*) from public.profiles where not is_guest),
       'ever_paid', (select count(distinct user_id) from paid where user_id is not null)),
    'ai', jsonb_build_object(
      'requests_today', (select count(*) from public.usage_records where status = 'success' and created_at >= date_trunc('day', now())),
      'requests_month', (select count(*) from public.usage_records where status = 'success' and created_at >= date_trunc('month', now())),
      'cost_month_usd', (select coalesce(round(sum(est_cost_usd), 4), 0) from public.usage_records where created_at >= date_trunc('month', now())),
      'tokens_month', (select coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0) from public.usage_records where created_at >= date_trunc('month', now())),
      'cost_per_subscriber_usd', (select case when (select count(distinct user_id) from live where provider not in ('manual', 'test')) > 0
          then round(coalesce(sum(u.est_cost_usd), 0) / (select count(distinct user_id) from live where provider not in ('manual', 'test')), 4) end
        from public.usage_records u where u.created_at >= date_trunc('month', now())
          and u.user_id in (select user_id from live where provider not in ('manual', 'test')))),
    'media_today', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) as n from public.media_usage
       where created_at >= date_trunc('day', now()) group by kind) x), '{}'::jsonb),
    'heavy_users', coalesce((select jsonb_agg(jsonb_build_object('email', pr.email, 'plan', h.plan_id, 'requests_today', h.n, 'cost_30d_usd', h.c30) order by h.n desc)
      from (select u.user_id, max(u.plan_id) as plan_id, count(*) filter (where u.created_at >= date_trunc('day', now())) as n,
                   round(coalesce(sum(u.est_cost_usd), 0), 4) as c30
            from public.usage_records u where u.user_id is not null and u.created_at >= now() - interval '30 days' group by u.user_id
            having count(*) filter (where u.created_at >= date_trunc('day', now())) >= public.setting_num('heavy_user_daily_requests', 300)
            order by 3 desc limit 10) h
      join public.profiles pr on pr.id = h.user_id), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- Sign-ups and guests, from real records. A guest session is not a person: the same student on two
-- phones is two sessions. Uses no conversation content.
create or replace function public.admin_auth_json(p_actor uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb; v_from timestamptz := p_from; v_to timestamptz := p_to + 1;
begin
  perform public.require_platform_admin(p_actor);
  with g as (select * from public.guest_sessions where created_at >= v_from and created_at < v_to),
  accounts as (select p.id, p.created_at from public.profiles p where not p.is_guest),
  days as (select d::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d)
  select jsonb_build_object(
    'accounts_total', (select count(*) from accounts),
    'registrations', jsonb_build_object(
      'today', (select count(*) from accounts where created_at >= date_trunc('day', now())),
      'week', (select count(*) from accounts where created_at >= now() - interval '7 days'),
      'month', (select count(*) from accounts where created_at >= now() - interval '30 days'),
      'in_range', (select count(*) from accounts where created_at >= v_from and created_at < v_to)),
    'by_provider', coalesce((select jsonb_object_agg(provider, n) from (select i.provider, count(distinct i.user_id) as n
       from auth.identities i join accounts a on a.id = i.user_id where a.created_at >= v_from and a.created_at < v_to group by 1) x), '{}'::jsonb),
    'guest_sessions', (select count(*) from g),
    'guest_sessions_all_time', (select count(*) from public.guest_sessions),
    'guests_active_today', (select count(distinct user_id) from public.usage_records
       where plan_id = 'guest' and user_id is not null and created_at >= date_trunc('day', now())),
    'guest_messages', (select count(*) from public.usage_records where plan_id = 'guest' and status = 'success' and created_at >= v_from and created_at < v_to),
    'reached_limit', (select count(*) from g where limit_reached_at is not null),
    'started_signup', (select count(*) from g where signup_started_at is not null),
    'converted', (select count(*) from g where converted_at is not null),
    'abandoned_signup', (select count(*) from g where signup_started_at is not null and converted_at is null
                           and signup_started_at < now() - make_interval(hours => public.setting_num('guest_claim_hours', 24)::int)),
    'converted_to_paid', (select count(*) from g where converted_user_id is not null
       and exists (select 1 from public.payments pay where pay.user_id = g.converted_user_id and pay.status = 'paid')),
    'trend', (select jsonb_agg(jsonb_build_object('day', d,
        'guests', (select count(*) from public.guest_sessions s where s.created_at >= d and s.created_at < d + 1),
        'accounts', (select count(*) from accounts a where a.created_at >= d and a.created_at < d + 1)) order by d) from days)
  ) into result;
  return result;
end $$;

revoke execute on function public.guest_allow(), public.guest_mark_limit(uuid), public.guest_start_signup(uuid, text),
  public.claim_guest(text, uuid, boolean), public.purge_old_guests(), public.admin_auth_json(uuid, date, date) from public, anon, authenticated;
grant execute on function public.guest_allow(), public.guest_mark_limit(uuid), public.guest_start_signup(uuid, text),
  public.claim_guest(text, uuid, boolean), public.purge_old_guests(), public.admin_auth_json(uuid, date, date) to service_role;
