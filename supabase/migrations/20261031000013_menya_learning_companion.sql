-- ============================================================
-- Learning companion: the learner's profile, exams, mock exams and course materials.
-- All writes go through the API (service role); learners can read only their own rows,
-- except mock-exam answer keys and material text, which only the server reads.
-- Everything is deleted with the account (on delete cascade) and included in the export.
-- Rollback: drop the functions defined below (learning_state … list_materials); drop table public.material_chunks, public.course_materials,
-- public.mock_exams, public.learner_exams, public.learner_profiles; restore export_my_data
-- from 20261029000010.
-- ============================================================

create table public.learner_profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  education_level  text check (education_level in ('secondary', 'university', 'professional', 'other')),
  year_of_study    smallint check (year_of_study between 1 and 12),
  institution      text check (char_length(institution) <= 120),
  programme        text check (char_length(programme) <= 120),       -- course or field of study
  curriculum       text check (char_length(curriculum) <= 120),      -- e.g. "REB A-level", "University of Rwanda CST"
  subjects         text[] not null default '{}',
  goals            text check (char_length(goals) <= 500),
  -- minutes the learner can study on each weekday, Monday first (0 = no study that day)
  study_minutes    smallint[] not null default '{30,30,30,30,30,0,0}' check (array_length(study_minutes, 1) = 7),
  updated_at       timestamptz not null default now()
);
alter table public.learner_profiles enable row level security;
create policy learner_profiles_self_read on public.learner_profiles for select to authenticated using (user_id = auth.uid());
revoke all on public.learner_profiles from anon;
revoke insert, update, delete on public.learner_profiles from authenticated;

create table public.learner_exams (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  exam_date   date not null,
  objectives  text[] not null default '{}',     -- engine objective ids the exam covers
  created_at  timestamptz not null default now()
);
create index learner_exams_user_idx on public.learner_exams(user_id, exam_date);
alter table public.learner_exams enable row level security;
create policy learner_exams_self_read on public.learner_exams for select to authenticated using (user_id = auth.uid());
revoke all on public.learner_exams from anon;
revoke insert, update, delete on public.learner_exams from authenticated;

-- Items hold the private answer keys: no client access at all.
create table public.mock_exams (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  objectives    text[] not null,
  items         jsonb not null,
  time_limit_s  integer not null check (time_limit_s between 60 and 14400),
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  results       jsonb
);
create index mock_exams_user_idx on public.mock_exams(user_id, started_at desc);
alter table public.mock_exams enable row level security;
revoke all on public.mock_exams from anon, authenticated;

create table public.course_materials (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  kind        text not null,
  pages       integer not null check (pages between 1 and 2000),
  chars       integer not null,
  created_at  timestamptz not null default now()
);
create index course_materials_user_idx on public.course_materials(user_id, created_at desc);
alter table public.course_materials enable row level security;
create policy course_materials_self_read on public.course_materials for select to authenticated using (user_id = auth.uid());
revoke all on public.course_materials from anon;
revoke insert, update, delete on public.course_materials from authenticated;

create table public.material_chunks (
  id           bigserial primary key,
  material_id  uuid not null references public.course_materials(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  page         integer not null,
  content      text not null check (char_length(content) <= 4000),
  tsv          tsvector generated always as (to_tsvector('simple', content)) stored
);
create index material_chunks_tsv_idx on public.material_chunks using gin (tsv);
create index material_chunks_user_idx on public.material_chunks(user_id);
alter table public.material_chunks enable row level security;
revoke all on public.material_chunks from anon, authenticated;

-- Everything the companion needs in one round trip: profile, exams, mastery records and
-- recent verified attempts (90 days).
create or replace function public.learning_state(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'user_id' from public.learner_profiles p where user_id = p_user),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'exam_date', exam_date, 'objectives', objectives)
                       order by exam_date) from public.learner_exams where user_id = p_user and exam_date >= current_date - 1), '[]'::jsonb),
    'objectives', coalesce((select jsonb_agg(to_jsonb(o) - 'user_id') from public.learner_objectives o where user_id = p_user), '[]'::jsonb),
    'attempts', coalesce((select jsonb_agg(jsonb_build_object('objective', objective_id, 'kind', kind, 'verdict', verdict,
                          'hints', hints_used, 'at', created_at) order by created_at)
                          from public.assessment_attempts where user_id = p_user and created_at >= now() - interval '90 days'), '[]'::jsonb));
$$;

-- Validated upsert of the learner's profile (fields not given are kept; null clears).
create or replace function public.save_learning_profile(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  for k in select jsonb_object_keys(p) loop
    if k not in ('education_level', 'year_of_study', 'institution', 'programme', 'curriculum', 'subjects', 'goals', 'study_minutes') then
      raise exception using errcode = '22023', message = 'field_not_editable: ' || k;
    end if;
  end loop;
  insert into public.learner_profiles (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.learner_profiles set
    education_level = case when p ? 'education_level' then nullif(p->>'education_level', '') else education_level end,
    year_of_study = case when p ? 'year_of_study' then (p->>'year_of_study')::smallint else year_of_study end,
    institution = case when p ? 'institution' then nullif(trim(p->>'institution'), '') else institution end,
    programme = case when p ? 'programme' then nullif(trim(p->>'programme'), '') else programme end,
    curriculum = case when p ? 'curriculum' then nullif(trim(p->>'curriculum'), '') else curriculum end,
    goals = case when p ? 'goals' then nullif(trim(p->>'goals'), '') else goals end,
    subjects = case when p ? 'subjects' then coalesce((select array_agg(left(trim(s), 60)) from jsonb_array_elements_text(p->'subjects') s
                                                       where trim(s) <> ''), '{}') else subjects end,
    study_minutes = case when p ? 'study_minutes' then (select array_agg(least(greatest(coalesce(v::int, 0), 0), 600)::smallint order by i)
                                                         from jsonb_array_elements_text(p->'study_minutes') with ordinality as t(v, i))
                    else study_minutes end,
    updated_at = now()
  where user_id = p_user;
  return (select to_jsonb(lp) - 'user_id' from public.learner_profiles lp where user_id = p_user);
end $$;

-- Passages from the learner's own materials that match the question (best first).
create or replace function public.search_materials(p_user uuid, p_query text, p_limit integer default 4)
returns table (material_id uuid, title text, kind text, page integer, content text, rank real)
language sql stable security definer set search_path = public as $$
  with q as (
    -- words joined with OR, so a question matches passages that share its important words
    select to_tsquery('simple', string_agg(w, ' | ')) as tq
    from (select distinct lower(w) as w from regexp_split_to_table(p_query, '[^[:alnum:]]+') w where char_length(w) >= 3 limit 30) words
  )
  select c.material_id, m.title, m.kind, c.page, c.content, ts_rank(c.tsv, q.tq) as rank
  from public.material_chunks c join public.course_materials m on m.id = c.material_id, q
  where c.user_id = p_user and q.tq is not null and c.tsv @@ q.tq
  order by rank desc, c.page
  limit least(greatest(p_limit, 1), 8);
$$;

-- Question keys the learner has already been shown (to prefer unseen mock-exam questions).
create or replace function public.served_keys(p_user uuid) returns integer[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(seed), '{}') from public.served_items where user_id = p_user;
$$;

create or replace function public.add_exam(p_user uuid, p_title text, p_date date, p_objectives jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if (select count(*) from public.learner_exams where user_id = p_user and exam_date >= current_date) >= 20 then
    raise exception using errcode = '22023', message = 'too_many_exams';
  end if;
  insert into public.learner_exams (user_id, title, exam_date, objectives)
  values (p_user, left(trim(p_title), 120), p_date,
          array(select jsonb_array_elements_text(coalesce(p_objectives, '[]'::jsonb)))) returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_exam(p_user uuid, p_id bigint) returns boolean
language sql security definer set search_path = public as $$
  with d as (delete from public.learner_exams where id = p_id and user_id = p_user returning 1) select exists (select 1 from d);
$$;

-- The learner disagrees with what Menya recorded for a topic: start that topic afresh.
-- Past attempts stay in the history (and the export); only the estimate is cleared.
create or replace function public.reset_objective(p_user uuid, p_objective text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from public.learner_objectives where user_id = p_user and objective_id = p_objective;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_user, 'learner.reset_objective', 'objective', p_objective, '{}'::jsonb);
  return found;
end $$;

-- At most 30 practice exams a day per learner (each one stores its questions).
create or replace function public.create_mock_exam(p_user uuid, p_title text, p_objectives jsonb, p_items jsonb, p_limit integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if (select count(*) from public.mock_exams where user_id = p_user and started_at > now() - interval '1 day') >= 30 then
    raise exception using errcode = '54000', message = 'exam_daily_limit';
  end if;
  insert into public.mock_exams (user_id, title, objectives, items, time_limit_s)
  values (p_user, left(p_title, 120), array(select jsonb_array_elements_text(p_objectives)), p_items, p_limit) returning id into v_id;
  return v_id;
end $$;

create or replace function public.get_mock_exam(p_user uuid, p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(e) - 'user_id' from public.mock_exams e where id = p_id and user_id = p_user;
$$;

-- Only the first submission counts.
create or replace function public.submit_mock_exam(p_user uuid, p_id uuid, p_results jsonb) returns boolean
language sql security definer set search_path = public as $$
  with u as (update public.mock_exams set submitted_at = now(), results = p_results
             where id = p_id and user_id = p_user and submitted_at is null returning 1)
  select exists (select 1 from u);
$$;

create or replace function public.list_mock_exams(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'started_at', started_at, 'submitted_at', submitted_at,
           'score', results->'score') order by started_at desc), '[]'::jsonb)
  from (select * from public.mock_exams where user_id = p_user order by started_at desc limit 30) e;
$$;

create or replace function public.add_material(p_user uuid, p_title text, p_kind text, p_pages integer, p_chars integer,
                                               p_chunks jsonb, p_max integer) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if (select count(*) from public.course_materials where user_id = p_user) >= p_max then
    raise exception using errcode = '22023', message = 'material_limit';
  end if;
  insert into public.course_materials (user_id, title, kind, pages, chars)
  values (p_user, left(trim(p_title), 200), p_kind, p_pages, p_chars) returning id into v_id;
  insert into public.material_chunks (material_id, user_id, page, content)
  select v_id, p_user, (c->>'page')::int, c->>'content' from jsonb_array_elements(p_chunks) c;
  return v_id;
end $$;

create or replace function public.delete_material(p_user uuid, p_id uuid) returns boolean
language sql security definer set search_path = public as $$
  with d as (delete from public.course_materials where id = p_id and user_id = p_user returning 1) select exists (select 1 from d);
$$;

create or replace function public.list_materials(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'kind', kind, 'pages', pages, 'chars', chars,
           'created_at', created_at) order by created_at desc), '[]'::jsonb)
  from public.course_materials where user_id = p_user;
$$;

revoke execute on function public.learning_state(uuid), public.save_learning_profile(uuid, jsonb),
  public.search_materials(uuid, text, integer), public.served_keys(uuid), public.add_exam(uuid, text, date, jsonb),
  public.delete_exam(uuid, bigint), public.reset_objective(uuid, text), public.create_mock_exam(uuid, text, jsonb, jsonb, integer),
  public.get_mock_exam(uuid, uuid), public.submit_mock_exam(uuid, uuid, jsonb), public.list_mock_exams(uuid),
  public.add_material(uuid, text, text, integer, integer, jsonb, integer), public.delete_material(uuid, uuid),
  public.list_materials(uuid) from public, anon, authenticated;
grant execute on function public.learning_state(uuid), public.save_learning_profile(uuid, jsonb),
  public.search_materials(uuid, text, integer), public.served_keys(uuid), public.add_exam(uuid, text, date, jsonb),
  public.delete_exam(uuid, bigint), public.reset_objective(uuid, text), public.create_mock_exam(uuid, text, jsonb, jsonb, integer),
  public.get_mock_exam(uuid, uuid), public.submit_mock_exam(uuid, uuid, jsonb), public.list_mock_exams(uuid),
  public.add_material(uuid, text, text, integer, integer, jsonb, integer), public.delete_material(uuid, uuid),
  public.list_materials(uuid) to service_role;

-- Data portability now includes the companion data (material text is included: it is the learner's).
create or replace function public.export_my_data(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where id = p_user),
    'learner_profile', (select to_jsonb(lp) - 'user_id' from public.learner_profiles lp where user_id = p_user),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'date', exam_date, 'objectives', objectives))
      from public.learner_exams where user_id = p_user), '[]'::jsonb),
    'mock_exams', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'started_at', started_at, 'submitted_at', submitted_at,
        'results', results)) from public.mock_exams where user_id = p_user), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(jsonb_build_object('title', m.title, 'pages', m.pages, 'created_at', m.created_at,
        'text', (select string_agg(content, E'\n' order by page, id) from public.material_chunks c where c.material_id = m.id)))
      from public.course_materials m where m.user_id = p_user), '[]'::jsonb),
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
