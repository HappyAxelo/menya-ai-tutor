-- ============================================================
-- Pictures in tutor replies, limited per plan per day (null = no limit), and the top plan
-- renamed Unlimited at $20 / month. Its id stays 'professional': payment product keys and
-- existing records use it; learners only see the name.
-- Rollback: alter table public.plans drop column daily_image_limit; restore the name, tagline,
-- price, limits and features of 'professional' and the features of 'free' and 'pro' from
-- 20261024000000 / 20261030000012; recreate public_plans and admin_update_plan from
-- 20261030000012; drop function public.diagram_allowance; delete from public.media_usage where
-- kind = 'diagram'; restore the media_usage kind check from 20261029000011.
-- ============================================================
alter table public.plans add column daily_image_limit integer check (daily_image_limit >= 0);

update public.plans set daily_image_limit = 1, updated_at = now(),
  features = '["Step-by-step Socratic tutoring","Three progressive hints per problem","Your sessions saved to your account","One picture or diagram a day"]'
  where id = 'free';
update public.plans set daily_image_limit = 3, updated_at = now(),
  features = '["Everything in Free","Many more messages each day","Longer sessions that remember more of your work","More detailed explanations and checks","A stronger model for hard questions","Up to 3 pictures or diagrams a day"]'
  where id = 'pro';
update public.plans set daily_image_limit = 3, updated_at = now() where id = 'exam';
update public.plans set daily_image_limit = null, name = 'Unlimited', tagline = 'Unlimited pictures and practically unlimited practice',
  price_monthly_cents = 2000, daily_request_limit = 1000, monthly_request_limit = 20000, updated_at = now(),
  features = '["Everything in Pro","Unlimited pictures and diagrams","Practically unlimited messages (fair use)","Our strongest standard model for everyday tutoring","Advanced reasoning on hard problems, within a monthly allowance"]'
  where id = 'professional';

alter table public.media_usage drop constraint media_usage_kind_check;
alter table public.media_usage add constraint media_usage_kind_check check (kind in ('transcribe', 'read_image', 'diagram'));

-- Today's picture allowance. Pictures are recorded with media_allow() when one is actually shown.
create or replace function public.diagram_allowance(p_user uuid, p_plan text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'limit', (select daily_image_limit from public.plans where id = p_plan),
    'used', (select count(*) from public.media_usage
             where user_id = p_user and kind = 'diagram' and created_at >= date_trunc('day', now())));
$$;
revoke execute on function public.diagram_allowance(uuid, text) from public, anon, authenticated;
grant execute on function public.diagram_allowance(uuid, text) to service_role;

create or replace function public.public_plans() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'tagline', tagline, 'price_monthly_cents', price_monthly_cents,
    'price_yearly_cents', price_yearly_cents, 'price_semester_cents', price_semester_cents,
    'price_two_weeks_cents', price_two_weeks_cents, 'currency', currency, 'daily_request_limit', daily_request_limit,
    'monthly_request_limit', monthly_request_limit,
    'monthly_premium_limit', greatest(monthly_premium_limit - premium_safety_margin, 0),
    'max_session_turns', max_session_turns, 'daily_image_limit', daily_image_limit, 'features', features) order by rank), '[]'::jsonb)
  from public.plans where is_public;
$$;

-- Only whitelisted, validated columns can change (now including the picture limit; empty = no limit).
create or replace function public.admin_update_plan(p_actor uuid, p_plan text, p_changes jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  perform public.require_platform_admin(p_actor);
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('name', 'tagline', 'price_monthly_cents', 'price_yearly_cents', 'price_semester_cents', 'price_two_weeks_cents',
                 'is_public', 'daily_request_limit', 'monthly_request_limit', 'monthly_premium_limit', 'premium_safety_margin',
                 'requests_per_minute', 'max_session_turns', 'context_turns', 'analytics_level', 'features', 'daily_image_limit') then
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
