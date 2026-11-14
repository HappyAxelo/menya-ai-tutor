// A lesson is ordinary text with section markers on their own lines (@@idea, @@see, ...). Keeping one text,
// instead of a second structured copy, means the answer guard, citation checks, history and exports all
// keep working on exactly what the student sees. A reply without markers simply shows as plain text.
// Shared by the server and the web app.
export const SECTION_IDS = ["idea", "see", "example", "try", "feedback", "check"] as const;
export type SectionId = typeof SECTION_IDS[number];
export interface LessonSection { id: SectionId; body: string }
export interface ParsedLesson { intro: string; sections: LessonSection[] }

// A marker may be followed by a colon or a dash before the text ("@@idea — Think of..."): neither is part of the lesson.
const MARKER = /^[\s>*_#]*@@\s*([a-z]+)\b[\s:*_]*(?:[—–-]\s+)?(.*)$/i;

export function parseLesson(message: string): ParsedLesson {
  const sections: LessonSection[] = [];
  const intro: string[] = [];
  let current: { id: SectionId; lines: string[] } | null = null;
  let inCode = false;
  const close = () => { if (current) sections.push({ id: current.id, body: current.lines.join("\n").trim() }); };
  for (const line of (message ?? "").split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    const m = inCode ? null : MARKER.exec(line);
    if (m) {
      const id = m[1].toLowerCase() as SectionId;
      close();
      current = SECTION_IDS.includes(id) ? { id, lines: m[2] ? [m[2]] : [] } : null;
      // A marker the app doesn't know is dropped; what follows stays visible in the previous place.
      if (!current && m[2]) intro.push(m[2]);
      continue;
    }
    if (current) current.lines.push(line); else intro.push(line);
  }
  close();
  return { intro: intro.join("\n").trim(), sections: sections.filter(s => s.body) };
}

// The same text with no markers: for copying, exporting and reading aloud.
export function stripLessonMarkers(message: string): string {
  const { intro, sections } = parseLesson(message);
  return [intro, ...sections.map(s => s.body)].filter(Boolean).join("\n\n");
}

export const isLesson = (message: string) => parseLesson(message).sections.length > 0;

// "1. First step" items, for showing a worked example one step at a time.
// "1. Let g(t) = ... 2. Apply the rule ... 3. So ..." or "a • b • c" written on one line: put each step on its own line.
export function unfoldSteps(body: string): string {
  if (/^\s*\d+[.)]\s+/m.test(body.split(/\r?\n/).slice(1).join("\n"))) return body;       // already one step per line
  const bullets = body.split(/\s+•\s+/);
  if (bullets.length >= 3 && !/\n\s*[-•*]\s/.test(body)) {
    const [lead, ...rest] = bullets;
    return [lead.replace(/^•\s*/, "").trim(), ...rest.map((b, i) => (i + 1) + ". " + b.trim())].filter(Boolean).join("\n");
  }
  let expect = 1;
  const out = body.replace(/(^|[.;:!?)]\s+|\s{2,})(\d+)[.)]\s+(?=\S)/g, (whole, before, n) => {
    if (Number(n) !== expect) return whole;
    expect += 1;
    return (before.trim() ? before.trimEnd() + "\n" : "") + n + ". ";
  });
  return expect > 2 ? out : body;
}

export function splitSteps(rawBody: string): { lead: string; steps: string[]; tail: string } | null {
  const body = unfoldSteps(rawBody);
  const lines = body.split(/\r?\n/);
  const starts = lines.flatMap((l, i) => /^\s*\d+[.)]\s+/.test(l) ? [i] : []);
  if (starts.length < 2) return null;
  const steps = starts.map((s, k) => lines.slice(s, starts[k + 1] ?? lines.length).join("\n").replace(/^\s*\d+[.)]\s+/, "").trim());
  // Anything after a blank line following the last step is a closing remark, not part of that step.
  const last = steps[steps.length - 1], cut = last.search(/\n\s*\n/);
  const tail = cut >= 0 ? last.slice(cut).trim() : "";
  if (cut >= 0) steps[steps.length - 1] = last.slice(0, cut).trim();
  return { lead: lines.slice(0, starts[0]).join("\n").trim(), steps, tail };
}

// A lesson put back together after one of its sections was replaced.
export function formatLesson(lesson: ParsedLesson): string {
  return [lesson.intro, ...lesson.sections.map(s => `@@${s.id}\n${s.body}`)].filter(Boolean).join("\n");
}
