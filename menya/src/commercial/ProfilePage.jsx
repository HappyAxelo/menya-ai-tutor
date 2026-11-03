import { useEffect, useState } from "react";
import { api, supabase } from "../lib/backend.js";
import { authMethod, initialsOf } from "../lib/signout.js";
import { useSettings } from "../settings.js";
import { LANGUAGES } from "../tutor.js";
import { useT } from "../i18n.js";
import { C, Page, Card, Button, Notice, Loading, Field, inputStyle } from "./ui.jsx";

export const displayName = (user) => user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name || "";
export const pictureOf = (user) => {
  const url = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
};

export function Avatar({ user, size = 30 }) {
  const [broken, setBroken] = useState(false);
  const picture = pictureOf(user);
  if (picture && !broken) return <img className="mn-avatar" src={picture} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return <span className="mn-avatar letters" style={{ width: size, height: size }} aria-hidden="true">{initialsOf(displayName(user), user?.email)}</span>;
}

// Who the student is and what Menya knows about their studies. The sign-in credentials themselves are
// never here: Google and the email link hold them, and Menya has no password to show.
export default function ProfilePage({ user, account, onBack, onSubscription, onSignOutEverywhere }) {
  const { t, lang } = useT();
  const [settings, updateSettings] = useSettings();
  const [form, setForm] = useState(null);
  const [name, setName] = useState(displayName(user));
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/learn/state").then(r => {
      const p = r.ok ? r.data.profile : null;
      setForm({ education_level: p?.education_level ?? "", year_of_study: p?.year_of_study ?? "", programme: p?.programme ?? "", institution: p?.institution ?? "" });
    });
  }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const saved = await api("/learn/profile", { method: "POST", body: { education_level: form.education_level || null,
      year_of_study: form.year_of_study ? Number(form.year_of_study) : null, programme: form.programme || null, institution: form.institution || null } });
    let nameOk = true;
    if (name.trim() !== displayName(user)) nameOk = !(await supabase.auth.updateUser({ data: { display_name: name.trim().slice(0, 80) } })).error;
    setBusy(false);
    setMsg(saved.ok && nameOk ? { kind: "ok", text: t("profile.saved") } : { kind: "error", text: t("profile.saveFailed") });
  };

  return (
    <Page title={t("profile.title")} onBack={onBack}>
      <Card>
        <div className="mn-profile-head">
          <Avatar user={user} size={56} />
          <div>
            <div className="name">{displayName(user) || t("profile.noName")}</div>
            {user?.email && <div className="sub">{user.email}</div>}
          </div>
        </div>
        <dl className="mn-facts">
          <div><dt>{t("profile.method")}</dt><dd>{t(`profile.method.${authMethod(user)}`)}</dd></div>
          <div><dt>{t("profile.joined")}</dt><dd>{user?.created_at ? new Date(user.created_at).toLocaleDateString([lang], { day: "numeric", month: "long", year: "numeric" }) : "—"}</dd></div>
          <div><dt>{t("profile.plan")}</dt><dd>{account ? t(`plan.${account.plan}`) : "—"} <button className="mn-link" onClick={onSubscription}>{t("profile.manage")}</button></dd></div>
        </dl>
      </Card>

      <Card title={t("profile.about")}>
        <p className="mn-fine left">{t("profile.aboutNote")}</p>
        {!form ? <Loading /> : (
          <form onSubmit={save} className="mn-form">
            <Field label={t("profile.name")}><input style={inputStyle} maxLength={80} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></Field>
            <Field label={t("settings.lang")}>
              <select style={inputStyle} value={settings.language} onChange={e => updateSettings({ language: e.target.value })}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.code === "auto" ? t("settings.langMatch") : l.label}</option>)}
              </select>
            </Field>
            <Field label={t("study.level")}>
              <select style={inputStyle} value={form.education_level} onChange={set("education_level")}>
                <option value="">—</option>
                {["secondary", "university", "professional", "other"].map(l => <option key={l} value={l}>{t(`study.levelOpt.${l}`)}</option>)}
              </select>
            </Field>
            <Field label={t("study.year")}><input style={inputStyle} type="number" min="1" max="12" value={form.year_of_study} onChange={set("year_of_study")} /></Field>
            <Field label={t("profile.field")}><input style={inputStyle} maxLength={120} value={form.programme} onChange={set("programme")} placeholder={t("study.programmePh")} /></Field>
            <Field label={t("study.institution")}><input style={inputStyle} maxLength={120} value={form.institution} onChange={set("institution")} /></Field>
            {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
            <div className="mn-row"><Button type="submit" disabled={busy}>{t("study.save")}</Button></div>
          </form>
        )}
      </Card>

      <Card title={t("profile.notifications")}><p className="mn-panel-text">{t("profile.noNotifications")}</p></Card>

      <Card title={t("profile.security")}>
        <p className="mn-panel-text">{t("profile.securityText")}</p>
        <Button variant="ghost" onClick={onSignOutEverywhere}>{t("profile.signOutEverywhere")}</Button>
        <p className="mn-fine left" style={{ marginTop: 12, color: C.dim }}><a href="./privacy.html" target="_blank" rel="noopener noreferrer">{t("profile.privacy")}</a></p>
      </Card>
    </Page>
  );
}
