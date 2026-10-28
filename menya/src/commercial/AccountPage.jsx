import { useEffect, useState } from "react";
import { api, listSessions, deleteSession, downloadWithAuth, supabase } from "../lib/backend.js";
import { useT } from "../i18n.js";
import { C, Page, Card, Button, Meter, Notice, Loading, Field, inputStyle, Table } from "./ui.jsx";

export default function AccountPage({ account, email, onBack, onPricing, refresh }) {
  const { t, lang } = useT();
  const [sessions, setSessions] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState(null);

  useEffect(() => { listSessions().then(setSessions).catch(() => setSessions([])); }, []);

  if (!account) return <Page title={t("account.title")} onBack={onBack}><Loading /></Page>;
  const { limits, used } = account;
  const date = account.period_end ? new Date(account.period_end).toLocaleDateString([lang]) : null;
  const status = account.subscription_status;

  const removeSession = async (s) => {
    if (!confirm(t("history.deleteConfirm", { title: s.title || t("history.untitled") }))) return;
    try { await deleteSession(s.id); setSessions(list => list.filter(x => x.id !== s.id)); }
    catch { setMsg({ kind: "error", text: t("history.deleteError") }); }
  };

  const deleteAccount = async () => {
    const r = await api("/account", { method: "DELETE" });
    if (r.ok) { await supabase.auth.signOut(); window.location.reload(); }
    else setMsg({ kind: "error", text: t("account.deleteFailed") });
  };

  return (
    <Page title={t("account.title")} subtitle={email} onBack={onBack}>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Card title={t("account.plan")}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 600 }}>{t(`plan.${account.plan}`)}</div>
            <div style={{ fontSize: "13px", color: C.dim, marginTop: "4px", lineHeight: 1.6 }}>
              {account.source === "organization" && `${t("account.fromInstitution")} `}
              {status && `${t(`account.status.${status}`)}. `}
              {date && (account.cancel_at_period_end || status === "canceled" ? t("account.endsOn", { date })
                : status === "past_due" ? t("account.updateBy", { date }) : t("account.renews", { date }))}
            </div>
          </div>
          {account.source !== "organization" && <Button variant="ghost" onClick={onPricing}>{account.plan === "free" ? t("account.seePaid") : t("account.changePlan")}</Button>}
        </div>
      </Card>

      <Card title={t("account.usage")}>
        <Meter label={t("account.today")} used={used.daily} limit={limits.daily} />
        <Meter label={t("account.month")} used={used.monthly} limit={limits.monthly} />
        <Meter label={t("account.premium")} used={used.premium} limit={limits.premium} />
        <p className="mn-panel-text small">{t("account.resetNote", { n: limits.session_turns })}</p>
        <button onClick={refresh} className="mn-btn outline" style={{ marginTop: 8 }}>{t("account.refresh")}</button>
      </Card>

      <Card title={t("account.recent")}>
        {!sessions ? <Loading /> : (
          <Table empty={t("account.recentEmpty")}
            columns={[
              { key: "title", label: t("account.col.problem"), wrap: true, render: s => s.title || t("history.untitled") },
              { key: "turn_count", label: t("account.col.exchanges"), align: "right" },
              { key: "hints_used", label: t("account.col.hints"), align: "right" },
              { key: "updated_at", label: t("account.col.last"), render: s => new Date(s.updated_at).toLocaleDateString([lang]) },
              { key: "x", label: "", render: s => <button onClick={() => removeSession(s)} aria-label={t("history.deleteAria", { title: s.title || t("history.untitled") })} className="mn-link danger">{t("account.delete")}</button> },
            ]}
            rows={sessions} />
        )}
      </Card>

      <Card title={t("account.data")}>
        <p className="mn-panel-text">{t("account.dataText")}</p>
        <Button variant="ghost" onClick={() => downloadWithAuth("/account/export", "menya-data.json").catch(e => setMsg({ kind: "error", text: e.message }))}>{t("account.download")}</Button>
        <div style={{ marginTop: "18px", maxWidth: "360px" }}>
          <Field label={t("account.confirmLabel")}>
            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} style={inputStyle} />
          </Field>
          <Button variant="danger" disabled={confirmText !== "DELETE"} onClick={deleteAccount}>{t("account.deleteAccount")}</Button>
        </div>
      </Card>
    </Page>
  );
}
