-- ============================================================
-- Self-hosted model on a university Slurm cluster. Each job gets a new
-- public address (a tunnel), so the job registers it here and repeats the
-- call as a heartbeat. The API reads it per request and treats it as gone
-- after 10 minutes without a heartbeat; free-plan requests then fall back
-- to Groq through the usual route ('local_small' -> 'medium').
-- Rollback: drop function public.hpc_register(text, text, text), public.hpc_unregister();
-- delete from public.app_settings where key = 'hpc_llm';
-- update public.model_configs set enabled = false where role = 'local_small';
-- ============================================================
create or replace function public.hpc_register(p_url text, p_model text, p_job text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_settings (key, value, description)
  values ('hpc_llm', jsonb_build_object('url', p_url, 'model', p_model, 'job', p_job, 'at', now()),
          'Model server on the HPC cluster, registered by the Slurm job (heartbeat)')
  on conflict (key) do update set value = excluded.value, updated_at = now();
  -- First registration of a job (or a model change) enables the route and records it.
  if not exists (select 1 from public.model_configs where role = 'local_small' and enabled and model = p_model) then
    update public.model_configs
      set model = p_model, enabled = true, timeout_ms = least(timeout_ms, 25000), updated_at = now()
      where role = 'local_small';
    insert into public.audit_logs (action, target_type, target_id, details)
    values ('hpc.register', 'model_config', 'local_small', jsonb_build_object('model', p_model, 'job', p_job));
  end if;
end $$;

create or replace function public.hpc_unregister() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.app_settings where key = 'hpc_llm';
  update public.model_configs set enabled = false, updated_at = now() where role = 'local_small' and enabled;
  insert into public.audit_logs (action, target_type, target_id, details)
  values ('hpc.unregister', 'model_config', 'local_small', '{}'::jsonb);
end $$;

revoke execute on function public.hpc_register(text, text, text), public.hpc_unregister() from public, anon, authenticated;
grant execute on function public.hpc_register(text, text, text), public.hpc_unregister() to service_role;
