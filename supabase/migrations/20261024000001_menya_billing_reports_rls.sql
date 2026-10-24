-- ============================================================
-- Menya: quota release, usage recording, verified billing events,
-- reports, row-level security and grants.
-- Rollback: see supabase/rollback/ (drops these objects; destroys data).
-- ============================================================

-- Gives back a reservation when the model call failed, exactly once.
create or replace function public.release_quota(p_user uuid, p_request_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.request_reservations;
begin
  update public.request_reservations set state = 'released'
  where user_id = p_user and request_id = p_request_id and state = 'reserved'
  returning * into r;
  if not found then return false; end if;

  update public.usage_counters set requests = greatest(requests - 1, 0)
  where subject_type = 'user' and subject_id = p_user and period = 'day' and period_start = r.day_start;
  update public.usage_counters
     set requests = greatest(requests - 1, 0),
         premium_requests = greatest(premium_requests - case when r.premium then 1 else 0 end, 0)
  where subject_type = 'user' and subject_id = p_user and period = 'month' and period_start = r.month_start;
  if r.org_id is not null then
    update public.usage_counters set requests = greatest(requests - 1, 0)
    where subject_type = 'org' and subject_id = r.org_id and period = 'month' and period_start = r.month_start;
  end if;
  return true;
end $$;

-- A premium reservation whose premium model failed and fell back to a
-- standard model: keep the request counted, give the premium unit back.
create or replace function public.downgrade_reservation(p_user uuid, p_request_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.request_reservations;
begin
  update public.request_reservations set premium = false
  where user_id = p_user and request_id = p_request_id and state = 'reserved' and premium
  returning * into r;
  if not found then return false; end if;
  update public.usage_counters set premium_requests = greatest(premium_requests - 1, 0)
  where subject_type = 'user' and subject_id = p_user and period = 'month' and period_start = r.month_start;
  return true;
end $$;

create or replace function public.record_usage(p jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usage_records
    (request_id, user_id, org_id, plan_id, provider, model, model_role, premium, input_tokens, output_tokens,
     est_cost_usd, latency_ms, ttft_ms, status, fallback_used, answer_rewrite, error_code)
  values
    ((p->>'request_id')::uuid, (p->>'user_id')::uuid, nullif(p->>'org_id', '')::uuid, p->>'plan_id',
     p->>'provider', p->>'model', p->>'model_role', coalesce((p->>'premium')::boolean, false),
     (p->>'input_tokens')::int, (p->>'output_tokens')::int, (p->>'est_cost_usd')::numeric,
     (p->>'latency_ms')::int, (p->>'ttft_ms')::int, p->>'status',
     coalesce((p->>'fallback_used')::boolean, false), coalesce((p->>'answer_rewrite')::boolean, false), p->>'error_code');

  if p->>'status' = 'success' then
    update public.request_reservations set state = 'completed'
    where user_id = (p->>'user_id')::uuid and request_id = (p->>'request_id')::uuid and state = 'reserved';
  end if;
end $$;

-- ============================================================
-- Billing: verified, idempotent subscription updates
-- ============================================================
alter table public.subscriptions add column last_event_at timestamptz;

-- p_event is the provider-neutral event a billing adapter produces AFTER its
-- signature check passed:
-- { "id", "type", "occurred_at", "subscription": { "provider_subscription_id",
--   "provider_customer_id", "user_id" | "org_id", "plan_id", "interval",
--   "status", "current_period_start", "current_period_end", "cancel_at_period_end" } }
-- Returns 'processed' | 'duplicate' | 'ignored' | 'stale'.
create or replace function public.process_payment_event(p_provider text, p_event jsonb, p_raw jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_event_id bigint;
  s jsonb := p_event->'subscription';
  v_occurred timestamptz := coalesce((p_event->>'occurred_at')::timestamptz, now());
  v_existing public.subscriptions;
  v_status public.subscription_status;
begin
  insert into public.payment_events (provider, provider_event_id, event_type, payload)
  values (p_provider, p_event->>'id', p_event->>'type', p_raw)
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event_id;
  if v_event_id is null then return 'duplicate'; end if;

  if s is null or s = 'null'::jsonb then
    update public.payment_events set status = 'ignored', processed_at = now() where id = v_event_id;
    return 'ignored';
  end if;

  v_status := (s->>'status')::public.subscription_status;
  if not exists (select 1 from public.plans where id = s->>'plan_id') then
    raise exception 'unknown plan %', s->>'plan_id';
  end if;

  select * into v_existing from public.subscriptions
  where provider = p_provider and provider_subscription_id = s->>'provider_subscription_id';

  if found and v_existing.last_event_at is not null and v_existing.last_event_at > v_occurred then
    update public.payment_events set status = 'ignored', error = 'older than last applied event', processed_at = now()
    where id = v_event_id;
    return 'stale';
  end if;

  if found then
    update public.subscriptions set
      plan_id = s->>'plan_id',
      billing_interval = coalesce((s->>'interval')::public.billing_interval, billing_interval),
      status = v_status,
      provider_customer_id = coalesce(s->>'provider_customer_id', provider_customer_id),
      current_period_start = coalesce((s->>'current_period_start')::timestamptz, current_period_start),
      current_period_end = coalesce((s->>'current_period_end')::timestamptz, current_period_end),
      cancel_at_period_end = coalesce((s->>'cancel_at_period_end')::boolean, cancel_at_period_end),
      last_event_at = v_occurred,
      updated_at = now()
    where id = v_existing.id;
  else
    insert into public.subscriptions
      (user_id, org_id, plan_id, billing_interval, status, provider, provider_customer_id, provider_subscription_id,
       current_period_start, current_period_end, cancel_at_period_end, last_event_at)
    values
      (nullif(s->>'user_id', '')::uuid, nullif(s->>'org_id', '')::uuid, s->>'plan_id',
       coalesce((s->>'interval')::public.billing_interval, 'month'), v_status, p_provider,
       s->>'provider_customer_id', s->>'provider_subscription_id',
       (s->>'current_period_start')::timestamptz, (s->>'current_period_end')::timestamptz,
       coalesce((s->>'cancel_at_period_end')::boolean, false), v_occurred);
  end if;

  update public.payment_events set status = 'processed', processed_at = now() where id = v_event_id;
  insert into public.audit_logs (action, target_type, target_id, details)
  values ('billing.' || (p_event->>'type'), 'subscription', s->>'provider_subscription_id',
          jsonb_build_object('provider', p_provider, 'status', v_status, 'plan', s->>'plan_id'));
  return 'processed';
end $$;

-- ============================================================
-- Learner-facing: own entitlement and usage
-- ============================================================
create or replace function public.my_account() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  e record;
  d public.usage_counters;
  m public.usage_counters;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into e from public.resolve_entitlement(v_user);
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
      'session_turns', e.max_session_turns, 'analytics', e.analytics_level),
    'used', jsonb_build_object('daily', coalesce(d.requests, 0), 'monthly', coalesce(m.requests, 0),
      'premium', coalesce(m.premium_requests, 0)),
    'is_admin', public.is_platform_admin(v_user),
    'org_admin_of', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name))
                              from public.org_members om join public.organizations o on o.id = om.org_id
                              where om.user_id = v_user and om.role = 'org_admin'), '[]'::jsonb));
end $$;

-- ============================================================
-- Institutions: aggregate dashboard (no conversation content)
-- ============================================================
create or replace function public.org_dashboard(p_actor uuid, p_org uuid, p_month date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := date_trunc('month', p_month)::timestamptz;
  v_to timestamptz := (date_trunc('month', p_month) + interval '1 month')::timestamptz;
  o public.organizations;
begin
  if not (public.is_platform_admin(p_actor) or exists (
      select 1 from public.org_members where org_id = p_org and user_id = p_actor and role = 'org_admin')) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into o from public.organizations where id = p_org;
  return jsonb_build_object(
    'organization', jsonb_build_object('id', o.id, 'name', o.name, 'plan', o.plan_id, 'status', o.status,
                                       'worked_solutions', o.worked_solutions),
    'seats', jsonb_build_object(
      'purchased', o.purchased_seats,
      'assigned', (select count(*) from public.org_members where org_id = p_org and seat_assigned),
      'members', (select count(*) from public.org_members where org_id = p_org),
      'pending_invitations', (select count(*) from public.org_invitations
                              where org_id = p_org and accepted_at is null and expires_at > now())),
    'usage', jsonb_build_object(
      'monthly_active_learners', (select count(distinct user_id) from public.usage_records
                                  where org_id = p_org and status = 'success' and created_at >= v_from and created_at < v_to),
      'requests', (select count(*) from public.usage_records
                   where org_id = p_org and status = 'success' and created_at >= v_from and created_at < v_to),
      'premium_requests', (select count(*) from public.usage_records
                           where org_id = p_org and premium and status = 'success' and created_at >= v_from and created_at < v_to),
      'pool_limit', o.monthly_request_limit),
    -- What learners are working on, as counts of concepts the tutor detected.
    'top_concepts', coalesce((
      select jsonb_agg(jsonb_build_object('concept', concept, 'count', n) order by n desc)
      from (select lower(c.value) as concept, count(*) as n
            from public.tutoring_messages tm
            join public.tutoring_sessions ts on ts.id = tm.session_id
            cross join lateral jsonb_array_elements_text(coalesce(tm.meta->'concepts', '[]'::jsonb)) c(value)
            where ts.org_id = p_org and tm.role = 'assistant' and tm.created_at >= v_from and tm.created_at < v_to
            group by 1 order by 2 desc limit 15) t), '[]'::jsonb),
    'misconceptions_caught', (select count(*) from public.tutoring_messages tm
                              join public.tutoring_sessions ts on ts.id = tm.session_id
                              where ts.org_id = p_org and tm.role = 'assistant' and tm.meta ? 'misconception'
                                and tm.created_at >= v_from and tm.created_at < v_to));
end $$;

-- ============================================================
-- Platform admin: unit economics
-- ============================================================
insert into public.app_settings (key, value, description) values
  ('monthly_infra_cost_usd', '0', 'Shared infrastructure cost per month (hosting, GPU rental, monitoring). Set from real invoices.'),
  ('payment_fee_pct',        '0', 'Payment provider fee as a percentage of revenue. Set once a provider is chosen.');

-- Revenue here is an ESTIMATE from plan prices of paid subscriptions live
-- during the month (yearly price / 12). Replace with settled amounts from
-- payment events once a provider is live. Shared infrastructure cost is
-- allocated to plans by share of requests, never charged per request.
create or replace function public.admin_unit_economics(p_month date)
returns table (
  plan_id text, paying_subscriptions bigint, active_users bigint, requests bigint, premium_requests bigint,
  input_tokens bigint, output_tokens bigint, ai_cost_usd numeric, allocated_infra_usd numeric,
  payment_fees_usd numeric, est_revenue_usd numeric, gross_margin_pct numeric
)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select date_trunc('month', p_month)::timestamptz as f,
           (date_trunc('month', p_month) + interval '1 month')::timestamptz as t
  ),
  usage as (
    select u.plan_id, count(distinct u.user_id) as active_users,
           count(*) filter (where u.status = 'success') as requests,
           count(*) filter (where u.premium and u.status = 'success') as premium_requests,
           coalesce(sum(u.input_tokens), 0) as input_tokens, coalesce(sum(u.output_tokens), 0) as output_tokens,
           coalesce(sum(u.est_cost_usd), 0) as ai_cost
    from public.usage_records u, bounds b where u.created_at >= b.f and u.created_at < b.t
    group by u.plan_id
  ),
  revenue as (
    select s.plan_id, count(*) as subs,
           sum(case when s.billing_interval = 'year' then coalesce(p.price_yearly_cents, 0) / 12.0
                    else coalesce(p.price_monthly_cents, 0) end) / 100.0 as rev
    from public.subscriptions s join public.plans p on p.id = s.plan_id, bounds b
    where s.status not in ('refunded', 'incomplete') and s.provider not in ('manual', 'test')
      and coalesce(s.current_period_end, b.t) >= b.f and s.created_at < b.t
    group by s.plan_id
  ),
  totals as (select greatest(coalesce(sum(requests), 0), 1) as all_requests from usage),
  rows as (
    select p.id, p.rank, coalesce(r.subs, 0) as subs, coalesce(u.active_users, 0) as active_users,
           coalesce(u.requests, 0) as requests, coalesce(u.premium_requests, 0) as premium_requests,
           coalesce(u.input_tokens, 0) as input_tokens, coalesce(u.output_tokens, 0) as output_tokens,
           coalesce(u.ai_cost, 0) as ai_cost,
           public.setting_num('monthly_infra_cost_usd', 0) * coalesce(u.requests, 0) / t.all_requests as infra,
           coalesce(r.rev, 0) as rev
    from public.plans p
    left join usage u on u.plan_id = p.id
    left join revenue r on r.plan_id = p.id
    cross join totals t
  )
  select id, subs, active_users, requests, premium_requests, input_tokens, output_tokens,
         round(ai_cost, 4), round(infra, 4),
         round(rev * public.setting_num('payment_fee_pct', 0) / 100, 4),
         round(rev, 2),
         case when rev > 0 then round(100 * (rev - ai_cost - infra - rev * public.setting_num('payment_fee_pct', 0) / 100) / rev, 1) end
  from rows order by rank;
$$;

create or replace function public.admin_usage_alerts() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'month_ai_cost_usd', (select coalesce(sum(est_cost_usd), 0) from public.usage_records
                          where created_at >= date_trunc('month', now())),
    'month_budget_usd', public.setting_num('monthly_ai_budget_usd', 200),
    'heavy_users_today', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', user_id, 'cost_usd', cost, 'requests', n))
      from (select user_id, round(sum(est_cost_usd), 4) as cost, count(*) as n from public.usage_records
            where created_at >= date_trunc('day', now()) group by user_id
            having sum(est_cost_usd) > public.setting_num('user_daily_cost_alert_usd', 1.5)) x), '[]'::jsonb),
    'error_rate_24h', (select round(100.0 * count(*) filter (where status <> 'success') / greatest(count(*), 1), 2)
                       from public.usage_records where created_at >= now() - interval '24 hours'),
    'p95_latency_ms_24h', (select percentile_cont(0.95) within group (order by latency_ms)
                           from public.usage_records where created_at >= now() - interval '24 hours' and status = 'success'));
$$;

create or replace function public.purge_old_messages() returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.tutoring_messages
  where created_at < now() - make_interval(days => public.setting_num('message_retention_days', 180)::int);
  get diagnostics n = row_count;
  delete from public.rate_buckets where minute_start < now() - interval '1 day';
  return n;
end $$;

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.app_settings enable row level security;
alter table public.plans enable row level security;
alter table public.model_configs enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_events enable row level security;
alter table public.usage_counters enable row level security;
alter table public.rate_buckets enable row level security;
alter table public.request_reservations enable row level security;
alter table public.usage_records enable row level security;
alter table public.tutoring_sessions enable row level security;
alter table public.tutoring_messages enable row level security;
alter table public.audit_logs enable row level security;
alter table public.quote_requests enable row level security;

-- Membership helpers (security definer, so policies on org_members don't recurse).
create or replace function public.is_org_member(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = p_user);
$$;
create or replace function public.is_org_admin(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = p_user and role = 'org_admin');
$$;

-- Public catalogue
create policy plans_public_read on public.plans for select to anon, authenticated using (is_public);

-- Own rows only
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid());
create policy subscriptions_self_read on public.subscriptions for select to authenticated using (user_id = auth.uid());
create policy usage_self_read on public.usage_records for select to authenticated using (user_id = auth.uid());
create policy counters_self_read on public.usage_counters for select to authenticated
  using (subject_type = 'user' and subject_id = auth.uid());
create policy sessions_self_read on public.tutoring_sessions for select to authenticated using (user_id = auth.uid());
create policy sessions_self_delete on public.tutoring_sessions for delete to authenticated using (user_id = auth.uid());
create policy messages_self_read on public.tutoring_messages for select to authenticated using (user_id = auth.uid());

-- Organizations: members see their org; org admins see their own roster and invitations only.
create policy orgs_member_read on public.organizations for select to authenticated
  using (public.is_org_member(id, auth.uid()));
create policy members_self_read on public.org_members for select to authenticated using (user_id = auth.uid());
create policy members_orgadmin_read on public.org_members for select to authenticated
  using (public.is_org_admin(org_id, auth.uid()));
create policy invitations_orgadmin_read on public.org_invitations for select to authenticated
  using (public.is_org_admin(org_id, auth.uid()));

-- No policies (= no browser access) on: app_settings, model_configs, payment_events,
-- rate_buckets, request_reservations, audit_logs, quote_requests.

-- Browsers never write directly; Edge Functions use the service role.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant delete on public.tutoring_sessions to authenticated;
revoke all on public.app_settings, public.model_configs, public.payment_events, public.rate_buckets,
  public.request_reservations, public.audit_logs, public.quote_requests from anon, authenticated;

-- Functions: service role only, except what signed-in users' queries need.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.my_account() to authenticated;
grant execute on function public.is_org_member(uuid, uuid), public.is_org_admin(uuid, uuid),
  public.is_platform_admin(uuid) to authenticated;
grant execute on all functions in schema public to service_role;
