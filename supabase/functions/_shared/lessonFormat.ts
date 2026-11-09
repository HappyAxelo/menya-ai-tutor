// A lesson is ordinary text with section markers on their own lines (@@idea, @@see, ...). Keeping one text,
// instead of a second structured copy, means the answer guard, citation checks, history and exports all
// keep working on exactly what the student sees. A reply without markers simply shows as plain text.
// Shared by the server and the web app.
export const SECTION_IDS = ["idea", "see", "example", "try", "feedback", "check"] as const;
export type SectionId = typeof SECTION_IDS[number];
export interface LessonSection { id: SectionId; body: string }
export interface ParsedLesson { intro: string; sections: LessonSection[] }

const MARKER = /^[\s>*_#]*@@\s*([a-z]+)\b[\s:*_]*(.*)$/i;

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
export function splitSteps(body: string): { lead: string; steps: string[]; tail: string } | null {
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
