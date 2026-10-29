"""Checks the model server answers a tutoring request in Menya's JSON format.

    python selftest.py <base_url> <api_key> <model> [json_schema|json_object]

Exit code 0 = ready for students. Uses only the standard library.
"""
import json
import sys
import time
import urllib.request

base, key, model = sys.argv[1], sys.argv[2], sys.argv[3]
mode = sys.argv[4] if len(sys.argv) > 4 else "json_schema"

FIELDS = {
    "language": {"type": "string"}, "message": {"type": "string"},
    "type": {"type": "string", "enum": ["question", "affirmation", "hint", "redirect", "summary", "explanation", "worked_solution"]},
    "conceptsDetected": {"type": "array", "items": {"type": "string"}},
    "misconceptionDetected": {"anyOf": [{"type": "string"}, {"type": "null"}]},
    "hintLevel": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
    "progressSummary": {"anyOf": [{"type": "string"}, {"type": "null"}]},
    "solved": {"type": "boolean"}, "finalAnswer": {"type": "string"},
    "difficulty": {"type": "string", "enum": ["basic", "standard", "complex"]},
}
schema = {"type": "object", "properties": FIELDS, "required": list(FIELDS), "additionalProperties": False}
system = ("You are Menya, a Socratic tutor. Never give the final answer to a problem; ask one focused question. "
          "Reply with one JSON object with the fields: " + ", ".join(FIELDS) +
          ". finalAnswer is your private verified answer.")
body = {
    "model": model,
    "messages": [{"role": "system", "content": system},
                 {"role": "user", "content": "A 12 V battery is connected across a 4 ohm resistor. What current flows?"}],
    "max_completion_tokens": 1500, "temperature": 0.4,
    "response_format": {"type": "json_object"} if mode == "json_object"
    else {"type": "json_schema", "json_schema": {"name": "tutor_reply", "strict": False, "schema": schema}},
}
req = urllib.request.Request(f"{base}/chat/completions", data=json.dumps(body).encode(),
                             headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
started = time.time()
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    text = data["choices"][0]["message"]["content"] or ""
    reply = json.loads(text[text.find("{"): text.rfind("}") + 1])
except Exception as e:  # noqa: BLE001 - any failure means "not ready"
    print(f"SELF-TEST FAILED: {e}")
    sys.exit(1)

missing = [f for f in ("message", "type", "finalAnswer", "solved") if f not in reply]
leaks = "3 A" in reply.get("message", "") or "= 3" in reply.get("message", "")
print(f"self-test reply in {time.time() - started:.1f}s: type={reply.get('type')} finalAnswer={reply.get('finalAnswer')!r}")
print(f"  message: {reply.get('message', '')[:200]}")
if missing:
    print(f"SELF-TEST FAILED: missing fields {missing}")
    sys.exit(1)
if leaks:
    print("warning: the model gave the answer away; the server's answer guard will rewrite such replies")
print("SELF-TEST PASSED")
