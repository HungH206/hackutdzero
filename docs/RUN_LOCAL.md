# Run Headcount with the local database

All data is synthetic. These commands use the real local SpacetimeDB server, with persistence and subscriptions shared across browser windows.

## First setup

Install the SpacetimeDB CLI, then install dependencies:

```bash
cd /Volumes/dedicated/hackutdzero/spacetimedb
npm ci
cd ../monitor
npm ci
```

## Start the database

In terminal 1:

```bash
cd /Volumes/dedicated/hackutdzero/monitor
npm run db:start
```

Keep it running. If port 3000 is already in use, check `npm run db:status:local` before starting another server.

In terminal 2, publish on first setup or after changing the module, then generate bindings:

```bash
cd /Volumes/dedicated/hackutdzero/monitor
npm run db:publish:local
npm run generate
npm run db:status:local
npm run dev
```

`db:publish:local` explicitly targets server `local`, database `headcount`, and refuses data deletion. Do not add a delete-data flag to bypass a schema conflict without deciding what to preserve.

Open the Local URL Vite prints (usually http://localhost:5173). The defaults now connect to Maincloud `rescuedb`. For this local workflow, create `monitor/.env.local` with `VITE_SPACETIME_URI=ws://localhost:3000` and `VITE_SPACETIME_DB=headcount`, then restart Vite. Promotion and verification read the same environment. Remove these overrides to return to Maincloud.

## Enable simulation controls

With the dashboard open, in terminal 3:

```bash
cd /Volumes/dedicated/hackutdzero/monitor
npm run promote -- --list
npm run promote
```

Promotion grants dispatcher access to every currently connected identity on the local database. Reload the dashboard afterward. For just one identity, use the Copy command button in New Simulation. Tokens persist in browser localStorage; clearing browser data or changing browser origins can require promotion again.

Use the New Simulation panel to trigger the synthetic scenario. Open another browser window to the same URL and confirm changes appear in both. A second browser profile needs its own promotion to operate controls.

## Everyday restart

Start the database with `npm run db:start` if needed, check `npm run db:status:local`, then run `npm run dev`. Publishing and generating are needed when setting up or changing the backend, not every restart. Keep the server data directory; do not reset it between runs if you want to preserve state.

## Troubleshooting

- Connection refused: ensure the database is listening on port 3000 and the monitor points to that server.
- Database not found: run `npm run db:publish:local` here; commands from `rescuegrid-test` can pick up its different configuration.
- Unauthorized controls: open the dashboard, run `npm run promote`, then reload.
- Local fallback label: restart with `npm run dev`. `npm run dev:local` uses an in-process fallback with no database persistence or shared browser state.
- Monitor on a different device: localhost means that device. Configure `VITE_SPACETIME_URI` with the database computer's reachable LAN address and restart Vite.

## Verification

`npm run db:status:local` reads the household count without changing data. `npm run promote -- --list` lists connected clients and dispatchers. `npm run verify:live` exercises subscriptions and authorization but **resets simulation state**; use it only when you are ready to restart the demo.

Verified during this setup: database query returned 40 households, monitor returned HTTP 200, and three connected identities were promoted. Visual interaction in two real browser windows remains a manual check.
