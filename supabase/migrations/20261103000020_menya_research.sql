-- ============================================================
-- Academic research: connector settings, a shared cache of public paper records, usage numbers for
-- administrators, and a daily allowance per plan. Only adds things: no existing row changes except the
-- new plan column and my_account returning two more numbers.
-- Keys are Edge Function secrets, never stored here. Nothing here holds a student's question or identity
-- except media_usage, which already counts per-user allowances; the numbers are by service and subject.
-- Rollback: select cron.unschedule('menya-purge-research'); drop table public.research_queries,
-- public.research_calls, public.research_rate, public.research_cache, public.research_connectors; drop the
-- functions below; alter table public.plans drop column daily_research_limit; delete from public.media_usage
-- where kind = 'research'; restore the kind check and my_account from 20261103000019.
-- ============================================================
alter table public.plans add column daily_research_limit integer;   -- null = none
update public.plans set daily_research_limit = case id when 'free' then 3 when 'pro' then 15 when 'exam' then 15 when 'professional' then 30 else 0 end;

alter table public.media_usage drop constraint media_usage_kind_check;
alter table public.media_usage add constraint media_usage_kind_check check (kind in ('transcribe', 'read_image', 'diagram', 'research'));

create table public.research_connectors (
  id            text primary key,
  name          text not null,
  enabled       boolean not null default true,
  priority      integer not null default 100,
  timeout_ms    integer not null default 5000 check (timeout_ms between 500 and 30000),
  rate_per_min  integer not null default 30 check (rate_per_min between 1 and 600),
  updated_at    timestamptz not null default now()
);
insert into public.research_connectors (id, name, enabled, priority, timeout_ms, rate_per_min) values
  ('openalex', 'OpenAlex', true, 10, 6000, 60),
  ('europe_pmc', 'Europe PMC', true, 20, 6000, 60),
  ('pubmed', 'PubMed', true, 30, 6000, 60),
  ('semantic_scholar', 'Semantic Scholar', true, 40, 5000, 20),
  ('arxiv', 'arXiv', true, 50, 6000, 15),
  ('doaj', 'DOAJ', true, 60, 5000, 60),
  ('crossref', 'Crossref', true, 70, 5000, 60),
  ('unpaywall', 'Unpaywall', true, 80, 4000, 60),
  ('core', 'CORE', true, 90, 6000, 10);

-- Public paper metadata, shared between students, found again by a hash of the search words.
create table public.research_cache (
  cache_key   text primary key,
  connector   text not null,
  results     jsonb not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index research_cache_expiry_idx on public.research_cache(expires_at);

create table public.research_rate (
  connector  text not null,
  minute     timestamptz not null,
  calls      integer not null default 0,
  primary key (connector, minute)
);

-- One row per call to a service: no query text and no user.
create table public.research_calls (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  connector    text not null,
  status       text not null check (status in ('ok', 'empty', 'cached', 'error', 'timeout', 'rate_limited', 'skipped')),
  latency_ms   integer,
  results      integer not null default 0,
  http_status  integer
);
create index research_calls_created_idx on public.research_calls(created_at);

-- One row per researched tutor reply: no query text and no user.
create table public.research_queries (
  id                 bigint generated always as identity primary key,
  created_at         timestamptz not null default now(),
  subject            text not null,
  tier               text not null check (tier in ('auto', 'deep')),
  status             text not null check (status in ('ok', 'empty', 'unavailable')),
  sources_found      integer not null default 0,
  sources_cited      integer not null default 0,
  citation_failures  integer not null default 0,
  degraded           boolean not null default false,
  duration_ms        integer,
  est_cost_usd       numeric(12, 6)
);
create index research_queries_created_idx on public.research_queries(created_at);

alter table public.research_connectors enable row level security;
alter table public.research_cache enable row level security;
alter table public.research_rate enable row level security;
alter table public.research_calls enable row level security;
alter table public.research_queries enable row level security;
revoke all on public.research_connectors, public.research_cache, public.research_rate, public.research_calls, public.research_queries from anon, authenticated;

insert into public.app_settings (key, value, description) values
  ('research_timeout_ms', '7000', 'Longest a student waits for a research search on an ordinary question'),
  ('research_deep_timeout_ms', '12000', 'Longest a student waits for a deeper search (a review, or when they asked for one)'),
  ('research_cache_hours', '168', 'How long retrieved paper records are reused before searching again')
on conflict (key) do nothing;

create or replace function public.research_allowance(p_user uuid, p_plan text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'limit', coalesce((select daily_research_limit from public.plans where id = p_plan), 0),
    'used', (select count(*) from public.media_usage
             where user_id = p_user and kind = 'research' and created_at >= date_trunc('day', now())));
$$;

create or replace function public.research_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'connectors', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'enabled', enabled, 'priority', priority, 'timeout_ms', timeout_ms, 'rate_per_min', rate_per_min) order by priority) from public.research_connectors), '[]'::jsonb),
    'timeout_ms', public.setting_num('research_timeout_ms', 7000),
    'deep_timeout_ms', public.setting_num('research_deep_timeout_ms', 12000),
    'cache_hours', public.setting_num('research_cache_hours', 168));
$$;

create or replace function public.research_rate_allow(p_connector text, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.research_rate (connector, minute, calls) values (p_connector, date_trunc('minute', now()), 1)
  on conflict (connector, minute) do update set calls = public.research_rate.calls + 1
  returning calls into n;
  return n <= p_limit;
end $$;

create or replace function public.purge_research() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.research_cache where expires_at < now();
  delete from public.research_rate where minute < now() - interval '1 day';
  delete from public.research_calls where created_at < now() - interval '180 days';
  delete from public.research_queries where created_at < now() - interval '365 days';
end $$;
select cron.schedule('menya-purge-research', '50 3 * * *', $$select public.purge_research()$$);

create or replace function public.admin_research_json(p_actor uuid, p_days integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 180));
begin
  perform public.require_platform_admin(p_actor);
  return jsonb_build_object(
    'connectors', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'enabled', c.enabled, 'priority', c.priority,
        'timeout_ms', c.timeout_ms, 'rate_per_min', c.rate_per_min,
        'requests', (select count(*) from public.research_calls r where r.connector = c.id and r.created_at >= since and r.status not in ('skipped', 'cached')),
        'cached', (select count(*) from public.research_calls r where r.connector = c.id and r.created_at >= since and r.status = 'cached'),
        'failed', (select count(*) from public.research_calls r where r.connector = c.id and r.created_at >= since and r.status in ('error', 'timeout')),
        'rate_limited', (select count(*) from public.research_calls r where r.connector = c.id and r.created_at >= since and r.status = 'rate_limited'),
        'avg_ms', (select round(avg(r.latency_ms)) from public.research_calls r where r.connector = c.id and r.created_at >= since and r.status in ('ok', 'empty')),
        'last_ok', (select max(r.created_at) from public.research_calls r where r.connector = c.id and r.status = 'ok')) order by c.priority) from public.research_connectors c), '[]'::jsonb),
    'queries', (select count(*) from public.research_queries where created_at >= since),
    'found_nothing', (select count(*) from public.research_queries where created_at >= since and status <> 'ok'),
    'sources_retrieved', (select coalesce(sum(sources_found), 0) from public.research_queries where created_at >= since),
    'sources_cited', (select coalesce(sum(sources_cited), 0) from public.research_queries where created_at >= since),
    'citation_failures', (select coalesce(sum(citation_failures), 0) from public.research_queries where created_at >= since),
    'avg_seconds', (select round(avg(duration_ms) / 1000.0, 1) from public.research_queries where created_at >= since),
    'ai_cost_usd', (select coalesce(round(sum(est_cost_usd), 4), 0) from public.research_queries where created_at >= since),
    'by_subject', coalesce((select jsonb_object_agg(subject, n) from (select subject, count(*) as n from public.research_queries where created_at >= since group by 1) x), '{}'::jsonb),
    'settings', jsonb_build_object('timeout_ms', public.setting_num('research_timeout_ms', 7000),
      'deep_timeout_ms', public.setting_num('research_deep_timeout_ms', 12000), 'cache_hours', public.setting_num('research_cache_hours', 168)),
    'plan_limits', coalesce((select jsonb_agg(jsonb_build_object('plan', id, 'name', name, 'limit', daily_research_limit) order by rank) from public.plans where id <> 'guest'), '[]'::jsonb));
end $$;

create or replace function public.admin_update_research(p_actor uuid, p_changes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare c jsonb := p_changes->'connector'; s jsonb := p_changes->'settings'; p jsonb := p_changes->'plan';
begin
  perform public.require_platform_admin(p_actor);
  if c is not null then
    if not exists (select 1 from public.research_connectors where id = c->>'id') then
      raise exception using errcode = '22023', message = 'unknown_connector';
    end if;
    update public.research_connectors set
      enabled = coalesce((c->>'enabled')::boolean, enabled),
      priority = coalesce((c->>'priority')::int, priority),
      timeout_ms = coalesce((c->>'timeout_ms')::int, timeout_ms),
      rate_per_min = coalesce((c->>'rate_per_min')::int, rate_per_min),
      updated_at = now()
    where id = c->>'id';
  end if;
  if s is not null then
    if exists (select 1 from jsonb_object_keys(s) k where k not in ('research_timeout_ms', 'research_deep_timeout_ms', 'research_cache_hours')) then
      raise exception using errcode = '22023', message = 'field_not_editable';
    end if;
    if (s->>'research_timeout_ms')::int not between 1000 and 20000 or (s->>'research_deep_timeout_ms')::int not between 1000 and 30000
       or (s->>'research_cache_hours')::int not between 0 and 2160 then
      raise exception using errcode = '22023', message = 'out_of_range';
    end if;
    update public.app_settings a set value = s->a.key, updated_at = now() where a.key in (select jsonb_object_keys(s));
  end if;
  if p is not null then
    if (p->>'limit')::int < 0 or not exists (select 1 from public.plans where id = p->>'plan' and id <> 'guest') then
      raise exception using errcode = '22023', message = 'invalid_plan_limit';
    end if;
    update public.plans set daily_research_limit = (p->>'limit')::int, updated_at = now() where id = p->>'plan';
  end if;
  insert into public.audit_logs (actor_id, action, target_type, details) values (p_actor, 'research.settings', 'research', p_changes);
end $$;

-- What the tutor needs to remember about a learner, from answers the server marked itself.
create or replace function public.learner_memory(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('objective_id', objective_id, 'status', status, 'incorrect', incorrect,
      'guided_correct', guided_correct, 'independent_correct', independent_correct, 'misconceptions', misconceptions,
      'next_review_at', next_review_at) order by updated_at desc), '[]'::jsonb)
  from (select * from public.learner_objectives where user_id = p_user order by updated_at desc limit 30) o;
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
      'images', pl.daily_image_limit, 'notes', pl.material_limit, 'research', pl.daily_research_limit),
    'used', jsonb_build_object('daily', coalesce(d.requests, 0), 'monthly', coalesce(m.requests, 0),
      'premium', coalesce(m.premium_requests, 0),
      'images', (select count(*) from public.media_usage where user_id = v_user and kind = 'diagram' and created_at >= date_trunc('day', now())),
      'research', (select count(*) from public.media_usage where user_id = v_user and kind = 'research' and created_at >= date_trunc('day', now())),
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

revoke execute on function public.research_allowance(uuid, text), public.research_config(), public.research_rate_allow(text, integer), public.purge_research(),
  public.admin_research_json(uuid, integer), public.admin_update_research(uuid, jsonb), public.learner_memory(uuid) from public, anon, authenticated;
grant execute on function public.research_allowance(uuid, text), public.research_config(), public.research_rate_allow(text, integer), public.purge_research(),
  public.admin_research_json(uuid, integer), public.admin_update_research(uuid, jsonb), public.learner_memory(uuid) to service_role;
