// Voice input. Two engines:
//  - recordVoice(): records with the microphone (noise suppression, echo
//    cancellation) and returns an audio file for the server's Whisper
//    transcription. Works in every modern browser, including iPhone Safari.
//  - browserDictation(): the browser's own speech recognition, used for
//    Kinyarwanda (Whisper doesn't support it) when the browser offers it.

export const MAX_SECONDS = 180;

export const voiceSupported = () =>
  typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

const SpeechRecognitionImpl = () => (typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null);
export const dictationSupported = () => Boolean(SpeechRecognitionImpl());

function pickMimeType() {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

// Starts recording. Returns { stop(): Promise<Blob>, cancel() }. onLevel(0..1) ~20x a second.
export async function recordVoice({ onLevel, onTick, onAutoStop } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48000 } : undefined);
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };

  // Level meter
  let ctx = null, raf = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) ** 2;
      onLevel?.(Math.min(1, Math.sqrt(sum / data.length) / 40));
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch { /* the meter is optional */ }

  const started = Date.now();
  const timer = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    onTick?.(s);
    if (s >= MAX_SECONDS) onAutoStop?.();
  }, 250);

  const cleanup = () => {
    clearInterval(timer);
    if (raf) cancelAnimationFrame(raf);
    ctx?.close().catch(() => {});
    stream.getTracks().forEach(t => t.stop());
  };
  recorder.start(1000);
  return {
    stop: () => new Promise((resolve) => {
      recorder.onstop = () => { cleanup(); resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" })); };
      recorder.stop();
    }),
    cancel: () => { recorder.onstop = cleanup; try { recorder.stop(); } catch { cleanup(); } },
  };
}

// Live dictation with the browser's recogniser. onText(finalText, interimText).
export function browserDictation(lang, { onText, onEnd, onError }) {
  const Impl = SpeechRecognitionImpl();
  const rec = new Impl();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
      else interim += e.results[i][0].transcript;
    }
    onText?.(finalText.trim(), interim);
  };
  rec.onerror = (e) => onError?.(e.error);
  rec.onend = () => onEnd?.(finalText.trim());
  rec.start();
  return { stop: () => rec.stop(), cancel: () => rec.abort() };
}
