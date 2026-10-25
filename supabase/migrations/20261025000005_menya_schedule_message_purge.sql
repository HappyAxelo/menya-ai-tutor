-- Enforce the 180-day message retention stated in menya/public/privacy.html.
-- Rollback: select cron.unschedule('menya-purge-old-messages');
create extension if not exists pg_cron;
select cron.schedule('menya-purge-old-messages', '15 3 * * *', $$select public.purge_old_messages()$$);
