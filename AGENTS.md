# AGENTS.md: context for AI coding agents

You are helping build **Headcount**, a HackUTD 2026 hackathon project. Read this file first, then `README.md` (the product and the math) and `TODO.md` (the work list). This file is for Claude Code, Codex, Cursor, Copilot, or any other agent, so keep it accurate and update it when facts change.

## One-paragraph summary
Headcount is a plug-in home sensor plus a live dispatch system for disaster response. After a disaster it keeps a running count of who has been **found**, ranks every household by need with the **Headcount Priority Index (HPI)**, and escalates cheapest-first until no one is left unaccounted for. Tagline: **"Everyone found."** The core idea: **silence is a signal**.

## Deadlines (Central Time)
- Hacking started Sat Nov 7, 12 PM. Devpost **draft** (due Sat 11 PM) is already submitted.
- **Final submission: Sun Nov 8, 12 PM (noon).** Judging: Sun 1-4 PM.
- Anything not working by roughly 10 AM Sunday should be cut. Prefer a smaller thing that works over a bigger thing that doesn't.

## Challenges and tracks
- **State Farm** (primary): "The Worst Day, at Scale: Intelligent Catastrophe Response." Identify those with the most urgent needs, coordinate assistance, ensure no one is overlooked.
- **SpacetimeDB** (main track): Spacetime must power the app's primary functionality. Public GitHub source required to win.
- **CBRE** (third, **deprioritized**): connect fragmented real estate data to predict operational failures, quantify business impact, or act before disruptions spread. What exists is left as is. Do not expand it or add features to it until the State Farm workflow (disaster to welfare check) is solid. It is not part of the primary demo.
- HackUTD track: Best Hardware (to be confirmed). Max 3 sponsor challenges and 1 HackUTD track.

## Team
Avin (pitching, hardware, Raspberry Pi), Hung (SpacetimeDB backend), Aryan, Aahan. Roles beyond that are not fixed here. Check `TODO.md` for who has claimed what, and claim a task by writing your name next to it before starting.

## Hard rules (do not break these)
1. **Synthetic data only.** No real people, real addresses, or real customer data. Label simulated things as simulated.
2. **Never contact real emergency services.** The 911 hand-off is a **simulated** feed. Do not add code that calls, texts, or emails real people or services.
3. **Need-based ranking only.** Never use income, race, immigration status, or insurance policy value as an input. Every score must show its reason. Humans can override, and overrides are logged.
4. **One source of truth for priority.** HPI is computed **only** in the SpacetimeDB `recompute_hpi` reducer. Dashboards, the map, the wall screen and the phone app only **read** the `priority` table. Do not re-implement scoring in a client.
4a. **Silence is never an injury.** Missing data raises a household for human verification; it never sets a final state or says someone is hurt. Silence counts only after a confirmed event. See `docs/HPI.md`.
4b. **Every state-changing reducer is authorized.** Dispatcher actions (`override_priority`, `set_final_state`, `register_node`, `recompute_hpi`, every `sim_*`) require an operator. Household check-ins, heartbeats and events require that household's registered device or an operator. New reducers must follow the same pattern (`requireOperator` / `requireHouseholdAccess` in `spacetimedb/src/index.ts`) and get an authorization test in `spacetimedb/test/auth.test.ts`.
5. **The math lives in `README.md`** (section "Headcount Priority Index"). If you change the formula, change the README in the same commit.
6. **No secrets in the repo.** It is public. No API keys, Wi-Fi passwords, tokens, or `.env` files. Use `.env.example` with placeholder values.
7. **Be honest in docs.** Update the Status table in `README.md` to say what is actually built. Do not describe planned features as working.
8. **Do not push to `main` without telling the team.** Work on a branch and open a PR, or ask first. (Hung's SpacetimeDB work is on or near the `spaceandtime` branch.)

## Product spec (summary; full detail in README.md)
- **End states** per household: Found OK, Found needs help, Assisted, Unresolved. Headline UI number: "N of M accounted for."
- **False-alarm filter:** a short spike is ignored. Shaking is **confirmed** only when 2+ nearby nodes report sustained shaking within about 10 seconds.
- **Silence:** minutes since last heartbeat or check-in after an event. Special cases: abrupt heartbeat loss (+), motion sensor activity (discount), area-wide silence with no shaking = communications outage (discount).
- **Check-in:** node prompts "Are you OK?" and the resident presses OK or HELP. States: OK, pending, no response, help.
- **Power-loss clock:** a node on battery reports `power_lost`. For households with powered medical equipment, time-to-harm = backup runtime minus minutes since power loss, which feeds the clock term K.
- **Escalation ladder:** (1) automated check-in, (2) emergency contact, (3) neighbor/volunteer knock, (4) responder dispatch to the simulated 911 feed. Waits shrink as HPI grows.
- **Hazards:** quake (shock/motion) and fire (flame + temperature). There is no smoke sensor.

## The four surfaces (all read the same SpacetimeDB data)
1. **Monitor dashboard** (laptop): accounted-for counter, live priority map, ranked queue with reasons, household card, ladder step and countdown, equity/coverage meter, event timeline.
2. **In-house wall screen** (M5Stack M5GO as a thermostat-like panel): home status, big OK / HELP buttons, buzzer, alerts.
3. **Phone web app** (mobile web page, not a native app): status, notifications, remote check-in.
4. **CBRE operations dashboard** (laptop): building-level roll-up of the same events, with synthetic property, tenant, revenue and maintenance data. Shows predicted failures, downtime, revenue at risk, recommended actions.

Also needed for the demo: a **demo control panel** (trigger quake / fire / power loss, fast-forward time, reset) and a **simulator** that plays ~40 synthetic households, including hero cases (Mrs. Alvarez, a healthy person near the epicenter, a fire unit, a family with an infant, a non-English speaker).

**Bridge between State Farm and CBRE:** buildings contain units. A unit is a household. The monitor view is per unit and per person. The CBRE view rolls the same events up to the building with dollars attached. Core portfolio is multifamily apartments, with one office and one warehouse added as extra rows.

## Built so far (branch `monitor-dashboard`)
- `/spacetimedb`: SpacetimeDB 2.x TypeScript module. Tables: `clock`, `building`, `household`, `node`, `reading_event`, `disaster`, `checkin`, `escalation`, `priority`, `override_log`, `timeline`, `tick_schedule`. The HPI math is in `src/hpi.ts` and is called only from `recompute_hpi`. Demo simulation is done by `sim_*` reducers plus a 5 s scheduled `tick`. Test with `npm test`, which runs in the SDK's in-memory datastore.
- `/monitor`: Vite + React dashboard. `npm run dev:local` runs the module in-process (no server). `npm run dev` connects to a published module after `npm run generate`.
  Screens: network graph, operations overview, houses, building view, live map, analytics, event log, plus the CBRE view (`?app=cbre`). `npm run dashboards` serves each on its own localhost port (5180-5186), all sharing one backend.
  **Graphics revamp handoff:** `docs/GRAPHICS_HANDOFF.md` (data contract, per-screen requirements, design references, what not to touch).
- Not yet done: publishing to a real SpacetimeDB server, reconciling with Hung's schema, responders/assignments.

## Proposed data model (a proposal: reconcile with Hung's actual schema before relying on it)
- Tables: `building`, `household` (profile and location), `node`, `heartbeat`, `reading_event`, `disaster`, `checkin`, `escalation`, `priority` (HPI, factor breakdown, reason), `responder`, `assignment`, `override_log`.
- Reducers: `register_node`, `heartbeat`, `report_event`, `confirm_disaster`, `submit_checkin`, `recompute_hpi`, `advance_escalation` (scheduled), `assign_responder`, `override_priority`, plus demo-only `sim_*` reducers.
- **What is actually built** (`spacetimedb/src/index.ts`; the list above is the original proposal and the schema is now frozen unless a needed relationship is missing): tables `clock`, `building`, `household`, `node`, `reading_event`, `disaster`, `checkin`, `escalation`, `priority`, `override_log`, `timeline`, `tick_schedule`, plus **private** `operator` and `node_owner`. Reducers `register_node` (operator provisioning), `add_operator`, `remove_operator`, `heartbeat`, `report_event`, `submit_checkin`, `recompute_hpi`, `override_priority`, `set_final_state`, scheduled `tick`, and `sim_quake`, `sim_fire`, `sim_power_loss`, `sim_comms_outage`, `sim_fast_forward`, `sim_reset`. There are no `responder` or `assignment` tables.

## Suggested tech (confirm versions in each tool's docs before using)
- Backend: **SpacetimeDB**, TypeScript module. Verify scheduled-reducer syntax and the HTTP/SDK API in the official docs.
- Dashboards and phone web app: Vite + React + TypeScript, with the SpacetimeDB TypeScript client for live subscriptions.
- Map: MapLibre GL JS (or Leaflet) with an **offline fallback basemap**. Do not depend on internet tile servers during the demo.
- Wall screen / node firmware: M5GO (ESP32) via PlatformIO or Arduino with the M5Stack libraries. Confirm which sensors the kit has by reading the device.
- Simulator: a Node/TypeScript script that calls reducers.

## Planned repo layout
```
/spacetimedb   SpacetimeDB module: tables, reducers, recompute_hpi
/monitor       monitor dashboard (React)
/phone         phone web app
/cbre          CBRE dashboard
/firmware      M5GO wall-screen node
/simulator     synthetic households and scenarios
/docs          notes, demo script
README.md  AGENTS.md  TODO.md
```
This is a plan. Create folders as they are needed and keep the layout consistent.

## Environment notes
- A Raspberry Pi 5 named `hackpi` is set up headless (Raspberry Pi OS Lite, 64-bit) with a Pi Camera Module 3. It is reached over SSH on the team's phone hotspot (`ssh hackpi` using key auth). Credentials are not stored in this repo. The hotspot is IPv6-only, so the Pi is configured to prefer IPv4.
- Venue Wi-Fi may block device-to-device traffic. Plan the demo on a phone hotspot and a hosted backend or a local server both reachable on that network.
- Spare hardware: Raspberry Pi 3, 5x ESP32, M5Stack M5GO kit, DRV2605L haptic driver, servos, Nintendo Switch Joy-Cons. Loaner sensors may be available at the event (shock/vibration, PIR, flame, temperature, buttons, buzzers).

## Verifying your change
- `cd spacetimedb && npm run typecheck && npm test` (85 tests, in-memory datastore). Never read `h.db` inside `withReducerTx` in a test: it traps the harness.
- `cd monitor && npm run typecheck && npm run build`.
- Against a real server: `spacetime publish --server local --module-path spacetimedb headcount` (always pass `--server local`; the default server may be hosted, and run it from this repo so the CLI does not read another project's `spacetime.json`), `npm run generate`, then `npm run verify:live` in `/monitor`.
- A browser is read-only until promoted: `npm run promote` in `/monitor`. The dashboard persists its SpacetimeDB token in `localStorage`, so an identity survives reloads; anonymous connections are issued a new identity every time, so do not remove that.
- Details and the demo script: `docs/HPI.md`, `docs/DEMO_SCENARIO.md`.

## How to work in this repo
1. Read `TODO.md`, pick an unclaimed item, write your name next to it.
2. Make small, focused commits on a branch.
3. Run and verify your change before saying it is done. Do not report success on something you did not run.
4. Update `TODO.md` and the README Status table when you finish.
5. If something here is wrong or stale, fix this file.
