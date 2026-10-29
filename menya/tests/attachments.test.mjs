import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachmentKind, officeText, notebookText, readAttachment } from "../src/lib/attachments.js";

const fixture = (name) => { const b = readFileSync(new URL(`./fixtures/${name}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const file = (name, body, type = "") => Object.assign(new Blob([body], { type }), { name });
const services = { readImage: async () => "IMAGE TEXT", transcribe: async () => "VOICE TEXT" };

test("files are recognised by type and name", () => {
  const k = (name, type) => attachmentKind({ name, type });
  assert.equal(k("hw.pdf", "application/pdf"), "pdf");
  assert.equal(k("Lab report.docx"), "document");
  assert.equal(k("week3.pptx"), "slides");
  assert.equal(k("marks.xlsx"), "spreadsheet");
  assert.equal(k("IMG_2041.HEIC", ""), "image");
  assert.equal(k("photo", "image/jpeg"), "image");
  assert.equal(k("question.m4a", ""), "audio");
  assert.equal(k("main.py"), "code");
  assert.equal(k("adder.vhd"), "code");
  assert.equal(k("data.csv"), "text");
  assert.equal(k("old.doc"), "legacy-office");
  assert.equal(k("clip.mp4", "video/mp4"), "video");
});

test("Word, PowerPoint and Excel files are read from their (compressed) XML", async () => {
  const doc = await officeText(fixture("homework.docx"), "document");
  assert.equal(doc, "Question 2 & 3\nA 12 V source drives R1 = 4 Ω\t(series)\nx²+1");
  const slides = await officeText(fixture("lecture.pptx"), "slides");
  assert.equal(slides, "Slide 1:\nOhm's law\nV = I·R\n\nSlide 2:\nKirchhoff's laws\n\nSlide 3:\nSummary", "slides in numeric order (10 after 2)");
  const sheet = await officeText(fixture("marks.xlsx"), "spreadsheet");
  assert.equal(sheet, "Sheet 1:\nResistor | Ohms\nR1 | 4.7\nR2 | 10");
});

test("notebooks, text and code are read; unknown binary files are refused", async () => {
  const nb = JSON.stringify({ cells: [{ cell_type: "markdown", source: ["# Loop\n"] }, { cell_type: "code", source: ["for i in range(3):\n", "    print(i)"] }] });
  assert.equal(notebookText(nb), "# Loop\n\n\n```python\nfor i in range(3):\n    print(i)\n```");
  assert.deepEqual(await readAttachment(file("main.py", "print(1)\r\n"), services), { name: "main.py", kind: "code", text: "print(1)" });
  assert.equal((await readAttachment(file("photo.jpg", new Uint8Array([1, 2]), "image/jpeg"), { ...services, readImage: async b => `read ${b.size} bytes` })).text, "read 2 bytes");
  assert.equal((await readAttachment(file("q.m4a", new Uint8Array([1]), "audio/mp4"), services)).text, "VOICE TEXT");
  await assert.rejects(readAttachment(file("blob.bin", new Uint8Array([0, 1, 2, 0, 5, 0, 0, 3])), services), { code: "unsupported" });
  await assert.rejects(readAttachment(file("clip.mp4", new Uint8Array([1]), "video/mp4"), services), { code: "video" });
  await assert.rejects(readAttachment(file("empty.txt", "   "), services), { code: "empty" });
});
