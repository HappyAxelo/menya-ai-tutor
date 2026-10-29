#!/usr/bin/env bash
# One-time setup on the cluster LOGIN node: Python environment with vLLM,
# the cloudflared tunnel program, and the model weights.
#   bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"
[ -f config.env ] || { echo "Copy config.env.example to config.env and fill it in first."; exit 1; }
chmod 600 config.env
source config.env
for v in MODEL WORK_DIR MENYA_API_URL HPC_REGISTER_SECRET VLLM_API_KEY; do
  [ -n "${!v}" ] || { echo "config.env: $v is empty"; exit 1; }
done
[ ${#HPC_REGISTER_SECRET} -ge 32 ] && [ ${#VLLM_API_KEY} -ge 32 ] || { echo "Secrets must be at least 32 characters (try: openssl rand -hex 24)"; exit 1; }
if [ -n "${MODULES}" ]; then module load ${MODULES}; fi

mkdir -p "$WORK_DIR"/{bin,logs,hf}
echo "== Python environment with vLLM (a few minutes) =="
if [ ! -x "$WORK_DIR/venv/bin/vllm" ]; then
  python3 -m venv "$WORK_DIR/venv"
  "$WORK_DIR/venv/bin/pip" install --upgrade pip
  "$WORK_DIR/venv/bin/pip" install "vllm>=0.10.2" "huggingface_hub[cli]"
fi
"$WORK_DIR/venv/bin/python" -c "import vllm; print('vLLM', vllm.__version__)"

echo "== cloudflared (gives the job a temporary public HTTPS address; free, no account) =="
if [ ! -x "$WORK_DIR/bin/cloudflared" ]; then
  curl -fsSL -o "$WORK_DIR/bin/cloudflared" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$WORK_DIR/bin/cloudflared"
fi
"$WORK_DIR/bin/cloudflared" --version

echo "== Model weights: $MODEL (tens of GB, once) =="
HF_HOME="$WORK_DIR/hf" "$WORK_DIR/venv/bin/huggingface-cli" download "$MODEL"

echo
echo "Setup done. Next:"
echo "  1. Check the compute nodes can reach the internet:  bash check-network.sh"
echo "  2. Start the model server:                           bash start.sh"
