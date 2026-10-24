-- ============================================================
-- Menya: institution and platform-admin operations.
-- Every function checks the actor's role itself and writes an
-- audit log entry. Service role only (called by Edge Functions
-- after authenticating the actor).
-- Rollback: see supabase/rollback/.
-- ============================================================

create or replace function public.require_org_admin(p_actor uuid, p_org uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_platform_admin(p_actor) or public.is_org_admin(p_org, p_actor)) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
end $$;

create or replace function public.require_platform_admin(p_actor uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin(p_actor) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
end $$;

-- ------------------------------------------------------------
-- Institutions
-- ------------------------------------------------------------
create or replace function public.admin_create_org(p_actor uuid, p_name text, p_slug text, p_plan text,
  p_seats int, p_pool int, p_admin_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  perform public.require_platform_admin(p_actor);
  insert into public.organizations (name, slug, plan_id, purchased_seats, monthly_request_limit)
  values (p_name, p_slug, p_plan, p_seats, p_pool) returning id into v_org;
  insert into public.audit_logs (actor_id, action, target_type, target_id, org_id, details)
  values (p_actor, 'org.create', 'organization', v_org::text, v_org,
          jsonb_build_object('plan', p_plan, 'seats', p_seats, 'pool', p_pool, 'admin_email', p_admin_email));
  return v_org;
end $$;

-- Stores only the hash of the invite token; the caller emails the token.
create or replace function public.org_invite(p_actor uuid, p_org uuid, p_email text, p_role public.org_role,
  p_token_hash text, p_expires_at timestamptz)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.require_org_admin(p_actor, p_org);
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception using errcode = '22023', message = 'invalid_email'; end if;
  if p_role = 'org_admin' and not public.is_platform_admin(p_actor) and not public.is_org_admin(p_org, p_actor) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  insert into public.org_invitations (org_id, email, role, token_hash, expires_at, created_by)
  values (p_org, lower(p_email), p_role, p_token_hash, p_expires_at, p_actor)
  on conflict (org_id, email) do update
    set role = excluded.role, token_hash = excluded.token_hash, expires_at = excluded.expires_at,
        accepted_at = null, created_by = excluded.created_by
  returning id into v_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, org_id, details)
  values (p_actor, 'org.invite', 'invitation', v_id::text, p_org, jsonb_build_object('email', lower(p_email), 'role', p_role));
  return v_id;
end $$;

-- The invitation must be for the signed-in user's own email address.
-- A seat is assigned automatically while purchased seats remain.
create or replace function public.org_accept_invite(p_user uuid, p_token_hash text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inv public.org_invitations;
  v_email text;
  v_assigned int;
  v_seats int;
  v_seat boolean;
begin
  select * into inv from public.org_invitations where token_hash = p_token_hash for update;
  if not found or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception using errcode = '22023', message = 'invalid_or_expired_invitation';
  end if;
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is distinct from inv.email then
    raise exception using errcode = '42501', message = 'invitation_for_another_email';
  end if;

  select purchased_seats into v_seats from public.organizations where id = inv.org_id for update;
  select count(*) into v_assigned from public.org_members where org_id = inv.org_id and seat_assigned;
  v_seat := v_assigned < v_seats;

  insert into public.org_members (org_id, user_id, role, seat_assigned)
  values (inv.org_id, p_user, inv.role, v_seat)
  on conflict (org_id, user_id) do update set role = excluded.role;
  update public.org_invitations set accepted_at = now() where id = inv.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, org_id, details)
  values (p_user, 'org.join', 'member', p_user::text, inv.org_id, jsonb_build_object('seat_assigned', v_seat));
  return jsonb_build_object('org_id', inv.org_id, 'seat_assigned', v_seat);
end $$;

create or replace function public.org_set_seat(p_actor uuid, p_org uuid, p_user uuid, p_assigned boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_assigned int; v_seats int;
begin
  perform public.require_org_admin(p_actor, p_org);
  if p_assigned then
    select purchased_seats into v_seats from public.organizations where id = p_org for update;
    select count(*) into v_assigned from public.org_members where org_id = p_org and seat_assigned and user_id <> p_user;
    if v_assigned >= v_seats then raise exception using errcode = '22023', message = 'no_seats_available'; end if;
  end if;
  update public.org_members set seat_assigned = p_assigned where org_id = p_org and user_id = p_user;
  if not found then raise exception using errcode = '22023', message = 'not_a_member'; end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, org_id, details)
  values (p_actor, case when p_assigned then 'org.seat_assign' else 'org.seat_unassign' end, 'member', p_user::text, p_org, '{}');
end $$;

create or replace function public.org_remove_member(p_actor uuid, p_org uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_org_admin(p_actor, p_org);
  delete from public.org_members where org_id = p_org and user_id = p_user;
  insert into public.audit_logs (actor_id, action, target_type, target_id, org_id, details)
  values (p_actor, 'org.remove_member', 'member', p_user::text, p_org, '{}');
end $$;

-- Roster for an org admin: who has a seat and how active they are. No content.
create or replace function public.org_roster(p_actor uuid, p_org uuid)
returns table (user_id uuid, email text, role public.org_role, seat_assigned boolean, joined_at timestamptz,
               requests_this_month bigint, last_active timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_org_admin(p_actor, p_org);
  return query
    select m.user_id, p.email, m.role, m.seat_assigned, m.joined_at,
           (select count(*) from public.usage_records u where u.user_id = m.user_id and u.org_id = p_org
              and u.status = 'success' and u.created_at >= date_trunc('month', now())),
           (select max(created_at) from public.usage_records u where u.user_id = m.user_id and u.org_id = p_org)
    from public.org_members m left join public.profiles p on p.id = m.user_id
    where m.org_id = p_org
    order by m.joined_at;
end $$;

-- ------------------------------------------------------------
-- Platform admin
-- ------------------------------------------------------------
-- Admin-granted access (e.g. pilots, support). Excluded from revenue reports.
create or replace function public.admin_grant_subscription(p_actor uuid, p_user uuid, p_plan text, p_days int, p_note text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.require_platform_admin(p_actor);
  if p_days not between 1 and 366 then raise exception using errcode = '22023', message = 'invalid_days'; end if;
  insert into public.subscriptions (user_id, plan_id, status, provider, provider_subscription_id, current_period_start, current_period_end)
  values (p_user, p_plan, 'active', 'manual', 'manual_' || gen_random_uuid(), now(), now() + make_interval(days => p_days))
  returning id into v_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_actor, 'admin.grant_subscription', 'user', p_user::text,
          jsonb_build_object('plan', p_plan, 'days', p_days, 'note', p_note, 'subscription_id', v_id));
  return v_id;
end $$;

-- Only whitelisted, validated columns can change.
create or replace function public.admin_update_plan(p_actor uuid, p_plan text, p_changes jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  perform public.require_platform_admin(p_actor);
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('name', 'tagline', 'price_monthly_cents', 'price_yearly_cents', 'is_public', 'daily_request_limit',
                 'monthly_request_limit', 'monthly_premium_limit', 'premium_safety_margin', 'requests_per_minute',
                 'max_session_turns', 'context_turns', 'analytics_level', 'features') then
      raise exception using errcode = '22023', message = 'field_not_editable: ' || k;
    end if;
  end loop;
  update public.plans set
    name = coalesce(p_changes->>'name', name),
    tagline = coalesce(p_changes->>'tagline', tagline),
    price_monthly_cents = case when p_changes ? 'price_monthly_cents' then (p_changes->>'price_monthly_cents')::int else price_monthly_cents end,
    price_yearly_cents = case when p_changes ? 'price_yearly_cents' then (p_changes->>'price_yearly_cents')::int else price_yearly_cents end,
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

create or replace function public.admin_update_model(p_actor uuid, p_role text, p_changes jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  perform public.require_platform_admin(p_actor);
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('provider', 'model', 'enabled', 'input_usd_per_mtok', 'output_usd_per_mtok', 'timeout_ms',
                 'max_output_tokens', 'options', 'fallback_role') then
      raise exception using errcode = '22023', message = 'field_not_editable: ' || k;
    end if;
  end loop;
  update public.model_configs set
    provider = coalesce(p_changes->>'provider', provider),
    model = coalesce(p_changes->>'model', model),
    enabled = coalesce((p_changes->>'enabled')::boolean, enabled),
    input_usd_per_mtok = coalesce((p_changes->>'input_usd_per_mtok')::numeric, input_usd_per_mtok),
    output_usd_per_mtok = coalesce((p_changes->>'output_usd_per_mtok')::numeric, output_usd_per_mtok),
    timeout_ms = coalesce((p_changes->>'timeout_ms')::int, timeout_ms),
    max_output_tokens = coalesce((p_changes->>'max_output_tokens')::int, max_output_tokens),
    options = coalesce(p_changes->'options', options),
    fallback_role = case when p_changes ? 'fallback_role' then p_changes->>'fallback_role' else fallback_role end,
    updated_at = now()
  where role = p_role;
  if not found then raise exception using errcode = '22023', message = 'unknown_model_role'; end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_actor, 'admin.update_model', 'model_config', p_role, p_changes);
end $$;

create or replace function public.admin_list_users(p_actor uuid, p_search text, p_limit int)
returns table (user_id uuid, email text, platform_role public.platform_role, created_at timestamptz, plan_id text,
               plan_source text, requests_this_month bigint, cost_this_month numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_platform_admin(p_actor);
  return query
    select p.id, p.email, p.platform_role, p.created_at, e.plan_id, e.source,
           (select count(*) from public.usage_records u where u.user_id = p.id and u.status = 'success'
              and u.created_at >= date_trunc('month', now())),
           (select coalesce(sum(est_cost_usd), 0) from public.usage_records u where u.user_id = p.id
              and u.created_at >= date_trunc('month', now()))
    from public.profiles p
    cross join lateral public.resolve_entitlement(p.id) e
    where p_search is null or p.email ilike '%' || p_search || '%'
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200);
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.my_account() to authenticated;
grant execute on function public.is_org_member(uuid, uuid), public.is_org_admin(uuid, uuid),
  public.is_platform_admin(uuid) to authenticated;
grant execute on all functions in schema public to service_role;

-- Public quotation request with a simple per-email throttle.
create or replace function public.submit_quote(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if (select count(*) from public.quote_requests
      where lower(contact_email) = lower(p->>'contact_email') and created_at > now() - interval '24 hours') >= 3 then
    raise exception using errcode = '54000', message = 'too_many_requests';
  end if;
  insert into public.quote_requests (institution, contact_name, contact_email, country, learners, message)
  values (p->>'institution', p->>'contact_name', lower(p->>'contact_email'), p->>'country',
          nullif(p->>'learners', '')::int, p->>'message')
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.submit_quote(jsonb) from public, anon, authenticated;
grant execute on function public.submit_quote(jsonb) to service_role;

-- ------------------------------------------------------------
-- JSON views used by the API
-- ------------------------------------------------------------
create or replace function public.public_plans() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'tagline', tagline, 'price_monthly_cents', price_monthly_cents,
    'price_yearly_cents', price_yearly_cents, 'currency', currency, 'daily_request_limit', daily_request_limit,
    'monthly_request_limit', monthly_request_limit,
    'monthly_premium_limit', greatest(monthly_premium_limit - premium_safety_margin, 0),
    'max_session_turns', max_session_turns, 'features', features) order by rank), '[]'::jsonb)
  from public.plans where is_public;
$$;

create or replace function public.admin_unit_economics_json(p_month date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.admin_unit_economics(p_month) e;
$$;

create or replace function public.admin_list_users_json(p_actor uuid, p_search text, p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) from public.admin_list_users(p_actor, p_search, p_limit) u;
$$;

create or replace function public.admin_config(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_platform_admin(p_actor);
  return jsonb_build_object(
    'plans', (select jsonb_agg(to_jsonb(p) order by rank) from public.plans p),
    'models', (select jsonb_agg(to_jsonb(m) order by role) from public.model_configs m),
    'settings', (select jsonb_object_agg(key, value) from public.app_settings),
    'organizations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'plan', plan_id, 'status', status,
        'seats', purchased_seats) order by created_at) from public.organizations), '[]'::jsonb),
    'recent_quotes', coalesce((select jsonb_agg(to_jsonb(q) order by created_at desc)
        from (select * from public.quote_requests order by created_at desc limit 20) q), '[]'::jsonb),
    'recent_audit', coalesce((select jsonb_agg(to_jsonb(a) order by id desc)
        from (select * from public.audit_logs order by id desc limit 30) a), '[]'::jsonb),
    'webhooks', jsonb_build_object(
        'last_24h', (select count(*) from public.payment_events where received_at > now() - interval '24 hours'),
        'failed_7d', (select count(*) from public.payment_events where status = 'failed' and received_at > now() - interval '7 days')));
end $$;

-- Data portability: everything stored about the caller.
create or replace function public.export_my_data(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where id = p_user),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('plan', plan_id, 'status', status, 'interval', billing_interval,
        'period_end', current_period_end, 'provider', provider)) from public.subscriptions where user_id = p_user), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'created_at', s.created_at,
        'messages', (select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'content', m.content, 'at', m.created_at) order by m.id), '[]'::jsonb)
                     from public.tutoring_messages m where m.session_id = s.id)))
      from public.tutoring_sessions s where s.user_id = p_user), '[]'::jsonb),
    'usage', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'premium', premium, 'status', status))
      from public.usage_records where user_id = p_user), '[]'::jsonb));
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.my_account() to authenticated;
grant execute on function public.is_org_member(uuid, uuid), public.is_org_admin(uuid, uuid),
  public.is_platform_admin(uuid) to authenticated;
grant execute on all functions in schema public to service_role;

-- JSON form of the roster (same shape from supabase-js and from tests).
create or replace function public.org_roster_json(p_actor uuid, p_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.org_roster(p_actor, p_org) r;
$$;
revoke execute on function public.org_roster_json(uuid, uuid) from public, anon, authenticated;
grant execute on function public.org_roster_json(uuid, uuid) to service_role;
