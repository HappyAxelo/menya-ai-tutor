// Real-model check of the attachment chain: a photo of a problem is read by the
// vision model, then the tutor starts guiding from it. Needs GROQ_API_KEY (../menya/.env).
//   cd supabase && node dev/try-media.ts <image> [audio]
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { freshDb, createUser } from "../tests/db.ts";
import { pgRepo } from "../tests/pgRepo.ts";
import { handleTutor } from "../functions/_shared/tutorService.ts";
import { buildProviders } from "../functions/_shared/providers.ts";
import { readImage, transcribe } from "../functions/_shared/media.ts";

const envFile = new URL("../../menya/.env", import.meta.url);
if (!process.env.GROQ_API_KEY && existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*GROQ_API_KEY\s*=\s*(.+)\s*$/.exec(line);
    if (m) process.env.GROQ_API_KEY = m[1].replace(/^["']|["']$/g, "");
  }
}
const apiKey = process.env.GROQ_API_KEY!;
const [imagePath, audioPath] = process.argv.slice(2);

let t = Date.now();
const text = await readImage({ apiKey }, new Uint8Array(readFileSync(imagePath)), imagePath.endsWith(".png") ? "image/png" : "image/jpeg");
console.log(`--- image read in ${((Date.now() - t) / 1000).toFixed(1)} s ---\n${text}\n`);
if (audioPath) {
  t = Date.now();
  const v = await transcribe({ apiKey }, new Blob([readFileSync(audioPath)], { type: "audio/wav" }), "voice.wav", "English");
  console.log(`--- voice transcribed in ${((Date.now() - t) / 1000).toFixed(1)} s ---\n${v.text}\n`);
}
const db = await freshDb();
const user = await createUser(db);
t = Date.now();
const res = await handleTutor({ repo: pgRepo(db), providers: buildProviders({ GROQ_API_KEY: apiKey }) }, user,
  { requestId: randomUUID(), action: "message", message: "", language: "English", attachments: [{ name: "IMG_2041.jpg", kind: "image", text }] });
console.log(`--- tutor (${res.status}) in ${((Date.now() - t) / 1000).toFixed(1)} s, state ${(res.body.engine as any)?.state} ---\n${(res.body.reply as any)?.message ?? JSON.stringify(res.body)}`);
