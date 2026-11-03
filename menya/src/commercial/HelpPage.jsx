import { useT } from "../i18n.js";
import { Page, Card } from "./ui.jsx";

const CONTACT = "muyombanohappy@gmail.com";
const TOPICS = ["hints", "explain", "research", "limits", "plans", "data"];

export default function HelpPage({ onBack }) {
  const { t } = useT();
  return (
    <Page title={t("help.title")} onBack={onBack}>
      <Card title={t("help.how")}>
        {TOPICS.map(k => (
          <details key={k} className="mn-help-item">
            <summary>{t(`help.${k}.q`)}</summary>
            <p>{t(`help.${k}.a`)}</p>
          </details>
        ))}
      </Card>
      <Card title={t("help.contact")}>
        <p className="mn-panel-text">{t("help.contactText")} <a href={`mailto:${CONTACT}?subject=Menya%20support`}>{CONTACT}</a></p>
        <p className="mn-panel-text"><a href="./privacy.html" target="_blank" rel="noopener noreferrer">{t("profile.privacy")}</a></p>
      </Card>
    </Page>
  );
}
