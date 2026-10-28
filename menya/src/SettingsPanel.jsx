import { useEffect } from "react";
import { CreditCard, Database, GraduationCap, Info, KeyRound, MessageSquare, Palette, RotateCcw, X } from "lucide-react";
import { LANGUAGES } from "./tutor.js";
import { useT } from "./i18n.js";

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="mn-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

function Switch({ label, checked, onChange }) {
  return <button type="button" className="mn-switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

function Row({ label, help, children, stack }) {
  return (
    <div className={`mn-setting${stack ? " stack" : ""}`}>
      <div><div className="lbl">{label}</div>{help && <div className="help">{help}</div>}</div>
      {children}
    </div>
  );
}

// Settings that change something real: tutor behaviour (sent with each
// request), appearance, chat input, plan, data and the developer key.
export default function SettingsPanel({
  settings, update, reset, mode, account, hasConversation,
  onClose, onPlans, onAccount, onExport, onClear, onShowIntro, onForgetKey,
}) {
  const { t } = useT();
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const seg = (prefix, values) => values.map(v => [v, t(`${prefix}.${v}`)]);
  const left = (limit, used) => Math.max(limit - used, 0);

  return (
    <>
      <div className="mn-scrim" onClick={onClose} />
      <aside className="mn-drawer wide" role="dialog" aria-modal="true" aria-label={t("settings.title")}>
        <div className="mn-drawer-head">
          <h2>{t("settings.title")}</h2>
          <button className="mn-btn icon" onClick={onClose} aria-label={t("settings.close")} autoFocus><X size={18} /></button>
        </div>
        <div className="mn-drawer-body">
          <section className="mn-settings-section">
            <h3><GraduationCap size={16} />{t("settings.tutor")}</h3>
            <Row stack label={t("settings.lang")} help={t("settings.langHelp")}>
              <select className="mn-select-full" value={settings.language} onChange={e => update({ language: e.target.value })}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.code === "auto" ? t("settings.langMatch") : t("settings.langAlways", { lang: l.label })}</option>)}
              </select>
            </Row>
            <Row stack label={t("settings.level")} help={t("settings.levelHelp")}>
              <Segmented label={t("settings.level")} value={settings.level} onChange={level => update({ level })}
                options={seg("settings.level", ["secondary", "undergraduate", "postgraduate"])} />
            </Row>
            <Row stack label={t("settings.length")} help={t("settings.lengthHelp")}>
              <Segmented label={t("settings.length")} value={settings.style} onChange={style => update({ style })}
                options={seg("settings.length", ["concise", "balanced", "detailed"])} />
            </Row>
          </section>

          <section className="mn-settings-section">
            <h3><Palette size={16} />{t("settings.appearance")}</h3>
            <Row stack label={t("settings.theme")}>
              <Segmented label={t("settings.theme")} value={settings.theme} onChange={theme => update({ theme })}
                options={seg("settings.theme", ["system", "light", "dark"])} />
            </Row>
            <Row stack label={t("settings.textSize")}>
              <Segmented label={t("settings.textSize")} value={settings.textSize} onChange={textSize => update({ textSize })}
                options={seg("settings.text", ["sm", "md", "lg"])} />
            </Row>
            <Row label={t("settings.animate")} help={t("settings.animateHelp")}>
              <Switch label={t("settings.animate")} checked={settings.animate} onChange={animate => update({ animate })} />
            </Row>
            <Row label={t("settings.tags")} help={t("settings.tagsHelp")}>
              <Switch label={t("settings.tags")} checked={settings.showTags} onChange={showTags => update({ showTags })} />
            </Row>
          </section>

          <section className="mn-settings-section">
            <h3><MessageSquare size={16} />{t("settings.chat")}</h3>
            <Row label={t("settings.enter")} help={settings.enterToSend ? t("settings.enterHelpOn") : t("settings.enterHelpOff")}>
              <Switch label={t("settings.enter")} checked={settings.enterToSend} onChange={enterToSend => update({ enterToSend })} />
            </Row>
          </section>

          <section className="mn-settings-section">
            <h3><CreditCard size={16} />{t("settings.plan")}</h3>
            {mode === "commercial" && account ? (
              <div className="mn-plan-summary">
                <div className="name">{t(`plan.${account.plan}`)}{account.source === "organization" && <span className="mn-lang">{t("settings.institution")}</span>}</div>
                <p>{t("settings.planText", { left: left(account.limits.daily, account.used.daily), total: account.limits.daily,
                    mleft: left(account.limits.monthly, account.used.monthly), mtotal: account.limits.monthly })}
                  {account.limits.premium > 0 && t("settings.planPremium", { n: left(account.limits.premium, account.used.premium) })}</p>
                <div className="mn-btn-row">
                  <button className="mn-btn outline" onClick={onAccount}>{t("settings.accountUsage")}</button>
                  <button className="mn-btn primary" onClick={onPlans}>{t("settings.comparePlans")}</button>
                </div>
              </div>
            ) : (
              <div className="mn-plan-summary">
                <div className="name">{t("settings.devTitle")}</div>
                <p>{t("settings.devText")}</p>
                <div className="mn-btn-row"><button className="mn-btn outline" onClick={onPlans}>{t("settings.seePlans")}</button></div>
              </div>
            )}
          </section>

          <section className="mn-settings-section">
            <h3><Database size={16} />{t("settings.data")}</h3>
            <Row label={t("settings.export")} help={t("settings.exportHelp")}>
              <button className="mn-btn outline" onClick={onExport} disabled={!hasConversation}>{t("settings.exportBtn")}</button>
            </Row>
            <Row label={t("settings.clear")} help={mode === "dev" ? t("settings.clearHelpDev") : t("settings.clearHelp")}>
              <button className="mn-btn danger" onClick={onClear} disabled={!hasConversation}>{t("settings.clearBtn")}</button>
            </Row>
            {mode === "dev" ? (
              <Row label={t("settings.key")} help={t("settings.keyHelp")}>
                <button className="mn-btn outline" onClick={onForgetKey}><KeyRound size={15} />{t("settings.keyBtn")}</button>
              </Row>
            ) : (
              <Row label={t("settings.manage")} help={t("settings.manageHelp")}>
                <button className="mn-btn outline" onClick={onAccount}>{t("settings.manageBtn")}</button>
              </Row>
            )}
          </section>

          <section className="mn-settings-section">
            <h3><Info size={16} />{t("settings.about")}</h3>
            <div className="mn-about">
              {t("settings.aboutText")} <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener noreferrer">{t("privacy")}</a> · <a href="https://github.com/HappyAxelo/menya-ai-tutor" target="_blank" rel="noopener noreferrer">{t("settings.source")}</a>.
            </div>
            <div className="mn-btn-row">
              <button className="mn-btn outline" onClick={onShowIntro}>{t("settings.showIntro")}</button>
              <button className="mn-btn outline" onClick={reset}><RotateCcw size={15} />{t("settings.reset")}</button>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
