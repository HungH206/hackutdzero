# TODO

Claim a task by adding your name in brackets, e.g. `[Hung]`. Tick it only when it works. Priorities: **P0** = the demo cannot work without it, **P1** = strongly wanted, **P2** = nice to have. Final submission is **Sunday 12 PM**. Cut from the bottom if time is short.

Context: read `AGENTS.md` first, and `README.md` for the product and the HPI math.

- [x] [Codex] Include generated bindings in Vercel deployments and reject builds with missing bindings; production build verified locally, hosted redeploy pending

## Done
- [x] Idea locked: Headcount, "Everyone found."
- [x] HPI formula, escalation ladder, power-loss clock designed (see `README.md`)
- [x] Devpost draft submitted
- [x] Raspberry Pi 5 set up headless over SSH, camera detected
- [x] Agent context and this to-do list written (local; not yet pushed)

## Decisions still open
- [x] CBRE dashboard: **deprioritized** (decision: State Farm workflow first). Left as is, off by default in the launcher (`npm run dashboards -- --all`), no new work on it.
- [ ] Which HackUTD track: Best Hardware (lean) vs Best Design?
- [ ] Map location: fictional neighborhood vs synthetic points around a real area
- [ ] "Agent" role name: neutral "monitor" (lean) vs State Farm agent
- [ ] Confirm the team's beginner-track eligibility (needs 3 of 4 first-time hackers)

## P0: backend (SpacetimeDB)
- [x] [Codex] Publish Maincloud `rescuedb`, align monitor/CLI targets, and correct deployment documentation; 20/20 hosted live checks, 85/85 backend tests, monitor build pass
Built on branch `monitor-dashboard` in `/spacetimedb` and tested in the SDK's in-memory datastore. Published to Maincloud `rescuedb` on Nov 8, 2026. No `responder`/`assignment` tables yet; `heartbeat` lives on `node`.
- [ ] Reconcile the data model in `AGENTS.md` with the schema already started locally
- [x] [Avin] Tables: `building`, `household`, `node`, `heartbeat`, `reading_event`, `disaster`, `checkin`, `escalation`, `priority`, `responder`, `assignment`, `override_log`
- [x] [Avin] Reducers: `register_node`, `heartbeat`, `report_event`, `submit_checkin`
- [x] [Avin] `confirm_disaster`: confirm when 2+ nearby nodes report sustained shaking within about 10 s
- [x] [Avin] `recompute_hpi`: implement **exactly** the README formula, write score + factor breakdown + reason string to `priority`
- [x] Scheduled tick (every 5 s) that recomputes silence and advances escalation. Verified running on a local SpacetimeDB server.
- [x] [Avin] End states per household and an "accounted for" count
- [x] [Avin] `override_priority` with required reason, logged
- [x] [Avin] Unit checks: reproduce the three worked examples from the README (expected HPI 95.0, 38.8, 94.5)
- [x] [Codex] Publish to Maincloud `rescuedb`; monitor defaults to `wss://maincloud.spacetimedb.com`.
- [x] Local server: publish, `npm run generate`, and `npm run verify:live` (two client identities: sync and authorization) all work
- [ ] Drive the React dashboard in two real browser windows against the published module (the SDK path is verified; the browser UI has not been)

- [x] [Codex] Local database commands and monitor connection guide (`docs/RUN_LOCAL.md`); verified 40 households, HTTP 200, and connected-client promotion

## P0: stabilization (branch `stabilize-statefarm-scenario`)
- [x] HPI and escalation are computed only in server-side reducers (`recompute`, `advance`); the monitor only reads tables
- [x] Documented every HPI factor: meaning, weight, source, uncertainty, justification (`docs/HPI.md`)
- [x] Deterministic tests: scoring, overrides, communications outage, backup-power countdown, escalation timing, fast-forward equivalence
- [x] Missing sensor data never classifies anyone as injured (silence counts only after a confirmed event; offline-with-no-event says "verify")
- [x] Real nodes that stop sending are marked offline after 30 s (previously nothing ever marked a real node offline)
- [x] Overrides require a reason, a finite delta in [-30, +30], and write an audit row that survives `sim_reset`
- [x] Authorization: operator-only dispatcher reducers, per-household device binding, `tick` internal-only, input validation
- [x] End-to-end scenario: earthquake at Alder Court (`spacetimedb/test/alder-court.test.ts`, `docs/DEMO_SCENARIO.md`)
- [x] Persistent SIMULATION label in the monitor
- [x] Dashboard persists its SpacetimeDB token, so a browser keeps one identity across reloads (anonymous connections are issued a new identity every time, which silently undid dispatcher promotion)
- [x] `npm run promote` in `/monitor` makes connected browsers dispatchers; no 64-character identity to copy by hand
- [ ] Phone web app and wall screen must bind their device identity with `register_node` (operator provisioning) before they can answer check-ins
- [ ] Demo `sim_reset` also clears the timeline and re-seeds households; decide whether to keep a read-only history for judges

## P0: simulator and demo control
- [x] [Avin] Generate about 40 synthetic households with profiles (age, mobility, device and backup runtime, language, lives alone, infant)
- [x] [Avin] Hero cases: Mrs. Alvarez, healthy near the epicenter, fire unit, family with infant, non-English speaker
- [x] [Avin] Send heartbeats and check-ins like a real node; some residents answer OK, some HELP, some stay silent
- [x] [Avin] Demo control panel: trigger quake, fire, power loss; fast-forward time; reset
- [ ] Real nodes and simulated nodes must look identical to the server

## P0: monitor dashboard (`/monitor`)
- [ ] [Avin] Scaffold app and connect to SpacetimeDB with live subscriptions (app scaffolded and running on the local fallback; live connection untested until `spacetime generate`)
- [x] [Avin] Accounted-for counter ("N of M accounted for")
- [x] [Avin] Ranked queue showing score, plain-English reason, ladder step and countdown
- [x] [Avin] Live priority map: markers colored by HPI band, size by score, rank numbers on the top 10, final-state markers, "unknown" areas for no-sensor zones
- [x] [Avin] Offline fallback basemap (do not depend on internet tiles)
- [x] [Avin] Household card: factor breakdown (E, S, C, V, K), responder action, override with reason
- [x] [Avin] Hover and click linking between queue and map
- [x] [Avin] Event timeline and coverage (equity) meter
- [x] [Avin] Fire alerts for anomalous units (flame and temperature)
- [ ] [Aryan] Graphics revamp of every dashboard, one PR per screen (see `docs/GRAPHICS_HANDOFF.md`): main dashboard first (3D neighborhood model), then Houses, Overview, CBRE

## P1: wall screen and node firmware (`/firmware`)
- [ ] Read the M5GO over USB and confirm which sensors the kit has
- [ ] Heartbeat to the server over Wi-Fi
- [ ] Shake classifier: ignore a short bump, report sustained shaking
- [ ] Screen states: All clear, Are you OK?, alert. Buttons = OK / HELP, buzzer on alert
- [ ] `power_lost` reporting when running on battery
- [ ] Optional: extra ESP32 nodes with shock, PIR, flame, temperature sensors

## P1: phone web app (`/phone`)
- [ ] Mobile status page and big I'm OK / I need help buttons
- [ ] First answer (phone or wall screen) wins, and the other updates instantly
- [ ] Opens from a QR code so judges can play a household

## P1: CBRE dashboard (`/cbre`)
- [ ] Synthetic portfolio: mostly multifamily buildings, plus one office and one warehouse
- [ ] Building roll-up of the same events (units affected, status)
- [ ] Predicted operational failure, downtime hours, revenue at risk, repair cost (synthetic)
- [ ] Recommended action before disruption spreads
- [ ] Building-level map (pins sized by estimated dollar impact)

## P2: proof and polish
- [ ] "Found curve" simulation: first-come-first-served vs Headcount on the same synthetic disaster. Report only measured numbers, labeled as a simulation.
- [ ] Final README pass: update Status table, add real setup/run instructions, list exact hardware
- [ ] Rename `README.MD` to `README.md` on the remote so there is only one
- [ ] Devpost final edits (story, built-with, links, media, video)
- [ ] Demo script and rehearsal (3 runs)
- [ ] Submit before **Sunday 12 PM**, with the repo public and all four teammates listed

## Things to verify (do not assume)
- [ ] SpacetimeDB scheduled-reducer syntax and TypeScript client API
- [ ] How the M5GO exposes charging or battery state for `power_lost`
- [ ] Whether loaned hardware counts for the Best Hardware track
- [ ] That the demo network (phone hotspot) lets all devices reach the backend

- [x] [Codex] Implement independent Vercel Gemini draft endpoint; build and six mocked checks pass. Deployment and live API key verification pending.

- [x] [Codex] Replace restricted Gemini 2.5 draft default with latest Flash alias; normalize model names and expose sanitized provider errors. Live Vercel key verification pending.

- [x] [Codex] Diagnose Gemini transport errors: live test returned provider 503 high demand. Raised draft timeout to 45 s, Vercel duration to 60 s, separated timeout/transport/busy/quota messages; Photon token still missing.
