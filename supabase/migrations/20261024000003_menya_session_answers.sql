-- ============================================================
-- Server-only memory of each session's verified final answer, so the
-- answer-leak guard still works on turns where the model forgets to
-- repeat it. No RLS policies and no grants: browsers can never read it.
-- Rollback: drop table public.tutoring_session_answers;
-- ============================================================
create table public.tutoring_session_answers (
  session_id    uuid primary key references public.tutoring_sessions(id) on delete cascade,
  final_answer  text not null,
  updated_at    timestamptz not null default now()
);

alter table public.tutoring_session_answers enable row level security;
revoke all on public.tutoring_session_answers from anon, authenticated;
