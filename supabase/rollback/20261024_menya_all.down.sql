-- ============================================================
-- DESTRUCTIVE: removes everything created by the 20261024* Menya
-- migrations, including all data. For fresh or test projects only.
-- In production, write a corrective migration instead and restore
-- from backup if needed.
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;

drop function if exists
  public.learning_state(uuid), public.save_learning_profile(uuid, jsonb), public.search_materials(uuid, text, integer),
  public.served_keys(uuid), public.add_exam(uuid, text, date, jsonb), public.delete_exam(uuid, bigint),
  public.reset_objective(uuid, text), public.create_mock_exam(uuid, text, jsonb, jsonb, integer), public.get_mock_exam(uuid, uuid),
  public.submit_mock_exam(uuid, uuid, jsonb), public.list_mock_exams(uuid),
  public.add_material(uuid, text, text, integer, integer, jsonb, integer), public.delete_material(uuid, uuid), public.list_materials(uuid),
  public.submit_feedback(uuid, bigint, text), public.admin_overview_json(uuid), public.admin_feedback_export(uuid),
  public.admin_users_export(uuid), public.media_allow(uuid, text, int), public.hpc_register(text, text, text), public.hpc_unregister(),
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
  public.material_chunks, public.course_materials, public.mock_exams, public.learner_exams, public.learner_profiles,
  public.media_usage, public.learner_objectives, public.assessment_attempts, public.served_items, public.session_items, public.tutor_feedback, public.learning_events, public.tutoring_session_answers, public.quote_requests, public.audit_logs, public.tutoring_messages, public.tutoring_sessions,
  public.usage_records, public.request_reservations, public.rate_buckets, public.usage_counters,
  public.payment_events, public.subscriptions, public.org_invitations, public.org_members,
  public.organizations, public.profiles, public.model_configs, public.plans, public.app_settings cascade;

drop function if exists public.subscription_is_live(public.subscriptions), public.setting_num(text, numeric) cascade;

drop schema if exists private cascade;

drop type if exists public.org_role, public.platform_role, public.billing_interval, public.subscription_status;
