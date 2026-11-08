# TODO

Claim a task by adding your name in brackets, e.g. `[Hung]`. Tick it only when it works. Priorities: **P0** = the demo cannot work without it, **P1** = strongly wanted, **P2** = nice to have. Final submission is **Sunday 12 PM**. Cut from the bottom if time is short.

Context: read `AGENTS.md` first, and `README.md` for the product and the HPI math.

## Done
- [x] Idea locked: Headcount, "Everyone found."
- [x] HPI formula, escalation ladder, power-loss clock designed (see `README.md`)
- [x] Devpost draft submitted
- [x] Raspberry Pi 5 set up headless over SSH, camera detected
- [x] Agent context and this to-do list written (local; not yet pushed)

## Decisions still open
- [ ] Include the CBRE dashboard, or cut it? (Lean: include a thinner version only after the monitor dashboard works)
- [ ] Which HackUTD track: Best Hardware (lean) vs Best Design?
- [ ] Map location: fictional neighborhood vs synthetic points around a real area
- [ ] "Agent" role name: neutral "monitor" (lean) vs State Farm agent
- [ ] Confirm the team's beginner-track eligibility (needs 3 of 4 first-time hackers)

## P0: backend (SpacetimeDB)
Built on branch `monitor-dashboard` in `/spacetimedb` and tested in the SDK's in-memory datastore. Not yet published to a real server. No `responder`/`assignment` tables yet; `heartbeat` lives on `node`.
- [ ] Reconcile the data model in `AGENTS.md` with the schema already started locally
- [x] [Avin] Tables: `building`, `household`, `node`, `heartbeat`, `reading_event`, `disaster`, `checkin`, `escalation`, `priority`, `responder`, `assignment`, `override_log`
- [x] [Avin] Reducers: `register_node`, `heartbeat`, `report_event`, `submit_checkin`
- [x] [Avin] `confirm_disaster`: confirm when 2+ nearby nodes report sustained shaking within about 10 s
- [x] [Avin] `recompute_hpi`: implement **exactly** the README formula, write score + factor breakdown + reason string to `priority`
- [ ] Scheduled tick (about every 5 s) that recomputes silence and advances escalation (verify scheduling syntax in the docs)
- [x] [Avin] End states per household and an "accounted for" count
- [x] [Avin] `override_priority` with required reason, logged
- [x] [Avin] Unit checks: reproduce the three worked examples from the README (expected HPI 95.0, 38.8, 94.5)
- [ ] Publish the module and share how to connect (host/db name, no secrets in the repo)
- [ ] Install the SpacetimeDB CLI, `spacetime start`, publish, `npm run generate` in /monitor, test the live path

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
