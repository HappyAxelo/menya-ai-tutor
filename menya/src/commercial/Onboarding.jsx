import { useState } from "react";
import { api } from "../lib/backend.js";
import { useT } from "../i18n.js";
import { useSettings } from "../settings.js";
import { LANGUAGES } from "../tutor.js";
import { Button, inputStyle } from "./ui.jsx";

// Three optional questions after signing up. It sits above the tutor and never stops anyone using it.
export default function Onboarding({ onDone }) {
  const { t } = useT();
  const [settings, update] = useSettings();
  const [level, setLevel] = useState("");
  const [field, setField] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    // Whatever happens here, the student carries on: this is only to personalise replies.
    if (level || field.trim()) {
      await api("/learn/profile", { method: "POST", body: { education_level: level || null, programme: field.trim().slice(0, 120) || null } });
    }
    setBusy(false);
    onDone();
  };

  return (
    <form className="mn-onboard" onSubmit={save}>
      <div className="head"><b>{t("onboard.title")}</b><span>{t("onboard.sub")}</span></div>
      <div className="fields">
        <label>{t("onboard.language")}
          <select style={inputStyle} value={settings.language} onChange={e => update({ language: e.target.value })}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.code === "auto" ? t("lang.match") : l.label}</option>)}
          </select>
        </label>
        <label>{t("study.level")}
          <select style={inputStyle} value={level} onChange={e => setLevel(e.target.value)}>
            <option value="">—</option>
            {["secondary", "university", "professional", "other"].map(l => <option key={l} value={l}>{t(`study.levelOpt.${l}`)}</option>)}
          </select>
        </label>
        <label>{t("onboard.field")}
          <input style={inputStyle} maxLength={120} value={field} onChange={e => setField(e.target.value)} placeholder={t("study.programmePh")} />
        </label>
      </div>
      <div className="acts">
        <Button type="submit" disabled={busy}>{t("onboard.save")}</Button>
        <button type="button" className="mn-link" onClick={onDone}>{t("onboard.skip")}</button>
      </div>
    </form>
  );
}
