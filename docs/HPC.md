# Running the tutor model on a university Slurm cluster

Students keep using the same website. Free-plan tutor requests go to your own model on the
cluster; if no job is running (or it stops sending heartbeats for 10 minutes), Menya falls back
to Groq automatically, so students never see an outage.

```
student ──► Menya API (Supabase) ──► HPC job (vLLM on a GPU node) via a temporary HTTPS tunnel
                     │                       ▲  registers its address every 4 minutes
                     └──► Groq (fallback) ◄──┘  if the job is gone
```

## What you need

- An account on the cluster with access to a **GPU partition** (one 80 GB GPU for
  `openai/gpt-oss-120b`, or a 24–40 GB GPU for `openai/gpt-oss-20b`), and a project/account
  name if your cluster uses them. Ask HPC support: "Can a job run a web server on a GPU node for
  24 h and make **outbound** HTTPS connections?"
- ~150 GB of disk in a work/scratch area for the model weights (120b) or ~30 GB (20b).
- Two secrets you create (32+ characters each), e.g. `openssl rand -hex 24`:
  `HPC_REGISTER_SECRET` and `VLLM_API_KEY`.

## Step 1: Supabase secrets (once)

Supabase dashboard → Project → Edge Functions → Secrets, add:

| Name | Value |
|---|---|
| `HPC_REGISTER_SECRET` | the first secret |
| `LOCAL_LLM_API_KEY` | the second secret (same value as `VLLM_API_KEY` on the cluster) |
| `LOCAL_LLM_JSON_MODE` | `json_schema` (change to `json_object` only if the self-test fails) |

Then deploy the latest API function (it contains `/hpc/register`).

## Step 2: copy the kit to the cluster

From the deployment folder: copy the `hpc` folder to your home directory on the cluster
(WinSCP, MobaXterm, or `scp -r hpc you@cluster:~/menya-hpc-kit`).

```bash
cd ~/menya-hpc-kit
cp config.env.example config.env
nano config.env        # partition, GPU, account, model, the two secrets, MENYA_API_URL
bash setup.sh          # vLLM environment, cloudflared, model download (long, once)
bash check-network.sh  # both lines must say OK
bash start.sh          # submits the job
bash status.sh         # job state, address, latest log lines
```

A healthy log ends like:

```
vLLM ready
self-test reply in 3.1s: type=question finalAnswer='3 A'
SELF-TEST PASSED
queued next job 123457 (starts when this one ends)
tunnel: https://example-words.trycloudflare.com
heartbeat ok
```

In Menya's admin page → *Model providers*, `openai_compatible` turns green and the
`local_small` model shows your model name.

## Keeping it running

With `AUTO_RESUBMIT=1`, each job queues the next one (`--dependency=afterany`), so the service
continues past the time limit. Between jobs (queue wait + model loading) students are served
by Groq. Only a job whose self-test passed queues a successor, so a broken setup doesn't loop.

Stop everything: `bash stop.sh` (cancels jobs and tells Menya to stop routing to the HPC).

## Before students use it

1. Check quality: on your laptop, run the long conversation suite against the HPC model:
   ```bash
   cd supabase
   LOCAL_LLM_BASE_URL=https://<tunnel>/v1 LOCAL_LLM_API_KEY=<key> LOCAL_LLM_MODEL=<model> SUITE=core node dev/try-long-conversations.ts
   ```
   (or temporarily keep Groq for everyone by not starting the job).
2. Watch the admin dashboard's error rate and latency for the first days.

## If compute nodes are offline

Many clusters block outbound internet from compute nodes. Then the tunnel can't start
(`check-network.sh` says FAIL). Options, in order of preference:
1. Ask HPC support for an **approved reverse proxy / inference endpoint** for a GPU job.
2. Ask whether a specific outbound destination (Cloudflare tunnel, port 443) can be allowed.
3. Run the model on a GPU machine you control (same `vllm serve` command, a fixed address in the
   `LOCAL_LLM_BASE_URL` secret instead of registration).

Do not run the model server on a login node; it breaks the cluster's usage rules.

## Security

- vLLM listens on `127.0.0.1` only and requires `VLLM_API_KEY`; the tunnel is the only way in.
- The tunnel address is random and changes per job; only Menya's server knows it.
- Registration requires `HPC_REGISTER_SECRET`; student tokens can't register.
- `config.env` holds secrets: `chmod 600`, never commit it (it is git-ignored).
- No student data is stored on the cluster; vLLM keeps no logs of prompts by default.
