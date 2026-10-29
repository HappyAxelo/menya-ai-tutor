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

// timeoutMs: tutor replies can take a while on hard problems, but not forever.
export async function api(path, { method = "GET", body, timeoutMs = 60000 } = {}) {
  const upload = typeof FormData !== "undefined" && body instanceof FormData;   // files: the browser sets the multipart header
  const headers = upload ? {} : { "Content-Type": "application/json" };
  const t = await token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : upload ? body : JSON.stringify(body), signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      return { ok: false, status: 0, data: { error: "timeout", message: "This is taking much longer than usual, so we stopped waiting. Please try again." } };
    }
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return { ok: false, status: 0, data: { error: offline ? "offline" : "network", message: offline
      ? "You're offline. Reconnect to the internet and try again."
      : "Couldn't reach Menya. Check your connection and try again." } };
  } finally {
    clearTimeout(timer);
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

const SESSION_COLUMNS = "id, title, language, turn_count, hints_used, attempts, practice, solved, examples_used, problems_solved, updated_at, mode, objective";

export async function listSessions(limit = 30) {
  const { data, error } = await supabase.from("tutoring_sessions")
    .select(SESSION_COLUMNS).order("updated_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data;
}

// One saved conversation, readable only by its owner (row-level security).
export async function loadSession(id) {
  const [s, m] = await Promise.all([
    supabase.from("tutoring_sessions").select(SESSION_COLUMNS).eq("id", id).single(),
    supabase.from("tutoring_messages").select("id, role, content, meta").eq("session_id", id).order("id", { ascending: true }).limit(400),
  ]);
  if (s.error) throw new Error(s.error.message);
  if (m.error) throw new Error(m.error.message);
  return { session: s.data, rows: m.data };
}

// Verified solves only (written by the server); the progress page aggregates them.
export async function listLearningEvents() {
  const { data, error } = await supabase.from("learning_events")
    .select("kind, concepts, hints_used, examples_used, attempts, created_at").order("created_at", { ascending: false }).limit(1000);
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
    // The server answers within ~55 s (MODEL_BUDGET_MS); wait a little longer than that.
    const r = await api("/tutor", { method: "POST", timeoutMs: 75000, body: { requestId: crypto.randomUUID(), sessionId, ...body } });
    if (!r.ok) {
      // Plan limits (quota, session length, hints) get a plan button; temporary failures get Retry.
      // The error code lets the app show the message in the learner's language.
      const isLimit = ["daily_limit", "monthly_limit", "premium_limit", "premium_not_included", "org_limit", "session_limit", "hint_limit"].includes(r.data.error);
      const retryable = r.status === 0 || r.status >= 500 || r.data.error === "rate_limited";
      return { ok: false, status: r.status, error: r.data.error, isLimit, retryable, upgradeTo: r.data.upgrade_to ?? null,
               retryAfter: r.data.retry_after_seconds ?? null,
               message: r.data.message ?? "Something went wrong. Please try again." };
    }
    sessionId = r.data.sessionId;
    return { ok: true, reply: r.data.reply, quota: r.data.quota, advanced: r.data.advancedReasoning,
             hintsUsed: r.data.hintsUsed, problem: r.data.problem ?? null, engine: r.data.engine ?? null };
  };
  return {
    // action: message | hint | simpler | example | check | practice | summary | verify | review | stuck
    // mode: learn | explain; stuck: start | step | mistake | concept; objective: for review
    act: (action, { text, language, learnerLevel, style, mode, stuck, objective, attachments }) =>
      call({ action, message: text, language, learnerLevel, style, mode, stuck, objective, attachments }),
    // Voice note -> text (Whisper). language: the learner's chosen reply language, if any.
    transcribe: async (blob, language) => {
      const form = new FormData();
      form.append("file", blob, `voice.${/mp4|m4a/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : /wav/.test(blob.type) ? "wav" : /mpeg|mp3/.test(blob.type) ? "mp3" : "webm"}`);
      if (language && language !== "auto") form.append("language", language);
      const r = await api("/media/transcribe", { method: "POST", body: form, timeoutMs: 90000 });
      if (!r.ok) throw Object.assign(new Error(r.data.error ?? "transcription_failed"), { code: r.data.error });
      return r.data.text ?? "";
    },
    // Photo or scan of a problem -> the problem as text.
    readImage: async (blob) => {
      const form = new FormData();
      form.append("file", blob, "image");
      const r = await api("/media/read-image", { method: "POST", body: form, timeoutMs: 90000 });
      if (!r.ok) throw Object.assign(new Error(r.data.error ?? "read_failed"), { code: r.data.error });
      return r.data.text ?? "";
    },
    // Objectives due for spaced review (readable by the learner; no answers in them).
    dueReviews: async () => {
      const { data } = await supabase.from("learner_objectives").select("objective_id, next_review_at, status")
        .lte("next_review_at", new Date().toISOString()).order("next_review_at").limit(3);
      return data ?? [];
    },
    newProblem: () => { sessionId = null; },
    resume: (id) => { sessionId = id; },
    currentSession: () => sessionId,
    // Bad / Fair / Good on one tutor reply (by its saved id).
    feedback: async (messageId, rating) => (await api("/feedback", { method: "POST", body: { messageId, rating } })).ok,
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

// The learner's profile per learning objective (mastery estimate, evidence, next review).
export async function listObjectives() {
  const { data, error } = await supabase.from("learner_objectives")
    .select("objective_id, alpha, beta, independent_correct, guided_correct, incorrect, delayed_correct, next_review_at, status, misconceptions")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}
