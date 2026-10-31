-- ============================================================
-- Retention round: Review Today (retry wrong questions), profile country and explanation
-- style, "delete my learning data", and retention / learning analytics for administrators.
-- Rollback: drop function public.review_retries, public.delete_my_learning_data,
-- public.admin_retention_json; drop function public.create_mock_exam(uuid, text, jsonb, jsonb, integer, text)
-- and recreate the 5-argument version from 20261031000013; restore save_learning_profile and
-- learning_state from 20261031000013; alter table public.mock_exams drop column mode;
-- alter table public.learner_profiles drop column country, drop column explanation_style.
-- ============================================================

alter table public.learner_profiles
  add column country text check (char_length(country) <= 60),
  add column explanation_style text check (explanation_style in ('steps', 'examples', 'analogies', 'visual'));

-- A review set uses the exam machinery but is untimed and counts as review / practice evidence.
alter table public.mock_exams add column mode text not null default 'exam' check (mode in ('exam', 'review'));

create or replace function public.save_learning_profile(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  for k in select jsonb_object_keys(p) loop
    if k not in ('education_level', 'year_of_study', 'institution', 'programme', 'curriculum', 'subjects', 'goals', 'study_minutes',
                 'country', 'explanation_style') then
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
    country = case when p ? 'country' then nullif(trim(p->>'country'), '') else country end,
    explanation_style = case when p ? 'explanation_style' then nullif(p->>'explanation_style', '') else explanation_style end,
    subjects = case when p ? 'subjects' then coalesce((select array_agg(left(trim(s), 60)) from jsonb_array_elements_text(p->'subjects') s
                                                       where trim(s) <> ''), '{}') else subjects end,
    study_minutes = case when p ? 'study_minutes' then (select array_agg(least(greatest(coalesce(v::int, 0), 0), 600)::smallint order by i)
                                                         from jsonb_array_elements_text(p->'study_minutes') with ordinality as t(v, i))
                    else study_minutes end,
    updated_at = now()
  where user_id = p_user;
  return (select to_jsonb(lp) - 'user_id' from public.learner_profiles lp where user_id = p_user);
end $$;

drop function public.create_mock_exam(uuid, text, jsonb, jsonb, integer);
create or replace function public.create_mock_exam(p_user uuid, p_title text, p_objectives jsonb, p_items jsonb, p_limit integer,
                                                   p_mode text default 'exam')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if (select count(*) from public.mock_exams where user_id = p_user and started_at > now() - interval '1 day') >= 30 then
    raise exception using errcode = '54000', message = 'exam_daily_limit';
  end if;
  insert into public.mock_exams (user_id, title, objectives, items, time_limit_s, mode)
  values (p_user, left(p_title, 120), array(select jsonb_array_elements_text(p_objectives)), p_items, p_limit, p_mode) returning id into v_id;
  return v_id;
end $$;

-- Bank questions the learner got wrong and hasn't since answered correctly, at least 20 hours
-- ago (bringing a question back straight away tests short-term memory, not learning).
create or replace function public.review_retries(p_user uuid, p_limit integer default 10) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('objective_id', objective_id, 'template_id', template_id, 'seed', seed,
                                               'wrong_at', created_at) order by created_at), '[]'::jsonb)
  from (select objective_id, template_id, seed, created_at
        from (select distinct on (template_id, seed) objective_id, template_id, seed, verdict, created_at
              from public.assessment_attempts
              where user_id = p_user and template_id is not null and seed is not null
              order by template_id, seed, created_at desc) latest
        where verdict = 'incorrect' and created_at < now() - interval '20 hours'
        order by created_at
        limit least(greatest(p_limit, 1), 20)) wrong;
$$;

-- Everything the companion needs, now with the number of questions waiting to be retried.
create or replace function public.learning_state(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'user_id' from public.learner_profiles p where user_id = p_user),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'exam_date', exam_date, 'objectives', objectives)
                       order by exam_date) from public.learner_exams where user_id = p_user and exam_date >= current_date - 1), '[]'::jsonb),
    'objectives', coalesce((select jsonb_agg(to_jsonb(o) - 'user_id') from public.learner_objectives o where user_id = p_user), '[]'::jsonb),
    'attempts', coalesce((select jsonb_agg(jsonb_build_object('objective', objective_id, 'kind', kind, 'verdict', verdict,
                          'hints', hints_used, 'at', created_at) order by created_at)
                          from public.assessment_attempts where user_id = p_user and created_at >= now() - interval '90 days'), '[]'::jsonb),
    'retries', jsonb_array_length(public.review_retries(p_user, 20)));
$$;

-- The learner's own "forget my learning data": profile, mastery, attempts, exams, practice exams
-- and notes. Conversations and the account itself are separate (history page / account page).
create or replace function public.delete_my_learning_data(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.learner_objectives where user_id = p_user;
  delete from public.assessment_attempts where user_id = p_user;
  delete from public.served_items where user_id = p_user;
  delete from public.learner_exams where user_id = p_user;
  delete from public.mock_exams where user_id = p_user;
  delete from public.course_materials where user_id = p_user;
  delete from public.learner_profiles where user_id = p_user;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_user, 'learner.delete_learning_data', 'user', p_user::text, '{}'::jsonb);
end $$;

-- Retention and learning analytics for administrators. Definitions (also shown on the page):
--   active day   = a successful tutor reply or a server-marked answer that day
--   activated    = active within 7 days of signing up (users who signed up >= 7 days ago)
--   D1 / D7 / D30 = active on day 1 / during days 7-13 / during days 30-59 after signing up,
--                   among users old enough to be measured
--   independent  = answers to unseen bank questions with no hints (checks, reviews, exams)
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
  cohort as (select id, created_at::date as d0 from public.profiles where created_at >= now() - interval '180 days'),
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
    'users', (select count(*) from public.profiles),
    'signups_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
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

revoke execute on function public.review_retries(uuid, integer), public.delete_my_learning_data(uuid), public.admin_retention_json(uuid),
  public.create_mock_exam(uuid, text, jsonb, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.review_retries(uuid, integer), public.delete_my_learning_data(uuid), public.admin_retention_json(uuid),
  public.create_mock_exam(uuid, text, jsonb, jsonb, integer, text) to service_role;
