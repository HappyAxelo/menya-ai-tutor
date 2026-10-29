#!/usr/bin/env bash
#SBATCH --job-name=menya-llm
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --signal=B:USR1@600
# Partition, GPU, time, memory and log path come from start.sh (config.env).
#
# Menya AI model server for one Slurm job:
#   1. start vLLM on this GPU node (localhost only, API key required)
#   2. check it answers in the tutor's JSON format (self-test)
#   3. open a temporary HTTPS tunnel and register its address with Menya
#   4. heartbeat every 4 minutes; restart the tunnel if it drops
#   5. queue the next job, so the service keeps running across time limits
# Students never wait on a missing job: without a heartbeat for 10 minutes,
# Menya sends free-plan requests to Groq instead.
set -uo pipefail
cd "${SLURM_SUBMIT_DIR:-$(dirname "$0")}"
source config.env
if [ -n "${MODULES}" ]; then module load ${MODULES}; fi
export HF_HOME="$WORK_DIR/hf" HF_HUB_OFFLINE=1
LOG="$WORK_DIR/logs"; JOB="${SLURM_JOB_ID:-local}"
PORT=$((20000 + RANDOM % 20000))
log() { echo "[$(date '+%F %T')] $*"; }

VLLM_PID=""; TUNNEL_PID=""
cleanup() {
  log "stopping (time limit or cancel)"
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
  [ -n "$VLLM_PID" ] && kill "$VLLM_PID" 2>/dev/null
  wait 2>/dev/null
  exit 0
}
trap cleanup USR1 TERM INT

log "job $JOB on $(hostname): $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -1)"
log "starting vLLM: $MODEL on port $PORT"
"$WORK_DIR/venv/bin/vllm" serve "$MODEL" --host 127.0.0.1 --port "$PORT" --api-key "$VLLM_API_KEY" \
  --served-model-name "$MODEL" --max-model-len "$MAX_MODEL_LEN" --gpu-memory-utilization 0.90 \
  $VLLM_EXTRA_ARGS > "$LOG/vllm-$JOB.log" 2>&1 &
VLLM_PID=$!

# Wait up to 30 minutes for the model to load.
for _ in $(seq 1 180); do
  curl -fsS -m 5 -H "Authorization: Bearer $VLLM_API_KEY" "http://127.0.0.1:$PORT/v1/models" >/dev/null 2>&1 && break
  kill -0 "$VLLM_PID" 2>/dev/null || { log "vLLM exited; see $LOG/vllm-$JOB.log"; tail -n 30 "$LOG/vllm-$JOB.log"; exit 1; }
  sleep 10
done
curl -fsS -m 5 -H "Authorization: Bearer $VLLM_API_KEY" "http://127.0.0.1:$PORT/v1/models" >/dev/null || { log "vLLM did not become ready"; exit 1; }
log "vLLM ready"

# The tutor needs JSON in its schema; refuse to serve students if the model can't produce it.
if ! "$WORK_DIR/venv/bin/python" selftest.py "http://127.0.0.1:$PORT/v1" "$VLLM_API_KEY" "$MODEL" "${LOCAL_LLM_JSON_MODE:-json_schema}"; then
  log "self-test failed: not registering. Try LOCAL_LLM_JSON_MODE=json_object (docs/HPC.md) or another MODEL."
  cleanup
fi

# Only a job that works queues its successor (a broken setup doesn't loop forever).
if [ "${AUTO_RESUBMIT}" = "1" ] && [ -n "${SLURM_JOB_ID:-}" ]; then
  ACC=${SLURM_ACCOUNT:+--account=$SLURM_ACCOUNT}
  NEXT=$(sbatch --parsable $ACC --dependency=afterany:"$SLURM_JOB_ID" --partition="$SLURM_PARTITION" --gres="$SLURM_GRES" \
    --time="$SLURM_TIME" --mem="$SLURM_MEM" --cpus-per-task="$SLURM_CPUS" --output="$LOG/menya-llm-%j.out" menya-llm.sbatch) \
    && log "queued next job $NEXT (starts when this one ends)"
fi

TUNNEL_URL=""
start_tunnel() {
  : > "$LOG/tunnel-$JOB.log"
  "$WORK_DIR/bin/cloudflared" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" > "$LOG/tunnel-$JOB.log" 2>&1 &
  TUNNEL_PID=$!
  TUNNEL_URL=""
  for _ in $(seq 1 30); do
    TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG/tunnel-$JOB.log" | head -1)
    [ -n "$TUNNEL_URL" ] && break
    sleep 2
  done
  [ -n "$TUNNEL_URL" ] && log "tunnel: $TUNNEL_URL" || log "tunnel did not start; see $LOG/tunnel-$JOB.log"
}

register() {
  curl -fsS -m 15 -X POST "$MENYA_API_URL/hpc/register" -H "Authorization: Bearer $HPC_REGISTER_SECRET" \
    -H "Content-Type: application/json" -d "{\"url\":\"$TUNNEL_URL\",\"model\":\"$MODEL\",\"job\":\"$JOB\"}" >/dev/null
}

start_tunnel
while true; do
  if ! kill -0 "$VLLM_PID" 2>/dev/null; then log "vLLM stopped; ending job"; cleanup; fi
  if [ -z "$TUNNEL_URL" ] || ! kill -0 "$TUNNEL_PID" 2>/dev/null \
     || ! curl -fsS -m 10 -H "Authorization: Bearer $VLLM_API_KEY" "$TUNNEL_URL/v1/models" >/dev/null 2>&1; then
    log "tunnel down; restarting"
    [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
    start_tunnel
  fi
  if [ -n "$TUNNEL_URL" ]; then register && log "heartbeat ok" || log "could not reach Menya (will retry)"; fi
  sleep 240 &
  wait $!
done
