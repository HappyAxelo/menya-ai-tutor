-- ============================================================
-- Prices chosen by the owner (30 October 2026), in US dollars:
--   Free 0; Pro $10 / month, $35 / semester (4 months), $90 / year;
--   Exam Pass $8 for 2 weeks (very high, fair-use limits); Professional $25 / month.
-- Adds the semester and 2-week periods and the Exam Pass plan.
-- Rollback: delete from public.plans where id = 'exam'; alter table public.plans
-- drop column price_semester_cents, drop column price_two_weeks_cents; restore the old
-- prices (pro 1500, professional 5000 monthly); recreate public_plans, admin_update_plan
-- and admin_unit_economics from 20261024000001/2. (Enum values cannot be dropped.)
-- ============================================================
alter type public.billing_interval add value if not exists 'semester';
alter type public.billing_interval add value if not exists 'two_weeks';

alter table public.plans
  add column price_semester_cents  integer check (price_semester_cents >= 0),   -- 4 months; null = not offered
  add column price_two_weeks_cents integer check (price_two_weeks_cents >= 0);  -- 14 days; null = not offered

update public.plans set price_monthly_cents = 0, price_yearly_cents = 0, currency = 'USD', updated_at = now() where id = 'free';
update public.plans set price_monthly_cents = 1000, price_semester_cents = 3500, price_yearly_cents = 9000,
  currency = 'USD', updated_at = now() where id = 'pro';
update public.plans set price_monthly_cents = 2500, price_yearly_cents = null, currency = 'USD', updated_at = now()
  where id = 'professional';

-- Exam Pass: everything in Pro with fair-use limits high enough to feel unlimited, for 14 days.
insert into public.plans
  (id, name, tagline, price_monthly_cents, price_yearly_cents, price_two_weeks_cents, currency, rank,
   daily_request_limit, monthly_request_limit, monthly_premium_limit, premium_safety_margin,
   requests_per_minute, max_session_turns, context_turns, routing_policy, analytics_level, features)
values
  ('exam', 'Exam Pass', 'Practically unlimited practice before your exams', null, null, 800, 'USD', 15,
   1000, 10000, 0, 0, 20, 120, 30, 'pro', 'enhanced',
   '["Everything in Pro","Practice without daily worries for two weeks (fair use)","Made for the run-up to exams"]')
on conflict (id) do nothing;

create or replace function public.public_plans() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'tagline', tagline, 'price_monthly_cents', price_monthly_cents,
    'price_yearly_cents', price_yearly_cents, 'price_semester_cents', price_semester_cents,
    'price_two_weeks_cents', price_two_weeks_cents, 'currency', currency, 'daily_request_limit', daily_request_limit,
    'monthly_request_limit', monthly_request_limit,
    'monthly_premium_limit', greatest(monthly_premium_limit - premium_safety_margin, 0),
    'max_session_turns', max_session_turns, 'features', features) order by rank), '[]'::jsonb)
  from public.plans where is_public;
$$;

-- Only whitelisted, validated columns can change (now including the new prices).
create or replace function public.admin_update_plan(p_actor uuid, p_plan text, p_changes jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  perform public.require_platform_admin(p_actor);
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('name', 'tagline', 'price_monthly_cents', 'price_yearly_cents', 'price_semester_cents', 'price_two_weeks_cents',
                 'is_public', 'daily_request_limit', 'monthly_request_limit', 'monthly_premium_limit', 'premium_safety_margin',
                 'requests_per_minute', 'max_session_turns', 'context_turns', 'analytics_level', 'features') then
      raise exception using errcode = '22023', message = 'field_not_editable: ' || k;
    end if;
  end loop;
  update public.plans set
    name = coalesce(p_changes->>'name', name),
    tagline = coalesce(p_changes->>'tagline', tagline),
    price_monthly_cents = case when p_changes ? 'price_monthly_cents' then (p_changes->>'price_monthly_cents')::int else price_monthly_cents end,
    price_yearly_cents = case when p_changes ? 'price_yearly_cents' then (p_changes->>'price_yearly_cents')::int else price_yearly_cents end,
    price_semester_cents = case when p_changes ? 'price_semester_cents' then (p_changes->>'price_semester_cents')::int else price_semester_cents end,
    price_two_weeks_cents = case when p_changes ? 'price_two_weeks_cents' then (p_changes->>'price_two_weeks_cents')::int else price_two_weeks_cents end,
    is_public = coalesce((p_changes->>'is_public')::boolean, is_public),
    daily_request_limit = coalesce((p_changes->>'daily_request_limit')::int, daily_request_limit),
    monthly_request_limit = coalesce((p_changes->>'monthly_request_limit')::int, monthly_request_limit),
    monthly_premium_limit = coalesce((p_changes->>'monthly_premium_limit')::int, monthly_premium_limit),
    premium_safety_margin = coalesce((p_changes->>'premium_safety_margin')::int, premium_safety_margin),
    requests_per_minute = coalesce((p_changes->>'requests_per_minute')::int, requests_per_minute),
    max_session_turns = coalesce((p_changes->>'max_session_turns')::int, max_session_turns),
    context_turns = coalesce((p_changes->>'context_turns')::int, context_turns),
    analytics_level = coalesce(p_changes->>'analytics_level', analytics_level),
    features = coalesce(p_changes->'features', features),
    updated_at = now()
  where id = p_plan;
  if not found then raise exception using errcode = '22023', message = 'unknown_plan'; end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_actor, 'admin.update_plan', 'plan', p_plan, p_changes);
end $$;

-- Revenue estimate with the new periods.
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
           -- monthly equivalent: a year /12, a semester /4; an exam pass counts once in its month
           sum(case s.billing_interval::text
                 when 'year' then coalesce(p.price_yearly_cents, 0) / 12.0
                 when 'semester' then coalesce(p.price_semester_cents, 0) / 4.0
                 when 'two_weeks' then coalesce(p.price_two_weeks_cents, 0)
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

revoke execute on function public.public_plans(), public.admin_update_plan(uuid, text, jsonb), public.admin_unit_economics(date)
  from public, anon, authenticated;
grant execute on function public.public_plans(), public.admin_update_plan(uuid, text, jsonb), public.admin_unit_economics(date)
  to service_role;
