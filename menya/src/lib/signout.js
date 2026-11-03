// Everything that ties this browser to an account. Device preferences (theme, text size) stay, because
// they say nothing about the person. No imports, so it can be tested with node --test.
const ACCOUNT_KEYS = ["menya_current", "menya_invite", "menya_onboarded", "menya_guest_ticket"];
const isAuthKey = (k) => /^sb-.*-auth-token/.test(k) || k === "supabase.auth.token";

export function clearAccountData(stores) {
  for (const s of stores) {
    if (!s) continue;
    try {
      for (let i = s.length - 1; i >= 0; i--) {
        const k = s.key(i);
        if (k && (isAuthKey(k) || ACCOUNT_KEYS.includes(k))) s.removeItem(k);
      }
    } catch { /* storage blocked: nothing was kept there either */ }
  }
}

// Ends the session on the server, then clears this browser whatever the server said, so that a lost
// connection can't leave the next person on a shared device signed in. Returns false if the server
// couldn't be reached: the session then ends by itself when its token expires, within the hour.
export async function endSession(auth, stores, { everywhere = false } = {}) {
  let reached = true;
  try {
    const { error } = await auth.signOut({ scope: everywhere ? "global" : "local" });
    if (error) reached = false;
  } catch { reached = false; }
  clearAccountData(stores);
  return reached;
}

// Initials for the profile button, when there's no picture.
export function initialsOf(name, email) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words.at(-1)[0]).toUpperCase();
  if (words.length === 1) return words[0][0].toUpperCase();
  return (String(email ?? "").trim()[0] ?? "?").toUpperCase();
}

// How the account signs in, from Supabase's own record.
export function authMethod(user) {
  if (user?.is_anonymous) return "guest";
  const provider = user?.app_metadata?.provider ?? user?.identities?.[0]?.provider;
  return provider === "google" ? "google" : provider === "email" ? "email" : "other";
}
