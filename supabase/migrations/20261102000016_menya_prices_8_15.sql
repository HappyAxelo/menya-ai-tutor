-- ============================================================
-- Owner's prices (2 November 2026): Pro $8 a month, sold by the month only; Unlimited $15 a month.
-- Exam Pass stays $8 for 2 weeks. Semester and yearly billing stay available in the code: set a
-- price in Admin to offer them again.
-- Rollback: update public.plans set price_monthly_cents = 1000, price_semester_cents = 3500,
-- price_yearly_cents = 9000 where id = 'pro'; update public.plans set price_monthly_cents = 2000
-- where id = 'professional';
-- ============================================================
update public.plans set price_monthly_cents = 800, price_semester_cents = null, price_yearly_cents = null, updated_at = now()
  where id = 'pro';
update public.plans set price_monthly_cents = 1500, updated_at = now() where id = 'professional';
