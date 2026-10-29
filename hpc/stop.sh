#!/usr/bin/env bash
# Stop the model server and tell Menya to send everyone to Groq.
set -euo pipefail
cd "$(dirname "$0")"; source config.env
scancel -u "$USER" -n menya-llm || true
curl -fsS -X POST "$MENYA_API_URL/hpc/unregister" -H "Authorization: Bearer $HPC_REGISTER_SECRET" && echo " (Menya: HPC route switched off)"
