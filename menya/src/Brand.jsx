// Menya AI brand elements: the "m" whose second arch becomes a question mark.
// Drawn inline so it takes the theme's brand colour (indigo on light, a lighter
// indigo on dark). The same shape is in public/menya-mark.svg and the app icons.

export const TAGLINE = "Learn better. Think deeper.";

const MARK_PATH = "M10 113.5V49.75a39.25 39.25 0 0 1 78.5 0V113.5M88.5 49.75a39 39 0 0 1 78 0a39 39 0 0 1-5.9 20.65L151 88.5";

function MarkSvg({ width, title }) {
  return (
    <svg className="mn-logo" viewBox="-1 -1 179 149" width={width} height={Math.round(width * 149 / 179)} fill="none"
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <path d={MARK_PATH} stroke="currentColor" strokeWidth="21" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="152" cy="132" r="14" fill="currentColor" />
    </svg>
  );
}

export function BrandMark({ size = 40, decorative = true }) {
  return <span className="mn-mark-ink"><MarkSvg width={size} title={decorative ? undefined : "Menya AI"} /></span>;
}

// White mark on the indigo tile, as on the app icon. Used for the tutor's avatar.
export function BrandAvatar({ size = 28 }) {
  return (
    <span className="mn-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <MarkSvg width={Math.round(size * 0.62)} />
    </span>
  );
}

// "Menya AI" as in the logo lockup.
export function Wordmark({ size = "md" }) {
  return <span className={`mn-word ${size}`}>Menya <span className="ai">AI</span></span>;
}

// Mark + wordmark (+ tagline), centred: sign-in and developer key screens.
export function BrandLockup({ tagline = true }) {
  return (
    <div className="mn-lockup">
      <BrandMark size={84} decorative={false} />
      <Wordmark size="lg" />
      {tagline && <div className="mn-tagline">{TAGLINE}</div>}
    </div>
  );
}
