-- ============================================================
-- The Free plan gets 3 pictures or diagrams a day (was 1), the owner's decision so that a
-- student's first lesson doesn't use up the day's visuals. Other plans are unchanged.
--
-- Rollback: update public.plans set daily_image_limit = 1, updated_at = now(),
--   features = replace(features::text, 'Up to 3 pictures or diagrams a day', 'One picture or diagram a day')::jsonb
--   where id = 'free';
-- ============================================================
update public.plans set daily_image_limit = 3, updated_at = now(),
  features = replace(features::text, 'One picture or diagram a day', 'Up to 3 pictures or diagrams a day')::jsonb
  where id = 'free';
