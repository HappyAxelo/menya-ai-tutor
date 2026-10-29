// Voice and image input, on Groq's free tier:
//  - transcribe(): speech to text with Whisper (large-v3, turbo as fallback),
//    nudged toward STEM vocabulary so "12 V" and "4 Ω" come out right;
//  - readImage(): a vision model copies out the problem in a photo or scan,
//    exactly and without solving it, so the tutor can start guiding.
// Documents (PDF, Word, PowerPoint, Excel, text, code) are read in the
// browser; only images and audio come here.

export interface MediaOptions { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string }

export class MediaError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

const BASE = "https://api.groq.com/openai/v1";
export const WHISPER_MODELS = ["whisper-large-v3", "whisper-large-v3-turbo"];
export const VISION_MODEL = "qwen/qwen3.8-27b";
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Whisper language codes for the languages it supports well. Kinyarwanda is not one
// of them: the browser's own speech recognition is used for it when available.
const WHISPER_LANG: Record<string, string> = { English: "en", French: "fr", Swahili: "sw", Spanish: "es", Portuguese: "pt", Arabic: "ar" };
const STEM_PROMPT = "A student asks a tutor about mathematics, physics, electronics, chemistry or programming. " +
  "Units like V, A, mA, Ω (ohm), kΩ, W, Hz; symbols like x², √, π, Δ; code words like for, while, range, print.";

export async function transcribe(o: MediaOptions, audio: Blob, filename: string, language?: string | null): Promise<{ text: string; language: string | null; seconds: number | null }> {
  if (audio.size === 0) throw new MediaError("empty_audio", 400);
  if (audio.size > MAX_AUDIO_BYTES) throw new MediaError("audio_too_large", 413);
  const doFetch = o.fetchImpl ?? fetch;
  let last = 0;
  for (const model of WHISPER_MODELS) {
    const form = new FormData();
    form.append("file", audio, filename || "voice.webm");
    form.append("model", model);
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    form.append("prompt", STEM_PROMPT);
    const code = language ? WHISPER_LANG[language] : undefined;
    if (code) form.append("language", code);
    const res = await doFetch(`${o.baseUrl ?? BASE}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${o.apiKey}` }, body: form });
    last = res.status;
    if (res.status === 429 || res.status >= 500) { await res.body?.cancel(); continue; }   // try the other model
    if (!res.ok) { await res.body?.cancel(); throw new MediaError("transcription_failed", 502); }
    const d = await res.json();
    return { text: String(d.text ?? "").trim(), language: d.language ?? null, seconds: Number.isFinite(d.duration) ? d.duration : null };
  }
  throw new MediaError(last === 429 ? "busy" : "transcription_failed", last === 429 ? 503 : 502);
}

const READ_PROMPT = `You are reading a file a student uploaded to a tutor. Copy out the problem(s) it contains, EXACTLY, so the tutor can help.
- All text, numbers, units and labels as written. Mathematics in plain Unicode (x², √2, π, ≤, fractions as a/b), never LaTeX.
- Code in fenced code blocks, keeping indentation.
- Diagrams, circuits, graphs: describe every component, value, label and connection (e.g. "12 V source in series with R1 = 4 Ω and R2 = 6 Ω").
- Tables as rows "a | b | c". Handwriting: transcribe it; write [unclear] for parts you can't read.
- Do NOT solve, explain, correct or add anything. If there is no problem, describe the content in two sentences.`;

export async function readImage(o: MediaOptions, bytes: Uint8Array, mime: string): Promise<string> {
  if (!IMAGE_TYPES.includes(mime)) throw new MediaError("unsupported_image", 415);
  if (bytes.length === 0) throw new MediaError("empty_image", 400);
  if (bytes.length > MAX_IMAGE_BYTES) throw new MediaError("image_too_large", 413);
  const doFetch = o.fetchImpl ?? fetch;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const body = (hidden: boolean) => JSON.stringify({
    model: VISION_MODEL, temperature: 0.1, max_completion_tokens: 2000,
    ...(hidden ? { reasoning_format: "hidden" } : {}),
    messages: [{ role: "user", content: [
      { type: "text", text: READ_PROMPT },
      { type: "image_url", image_url: { url: `data:${mime};base64,${btoa(bin)}` } },
    ] }],
  });
  for (const hidden of [true, false]) {     // some models reject reasoning_format; retry plainly
    const res = await doFetch(`${o.baseUrl ?? BASE}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" }, body: body(hidden) });
    if (res.status === 400 && hidden) { await res.body?.cancel(); continue; }
    if (res.status === 429) { await res.body?.cancel(); throw new MediaError("busy", 503); }
    if (!res.ok) { await res.body?.cancel(); throw new MediaError("read_failed", 502); }
    const d = await res.json();
    const text = String(d?.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!text) throw new MediaError("read_failed", 502);
    return text;
  }
  throw new MediaError("read_failed", 502);
}
