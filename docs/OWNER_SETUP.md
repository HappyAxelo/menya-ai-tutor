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
- Optional: Authentication → **SMTP Settings** with your own email service, so email sign-in
  links reach students too (Supabase's built-in mailer only delivers to your own team).

## Rotating the key

Create a new key at the provider → update the secret in step 1 → delete the old key at the
provider. No redeploy needed.
