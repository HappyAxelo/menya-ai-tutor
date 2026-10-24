-- ============================================================
-- Menya core schema: plans, entitlements, subscriptions,
-- organizations, usage metering, quotas, billing events, audit.
--
-- Rollback: supabase/rollback/20261024_menya_all.down.sql drops every
-- object these migrations create (run manually; destroys data).
--
-- Security model:
--   * Every table has RLS enabled.
--   * Learners can READ their own rows only. All writes that affect
--     money, quotas or roles go through SECURITY DEFINER functions
--     that only the service role (Edge Functions) may execute.
--   * Organization admins see aggregates, never other users' messages.
-- ============================================================


-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
create type public.subscription_status as enum
  ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'expired', 'refunded');
create type public.billing_interval as enum ('month', 'year');
create type public.platform_role as enum ('learner', 'admin');
create type public.org_role as enum ('org_admin', 'learner');

-- ------------------------------------------------------------
-- Settings (operator-tunable, no code change needed)
-- ------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  ('past_due_grace_days',        '3',     'Days a past_due subscription keeps paid access while the provider retries payment.'),
  ('monthly_ai_budget_usd',      '200',   'Alert threshold for total estimated AI provider spend per calendar month.'),
  ('user_daily_cost_alert_usd',  '1.5',   'Alert when one user''s estimated AI cost in a day exceeds this.'),
  ('message_retention_days',     '180',   'Tutoring messages older than this are deleted by purge_old_messages().'),
  ('max_message_chars',          '4000',  'Longest learner message accepted by the tutor endpoint.');

-- ------------------------------------------------------------
-- Plans and entitlements (single source of truth for limits)
-- ------------------------------------------------------------
create table public.plans (
  id                     text primary key,               -- 'free' | 'pro' | 'professional' | custom
  name                   text not null,
  tagline                text not null default '',
  price_monthly_cents    integer check (price_monthly_cents >= 0),
  price_yearly_cents     integer check (price_yearly_cents >= 0), -- null = annual billing not offered yet
  currency               text not null default 'USD',
  is_public              boolean not null default true,
  rank                   integer not null,                -- higher = more capable; used to pick the best live plan
  daily_request_limit    integer not null check (daily_request_limit >= 0),
  monthly_request_limit  integer not null check (monthly_request_limit >= 0),
  monthly_premium_limit  integer not null default 0 check (monthly_premium_limit >= 0),
  premium_safety_margin  integer not null default 0 check (premium_safety_margin >= 0),
  requests_per_minute    integer not null check (requests_per_minute > 0),
  max_session_turns      integer not null check (max_session_turns > 0),
  context_turns          integer not null check (context_turns > 0),
  routing_policy         text not null check (routing_policy in ('free', 'pro', 'professional')),
  analytics_level        text not null default 'basic' check (analytics_level in ('basic', 'enhanced')),
  features               jsonb not null default '[]'::jsonb, -- plain-language bullets; no numbers (limits are shown from the columns) and only features the backend enforces
  updated_at             timestamptz not null default now()
);

-- Initial limits are starting assumptions, to be tuned from measured usage.
-- Annual prices are deliberately NULL until the business approves them.
insert into public.plans
  (id, name, tagline, price_monthly_cents, price_yearly_cents, rank,
   daily_request_limit, monthly_request_limit, monthly_premium_limit, premium_safety_margin,
   requests_per_minute, max_session_turns, context_turns, routing_policy, analytics_level, features)
values
  ('free', 'Free', 'Try guided tutoring', 0, 0, 0,
   20, 300, 0, 0, 6, 30, 10, 'free', 'basic',
   '["Step-by-step Socratic tutoring","Three progressive hints per problem","Your sessions saved to your account"]'),
  ('pro', 'Pro', 'For regular study', 1500, null, 10,
   150, 3000, 0, 0, 15, 80, 24, 'pro', 'enhanced',
   '["Everything in Free","Many more messages each day","Longer sessions that remember more of your work","More detailed explanations and checks","A stronger model for hard questions"]'),
  ('professional', 'Professional', 'Deepest reasoning for demanding work', 5000, null, 20,
   400, 8000, 200, 10, 30, 150, 40, 'professional', 'enhanced',
   '["Everything in Pro","The highest daily allowance","Our strongest standard model for everyday tutoring","Advanced reasoning on hard problems, within a monthly allowance"]');

-- ------------------------------------------------------------
-- Model configuration (no credentials here: keys live in Edge
-- Function secrets, referenced by provider name)
-- ------------------------------------------------------------
create table public.model_configs (
  role                  text primary key,     -- 'small' | 'medium' | 'strong' | 'premium' | 'local_small' ...
  provider              text not null check (provider in ('groq', 'anthropic', 'openai_compatible')),
  model                 text not null,
  enabled               boolean not null default true,
  is_premium            boolean not null default false,   -- counts against the premium allowance
  input_usd_per_mtok    numeric(10,4) not null default 0,
  output_usd_per_mtok   numeric(10,4) not null default 0,
  timeout_ms            integer not null default 45000 check (timeout_ms between 1000 and 300000),
  max_output_tokens     integer not null default 2000,
  options               jsonb not null default '{}'::jsonb, -- provider-specific, e.g. {"reasoning_effort":"medium"}
  fallback_role         text references public.model_configs(role),
  updated_at            timestamptz not null default now()
);

-- Prices from the providers' published rates (2026-10). Local models have
-- no per-token price; their server cost is tracked separately in reports.
insert into public.model_configs (role, provider, model, enabled, is_premium, input_usd_per_mtok, output_usd_per_mtok, timeout_ms, max_output_tokens, options, fallback_role) values
  ('medium',      'groq',              'openai/gpt-oss-120b', true,  false, 0.15, 0.60, 45000, 2000, '{"reasoning_effort":"medium"}', null),
  ('small',       'groq',              'openai/gpt-oss-20b',  true,  false, 0.075, 0.30, 30000, 1500, '{"reasoning_effort":"medium"}', 'medium'),
  ('strong',      'groq',              'openai/gpt-oss-120b', true,  false, 0.15, 0.60, 60000, 3000, '{"reasoning_effort":"high"}',   'medium'),
  ('premium',     'anthropic',         'claude-opus-5-5',     true,  true,  4.00, 20.00, 90000, 4000, '{"effort":"medium"}',         'strong'),
  ('local_small', 'openai_compatible', 'qwen3:4b',            false, false, 0,    0,     60000, 1500, '{}',                           'small');

-- ------------------------------------------------------------
-- Users
-- ------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  display_name   text,
  platform_role  public.platform_role not null default 'learner',
  created_at     timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_platform_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_user and platform_role = 'admin');
$$;

-- ------------------------------------------------------------
-- Organizations (universities, schools)
-- ------------------------------------------------------------
create table public.organizations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  slug                   text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  plan_id                text not null references public.plans(id),
  status                 text not null default 'pilot' check (status in ('pilot', 'active', 'suspended')),
  purchased_seats        integer not null default 0 check (purchased_seats >= 0),
  monthly_request_limit  integer check (monthly_request_limit >= 0), -- org-wide pool on top of per-learner plan limits; null = no pool cap
  worked_solutions       boolean not null default true,  -- tutor may show worked solutions after the learner earns them
  billing_contact_email  text,
  billing_config         jsonb not null default '{}'::jsonb, -- negotiated terms; never credentials
  created_at             timestamptz not null default now()
);

create table public.org_members (
  org_id         uuid not null references public.organizations(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  role           public.org_role not null default 'learner',
  seat_assigned  boolean not null default true,
  joined_at      timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members(user_id);

create table public.org_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  email        text not null,
  role         public.org_role not null default 'learner',
  token_hash   text not null unique,   -- sha256 of the invite token; the token itself is only emailed
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (org_id, email)
);

-- ------------------------------------------------------------
-- Subscriptions (source of truth for paid access)
-- Only verified payment-provider events or platform admins write here.
-- ------------------------------------------------------------
create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid references auth.users(id) on delete cascade,
  org_id                    uuid references public.organizations(id) on delete cascade,
  plan_id                   text not null references public.plans(id),
  billing_interval          public.billing_interval not null default 'month',
  status                    public.subscription_status not null,
  provider                  text not null,                 -- 'flutterwave' | 'paddle' | 'manual' | 'test' ...
  provider_customer_id      text,
  provider_subscription_id  text not null,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check ((user_id is null) <> (org_id is null)),
  unique (provider, provider_subscription_id)
);
create index subscriptions_user_idx on public.subscriptions(user_id);
create index subscriptions_org_idx on public.subscriptions(org_id);

create table public.payment_events (
  id                 bigserial primary key,
  provider           text not null,
  provider_event_id  text not null,
  event_type         text not null,
  payload            jsonb not null,
  status             text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error              text,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  unique (provider, provider_event_id)       -- replayed webhooks cannot be processed twice
);

-- ------------------------------------------------------------
-- Usage metering and quotas
-- ------------------------------------------------------------
create table public.usage_counters (
  subject_type      text not null check (subject_type in ('user', 'org')),
  subject_id        uuid not null,
  period            text not null check (period in ('day', 'month')),
  period_start      date not null,
  requests          integer not null default 0 check (requests >= 0),
  premium_requests  integer not null default 0 check (premium_requests >= 0),
  primary key (subject_type, subject_id, period, period_start)
);

create table public.rate_buckets (
  user_id       uuid not null,
  minute_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (user_id, minute_start)
);

-- One row per tutor request id: makes retries idempotent and lets a failed
-- provider call give its quota back exactly once.
create table public.request_reservations (
  user_id      uuid not null references auth.users(id) on delete cascade,
  request_id   uuid not null,
  org_id       uuid,
  premium      boolean not null,
  day_start    date not null,
  month_start  date not null,
  state        text not null default 'reserved' check (state in ('reserved', 'completed', 'released')),
  created_at   timestamptz not null default now(),
  primary key (user_id, request_id)
);

-- No conversation content here: only metering data.
create table public.usage_records (
  id              bigserial primary key,
  request_id      uuid not null,
  user_id         uuid references auth.users(id) on delete set null,
  org_id          uuid references public.organizations(id) on delete set null,
  plan_id         text not null,
  provider        text,
  model           text,
  model_role      text,
  premium         boolean not null default false,
  input_tokens    integer,
  output_tokens   integer,
  est_cost_usd    numeric(12,6),           -- estimate: provider-reported tokens x configured price
  latency_ms      integer,
  ttft_ms         integer,                 -- null when the provider call was not streamed
  status          text not null check (status in ('success', 'timeout', 'error', 'cancelled')),
  fallback_used   boolean not null default false,
  answer_rewrite  boolean not null default false, -- reply was regenerated because it revealed the final answer
  error_code      text,
  created_at      timestamptz not null default now()
);
create index usage_records_user_time_idx on public.usage_records(user_id, created_at);
create index usage_records_org_time_idx on public.usage_records(org_id, created_at);
create index usage_records_time_idx on public.usage_records(created_at);

-- ------------------------------------------------------------
-- Tutoring history (owner-only)
-- ------------------------------------------------------------
create table public.tutoring_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid references public.organizations(id) on delete set null,
  title       text not null default '',
  language    text,
  turn_count  integer not null default 0,
  hints_used  integer not null default 0 check (hints_used between 0 and 3),
  last_difficulty text check (last_difficulty in ('basic', 'standard', 'complex')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tutoring_sessions_user_idx on public.tutoring_sessions(user_id, updated_at desc);

create table public.tutoring_messages (
  id          bigserial primary key,
  session_id  uuid not null references public.tutoring_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  meta        jsonb not null default '{}'::jsonb,  -- type, hintLevel, concepts, misconception (never the private solution)
  created_at  timestamptz not null default now()
);
create index tutoring_messages_session_idx on public.tutoring_messages(session_id, id);

-- ------------------------------------------------------------
-- Operations
-- ------------------------------------------------------------
create table public.audit_logs (
  id           bigserial primary key,
  actor_id     uuid,
  action       text not null,
  target_type  text,
  target_id    text,
  org_id       uuid,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_time_idx on public.audit_logs(created_at desc);

create table public.quote_requests (
  id             uuid primary key default gen_random_uuid(),
  institution    text not null check (length(institution) between 2 and 200),
  contact_name   text not null check (length(contact_name) between 2 and 120),
  contact_email  text not null check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  country        text,
  learners       integer check (learners between 1 and 1000000),
  message        text check (length(message) <= 4000),
  status         text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at     timestamptz not null default now()
);

-- ============================================================
-- Entitlement resolution
-- ============================================================
create or replace function public.setting_num(p_key text, p_default numeric) returns numeric
language sql stable set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_settings where key = p_key), p_default);
$$;

-- A subscription grants access while it is live under its billing state.
create or replace function public.subscription_is_live(s public.subscriptions) returns boolean
language sql stable set search_path = public as $$
  select case s.status
    when 'active'   then s.current_period_end is null or s.current_period_end > now()
    when 'trialing' then s.current_period_end is null or s.current_period_end > now()
    when 'past_due' then s.current_period_end is not null
                         and now() < s.current_period_end + make_interval(days => public.setting_num('past_due_grace_days', 3)::int)
    when 'canceled' then s.current_period_end is not null and now() < s.current_period_end  -- paid-through period only
    else false   -- incomplete, expired, refunded
  end;
$$;

-- Returns the single best plan the user is entitled to right now.
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
    select 'free', 'free', null, null, null, null, true
  )
  select c.plan_id, c.source, c.org_id, c.subscription_id, c.status, c.current_period_end,
         p.daily_request_limit, p.monthly_request_limit, p.monthly_premium_limit, p.premium_safety_margin,
         p.requests_per_minute, p.max_session_turns, p.context_turns, p.routing_policy, p.analytics_level,
         c.worked_solutions
  from candidates c join public.plans p on p.id = c.plan_id
  order by p.rank desc, (c.source = 'subscription') desc
  limit 1;
$$;

-- ============================================================
-- Atomic quota enforcement
-- ============================================================
-- Reserves one request (and optionally one premium request) for the user.
-- Concurrency-safe: each counter row is incremented with a conditional
-- INSERT .. ON CONFLICT DO UPDATE .. WHERE, which takes a row lock and
-- re-checks the limit against the latest committed value, so parallel
-- requests cannot push a counter past its limit. All increments happen in
-- one sub-transaction: if any limit is hit, every increment is undone.
create or replace function public.consume_quota(p_user uuid, p_request_id uuid, p_premium boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e record;
  v_day date := (now() at time zone 'utc')::date;
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_hits int;
  v_day_used int;
  v_month_used int;
  v_premium_used int := 0;
  v_premium_cap int;
  v_org_limit int;
begin
  select * into e from public.resolve_entitlement(p_user);

  -- Idempotency: the same request id is never charged twice.
  if exists (select 1 from public.request_reservations where user_id = p_user and request_id = p_request_id) then
    return jsonb_build_object('allowed', false, 'reason', 'duplicate_request', 'plan', e.plan_id);
  end if;

  -- Per-minute rate limit (counts attempts, including rejected ones).
  insert into public.rate_buckets as b (user_id, minute_start, hits)
  values (p_user, date_trunc('minute', now()), 1)
  on conflict (user_id, minute_start) do update set hits = b.hits + 1
  returning hits into v_hits;
  if v_hits > e.requests_per_minute then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited', 'plan', e.plan_id,
                              'retry_after_seconds', 60 - extract(second from now())::int);
  end if;

  v_premium_cap := greatest(e.monthly_premium_limit - e.premium_safety_margin, 0);
  if p_premium and v_premium_cap = 0 then
    return jsonb_build_object('allowed', false, 'reason', 'premium_not_included', 'plan', e.plan_id);
  end if;
  if e.daily_request_limit = 0 or e.monthly_request_limit = 0 then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'plan', e.plan_id);
  end if;

  begin
    insert into public.usage_counters as c (subject_type, subject_id, period, period_start, requests, premium_requests)
    values ('user', p_user, 'day', v_day, 1, 0)
    on conflict (subject_type, subject_id, period, period_start) do update
      set requests = c.requests + 1
      where c.requests < e.daily_request_limit
    returning requests into v_day_used;
    if v_day_used is null then raise exception using errcode = 'P0001', message = 'daily_limit'; end if;

    insert into public.usage_counters as c (subject_type, subject_id, period, period_start, requests, premium_requests)
    values ('user', p_user, 'month', v_month, 1, case when p_premium then 1 else 0 end)
    on conflict (subject_type, subject_id, period, period_start) do update
      set requests = c.requests + 1,
          premium_requests = c.premium_requests + case when p_premium then 1 else 0 end
      where c.requests < e.monthly_request_limit
        and (not p_premium or c.premium_requests < v_premium_cap)
    returning requests, premium_requests into v_month_used, v_premium_used;
    if v_month_used is null then
      if p_premium and exists (
        select 1 from public.usage_counters
        where subject_type = 'user' and subject_id = p_user and period = 'month'
          and period_start = v_month and premium_requests >= v_premium_cap
          and requests < e.monthly_request_limit) then
        raise exception using errcode = 'P0001', message = 'premium_limit';
      end if;
      raise exception using errcode = 'P0001', message = 'monthly_limit';
    end if;

    -- Institutional pool (only when the seat comes from an organization).
    if e.source = 'organization' then
      select monthly_request_limit into v_org_limit from public.organizations where id = e.org_id;
      if v_org_limit is not null then
        if v_org_limit = 0 then raise exception using errcode = 'P0001', message = 'org_limit'; end if;
        with ins as (
          insert into public.usage_counters as c (subject_type, subject_id, period, period_start, requests, premium_requests)
          values ('org', e.org_id, 'month', v_month, 1, 0)
          on conflict (subject_type, subject_id, period, period_start) do update
            set requests = c.requests + 1
            where c.requests < v_org_limit
          returning 1
        ) select count(*) into v_hits from ins;
        if v_hits = 0 then raise exception using errcode = 'P0001', message = 'org_limit'; end if;
      end if;
    end if;

    insert into public.request_reservations (user_id, request_id, org_id, premium, day_start, month_start)
    values (p_user, p_request_id, e.org_id, p_premium, v_day, v_month);
  exception when sqlstate 'P0001' then
    return jsonb_build_object('allowed', false, 'reason', sqlerrm, 'plan', e.plan_id);
  end;

  return jsonb_build_object(
    'allowed', true, 'plan', e.plan_id, 'source', e.source, 'org_id', e.org_id,
    'daily_remaining', e.daily_request_limit - v_day_used,
    'monthly_remaining', e.monthly_request_limit - v_month_used,
    'premium_remaining', case when e.monthly_premium_limit > 0
                              then greatest(v_premium_cap - coalesce(v_premium_used, 0), 0) else 0 end);
end $$;
