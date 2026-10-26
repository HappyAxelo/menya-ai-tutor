-- ============================================================
-- More capacity on free provider tiers. Groq's free limits are per model
-- (8K tokens/min, 200K tokens/day each), so when the main model is busy the
-- request moves to a different model with its own allowance:
--   medium (gpt-oss-120b) -> alt (qwen3.8-27b) -> small (gpt-oss-20b)
-- All three support strict JSON-schema output, which the tutor needs.
-- Prices are Groq's published rates (26 Oct 2026); with no payment method on
-- the Groq account nothing is charged.
-- Also records cached prompt tokens (they don't count toward Groq's limits).
-- Rollback: update public.model_configs set fallback_role = null where role = 'medium';
--           delete from public.model_configs where role = 'alt';
--           alter table public.usage_records drop column cached_input_tokens;
-- ============================================================
insert into public.model_configs (role, provider, model, enabled, is_premium, input_usd_per_mtok, output_usd_per_mtok,
                                  timeout_ms, max_output_tokens, options, fallback_role)
values ('alt', 'groq', 'qwen/qwen3.8-27b', true, false, 0.80, 4.00, 45000, 2000, '{"reasoning_effort":"medium"}', 'small')
on conflict (role) do nothing;

update public.model_configs set fallback_role = 'alt', updated_at = now() where role = 'medium' and fallback_role is null;

alter table public.usage_records add column if not exists cached_input_tokens integer;

create or replace function public.record_usage(p jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usage_records
    (request_id, user_id, org_id, plan_id, provider, model, model_role, premium, input_tokens, output_tokens,
     est_cost_usd, latency_ms, ttft_ms, status, fallback_used, answer_rewrite, error_code, cached_input_tokens)
  values
    ((p->>'request_id')::uuid, (p->>'user_id')::uuid, nullif(p->>'org_id', '')::uuid, p->>'plan_id',
     p->>'provider', p->>'model', p->>'model_role', coalesce((p->>'premium')::boolean, false),
     (p->>'input_tokens')::int, (p->>'output_tokens')::int, (p->>'est_cost_usd')::numeric,
     (p->>'latency_ms')::int, (p->>'ttft_ms')::int, p->>'status',
     coalesce((p->>'fallback_used')::boolean, false), coalesce((p->>'answer_rewrite')::boolean, false), p->>'error_code',
     (p->>'cached_input_tokens')::int);

  if p->>'status' = 'success' then
    update public.request_reservations set state = 'completed'
    where user_id = (p->>'user_id')::uuid and request_id = (p->>'request_id')::uuid and state = 'reserved';
  end if;
end $$;
revoke execute on function public.record_usage(jsonb) from public, anon, authenticated;
grant execute on function public.record_usage(jsonb) to service_role;
