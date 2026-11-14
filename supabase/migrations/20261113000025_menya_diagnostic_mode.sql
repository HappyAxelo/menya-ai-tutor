-- ============================================================
-- Menya 5: a third kind of question set, the prerequisite diagnostic.
-- A diagnostic is a short untimed set served before a topic is taught: one unseen
-- question on each prerequisite, then the topic itself. It is stored and marked like
-- a practice exam (public.mock_exams), so no new table is needed; only the list of
-- allowed modes grows.
-- Safe to run more than once. Existing rows are unaffected ('exam' and 'review' stay valid).
-- Rollback: alter table public.mock_exams drop constraint mock_exams_mode_check;
--           delete from public.mock_exams where mode = 'diagnostic';
--           alter table public.mock_exams add constraint mock_exams_mode_check check (mode in ('exam', 'review'));
-- ============================================================
alter table public.mock_exams drop constraint if exists mock_exams_mode_check;
alter table public.mock_exams add constraint mock_exams_mode_check check (mode in ('exam', 'review', 'diagnostic'));
