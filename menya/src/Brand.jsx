// Menya AI Tutor brand elements, matching docs/brand/menya-brand-board.webp.
const BASE = import.meta.env.BASE_URL;

export const TAGLINE = "Learn better. Think deeper.";

// The full-colour mark (head + M + open book).
export function BrandMark({ size = 40, decorative = true, className = "" }) {
  return (
    <img className={`mn-logo ${className}`} src={`${BASE}menya-mark.svg`} width={size} height={Math.round(size * 0.91)}
      alt={decorative ? "" : "Menya AI Tutor"} aria-hidden={decorative || undefined} draggable="false" />
  );
}

// White mark on the brand gradient tile, as on the app icon. Used for the tutor's avatar.
export function BrandAvatar({ size = 28 }) {
  return (
    <span className="mn-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <img src={`${BASE}menya-mark-white.svg`} alt="" draggable="false" />
    </span>
  );
}

// "MENYA AI" with "TUTOR" beneath, as in the logo lockup.
export function Wordmark({ size = "md", showTutor = true }) {
  return (
    <span className={`mn-word ${size}`}>
      <span className="name">MENYA <span className="ai">AI</span></span>
      {showTutor && <span className="tutor"><i />TUTOR<i /></span>}
    </span>
  );
}

// Mark + wordmark + tagline, centred (key screen, sign-in).
export function BrandLockup({ tagline = true }) {
  return (
    <div className="mn-lockup">
      <BrandMark size={96} decorative={false} />
      <Wordmark size="lg" />
      {tagline && <div className="mn-tagline">{TAGLINE}</div>}
    </div>
  );
}
