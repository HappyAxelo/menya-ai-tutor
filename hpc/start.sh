#!/usr/bin/env bash
# Submit the model-server job. With AUTO_RESUBMIT=1 each job queues the next.
set -euo pipefail
cd "$(dirname "$0")"; source config.env
if squeue -h -u "$USER" -n menya-llm | grep -q .; then echo "A menya-llm job is already queued or running:"; squeue -u "$USER" -n menya-llm; exit 0; fi
mkdir -p "$WORK_DIR/logs"
ACC=${SLURM_ACCOUNT:+--account=$SLURM_ACCOUNT}
sbatch $ACC --partition="$SLURM_PARTITION" --gres="$SLURM_GRES" --time="$SLURM_TIME" --mem="$SLURM_MEM" \
  --cpus-per-task="$SLURM_CPUS" --output="$WORK_DIR/logs/menya-llm-%j.out" menya-llm.sbatch
echo "Submitted. Watch it with: bash status.sh"
