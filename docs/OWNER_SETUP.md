# Owner setup: one-time settings (about 10 minutes)

Students never configure anything. These settings are entered **once, by the owner**, in
dashboards only the owner can access. Everything else (database, backend function, web app)
is already deployed or deploys automatically.

Supabase project: **menya-ai-tutor** (`tgrihnmngbamxxjnedlc`) —
https://supabase.com/dashboard/project/tgrihnmngbamxxjnedlc

## 1. AI provider key (server-side secret)

1. Get a key at https://console.groq.com/keys (the model all plans use today).
2. Supabase dashboard → **Edge Functions** → **Secrets** (or *Project Settings → Edge Functions*)
   → **Add new secret**:
   - Name: `GROQ_API_KEY` — Value: your Groq key.
   - Optional, for Professional's advanced reasoning: `ANTHROPIC_API_KEY` — your Anthropic key.
3. Save. The `api` function picks it up on its next start (within a minute or two).

The key lives only in Supabase's server-side secrets. It is never in the web app, GitHub,
browser storage or any API response. Check it worked:
https://tgrihnmngbamxxjnedlc.supabase.co/functions/v1/api/health should show `"tutorReady":true`.

## 2. Where sign-in may return to

Supabase dashboard → **Authentication** → **URL Configuration**:
- **Site URL**: `https://happyaxelo.github.io/menya-ai-tutor/`
- **Redirect URLs** → Add: `https://happyaxelo.github.io/menya-ai-tutor/`

## 3. Google sign-in

1. Google Cloud Console → https://console.cloud.google.com/apis/credentials
   → **Create credentials** → **OAuth client ID** (configure the consent screen first if asked:
   app name "Menya AI Tutor", External, your support email).
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://happyaxelo.github.io`
   - Authorized redirect URIs: `https://tgrihnmngbamxxjnedlc.supabase.co/auth/v1/callback`
2. Copy the **Client ID** and **Client secret**.
3. Supabase dashboard → **Authentication** → **Providers** → **Google** → enable, paste both, save.
4. In Google's consent screen, set **Publishing status** to *In production* so any student can
   sign in (while *Testing*, only listed test users can).

The sign-in screen shows "Continue with Google" automatically as soon as Google is enabled.

## After that

- Tell Claude (or run the deploy yourself): the public site switches from the old
  bring-your-own-key version to the signed-in version with `cd menya && npm run deploy`.
- Make yourself platform admin after your first sign-in (SQL editor):
  `update public.profiles set platform_role = 'admin' where email = 'YOUR_EMAIL';`
- Email sign-in links for students: see section 5 (Resend).

## Running at zero cost (early adopters)

Menya runs entirely on free tiers today, and nothing in it can create a bill as long as:

- **Groq** has no payment method on the account. Free limits apply *per model* (8,000 tokens/min,
  200,000 tokens/day each). Menya uses three models in a chain — `gpt-oss-120b`, then
  `gpt-oss-20b`, then `qwen3.8-27b` — so when one is busy the next answers. Groq doesn't count
  cached prompt tokens toward these limits, and Menya's instructions are cached automatically.
  When all three are busy, students see "Menya is very busy right now. Please try again in about
  N seconds. Your message was not counted." That is the only effect: no charge.
- **Supabase** stays on the Free plan. Free projects pause after a week without activity; the
  *Keep backend awake* GitHub Action calls the API every 3 days to prevent that. (GitHub turns
  scheduled actions off after 60 days without commits — push anything, or run it from the
  Actions tab, to turn it back on.)
- **No Anthropic key** is set. The Professional plan's "advanced reasoning" role is skipped
  without one.
- **GitHub Pages** and **GitHub Actions** are free for public repositories.

Rough free capacity: ~600,000 tokens/day across the three models ≈ 250–500 tutor replies/day
(more with caching), ≈ 10–25 replies/minute at peak. Enough for a few dozen active early
adopters; each Free account is capped at 20 messages/day. Usage per model is in `usage_records`
(Admin page), including `cached_input_tokens`.

Things that *would* cost money, for later: a Groq paid tier (section 4), Supabase Pro ($25/month),
a domain for email sign-in (section 5), an Anthropic key.

## 4. Enough AI capacity for real students (Groq)

Groq's free tier allows about 200,000 tokens a day for `openai/gpt-oss-120b`. One tutor reply
uses roughly 2,000–3,000 tokens, so the free tier covers only **about 70–100 replies a day for
all students together**. When it runs out, students see "The tutor is temporarily unavailable"
until Groq's daily window resets.

1. https://console.groq.com → **Settings** → **Billing** → upgrade to the pay-as-you-go
   (Developer) tier and add a card.
2. Optional: set a monthly spending limit there.
3. Nothing changes in Menya: the same `GROQ_API_KEY` keeps working with higher limits.

Cost at current prices ($0.15 per million input tokens, $0.60 per million output tokens): about
**$0.0005 per reply**, i.e. roughly $0.50 per 1,000 replies. Actual cost per request is recorded
in `usage_records` and shown on the Admin page.

## 5. Email sign-in links for students (Resend)

Google sign-in already works for everyone. Email links need your own email service, because
Supabase's built-in mailer only delivers to members of your Supabase team.

Resend needs a **domain you own** (for example `menya.rw` or any domain you buy): it will only
send to other people from a verified domain. A `github.io` address can't be verified.

1. Create an account at https://resend.com (free: 3,000 emails a month, 100 a day).
2. **Domains** → **Add domain** → enter your domain → add the DNS records Resend shows (SPF,
   DKIM) at your domain registrar → wait until the domain shows **Verified**.
3. **API Keys** → **Create API key** (permission: *Sending access*). Copy it — this is the SMTP
   password. Keep it private; never put it in the web app or GitHub.
4. Supabase dashboard → **Authentication** → **Emails** → **SMTP Settings** → enable custom SMTP:
   - Sender email: `no-reply@YOUR-DOMAIN` · Sender name: `Menya AI Tutor`
   - Host: `smtp.resend.com` · Port: `465`
   - Username: `resend` · Password: the API key from step 3
   - Save.
5. **Authentication** → **Rate Limits** → raise "emails sent per hour" (for example to 100).
6. Test: open the site in a private window → *Use an email sign-in link instead* → enter an
   address that is not yours → the link should arrive within a minute.

Optional: **Authentication** → **Emails** → **Templates** → "Magic Link" — change the subject to
"Your Menya sign-in link" and the text to match.

## Rotating the key

Create a new key at the provider → update the secret in step 1 → delete the old key at the
provider. No redeploy needed.
