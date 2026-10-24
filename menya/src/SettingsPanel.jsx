import { useEffect } from "react";
import { CreditCard, Database, GraduationCap, Info, KeyRound, MessageSquare, Palette, RotateCcw, X } from "lucide-react";
import { LANGUAGES } from "./tutor.js";

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

const PLAN_NAMES = { free: "Free", pro: "Pro", professional: "Professional" };

// Settings that change something real: tutor behaviour (sent with each
// request), appearance, chat input, plan, data and the developer key.
export default function SettingsPanel({
  settings, update, reset, mode, account, hasConversation,
  onClose, onPlans, onAccount, onExport, onClear, onForgetKey,
}) {
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="mn-scrim" onClick={onClose} />
      <aside className="mn-drawer wide" role="dialog" aria-label="Settings">
        <div className="mn-drawer-head">
          <h2>Settings</h2>
          <button className="mn-btn icon" onClick={onClose} aria-label="Close settings"><X size={18} /></button>
        </div>
        <div className="mn-drawer-body">
          <section className="mn-settings-section">
            <h3><GraduationCap size={16} />Tutor</h3>
            <Row stack label="Reply language" help="The language Menya answers in. Auto-detect replies in whatever language you write.">
              <select className="mn-select-full" value={settings.language} onChange={e => update({ language: e.target.value })}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.code === "auto" ? "Auto-detect (match my language)" : l.label}</option>)}
              </select>
            </Row>
            <Row stack label="Your level" help="Menya adjusts its vocabulary, examples and rigour.">
              <Segmented label="Your level" value={settings.level} onChange={level => update({ level })}
                options={[["secondary", "Secondary"], ["undergraduate", "University"], ["postgraduate", "Postgraduate"]]} />
            </Row>
            <Row stack label="Reply length" help="Concise keeps replies to a sentence or two; detailed adds a short illustration of the idea.">
              <Segmented label="Reply length" value={settings.style} onChange={style => update({ style })}
                options={[["concise", "Concise"], ["balanced", "Balanced"], ["detailed", "Detailed"]]} />
            </Row>
          </section>

          <section className="mn-settings-section">
            <h3><Palette size={16} />Appearance</h3>
            <Row stack label="Theme">
              <Segmented label="Theme" value={settings.theme} onChange={theme => update({ theme })}
                options={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]} />
            </Row>
            <Row stack label="Text size">
              <Segmented label="Text size" value={settings.textSize} onChange={textSize => update({ textSize })}
                options={[["sm", "Small"], ["md", "Medium"], ["lg", "Large"]]} />
            </Row>
            <Row label="Animate replies" help="Reveal replies word by word.">
              <Switch label="Animate replies" checked={settings.animate} onChange={animate => update({ animate })} />
            </Row>
            <Row label="Show topic tags" help="Concepts detected in each reply.">
              <Switch label="Show topic tags" checked={settings.showTags} onChange={showTags => update({ showTags })} />
            </Row>
          </section>

          <section className="mn-settings-section">
            <h3><MessageSquare size={16} />Chat</h3>
            <Row label="Enter sends message" help={settings.enterToSend ? "Shift + Enter adds a new line." : "Enter adds a new line; Ctrl/⌘ + Enter sends."}>
              <Switch label="Enter sends message" checked={settings.enterToSend} onChange={enterToSend => update({ enterToSend })} />
            </Row>
          </section>

          <section className="mn-settings-section">
            <h3><CreditCard size={16} />Plan &amp; usage</h3>
            {mode === "commercial" && account ? (
              <div className="mn-plan-summary">
                <div className="name">{PLAN_NAMES[account.plan] ?? account.plan}{account.source === "organization" && <span className="mn-lang">INSTITUTION</span>}</div>
                <p>{Math.max(account.limits.daily - account.used.daily, 0)} of {account.limits.daily} messages left today · {Math.max(account.limits.monthly - account.used.monthly, 0)} of {account.limits.monthly} this month
                  {account.limits.premium > 0 && <> · {Math.max(account.limits.premium - account.used.premium, 0)} advanced-reasoning requests left</>}</p>
                <div className="mn-btn-row">
                  <button className="mn-btn outline" onClick={onAccount}>Account &amp; usage</button>
                  <button className="mn-btn primary" onClick={onPlans}>Compare plans</button>
                </div>
              </div>
            ) : (
              <div className="mn-plan-summary">
                <div className="name">Developer mode</div>
                <p>You're using your own free Groq key, so Menya's plan limits don't apply. Free, Pro and Professional plans come with Menya accounts.</p>
                <div className="mn-btn-row"><button className="mn-btn primary" onClick={onPlans}>See Free, Pro &amp; Professional</button></div>
              </div>
            )}
          </section>

          <section className="mn-settings-section">
            <h3><Database size={16} />Your data</h3>
            <Row label="Export this conversation" help="Download it as a Markdown file.">
              <button className="mn-btn outline" onClick={onExport} disabled={!hasConversation}>Export</button>
            </Row>
            <Row label="Clear conversation and progress" help="Removes this chat, hints, mastery and analytics from this tab.">
              <button className="mn-btn danger" onClick={onClear} disabled={!hasConversation}>Clear</button>
            </Row>
            {mode === "dev" ? (
              <Row label="Groq API key" help="Held in this tab's memory only and sent straight to Groq. Never saved.">
                <button className="mn-btn outline" onClick={onForgetKey}><KeyRound size={15} />Change key</button>
              </Row>
            ) : (
              <Row label="Download or delete your account data" help="Everything Menya stores about you.">
                <button className="mn-btn outline" onClick={onAccount}>Manage</button>
              </Row>
            )}
          </section>

          <section className="mn-settings-section">
            <h3><Info size={16} />About</h3>
            <div className="mn-about">
              Menya is a Socratic tutor: it guides you to answers with accurate, step-by-step hints instead of handing them over, in your language.
              Settings are saved in this browser only. <a href="https://github.com/HappyAxelo/menya-ai-tutor" target="_blank" rel="noopener noreferrer">Source on GitHub</a>.
            </div>
            <div className="mn-btn-row">
              <button className="mn-btn outline" onClick={reset}><RotateCcw size={15} />Reset settings to defaults</button>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
