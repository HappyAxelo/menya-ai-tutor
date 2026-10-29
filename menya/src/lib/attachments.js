// Read an attached file into text the tutor can work with.
//   PDF                      -> text with pdf.js; scanned pages -> the image reader
//   Word / PowerPoint / Excel -> text from the file's XML (they are zip archives)
//   text, code, CSV, JSON, notebooks -> as text
//   images (photos, scans, screenshots) -> the server's image reader (copies out the problem)
//   audio                    -> the server's transcription
// Documents never leave the browser; only images and audio are uploaded.

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TEXT = 20000;

const CODE_EXT = /\.(py|js|mjs|ts|jsx|tsx|java|c|h|cpp|hpp|cc|cs|go|rs|rb|php|swift|kt|m|r|jl|sql|sh|bat|ps1|asm|s|v|sv|vhd|vhdl|ino|lua|scala|hs|pl|f90|f|mat)$/i;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|tex|bib|log|yaml|yml|ini|cfg|toml|srt|rtf)$/i;

export function attachmentKind(file) {
  const name = file.name ?? "", type = file.type ?? "";
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (/\.docx$/i.test(name)) return "document";
  if (/\.pptx$/i.test(name)) return "slides";
  if (/\.xlsx$/i.test(name)) return "spreadsheet";
  if (/\.ipynb$/i.test(name)) return "code";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(name)) return "image";
  if (type.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|oga|opus|webm|flac|aac)$/i.test(name)) return "audio";
  if (type.startsWith("video/") || /\.(mp4|mov|avi|mkv)$/i.test(name)) return "video";
  if (/\.(doc|ppt|xls)$/i.test(name)) return "legacy-office";
  if (CODE_EXT.test(name)) return "code";
  if (type.startsWith("text/") || TEXT_EXT.test(name) || type === "application/json") return "text";
  return "unknown";
}

// ---------------- zip (Office files) ----------------
// Minimal reader: the central directory, then each wanted entry (stored or deflated).
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(buffer, wanted = () => true) {
  const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("not_a_zip");
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const files = {}, dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true), size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true), extra = view.getUint16(p + 30, true), comment = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    files[name] = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
  }
  return files;
}

const xmlText = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");
const utf8 = (b) => new TextDecoder().decode(b);
const byNumber = (a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0);

// Word: paragraphs from <w:p>, text runs <w:t>, tabs and breaks, and equation text <m:t>.
export function docxText(xml) {
  return xml.split(/<\/w:p>/).map(par => {
    let out = "";
    for (const m of par.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<m:t(?:\s[^>]*)?>([^<]*)<\/m:t>|<w:tab\/>|<w:br\/>/g)) {
      out += m[0] === "<w:tab/>" ? "\t" : m[0] === "<w:br/>" ? "\n" : xmlText(m[1] ?? m[2] ?? "");
    }
    return out;
  }).filter(l => l.trim()).join("\n");
}

// PowerPoint: the text of each slide, in order.
export function slideText(xml) {
  return xml.split(/<\/a:p>/).map(par => [...par.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => xmlText(m[1])).join("")).filter(l => l.trim()).join("\n");
}

// Excel: each sheet's rows, cells separated by " | " (shared strings, inline strings, numbers).
export function sheetText(xml, shared) {
  return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(row => [...row[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(c => {
    const attrs = c[1], body = c[2] ?? "";
    const v = /<v>([^<]*)<\/v>/.exec(body)?.[1];
    if (/t="s"/.test(attrs)) return shared[Number(v)] ?? "";
    if (/t="inlineStr"/.test(attrs)) return [...body.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => xmlText(m[1])).join("");
    return v != null ? xmlText(v) : "";
  }).join(" | ").replace(/( \| )+$/, "")).filter(r => r.replace(/[ |]/g, "")).join("\n");
}

export async function officeText(buffer, kind) {
  if (kind === "document") {
    const f = await unzip(buffer, n => n === "word/document.xml");
    if (!f["word/document.xml"]) throw new Error("unreadable");
    return docxText(utf8(f["word/document.xml"]));
  }
  if (kind === "slides") {
    const f = await unzip(buffer, n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    return Object.keys(f).sort(byNumber).map((n, i) => `Slide ${i + 1}:\n${slideText(utf8(f[n]))}`).join("\n\n");
  }
  const f = await unzip(buffer, n => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared = f["xl/sharedStrings.xml"]
    ? [...utf8(f["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(si => [...si[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => xmlText(m[1])).join(""))
    : [];
  return Object.keys(f).filter(n => n.includes("worksheets")).sort(byNumber)
    .map((n, i) => `Sheet ${i + 1}:\n${sheetText(utf8(f[n]), shared)}`).join("\n\n");
}

// Jupyter notebooks: the cells' source, code cells fenced.
export function notebookText(json) {
  const nb = JSON.parse(json);
  return (nb.cells ?? []).map(c => {
    const src = Array.isArray(c.source) ? c.source.join("") : String(c.source ?? "");
    return c.cell_type === "code" ? "```python\n" + src + "\n```" : src;
  }).join("\n\n");
}

// ---------------- images ----------------
// Shrink photos before upload (phones take 12 MP pictures); keeps text readable.
async function prepareImage(file, maxSide = 1800) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024 && /image\/(png|jpeg|webp)/.test(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.88));
  } catch {
    return file;      // the browser can't decode it here; let the server try
  }
}

// ---------------- PDF ----------------
let pdfjs = null;
async function loadPdf() {
  if (!pdfjs) {
    pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  return pdfjs;
}

async function pdfText(file, readImage) {
  const lib = await loadPdf();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = "", out = "", lastY = null;
    for (const item of content.items) {
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { out += line.trimEnd() + "\n"; line = ""; }
      line += item.str + (item.hasEOL ? "\n" : "");
      lastY = y;
    }
    pages.push((out + line).trim());
  }
  const text = pages.map((t, i) => (doc.numPages > 1 ? `Page ${i + 1}:\n${t}` : t)).join("\n\n");
  if (text.replace(/\s|Page \d+:/g, "").length >= 40) return text;
  // A scan: render the first pages and read them like photos.
  const read = [];
  for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
    read.push(`Page ${i}:\n${await readImage(blob)}`);
  }
  return read.join("\n\n");
}

// ---------------- entry point ----------------
// services: { readImage(blob) -> text, transcribe(blob) -> text }
// Returns { name, kind, text } or throws Error with .code (unsupported, too_large, empty, ...).
export async function readAttachment(file, services) {
  const fail = (code) => Object.assign(new Error(code), { code });
  if (file.size > MAX_FILE_BYTES) throw fail("too_large");
  const kind = attachmentKind(file);
  let text;
  switch (kind) {
    case "pdf": text = await pdfText(file, services.readImage); break;
    case "document": case "slides": case "spreadsheet": text = await officeText(await file.arrayBuffer(), kind); break;
    case "image": text = await services.readImage(await prepareImage(file)); break;
    case "audio": text = await services.transcribe(file); break;
    case "code": text = /\.ipynb$/i.test(file.name) ? notebookText(await file.text()) : await file.text(); break;
    case "text": text = await file.text(); break;
    case "video": throw fail("video");
    case "legacy-office": throw fail("legacy_office");
    default: {
      // Unknown type: accept it if it is really text.
      const t = await file.slice(0, 200000).text();
      if (!t || /[\u0000-\u0008\u000E-\u001F]/.test(t.slice(0, 2000))) throw fail("unsupported");
      text = t;
    }
  }
  text = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) throw fail("empty");
  return { name: file.name || "file", kind: kind === "unknown" ? "text" : kind, text: text.slice(0, MAX_TEXT) };
}
