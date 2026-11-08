# Connect the Photon agent to the hosted monitor

The monitor is on Vercel; this Node process runs separately on a laptop/Pi or a host with a persistent private disk. No real messages are sent unless explicitly enabled.

## Prepare Maincloud

Run from the repository root, using the database owner's CLI login:

```bash
spacetime publish --server maincloud --module-path spacetimedb --delete-data=never rescuedb
cd photon-agent
npm ci
npm run setup:cloud
```

Publishing must include the agent tables (`accounting`, `help_task`, `headcount_summary`). The setup command checks for the summary table, creates a dedicated operator identity and private ADMIN_TOKEN, saves them in the gitignored `.env`, and disables messaging. It refuses to reuse a token targeting a different database. Keep this file private. Never put these secrets in `VITE_*` variables.

## Start a dry-run service

In `.env`, set `ADMIN_ORIGINS` to the exact HTTPS origin of your Vercel site, without a trailing slash. Keep `PHOTON_SEND_ENABLED=false`. `npm start` starts the process on 127.0.0.1:8787.

Use your HTTPS tunnel provider to forward to `http://127.0.0.1:8787`. For example, with cloudflared already installed:

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Set `VITE_AGENT_URL` on Vercel to the HTTPS agent/tunnel origin and redeploy. On the neighborhood agent screen, press **Connect Photon agent** and enter the ADMIN_TOKEN from your local `.env`. The token stays in that tab's session storage. For the agent's own admin page, Basic-auth username is `dispatcher`, password is ADMIN_TOKEN. Do not share either credential in screenshots or chat. A tunnel URL may change after restarting.

`/healthz` reports process liveness without credentials; `/api/status` and all admin actions require credentials when ADMIN_TOKEN is set. Confirm a 401 without authorization and successful connection with the token. No real phones are needed for this check.

## Separate hosted Node service

Use `photon-agent` as root directory, install with `npm ci`, and start with `npm start`. Configure the same secret environment values as `.env`, set `ADMIN_HOST=0.0.0.0`, and set STATE_FILE to a private mounted persistent disk location (e.g. `/data/state.json`). The service reads the platform's PORT. Run one replica: the event cursor, contact state and deduplication store are not designed for multiple replicas. Protect the disk and retain it across restarts. Only `/healthz` is a public health check. The current code needs a running Node process; it is not a drop-in Vercel Function.

## Messaging

Keep messaging disabled until a real-phone test is explicitly authorized. With messaging disabled, no Photon subscription, number assignment, outbound Photon message, or voice call is enabled. Chat testing uses the synthetic database and captures replies. A real-phone test requires a provisioned Photon line, explicit recipient authorization, and `PHOTON_SEND_ENABLED=true`; it is outside the dry-run hosting setup.
