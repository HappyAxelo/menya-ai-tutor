-- ============================================================
-- DESTRUCTIVE: removes everything created by the 20261024* Menya
-- migrations, including all data. For fresh or test projects only.
-- In production, write a corrective migration instead and restore
-- from backup if needed.
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;

drop function if exists
  public.org_roster_json(uuid, uuid), public.export_my_data(uuid), public.admin_config(uuid),
  public.admin_list_users_json(uuid, text, int), public.admin_unit_economics_json(date), public.public_plans(),
  public.submit_quote(jsonb), public.admin_list_users(uuid, text, int), public.admin_update_model(uuid, text, jsonb),
  public.admin_update_plan(uuid, text, jsonb), public.admin_grant_subscription(uuid, uuid, text, int, text),
  public.org_roster(uuid, uuid), public.org_remove_member(uuid, uuid, uuid), public.org_set_seat(uuid, uuid, uuid, boolean),
  public.org_accept_invite(uuid, text), public.org_invite(uuid, uuid, text, public.org_role, text, timestamptz),
  public.admin_create_org(uuid, text, text, text, int, int, text), public.require_platform_admin(uuid),
  public.require_org_admin(uuid, uuid), public.is_org_admin(uuid, uuid), public.is_org_member(uuid, uuid),
  public.purge_old_messages(), public.admin_usage_alerts(), public.admin_unit_economics(date),
  public.org_dashboard(uuid, uuid, date), public.my_account(), public.process_payment_event(text, jsonb, jsonb),
  public.record_usage(jsonb), public.downgrade_reservation(uuid, uuid), public.release_quota(uuid, uuid),
  public.consume_quota(uuid, uuid, boolean), public.resolve_entitlement(uuid),
  public.is_platform_admin(uuid), public.handle_new_user() cascade;

drop table if exists
  public.tutoring_session_answers, public.quote_requests, public.audit_logs, public.tutoring_messages, public.tutoring_sessions,
  public.usage_records, public.request_reservations, public.rate_buckets, public.usage_counters,
  public.payment_events, public.subscriptions, public.org_invitations, public.org_members,
  public.organizations, public.profiles, public.model_configs, public.plans, public.app_settings cascade;

drop function if exists public.subscription_is_live(public.subscriptions), public.setting_num(text, numeric) cascade;

drop schema if exists private cascade;

drop type if exists public.org_role, public.platform_role, public.billing_interval, public.subscription_status;
