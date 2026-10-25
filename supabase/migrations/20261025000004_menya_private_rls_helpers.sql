-- ============================================================
-- RLS helpers move to a schema the API does not expose, and only
-- answer about the caller (auth.uid()). Before this, a signed-in user
-- could call public.is_org_admin(any_org, any_user) over /rest/v1/rpc
-- and learn other people's roles (Supabase security advisor 0029).
-- The public.* versions stay for server-side use (service role only).
-- Rollback: recreate the old policies on public.is_org_member/is_org_admin
-- and grant execute on them to authenticated.
-- ============================================================
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_member_of(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid());
$$;

create or replace function private.is_admin_of(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid() and role = 'org_admin');
$$;

revoke execute on function private.is_member_of(uuid), private.is_admin_of(uuid) from public, anon;
grant execute on function private.is_member_of(uuid), private.is_admin_of(uuid) to authenticated, service_role;

drop policy if exists orgs_member_read on public.organizations;
drop policy if exists members_orgadmin_read on public.org_members;
drop policy if exists invitations_orgadmin_read on public.org_invitations;

create policy orgs_member_read on public.organizations for select to authenticated
  using (private.is_member_of(id));
create policy members_orgadmin_read on public.org_members for select to authenticated
  using (private.is_admin_of(org_id));
create policy invitations_orgadmin_read on public.org_invitations for select to authenticated
  using (private.is_admin_of(org_id));

revoke execute on function public.is_org_member(uuid, uuid), public.is_org_admin(uuid, uuid),
  public.is_platform_admin(uuid) from authenticated;
