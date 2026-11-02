-- ============================================================
-- Owner's plans (November 2026): Free $0, Pro $5 / month, Exam Pass $5 / 14 days, Max $8 / month.
-- The top plan's id stays 'professional' (IremboPay key professional:month, transaction code PRF
-- and existing records use it); learners see "Max".
-- The plans table is the one source of limits: notes and practice exams move here too.
-- payments records every checkout and its outcome: history, pending and failed states, and revenue
-- taken from what was actually paid. Existing subscriptions and payment_events are not touched.
-- Rollback: restore prices, names and limits from 20261102000015 / 16 / 17; drop table public.payments;
-- drop functions record_payment_started, record_payment_result, list_my_payments, current_plan_end,
-- admin_revenue_json; alter table public.plans drop column material_limit, drop column daily_exam_limit;
-- recreate public_plans and admin_update_plan from 20261102000015, my_account from 20261024000001,
-- create_mock_exam from 20261031000014 and add_material from 20261031000013.
-- ============================================================
alter table public.plans
  add column material_limit integer not null default 30 check (material_limit >= 0),
  add column daily_exam_limit integer not null default 30 check (daily_exam_limit >= 0);

update public.plans set material_limit = 3, daily_image_limit = 1, updated_at = now(),
  tagline = 'For students who want to start learning with Menya'
  where id = 'free';
update public.plans set price_monthly_cents = 500, daily_image_limit = 3, updated_at = now(),
  tagline = 'For students who want daily learning support, more practice and better study flexibility'
  where id = 'pro';
update public.plans set price_two_weeks_cents = 500, daily_image_limit = 10, updated_at = now(),
  tagline = 'For students preparing for upcoming examinations who need intensive revision',
  features = '["Everything in Pro","1,000 messages a day for intensive revision","Up to 10 pictures or diagrams a day","Lasts 14 days; it does not renew by itself"]'
  where id = 'exam';
update public.plans set name = 'Max', price_monthly_cents = 800, daily_image_limit = 10, updated_at = now(),
  tagline = 'For students who use Menya regularly for studying, practice and exam preparation',
  features = '["Everything in Pro","1,000 messages a day and 20,000 a month","Up to 10 pictures or diagrams a day","The longest conversations, with the most remembered"]'
  where id = 'professional';

create or replace function public.public_plans() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'tagline', tagline, 'price_monthly_cents', price_monthly_cents,
    'price_yearly_cents', price_yearly_cents, 'price_semester_cents', price_semester_cents,
    'price_two_weeks_cents', price_two_weeks_cents, 'currency', currency, 'daily_request_limit', daily_request_limit,
    'monthly_request_limit', monthly_request_limit,
    'monthly_premium_limit', greatest(monthly_premium_limit - premium_safety_margin, 0),
    'max_session_turns', max_session_turns, 'context_turns', context_turns, 'requests_per_minute', requests_per_minute,
    'analytics_level', analytics_level, 'daily_image_limit', daily_image_limit, 'material_limit', material_limit,
    'daily_exam_limit', daily_exam_limit, 'features', features) order by rank), '[]'::jsonb)
  from public.plans where is_public;
$$;

create or replace function public.admin_update_plan(p_actor uuid, p_plan text, p_changes jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  perform public.require_platform_admin(p_actor);
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('name', 'tagline', 'price_monthly_cents', 'price_yearly_cents', 'price_semester_cents', 'price_two_weeks_cents',
                 'is_public', 'daily_request_limit', 'monthly_request_limit', 'monthly_premium_limit', 'premium_safety_margin',
                 'requests_per_minute', 'max_session_turns', 'context_turns', 'analytics_level', 'features', 'daily_image_limit',
                 'material_limit', 'daily_exam_limit') then
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
    daily_image_limit = case when p_changes ? 'daily_image_limit' then (p_changes->>'daily_image_limit')::int else daily_image_limit end,
    material_limit = coalesce((p_changes->>'material_limit')::int, material_limit),
    daily_exam_limit = coalesce((p_changes->>'daily_exam_limit')::int, daily_exam_limit),
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

-- Limits now come from the learner's plan. The extra arguments stay so the running server keeps working
-- during an update; p_max is ignored.
create or replace function public.create_mock_exam(p_user uuid, p_title text, p_objectives jsonb, p_items jsonb, p_limit integer,
                                                   p_mode text default 'exam')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cap integer;
begin
  select pl.daily_exam_limit into v_cap from public.resolve_entitlement(p_user) e join public.plans pl on pl.id = e.plan_id;
  if (select count(*) from public.mock_exams where user_id = p_user and started_at > now() - interval '1 day') >= coalesce(v_cap, 30) then
    raise exception using errcode = '54000', message = 'exam_daily_limit';
  end if;
  insert into public.mock_exams (user_id, title, objectives, items, time_limit_s, mode)
  values (p_user, left(p_title, 120), array(select jsonb_array_elements_text(p_objectives)), p_items, p_limit, p_mode) returning id into v_id;
  return v_id;
end $$;

create or replace function public.add_material(p_user uuid, p_title text, p_kind text, p_pages integer, p_chars integer,
                                               p_chunks jsonb, p_max integer) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cap integer;
begin
  select pl.material_limit into v_cap from public.resolve_entitlement(p_user) e join public.plans pl on pl.id = e.plan_id;
  if (select count(*) from public.course_materials where user_id = p_user) >= coalesce(v_cap, 3) then
    raise exception using errcode = '22023', message = 'material_limit';
  end if;
  insert into public.course_materials (user_id, title, kind, pages, chars)
  values (p_user, left(trim(p_title), 200), p_kind, p_pages, p_chars) returning id into v_id;
  insert into public.material_chunks (material_id, user_id, page, content)
  select v_id, p_user, (c->>'page')::int, c->>'content' from jsonb_array_elements(p_chunks) c;
  return v_id;
end $$;

-- ---------- Payments: every checkout and what became of it ----------
-- user_id is cleared when an account is deleted; the financial record itself stays.
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  provider        text not null,
  transaction_id  text not null,
  invoice_number  text,
  plan_id         text not null references public.plans(id),
  billing_interval public.billing_interval not null,
  amount          numeric,
  currency        text,
  status          text not null check (status in ('pending', 'paid', 'failed', 'cancelled')),
  payment_method  text,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, transaction_id)
);
create index payments_user_idx on public.payments(user_id, created_at desc);
create index payments_status_idx on public.payments(status, created_at desc);
alter table public.payments enable row level security;
create policy payments_self_read on public.payments for select to authenticated using (user_id = auth.uid());
revoke all on public.payments from anon;
revoke insert, update, delete on public.payments from authenticated;

create or replace function public.record_payment_started(p jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.payments (user_id, provider, transaction_id, plan_id, billing_interval, amount, currency, status)
  values ((p->>'user_id')::uuid, p->>'provider', p->>'transaction_id', p->>'plan_id', (p->>'interval')::public.billing_interval,
          (p->>'amount')::numeric, p->>'currency', 'pending')
  on conflict (provider, transaction_id) do nothing;
$$;

-- From an authenticated notification only. A paid record never goes back to failed, whatever arrives
-- later or twice.
create or replace function public.record_payment_result(p jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.payments (user_id, provider, transaction_id, invoice_number, plan_id, billing_interval, amount, currency, status, payment_method, paid_at)
  values ((p->>'user_id')::uuid, p->>'provider', p->>'transaction_id', p->>'invoice_number', p->>'plan_id',
          (p->>'interval')::public.billing_interval, (p->>'amount')::numeric, p->>'currency', p->>'status', p->>'payment_method',
          (p->>'paid_at')::timestamptz)
  on conflict (provider, transaction_id) do update set
    status = case when payments.status = 'paid' then 'paid' else excluded.status end,
    invoice_number = coalesce(excluded.invoice_number, payments.invoice_number),
    amount = case when payments.status = 'paid' then payments.amount else coalesce(excluded.amount, payments.amount) end,
    currency = coalesce(excluded.currency, payments.currency),
    payment_method = coalesce(excluded.payment_method, payments.payment_method),
    paid_at = coalesce(payments.paid_at, excluded.paid_at),
    updated_at = now();
$$;

-- A pending checkout older than its invoice (24 hours) is shown as expired.
create or replace function public.list_my_payments(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('plan', plan_id, 'interval', billing_interval, 'amount', amount, 'currency', currency,
           'status', case when status = 'pending' and created_at < now() - interval '25 hours' then 'expired' else status end,
           'method', payment_method, 'paid_at', paid_at, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
  from (select * from public.payments where user_id = p_user order by created_at desc limit 50) x;
$$;

-- When the learner's paid time on this plan runs out: a renewal adds to it instead of overlapping it.
create or replace function public.current_plan_end(p_user uuid, p_plan text) returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(s.current_period_end) from public.subscriptions s
  where s.user_id = p_user and s.plan_id = p_plan and public.subscription_is_live(s);
$$;

-- ---------- What the student dashboard shows ----------
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
    'is_admin', public.is_platform_admin(v_user),
    'org_admin_of', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name))
                              from public.org_members om join public.organizations o on o.id = om.org_id
                              where om.user_id = v_user and om.role = 'org_admin'), '[]'::jsonb));
end $$;

-- ---------- Admin: money from payment records, usage from usage records ----------
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
      from public.plans pl where pl.id <> 'free'), '[]'::jsonb),
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
    'conversion', jsonb_build_object('users', (select count(*) from public.profiles),
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

insert into public.app_settings (key, value, description)
values ('heavy_user_daily_requests', '300', 'Tutor messages in a day above which a learner is listed for review on the admin page')
on conflict (key) do nothing;

revoke execute on function public.record_payment_started(jsonb), public.record_payment_result(jsonb), public.list_my_payments(uuid),
  public.current_plan_end(uuid, text), public.admin_revenue_json(uuid) from public, anon, authenticated;
grant execute on function public.record_payment_started(jsonb), public.record_payment_result(jsonb), public.list_my_payments(uuid),
  public.current_plan_end(uuid, text), public.admin_revenue_json(uuid) to service_role;
