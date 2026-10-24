// ============================================================
// Backend access for the commercial app (Supabase Auth + the "api"
// Edge Function). The anon key is a public key by design; every table
// is protected by row-level security and every privileged action goes
// through the server, which re-checks the user's plan and role.
// ============================================================
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const backendEnabled = Boolean(url && anonKey);
export const supabase = backendEnabled ? createClient(url, anonKey) : null;
const API_BASE = backendEnabled ? `${url.replace(/\/$/, "")}/functions/v1/api` : null;

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const t = await token();
  if (t) headers.Authorization = `Bearer ${t}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, data: { error: "network", message: "Can't reach Menya. Check your connection and try again." } };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function downloadWithAuth(path, filename) {
  const t = await token();
  const res = await fetch(`${API_BASE}${path}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Signed-in user's plan, limits and usage (computed by the database).
export async function getAccount() {
  const { data, error } = await supabase.rpc("my_account");
  if (error) throw new Error(error.message);
  return data;
}

export async function listSessions() {
  const { data, error } = await supabase.from("tutoring_sessions")
    .select("id, title, language, turn_count, hints_used, updated_at").order("updated_at", { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSession(id) {
  const { error } = await supabase.from("tutoring_sessions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Tutor client used by the chat UI. The server keeps the conversation,
// picks the model and enforces the plan; the browser only sends text.
export function backendTutorClient() {
  let sessionId = null;
  const call = async (body) => {
    const r = await api("/tutor", { method: "POST", body: { requestId: crypto.randomUUID(), sessionId, ...body } });
    if (!r.ok) {
      // Plan limits (quota, session length, hints) get an upgrade/plan button; other failures don't.
      const isLimit = r.status === 429 || ["session_limit", "hint_limit"].includes(r.data.error);
      return { ok: false, status: r.status, error: r.data.error, isLimit, upgradeTo: r.data.upgrade_to ?? null,
               message: r.data.message ?? "Something went wrong. Please try again." };
    }
    sessionId = r.data.sessionId;
    return { ok: true, reply: r.data.reply, quota: r.data.quota, advanced: r.data.advancedReasoning, hintsUsed: r.data.hintsUsed };
  };
  return {
    send: ({ text, language, learnerLevel, style }) => call({ action: "message", message: text, language, learnerLevel, style }),
    hint: ({ language, learnerLevel, style }) => call({ action: "hint", language, learnerLevel, style }),
    newProblem: () => { sessionId = null; },
  };
}

export function formatPrice(cents, currency = "USD") {
  if (cents == null) return null;
  if (cents === 0) return "Free";
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

// Small, failure-tolerant wrappers: storage can be unavailable (private mode).
export const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};
