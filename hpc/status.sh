#!/usr/bin/env bash
# Job state, the public address, and the latest log lines.
cd "$(dirname "$0")"; source config.env
squeue -u "$USER" -n menya-llm -o "%.10i %.9T %.10M %.10l %R"
LATEST=$(ls -t "$WORK_DIR"/logs/menya-llm-*.out 2>/dev/null | head -1)
[ -n "$LATEST" ] && { echo "--- $LATEST"; tail -n 15 "$LATEST"; }
curl -fsS "$MENYA_API_URL/health" && echo
