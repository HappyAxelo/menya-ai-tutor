#!/usr/bin/env bash
# Runs a 2-minute job to check that compute nodes can make outbound HTTPS
# connections (needed for the tunnel and for registering with Menya).
set -euo pipefail
cd "$(dirname "$0")"; source config.env
ACC=${SLURM_ACCOUNT:+--account=$SLURM_ACCOUNT}
srun $ACC --partition="$SLURM_PARTITION" --time=00:02:00 --mem=1G bash -c '
  echo "node: $(hostname)"
  curl -fsS -m 10 -o /dev/null https://www.cloudflare.com && echo "OK   cloudflare.com reachable" || echo "FAIL cloudflare.com not reachable"
  curl -fsS -m 10 -o /dev/null "'"$MENYA_API_URL"'/health" && echo "OK   Menya API reachable" || echo "FAIL Menya API not reachable"'
echo "If either line says FAIL, compute nodes have no outbound internet: see docs/HPC.md, 'If compute nodes are offline'."
