# Sign-in and guest access

## Sign-in methods

| Method | State | Notes |
|---|---|---|
| Google | Working in production (20 accounts) | Supabase Auth, enabled. Secrets live in Supabase, not the site |
| Email link | Working in production (2 accounts) | One-time link. No passwords exist, so there is no password recovery |
| Guest | Added here | Supabase anonymous sign-in. **Off until the owner turns it on** |

Other providers are not configured and aren't shown. Sessions are Supabase JWTs, refreshed by supabase-js.

## How a guest session works

"Try Menya without an account" calls Supabase's anonymous sign-in. Supabase issues a real signed session for a new
anonymous user, so the id never comes from the browser. The same tutor, row-level security and limits apply.

- **Limits:** the `guest` row in the plans table (5 messages, 1 picture, 10 exchanges, no notes or practice exams). Change
  them in Admin → Plan limits. The server enforces them; "You have N free questions remaining" reads the same numbers.
- **Allowed routes:** a short list in `api.ts` (tutor, feedback, sign-up ticket, delete session). Everything else returns
  `account_required`. Voice, photos and attachments need an account.
- **Abuse:** per-minute limit; a cap on all guests together (`guest_total_daily_messages`, 500 a day); Supabase's limit on
  anonymous sign-ins per IP address (30 an hour by default).
- **Expiry:** sessions unused for 30 days are deleted (`guest_session_days`, daily job). A session lasts while the browser
  keeps it: clearing browser data or changing device starts again, and the app doesn't promise otherwise.
- **Records:** `guest_sessions` keeps one row per session with no personal information, so numbers stay true after deletion.

## Becoming an account

1. The guest chooses Google or email. Before leaving, the server issues a one-time ticket: random, stored only as a hash,
   tied to that guest, valid 24 hours. The browser keeps it (the email link carries it too, in case it opens elsewhere).
2. After sign-in, the app sends the ticket to `/guest/claim`.
3. `claim_guest` runs as one transaction: it moves conversations, messages, answers, feedback and progress to the account,
   marks the ticket used, records the conversion and deletes the guest.

**Rules:** a ticket works once, and a guest can't claim. If the account already has conversations, the student is asked first.
An account's own data is never overwritten: where both have a topic level or a profile, the account's stays. Plans, payments
and usage counters don't transfer. Duplicate learning records can't arise, because rows move rather than copy.

## Setup needed from the owner

1. **Turn on anonymous sign-in:** Supabase dashboard → Authentication → Sign In / Providers → **Allow anonymous sign-ins** → Save.
   Until then the guest button stays hidden, and Google and email work as before.
2. **Check URLs:** Authentication → URL Configuration: Site URL `https://menyaneza.com`; Redirect URLs `https://menyaneza.com/**`
   and `https://www.menyaneza.com/**`. The `?claim=` link depends on the wildcard.
3. **Recommended before promoting widely:** Authentication → Attack Protection → CAPTCHA (Cloudflare Turnstile is free). It needs a
   small code change: tell the developer once you have the site key. Without it, automated guest sign-ins are limited only by the caps above.

## Deploying

1. Apply `supabase/migrations/20261103000019_menya_guest_access.sql`. It adds to the database and changes nothing for accounts.
2. Deploy the `api` function pinned to the commit. No new secrets.
3. Publish the site (`cd menya && npm run deploy`).
4. Turn on anonymous sign-ins (above), then try it in a private browser window.

**Rollback:** turn the switch off first; steps are in the migration's header. Existing accounts aren't affected.

## Measured

Admin → **Sign-ups and guests**, from real records, with 7, 30 and 90-day views. A guest session is one browser, not one person,
and the page says so. "Started signing up, didn't finish" only covers guests, because a visitor who leaves Google's page
without a guest session leaves no record.

## Not verified or not done

- Real Google sign-in and the real email link, with guest conversion, can't be tested without a real account: try them after deploying.
- Real iPhone and Android browsers, and slow connections: checked at phone width in a desktop browser only.
- Cancelling at Google shows a message, but only the code path is written; not tried against Google.
- Guest counts include real AI use, which draws on the same free-tier capacity as everyone else.
