-- ============================================================
-- Menya Research workspace: searches, claims, evidence assessments, syntheses, projects and saved papers.
-- Everything a learner saves is theirs alone: browsers have no access to these tables, and every function
-- checks that the row belongs to the user the server authenticated. Paper records are public metadata,
-- shared between searches. Limits per plan live in plans.research_limits and are edited from Admin.
-- Only adds things. Rollback: drop the tables and functions below; alter table public.plans drop column
-- research_limits; restore admin_update_research from 20261103000020.
-- ============================================================
alter table public.plans add column research_limits jsonb not null default '{}'::jsonb;
update public.plans set research_limits = case id
  when 'free' then '{"searches_per_month":5,"papers_per_search":25,"assessments_per_search":10,"syntheses_per_month":2,"full_text":false,"export":true}'::jsonb
  when 'pro' then '{"searches_per_month":30,"papers_per_search":50,"assessments_per_search":40,"syntheses_per_month":15,"full_text":true,"export":true}'::jsonb
  when 'exam' then '{"searches_per_month":30,"papers_per_search":50,"assessments_per_search":40,"syntheses_per_month":15,"full_text":true,"export":true}'::jsonb
  when 'professional' then '{"searches_per_month":100,"papers_per_search":50,"assessments_per_search":80,"syntheses_per_month":40,"full_text":true,"export":true}'::jsonb
  else '{"searches_per_month":0,"papers_per_search":0,"assessments_per_search":0,"syntheses_per_month":0,"full_text":false,"export":false}'::jsonb end;

create table public.research_projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index research_projects_user_idx on public.research_projects(user_id, updated_at desc);

create table public.research_searches (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid references public.research_projects(id) on delete set null,
  question       text not null check (char_length(question) between 3 and 1000),
  query          text not null,
  is_boolean     boolean not null default false,
  filters        jsonb not null default '{}'::jsonb,
  subject        text not null default 'general',
  strategy       jsonb not null default '{}'::jsonb,
  pages          integer not null default 0,
  tokens_in      integer not null default 0,
  tokens_out     integer not null default 0,
  cost_usd       numeric(12, 6) not null default 0,
  search_ms      integer,
  assess_ms      integer not null default 0,
  assess_batches integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index research_searches_user_idx on public.research_searches(user_id, created_at desc);

-- One record per paper, found again by DOI or by normalised title.
create table public.research_papers (
  key         text primary key,
  doi         text,
  title       text not null,
  data        jsonb not null,
  first_seen  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index research_papers_doi_idx on public.research_papers(doi);

create table public.research_search_papers (
  search_id  uuid not null references public.research_searches(id) on delete cascade,
  paper_key  text not null references public.research_papers(key),
  rank       integer not null,
  found_in   text[] not null default '{}',
  primary key (search_id, paper_key)
);
create index research_search_papers_rank_idx on public.research_search_papers(search_id, rank);

create table public.research_claims (
  id          uuid primary key default gen_random_uuid(),
  search_id   uuid not null references public.research_searches(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  text        text not null check (char_length(text) between 3 and 500),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index research_claims_search_idx on public.research_claims(search_id, position);

create table public.evidence_assessments (
  id                   bigint generated always as identity primary key,
  claim_id             uuid not null references public.research_claims(id) on delete cascade,
  search_id            uuid not null references public.research_searches(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  paper_key            text not null references public.research_papers(key),
  category             text not null check (category in ('supports', 'contradicts', 'mixed', 'insufficient', 'not_relevant', 'no_text')),
  relevance            numeric(4, 3) not null default 0,
  confidence           text not null check (confidence in ('high', 'moderate', 'low', 'undetermined')),
  design               text not null,
  sample_size          integer,
  population           text,
  geographic_context   text,
  findings             text not null default '',
  passages             jsonb not null default '[]'::jsonb,
  limitations_reported jsonb not null default '[]'::jsonb,
  ai_concerns          jsonb not null default '[]'::jsonb,
  strength             text not null,
  evidence_level       text not null check (evidence_level in ('full_text_excerpt', 'abstract', 'metadata_only')),
  rationale            text not null default '',
  checks               jsonb not null default '{}'::jsonb,
  model                text,
  created_at           timestamptz not null default now(),
  unique (claim_id, paper_key)
);
create index evidence_assessments_search_idx on public.evidence_assessments(search_id);

create table public.research_syntheses (
  id          uuid primary key default gen_random_uuid(),
  search_id   uuid not null references public.research_searches(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  content     jsonb not null,
  model       text,
  tokens_in   integer not null default 0,
  tokens_out  integer not null default 0,
  cost_usd    numeric(12, 6) not null default 0,
  created_at  timestamptz not null default now()
);
create index research_syntheses_user_idx on public.research_syntheses(user_id, created_at desc);

create table public.research_saved_papers (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  paper_key   text not null references public.research_papers(key),
  project_id  uuid references public.research_projects(id) on delete cascade,
  note        text not null default '' check (char_length(note) <= 5000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (user_id, paper_key, project_id)
);

create table public.research_exports (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  search_id   uuid references public.research_searches(id) on delete set null,
  format      text not null,
  created_at  timestamptz not null default now()
);

alter table public.research_projects enable row level security;
alter table public.research_searches enable row level security;
alter table public.research_papers enable row level security;
alter table public.research_search_papers enable row level security;
alter table public.research_claims enable row level security;
alter table public.evidence_assessments enable row level security;
alter table public.research_syntheses enable row level security;
alter table public.research_saved_papers enable row level security;
alter table public.research_exports enable row level security;
revoke all on public.research_projects, public.research_searches, public.research_papers, public.research_search_papers, public.research_claims,
  public.evidence_assessments, public.research_syntheses, public.research_saved_papers, public.research_exports from anon, authenticated;

-- ---------- Limits and this month's use ----------
create or replace function public.rs_limits(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', e.plan_id,
    'limits', coalesce((select research_limits from public.plans where id = e.plan_id), '{}'::jsonb),
    'used', jsonb_build_object(
      'searches', (select count(*) from public.research_searches where user_id = p_user and created_at >= date_trunc('month', now())),
      'syntheses', (select count(*) from public.research_syntheses where user_id = p_user and created_at >= date_trunc('month', now()))))
  from public.resolve_entitlement(p_user) e;
$$;

create or replace function public.rs_owned(p_user uuid, p_search uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.research_searches where id = p_search and user_id = p_user);
$$;

create or replace function public.rs_create_search(p_user uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_used int; v_id uuid; v_project uuid := nullif(p->>'project_id', '')::uuid;
begin
  select coalesce((l->'limits'->>'searches_per_month')::int, 0), (l->'used'->>'searches')::int into v_limit, v_used from public.rs_limits(p_user) l;
  if v_used >= v_limit then raise exception using errcode = '54000', message = 'research_search_limit'; end if;
  if v_project is not null and not exists (select 1 from public.research_projects where id = v_project and user_id = p_user) then
    raise exception using errcode = '22023', message = 'unknown_project';
  end if;
  insert into public.research_searches (user_id, project_id, question, query, is_boolean, filters, subject)
  values (p_user, v_project, p->>'question', p->>'query', coalesce((p->>'is_boolean')::boolean, false), coalesce(p->'filters', '{}'::jsonb), coalesce(p->>'subject', 'general'))
  returning id into v_id;
  -- A question is the first claim to test; keywords with operators are not a claim, so the person writes one.
  if not coalesce((p->>'is_boolean')::boolean, false) then
    insert into public.research_claims (search_id, user_id, text, position) values (v_id, p_user, left(p->>'question', 500), 0);
  end if;
  return v_id;
end $$;

-- Results of one page of a search: papers stored once, linked in rank order after those already there.
create or replace function public.rs_save_results(p_user uuid, p_search uuid, p_papers jsonb, p_strategy jsonb, p_page int, p_ms int) returns int
language plpgsql security definer set search_path = public as $$
declare v_start int; n int := 0;
begin
  if not public.rs_owned(p_user, p_search) then raise exception using errcode = '42501', message = 'not_found'; end if;
  select coalesce(max(rank), 0) into v_start from public.research_search_papers where search_id = p_search;
  insert into public.research_papers (key, doi, title, data)
  select x->>'key', x->>'doi', x->>'title', x->'data' from jsonb_array_elements(p_papers) x
  on conflict (key) do update set data = excluded.data, doi = coalesce(excluded.doi, research_papers.doi), updated_at = now();
  insert into public.research_search_papers (search_id, paper_key, rank, found_in)
  select p_search, x.value->>'key', v_start + x.ordinality::int, array(select jsonb_array_elements_text(coalesce(x.value->'found_in', '[]'::jsonb)))
  from jsonb_array_elements(p_papers) with ordinality x
  on conflict (search_id, paper_key) do nothing;
  get diagnostics n = row_count;
  update public.research_searches set strategy = p_strategy, pages = greatest(pages, p_page),
    search_ms = coalesce(search_ms, 0) + coalesce(p_ms, 0), updated_at = now() where id = p_search;
  return n;
end $$;

create or replace function public.rs_get_search(p_user uuid, p_search uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when s.id is null then null else jsonb_build_object(
    'search', jsonb_build_object('id', s.id, 'project_id', s.project_id, 'question', s.question, 'query', s.query, 'is_boolean', s.is_boolean,
      'filters', s.filters, 'subject', s.subject, 'strategy', s.strategy, 'pages', s.pages, 'created_at', s.created_at, 'updated_at', s.updated_at),
    'papers', coalesce((select jsonb_agg(jsonb_build_object('key', sp.paper_key, 'rank', sp.rank, 'found_in', sp.found_in, 'data', rp.data, 'retrieved_at', rp.updated_at) order by sp.rank)
       from public.research_search_papers sp join public.research_papers rp on rp.key = sp.paper_key where sp.search_id = s.id), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'text', c.text, 'position', c.position) order by c.position, c.created_at)
       from public.research_claims c where c.search_id = s.id), '[]'::jsonb),
    'assessments', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id' - 'search_id') from public.evidence_assessments a where a.search_id = s.id), '[]'::jsonb),
    'synthesis', (select jsonb_build_object('id', y.id, 'content', y.content, 'model', y.model, 'created_at', y.created_at)
       from public.research_syntheses y where y.search_id = s.id order by y.created_at desc limit 1),
    'saved', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'paper_key', v.paper_key, 'project_id', v.project_id, 'note', v.note))
       from public.research_saved_papers v where v.user_id = p_user and v.paper_key in (select paper_key from public.research_search_papers where search_id = s.id)), '[]'::jsonb))
  end
  from (select * from public.research_searches where id = p_search and user_id = p_user) s
  right join (select 1) one on true;
$$;

create or replace function public.rs_workspace(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'searches', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'question', s.question, 'project_id', s.project_id, 'created_at', s.created_at,
        'papers', (select count(*) from public.research_search_papers where search_id = s.id),
        'assessed', (select count(*) from public.evidence_assessments where search_id = s.id and category not in ('no_text'))) order by s.created_at desc)
       from (select * from public.research_searches where user_id = p_user order by created_at desc limit 40) s), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'description', p.description, 'updated_at', p.updated_at,
        'searches', (select count(*) from public.research_searches where project_id = p.id),
        'saved', (select count(*) from public.research_saved_papers where project_id = p.id)) order by p.updated_at desc)
       from public.research_projects p where p.user_id = p_user), '[]'::jsonb),
    'saved', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'paper_key', v.paper_key, 'project_id', v.project_id, 'note', v.note, 'data', rp.data, 'updated_at', v.updated_at) order by v.updated_at desc)
       from public.research_saved_papers v join public.research_papers rp on rp.key = v.paper_key where v.user_id = p_user), '[]'::jsonb),
    'limits', public.rs_limits(p_user));
$$;

create or replace function public.rs_add_claims(p_user uuid, p_search uuid, p_texts jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int; v_new int := jsonb_array_length(p_texts);
begin
  if not public.rs_owned(p_user, p_search) then raise exception using errcode = '42501', message = 'not_found'; end if;
  select count(*) into v_count from public.research_claims where search_id = p_search;
  if v_count + v_new > 6 then raise exception using errcode = '22023', message = 'too_many_claims'; end if;
  insert into public.research_claims (search_id, user_id, text, position)
  select p_search, p_user, left(trim(t.value), 500), v_count + t.ord::int from jsonb_array_elements_text(p_texts) with ordinality as t(value, ord) where length(trim(t.value)) >= 3;
  return v_count + v_new;
end $$;

create or replace function public.rs_delete_claim(p_user uuid, p_claim uuid) returns boolean
language sql security definer set search_path = public as $$
  with d as (delete from public.research_claims where id = p_claim and user_id = p_user returning 1) select exists (select 1 from d);
$$;

-- The next papers to assess for a claim, in rank order, within what the plan allows per search.
create or replace function public.rs_to_assess(p_user uuid, p_search uuid, p_claim uuid, p_n int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cap int; v_used int; v_claim text;
begin
  if not public.rs_owned(p_user, p_search) then raise exception using errcode = '42501', message = 'not_found'; end if;
  select text into v_claim from public.research_claims where id = p_claim and search_id = p_search;
  if v_claim is null then raise exception using errcode = '42501', message = 'not_found'; end if;
  select coalesce((l->'limits'->>'assessments_per_search')::int, 0) into v_cap from public.rs_limits(p_user) l;
  select count(*) into v_used from public.evidence_assessments where search_id = p_search and category <> 'no_text';
  return jsonb_build_object('claim', v_claim, 'cap', v_cap, 'used', v_used,
    'full_text', coalesce((select (l->'limits'->>'full_text')::boolean from public.rs_limits(p_user) l), false),
    'remaining_papers', (select count(*) from public.research_search_papers sp where sp.search_id = p_search
       and not exists (select 1 from public.evidence_assessments a where a.claim_id = p_claim and a.paper_key = sp.paper_key)),
    'papers', coalesce((select jsonb_agg(jsonb_build_object('key', x.paper_key, 'data', x.data) order by x.rank) from (
       select sp.paper_key, sp.rank, rp.data from public.research_search_papers sp join public.research_papers rp on rp.key = sp.paper_key
       where sp.search_id = p_search and not exists (select 1 from public.evidence_assessments a where a.claim_id = p_claim and a.paper_key = sp.paper_key)
       order by sp.rank limit greatest(p_n, 0)) x), '[]'::jsonb));
end $$;

create or replace function public.rs_save_assessments(p_user uuid, p_search uuid, p_claim uuid, p_rows jsonb, p_usage jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.rs_owned(p_user, p_search) then raise exception using errcode = '42501', message = 'not_found'; end if;
  if not exists (select 1 from public.research_claims where id = p_claim and search_id = p_search) then raise exception using errcode = '42501', message = 'not_found'; end if;
  insert into public.evidence_assessments (claim_id, search_id, user_id, paper_key, category, relevance, confidence, design, sample_size, population,
    geographic_context, findings, passages, limitations_reported, ai_concerns, strength, evidence_level, rationale, checks, model)
  select p_claim, p_search, p_user, r->>'paper_key', r->>'category', coalesce((r->>'relevance')::numeric, 0), r->>'confidence', r->>'design',
    (r->>'sample_size')::int, r->>'population', r->>'geographic_context', coalesce(r->>'findings', ''), coalesce(r->'passages', '[]'::jsonb),
    coalesce(r->'limitations_reported', '[]'::jsonb), coalesce(r->'ai_concerns', '[]'::jsonb), r->>'strength', r->>'evidence_level',
    coalesce(r->>'rationale', ''), coalesce(r->'checks', '{}'::jsonb), p_usage->>'model'
  from jsonb_array_elements(p_rows) r
  on conflict (claim_id, paper_key) do nothing;
  get diagnostics n = row_count;
  update public.research_searches set tokens_in = tokens_in + coalesce((p_usage->>'in')::int, 0), tokens_out = tokens_out + coalesce((p_usage->>'out')::int, 0),
    cost_usd = cost_usd + coalesce((p_usage->>'cost')::numeric, 0), assess_ms = assess_ms + coalesce((p_usage->>'ms')::int, 0),
    assess_batches = assess_batches + case when coalesce((p_usage->>'in')::int, 0) > 0 then 1 else 0 end, updated_at = now()
  where id = p_search;
  return n;
end $$;

create or replace function public.rs_save_synthesis(p_user uuid, p_search uuid, p_content jsonb, p_usage jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_used int; v_id uuid;
begin
  if not public.rs_owned(p_user, p_search) then raise exception using errcode = '42501', message = 'not_found'; end if;
  select coalesce((l->'limits'->>'syntheses_per_month')::int, 0), (l->'used'->>'syntheses')::int into v_limit, v_used from public.rs_limits(p_user) l;
  if v_used >= v_limit then raise exception using errcode = '54000', message = 'research_synthesis_limit'; end if;
  insert into public.research_syntheses (search_id, user_id, content, model, tokens_in, tokens_out, cost_usd)
  values (p_search, p_user, p_content, p_usage->>'model', coalesce((p_usage->>'in')::int, 0), coalesce((p_usage->>'out')::int, 0), coalesce((p_usage->>'cost')::numeric, 0))
  returning id into v_id;
  update public.research_searches set tokens_in = tokens_in + coalesce((p_usage->>'in')::int, 0), tokens_out = tokens_out + coalesce((p_usage->>'out')::int, 0),
    cost_usd = cost_usd + coalesce((p_usage->>'cost')::numeric, 0), updated_at = now() where id = p_search;
  return v_id;
end $$;

-- ---------- Projects, saved papers, exports ----------
create or replace function public.rs_project(p_user uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if p ? 'delete' then
    delete from public.research_projects where id = v_id and user_id = p_user;
    return v_id;
  end if;
  if v_id is null then
    insert into public.research_projects (user_id, title, description) values (p_user, trim(p->>'title'), nullif(trim(coalesce(p->>'description', '')), '')) returning id into v_id;
  else
    update public.research_projects set title = coalesce(nullif(trim(p->>'title'), ''), title), description = coalesce(p->>'description', description), updated_at = now()
    where id = v_id and user_id = p_user;
    if not found then raise exception using errcode = '42501', message = 'not_found'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.rs_search_project(p_user uuid, p_search uuid, p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_project is not null and not exists (select 1 from public.research_projects where id = p_project and user_id = p_user) then
    raise exception using errcode = '42501', message = 'not_found';
  end if;
  update public.research_searches set project_id = p_project, updated_at = now() where id = p_search and user_id = p_user;
  if not found then raise exception using errcode = '42501', message = 'not_found'; end if;
end $$;

create or replace function public.rs_save_paper(p_user uuid, p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_project uuid := nullif(p->>'project_id', '')::uuid;
begin
  if p ? 'delete' then
    delete from public.research_saved_papers where id = (p->>'id')::bigint and user_id = p_user returning id into v_id;
    return v_id;
  end if;
  if not exists (select 1 from public.research_papers where key = p->>'paper_key') then raise exception using errcode = '42501', message = 'not_found'; end if;
  if v_project is not null and not exists (select 1 from public.research_projects where id = v_project and user_id = p_user) then
    raise exception using errcode = '42501', message = 'not_found';
  end if;
  insert into public.research_saved_papers (user_id, paper_key, project_id, note) values (p_user, p->>'paper_key', v_project, left(coalesce(p->>'note', ''), 5000))
  on conflict (user_id, paper_key, project_id) do update set note = case when p ? 'note' then excluded.note else research_saved_papers.note end, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.rs_log_export(p_user uuid, p_search uuid, p_format text) returns void
language sql security definer set search_path = public as $$
  insert into public.research_exports (user_id, search_id, format) values (p_user, p_search, left(p_format, 20));
$$;

-- ---------- Administrators: totals only, no one's questions ----------
create or replace function public.admin_research_workspace_json(p_actor uuid, p_days int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 180));
begin
  perform public.require_platform_admin(p_actor);
  return jsonb_build_object(
    'searches', (select count(*) from public.research_searches where created_at >= since),
    'active_users', (select count(distinct user_id) from public.research_searches where created_at >= since),
    'by_subject', coalesce((select jsonb_object_agg(subject, n) from (select subject, count(*) n from public.research_searches where created_at >= since group by 1) x), '{}'::jsonb),
    'avg_search_ms', (select round(avg(search_ms)) from public.research_searches where created_at >= since and search_ms is not null),
    'avg_assess_batch_ms', (select round(sum(assess_ms)::numeric / nullif(sum(assess_batches), 0)) from public.research_searches where created_at >= since),
    'tokens_in', (select coalesce(sum(tokens_in), 0) from public.research_searches where created_at >= since),
    'tokens_out', (select coalesce(sum(tokens_out), 0) from public.research_searches where created_at >= since),
    'cost_usd', (select coalesce(round(sum(cost_usd), 4), 0) from public.research_searches where created_at >= since),
    'cost_per_search_usd', (select round(avg(cost_usd), 5) from public.research_searches where created_at >= since),
    'papers_assessed', (select count(*) from public.evidence_assessments where created_at >= since and category <> 'no_text'),
    'categories', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from public.evidence_assessments where created_at >= since group by 1) x), '{}'::jsonb),
    'passages_rejected', (select coalesce(sum((checks->>'passages_rejected')::int), 0) from public.evidence_assessments where created_at >= since),
    'downgraded', (select count(*) from public.evidence_assessments where created_at >= since and (checks->>'downgraded')::boolean),
    'syntheses', (select count(*) from public.research_syntheses where created_at >= since),
    'exports', coalesce((select jsonb_object_agg(format, n) from (select format, count(*) n from public.research_exports where created_at >= since group by 1) x), '{}'::jsonb),
    'top_saved', coalesce((select jsonb_agg(jsonb_build_object('title', rp.title, 'doi', rp.doi, 'saves', x.n) order by x.n desc) from (
       select paper_key, count(*) n from public.research_saved_papers where created_at >= since group by 1 order by 2 desc limit 10) x
       join public.research_papers rp on rp.key = x.paper_key), '[]'::jsonb),
    'limits', coalesce((select jsonb_agg(jsonb_build_object('plan', id, 'name', name, 'limits', research_limits) order by rank) from public.plans where id <> 'guest'), '[]'::jsonb));
end $$;

create or replace function public.admin_update_research(p_actor uuid, p_changes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare c jsonb := p_changes->'connector'; s jsonb := p_changes->'settings'; p jsonb := p_changes->'plan'; w jsonb := p_changes->'workspace'; lk text;
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
  if w is not null then
    if not exists (select 1 from public.plans where id = w->>'plan' and id <> 'guest') or jsonb_typeof(w->'limits') <> 'object' then
      raise exception using errcode = '22023', message = 'invalid_plan_limit';
    end if;
    for lk in select jsonb_object_keys(w->'limits') loop
      if lk in ('searches_per_month', 'papers_per_search', 'assessments_per_search', 'syntheses_per_month') then
        if jsonb_typeof(w->'limits'->lk) <> 'number' or (w->'limits'->>lk)::numeric < 0 or (w->'limits'->>lk)::numeric > 10000 then
          raise exception using errcode = '22023', message = 'out_of_range';
        end if;
      elsif lk in ('full_text', 'export') then
        if jsonb_typeof(w->'limits'->lk) <> 'boolean' then raise exception using errcode = '22023', message = 'out_of_range'; end if;
      else
        raise exception using errcode = '22023', message = 'field_not_editable';
      end if;
    end loop;
    update public.plans set research_limits = research_limits || (w->'limits'), updated_at = now() where id = w->>'plan';
  end if;
  insert into public.audit_logs (actor_id, action, target_type, details) values (p_actor, 'research.settings', 'research', p_changes);
end $$;

revoke execute on function public.rs_limits(uuid), public.rs_owned(uuid, uuid), public.rs_create_search(uuid, jsonb), public.rs_save_results(uuid, uuid, jsonb, jsonb, int, int),
  public.rs_get_search(uuid, uuid), public.rs_workspace(uuid), public.rs_add_claims(uuid, uuid, jsonb), public.rs_delete_claim(uuid, uuid),
  public.rs_to_assess(uuid, uuid, uuid, int), public.rs_save_assessments(uuid, uuid, uuid, jsonb, jsonb), public.rs_save_synthesis(uuid, uuid, jsonb, jsonb),
  public.rs_project(uuid, jsonb), public.rs_search_project(uuid, uuid, uuid), public.rs_save_paper(uuid, jsonb), public.rs_log_export(uuid, uuid, text),
  public.admin_research_workspace_json(uuid, int), public.admin_update_research(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rs_limits(uuid), public.rs_owned(uuid, uuid), public.rs_create_search(uuid, jsonb), public.rs_save_results(uuid, uuid, jsonb, jsonb, int, int),
  public.rs_get_search(uuid, uuid), public.rs_workspace(uuid), public.rs_add_claims(uuid, uuid, jsonb), public.rs_delete_claim(uuid, uuid),
  public.rs_to_assess(uuid, uuid, uuid, int), public.rs_save_assessments(uuid, uuid, uuid, jsonb, jsonb), public.rs_save_synthesis(uuid, uuid, jsonb, jsonb),
  public.rs_project(uuid, jsonb), public.rs_search_project(uuid, uuid, uuid), public.rs_save_paper(uuid, jsonb), public.rs_log_export(uuid, uuid, text),
  public.admin_research_workspace_json(uuid, int), public.admin_update_research(uuid, jsonb) to service_role;
