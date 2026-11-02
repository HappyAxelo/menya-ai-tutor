-- ============================================================
-- Plans promise only what students get today. All plans run on the same AI model and no premium
-- model is connected, so "a stronger model" and "advanced reasoning" are removed, and the allowance
-- behind the latter is set to 0 (which also hides its pricing line and account meter, and means a
-- premium model can't start costing money by accident).
-- When a stronger model really is connected: set monthly_premium_limit in Admin and restore the
-- features below.
-- Rollback: update public.plans set monthly_premium_limit = 200, premium_safety_margin = 10,
-- features = (the list in 20261102000015) where id = 'professional'; features of 'pro' likewise.
-- ============================================================
update public.plans set updated_at = now(),
  features = '["Everything in Free","Many more messages each day","Longer sessions that remember more of your work","More detailed explanations and checks","Up to 3 pictures or diagrams a day"]'
  where id = 'pro';
update public.plans set monthly_premium_limit = 0, premium_safety_margin = 0, updated_at = now(),
  features = '["Everything in Pro","Unlimited pictures and diagrams","Practically unlimited messages (fair use)","The longest conversations, with the most remembered"]'
  where id = 'professional';
