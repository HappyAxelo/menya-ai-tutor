-- ============================================================
-- Teaching events: what happened in a lesson (a concept taught, a visual shown, a hint asked for),
-- so the tutor can adapt and Menya can be evaluated. Only the kind of event is stored, never what
-- anyone wrote. Separate from learning_events, which holds verified solves only and is counted as such.
--
-- Plans, limits and payments are not touched.
--
-- Rollback: restore claim_guest from 20261103000019, delete_my_learning_data from 20261031000014 and
-- export_my_data from 20261031000013; then drop table public.teaching_events.
-- ============================================================
create table public.teaching_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.tutoring_sessions(id) on delete set null,
  objective_id text,
  kind text not null check (kind in ('concept_introduced', 'visual_shown', 'example_shown', 'hint_requested', 'response_submitted',
                                     'misconception_detected', 'explained_again', 'independent_answered', 'mastery_assessed')),
  visual_kind text,
  language text,
  level text,
  created_at timestamptz not null default now()
);
create index teaching_events_user_idx on public.teaching_events(user_id, created_at desc);
create index teaching_events_kind_idx on public.teaching_events(kind, created_at desc);

alter table public.teaching_events enable row level security;
create policy teaching_events_self_read on public.teaching_events for select to authenticated using (user_id = auth.uid());
revoke all on public.teaching_events from anon, authenticated;
grant select on public.teaching_events to authenticated;

-- A guest's teaching history moves with the rest of their learning when they create an account.
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
  update public.teaching_events set user_id = p_user where user_id = c.guest_id;
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

-- "Forget my learning data" includes these events.
create or replace function public.delete_my_learning_data(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.learner_objectives where user_id = p_user;
  delete from public.assessment_attempts where user_id = p_user;
  delete from public.teaching_events where user_id = p_user;
  delete from public.served_items where user_id = p_user;
  delete from public.learner_exams where user_id = p_user;
  delete from public.mock_exams where user_id = p_user;
  delete from public.course_materials where user_id = p_user;
  delete from public.learner_profiles where user_id = p_user;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_user, 'learner.delete_learning_data', 'user', p_user::text, '{}'::jsonb);
end $$;

-- A learner's data export includes them too.
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
    'teaching_events', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'objective', objective_id, 'visual', visual_kind, 'language', language, 'level', level, 'at', created_at) order by id)
      from public.teaching_events where user_id = p_user), '[]'::jsonb),
    'learning_profile', coalesce((select jsonb_agg(to_jsonb(o) - 'user_id') from public.learner_objectives o where user_id = p_user), '[]'::jsonb),
    'assessment_attempts', coalesce((select jsonb_agg(jsonb_build_object('objective', objective_id, 'kind', kind, 'verdict', verdict,
        'misconception', misconception, 'hints_used', hints_used, 'at', created_at) order by id) from public.assessment_attempts where user_id = p_user), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg(jsonb_build_object('rating', rating, 'reply', reply_excerpt, 'at', created_at) order by id)
      from public.tutor_feedback where user_id = p_user), '[]'::jsonb),
    'usage', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'premium', premium, 'status', status))
      from public.usage_records where user_id = p_user), '[]'::jsonb));
$$;
