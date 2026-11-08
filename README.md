# Headcount

**Everyone found.**

Headcount is a plug-in home sensor and a live dispatch board for the worst day. After a disaster, it keeps a running count of who has been accounted for, ranks everyone else by need, and keeps going, cheapest step first, until no one is left.

Built for HackUTD 2026. State Farm challenge: *The Worst Day, at Scale: Intelligent Catastrophe Response.*

> **Status: hackathon prototype.** Not a certified life-safety device. All data is synthetic. The 911 hand-off is simulated, and no real emergency service is ever contacted. See [Status](#status) for what is built and what is planned.

---

## The problem

When a major disaster affects thousands of people at once, help flows to whoever can call loudest. The people most at risk are often the ones who can't: an elderly neighbor on oxygen when the power fails, someone with no signal, someone who doesn't share a language with responders.

State Farm's challenge asks how to identify those with the most urgent needs, coordinate assistance, and ensure no one is overlooked. We started from the last part and asked: **who haven't we heard from?**

## The idea

After a disaster, success isn't how many calls you answer. It's whether **everyone has been found.**

| The brief says | Headcount does |
|---|---|
| **Identify** those with the most urgent needs | Ranks every household with the Headcount Priority Index (HPI), each with a plain-English reason. A power-loss clock lifts people who are running out of time. |
| **Coordinate** assistance | An escalation ladder: cheapest action first, responders last. |
| **Ensure no one is overlooked** | Treats **silence as a signal**, and keeps a closed loop: nobody is "done" until they're found. |

### Four end states
Every household ends up in exactly one, and Headcount keeps working until none are left in "Unresolved":

1. **Found, OK**
2. **Found, needs help**
3. **Assisted**
4. **Unresolved** (still being escalated)

The dashboard's headline number is a live counter, such as **"34 of 40 accounted for."**

## How it works

1. **Install.** A dispatcher registers a plug-in node to a household and its (opt-in) profile: location, age, mobility, powered medical equipment and its backup runtime, language. Only that node's identity (or a dispatcher) can then answer for the household.
2. **Sense.** The node watches for shaking and sends a heartbeat every few seconds.
3. **Filter false alarms.** A short spike (a slammed door) is ignored. Sustained, multi-axis shaking is only **confirmed** when two or more nearby homes agree within seconds.
4. **Check in.** After a confirmed event, the node asks "Are you OK?" Residents answer with one physical button. No phone or app is needed.
5. **Rank.** Every household gets a 0-100 HPI score.
6. **Escalate.** Unanswered households move up the ladder below.
7. **Account.** Households reach a final state, and the counter climbs.

### Headcount Priority Index (HPI)

Each household gets one score from 0 to 100. Higher means more urgent.

$$\text{HPI} = \operatorname{clamp}_{[0,100]}\Bigl(100 \cdot L \cdot M \cdot K \;+\; A \;+\; \delta_h\Bigr)$$

**Likelihood of trouble** (is this household probably in trouble right now?)

$$L = 0.40\,E + 0.35\,S + 0.25\,C$$

**Consequence** (how bad is it if they are left alone?)

$$M = 0.5 + 0.5\,V$$

**Clock** (is time running out?)

$$K = \max(K_p,\;K_f)$$

All the inputs below are between 0 and 1 unless noted.

#### Exposure $E$: how hard the household was hit

$$E = 1 - (1 - E_q)(1 - E_f)$$
$$E_q = 0.60\,I + 0.40\,B \qquad E_f = 0.50\,F + 0.35\,T + 0.15\,N$$

| Symbol | Meaning | Source |
|---|---|---|
| $I$ | Shaking intensity, $0.5\cdot$(normalized peak) $+ 0.5\cdot$(normalized duration). Zero unless the event was **confirmed** by neighboring nodes. | Node sensors, confirmed by the server |
| $B$ | Building risk (age, construction, floor) | Household / building profile |
| $F$ | Flame detected in this unit (0 or 1) | Flame sensor |
| $T$ | Temperature rise, $\min(1, \Delta T / \Delta T_{max})$ | Temperature sensor |
| $N$ | Fire in an adjacent unit (0 or 1) | Neighboring nodes |

#### Silence $S$: have we heard from them?

$$S = \lambda \cdot \min\bigl(1,\; \delta \cdot S_0 + \alpha\bigr), \qquad S_0 = \min\!\left(1, \frac{s}{20}\right)$$

| Symbol | Meaning |
|---|---|
| $s$ | Minutes since the later of the last signal (heartbeat or check-in) and the moment the event was confirmed, minus a 30 s heartbeat grace. **Zero when no event is confirmed** (an offline node with no event is flagged "verify", not scored as hurt), and zero while the node keeps sending. |
| $\alpha$ | $+0.2$ if the heartbeat stopped **abruptly** at the moment of shaking or fire (only when an event is confirmed), otherwise 0 |
| $\delta$ | $0.5$ if the motion sensor saw movement in the last 5 minutes ("moving, not responding"), otherwise 1 |
| $\lambda$ | $0.5$ if the whole area went quiet together with no shaking (a **communications outage**, not individual distress), otherwise 1 |

#### Check-in status $C$

| State | $C$ |
|---|---|
| Answered "OK" | 0.0 |
| Prompt sent, still within the wait window | 0.35 |
| Prompt sent, **no response** after the window | 0.7 |
| Answered "I need help" | 1.0 |

#### Vulnerability $V$ (need-based only)

$$V = \min\bigl(1,\; 0.35\,d + 0.25\,g + 0.25\,m + 0.15\,a + 0.15\,c + 0.10\,b\bigr)$$

Each flag is 0 or 1: $d$ depends on powered medical equipment, $g$ age 75 or over, $m$ mobility limitation, $a$ lives alone, $c$ language or communication barrier, $b$ infant in the home.

#### Clock $K$ (range 1.0 to 1.5)

$$K_p = 1 + 0.5\Bigl(1 - \min\bigl(1,\, TTH/240\bigr)\Bigr), \qquad TTH = \max(0,\; R - p)$$

- $K_p$ applies only to a household with powered medical equipment **and** a mains power loss. $R$ is its backup runtime in minutes and $p$ is the minutes since power was lost. Otherwise $K_p = 1$.
- $K_f = 1.5$ if flame is confirmed in the household's own unit, otherwise 1.

#### Aging $A$ and human override $\delta_h$

- $A = \min\bigl(10,\ \lfloor w / 10 \rfloor\bigr)$, where $w$ is minutes waiting unresolved. Nobody waits forever.
- $\delta_h \in [-30, +30]$ is a dispatcher's manual adjustment. It requires a reason, and every override is logged.

#### Override rules (applied in this order)

1. **Help or fire floor:** if $C = 1.0$ (the resident pressed "I need help") **or** flame is confirmed in the household's own unit, then $L \leftarrow \max(L,\ 0.9)$.
2. **Resolved:** a household whose final state is *Found, OK* or *Assisted* leaves the queue and keeps its final-state marker on the map. *Found, needs help* stays scored.
3. **Unknown:** a location with no sensor is **not scored**. It appears as "unknown", never "safe".

#### Worked examples (synthetic)

| Household | $E$ | $S$ | $C$ | $L$ | $V$ → $M$ | $K$ | $A$ | **HPI** |
|---|---|---|---|---|---|---|---|---|
| **Mrs. Alvarez**: 82, oxygen concentrator, lives alone, limited mobility, old building, silent 14 min, power out 60 min, 180-min backup | 0.79 | 0.70 | 0.7 | 0.736 | 1.00 → 1.00 | 1.25 | +3 | **95.0** |
| **Healthy 30-year-old** near the epicenter, silent 14 min | 0.74 | 0.70 | 0.7 | 0.716 | 0 → 0.50 | 1.00 | +3 | **38.8** |
| **Fire in own unit**: age 75+, lives alone, silent 3 min (the fire floor lifts $L$ to 0.9) | 0.71 | 0.15 | 0.35 | 0.900 | 0.40 → 0.70 | 1.50 | 0 | **94.5** |

The weights and thresholds above are our **starting design values**, not validated numbers. We plan to tune them against the synthetic scenarios, and the score is always shown with its factor breakdown so a person can check it.

Every score is shown with its reason, for example: *"82, oxygen concentrator, heavy-shake zone, silent 14 min."*

**Where it is implemented:** the HPI is computed in one place, the SpacetimeDB `recompute_hpi` reducer. It runs after every relevant event (shaking confirmed, check-in, power lost, heartbeat lost) and on a scheduled tick, and it writes each household's score, factor breakdown and reason string to a `priority` table. The map, queue and every other surface only **read** that table, so they can never disagree. Each factor's meaning, weight, source, uncertainty and justification is in [`docs/HPI.md`](docs/HPI.md).

### Power-loss clock
Each node runs from the wall with a battery behind it. If mains power drops, the node reports `power_lost`. For a household with powered medical equipment, that starts a clock:

`TTH = backup runtime - minutes since power was lost`

As the clock runs down, $K$ rises (from 1.0 toward 1.5) and the household climbs the queue.

### Escalation ladder
Cheapest action first. Responders only get the people who fail earlier steps.

| Step | Action | If no answer |
|---|---|---|
| 1 | Automated check-in (node prompt, simulated text or call) | wait, then step 2 |
| 2 | Notify an enrolled emergency contact | wait, then step 3 |
| 3 | Ask a nearby neighbor or volunteer to knock | wait, then step 4 |
| 4 | Responder dispatch, with a hand-off packet to a **simulated** 911 feed | stays at the top |

Waits shrink as HPI grows, so a very high-risk household skips ahead. An "OK" at any step resolves it.

Current implementation values (in `spacetimedb/src/hpi.ts` and `spacetimedb/src/index.ts`; starting design values, not validated):
- Wait at each step: $\max(1,\ 6 \cdot (1 - 0.75 \cdot HPI/100))$ minutes, so 6 min at HPI 0 and 1.5 min at HPI 100.
- A household at **HPI 85 or above** goes from step 1 straight to step 4.
- A check-in prompt becomes "no response" ($C = 0.7$) after **3 minutes**.
- Pressing "I need help" marks the household *Found, needs help* and goes straight to step 4.
- **Silence $s$:** a node that keeps sending heartbeats is not silent ($s = 0$), even if nobody presses a button. That case is still escalated through $C = 0.7$. Silence grows only when the node itself stops reporting.

## Live priority map

The map on the monitor dashboard shows, in real time, which homes need urgent care the most. It is the visual form of the HPI.

**What it shows**
- One marker per household, **colored by HPI band**: 0-24 low, 25-49 guarded, 50-74 high, 75-100 critical.
- **Marker size grows with HPI.** The top ten show their **rank number**, and the highest-priority markers pulse.
- Households with a final state get a distinct marker: Found OK (check), Assisted (blue), and Unresolved (colored by HPI).
- Areas **without sensors** are hatched grey and labeled "unknown", never "safe".
- Color is never the only signal. Every marker also carries its number or label, so the map works for color-blind viewers.

**What you can do**
- Click a marker for the card: reason, factor breakdown (E, S, C, V, K), ladder step with countdown, and the responder action.
- Hover a row in the ranked queue to highlight its marker. Click a marker to jump to its row.
- Toggle layers: HPI view, hazard footprint (shaking intensity), communications-outage zones, responder and volunteer positions, sensor coverage.

**How it stays real-time**
- The dashboard subscribes to the `priority` table in SpacetimeDB. When `recompute_hpi` writes a new score, the marker's color, size and rank update immediately and animate, so rank changes are easy to see.
- The map does **no scoring of its own**. It renders what the database says.

**Data and map notes**
- All household locations are **synthetic**, placed in a fictional neighborhood. No real addresses or people.
- Planned: a web map library (MapLibre or Leaflet). Because venue and hotspot networks can be unreliable, we plan an **offline fallback** basemap so the demo does not depend on internet tile servers.
- The CBRE dashboard reuses the map at **building level**: one pin per property, sized by estimated dollar impact.
- The home screen shows the same synthetic neighborhood as a **3D model** (three.js, bundled, so it works offline). Building heights are exaggerated about 4x so floors read from above; footprints and positions are to scale. Pins, routes and hazards come straight from the server rows, and the model does no scoring. Without WebGL it falls back to a flat map.

## Fairness by design

We rank by **need, never by worth.**

- Inputs are need-based only. We deliberately exclude income, race, immigration status and insurance policy value.
- Every score is explainable.
- Humans can override a ranking, and every override is logged with a reason.
- Areas without sensors are shown as **"unknown"**, never "safe".
- Opt-in only. Nodes do not record audio or video. They classify locally and send only status events.

## Architecture

```
Home nodes (sensors + button) --Wi-Fi--> SpacetimeDB --live subscriptions--> the four surfaces below
                                              ^
                              Simulator (synthetic households)
```

- **SpacetimeDB** holds all live state (households, nodes, events, check-ins, escalations, assignments) and runs confirmation, ranking and escalation as server logic. The dashboard subscribes to the ranked queue, so changes appear on every screen instantly.
- **Nodes** report heartbeats and events. Real nodes and simulated ones look identical to the server. A real node that stops sending is marked offline after 30 s and flagged for verification; silence alone never marks anyone found, OK or injured.
- **Who may change what.** Overrides, "mark found", recompute, node registration and every `sim_*` reducer are limited to **operators** (dispatchers). The database publisher is the first operator and can add more with `add_operator`. A household's check-in, heartbeat and sensor events are accepted only from the device identity an operator registered for it, or from an operator (recorded as `dispatcher`). The operator and device lists are private tables. Overrides need a reason and are written to an audit log that survives a demo reset. Details: [`docs/HPI.md`](docs/HPI.md#who-may-change-what).

### Four surfaces, one backend

All four are views of the same SpacetimeDB data. None of them computes priority on its own.

| # | Surface | Who it's for | Device | What it shows |
|---|---|---|---|---|
| 1 | **Monitor dashboard** | Someone watching all the homes | Laptop | Every unit normal or anomalous, fire alerts (flame and temperature sensing), the **live priority map**, the HPI ranking with reasons, the escalation ladder, the accounted-for counter, a coverage (equity) meter, and an event timeline |
| 2 | **In-house wall screen** | The person at home | Wall panel (M5Stack M5GO), like a thermostat | Home status, big **I'm OK / I need help** buttons, buzzer, alerts. Works with no phone. |
| 3 | **Phone web app** | The resident or family when away or out of reach | Phone browser | Notifications, status, remote check-in |
| 4 | **CBRE operations dashboard** | Property operations staff | Laptop | Building-level impact: downtime, revenue at risk, predicted failures, recommended actions (synthetic data) |

Surfaces 2 and 3 can both answer a check-in. The first answer counts, and the other updates instantly.

### Hardware
M5Stack M5GO as the primary node (screen, buttons, motion sensor, battery). ESP32 boards and additional sensors (shock/vibration, PIR, flame, temperature) as extra nodes. *Exact hardware used will be listed here before submission.*

## Status

Update this table honestly before submitting.

| Part | Status |
|---|---|
| Concept, HPI formula, escalation design | Done (design) |
| Agent context and to-do list (`AGENTS.md`, `TODO.md`) | Done |
| SpacetimeDB module (tables and reducers) | Built in `/spacetimedb`; 85 automated tests. Published to **Maincloud `rescuedb`** on Nov 8, 2026, with 40 synthetic households. The existing `rescuegrid-dev` database was left untouched. **20/20 live SDK checks passed** against Maincloud (sync, authorization, token reuse, scoring and escalation). |
| Household simulator (synthetic data) | Built as demo-only `sim_*` reducers in the module (40 synthetic households, 5 hero cases) |
| Monitor dashboard (counter, ranked queue, ladder) | Built in `/monitor`: 3D model of the neighborhood with the dispatch queue (home screen), building drill-down, live map, analytics, event log. Verified against the local fallback. Production build and typecheck pass against bindings generated from the published module. The SDK subscription path is verified by `verify:live`; the React dashboard itself has **not been driven in two real browser windows**. Shows a persistent SIMULATION label. Vercel source now includes generated client bindings and a missing-bindings build check; local production build passes, hosted redeploy pending. |
| Live priority map | Built (SVG basemap drawn in-app, works offline) |
| In-house wall screen (M5GO) | Planned |
| Phone web app | Planned |
| CBRE operations dashboard | **Deprioritized.** Built as `/?app=cbre` in the monitor app and left as is: it is no longer part of the primary demo, is off by default in `npm run dashboards` (add `-- --all`), and gets no further work until the State Farm workflow is solid. Property and dollar figures are **synthetic** (see "CBRE view" below). |
| Demo control panel (trigger events, fast-forward time) | Built into the monitor dashboard. Hosted Gemini draft endpoint implemented and checked with mocks; Vercel deployment and a real API call pending. |
| Node firmware (heartbeat, shake classifier, buttons) | Planned |
| Power-loss clock | Built in the module (simulated power loss; real `power_lost` from nodes not yet tested) |
| Escalation ladder | Built in the module (steps 2-4 are simulated outcomes) |
| "Found curve" simulation vs. first-come-first-served baseline | Planned |

## Running it

### Vercel frontend

Set Root Directory to `monitor`, Framework to Vite, Build Command to `npm run build`, and Output Directory to `dist`. Enable access to files outside the root directory because the Vite configuration imports the sibling backend module. Set `VITE_SPACETIME_URI=wss://maincloud.spacetimedb.com` and `VITE_SPACETIME_DB=rescuedb` in Vercel, then redeploy. The names `VITE_SPACETIMEDB_HOST` and `VITE_SPACETIMEDB_DB_NAME` are not read by this monitor.

Generated `monitor/src/module_bindings` files are included in Git so fresh deployments have the client schema without installing the SpacetimeDB CLI. Regenerate and commit them when the module schema changes. The build rejects missing bindings instead of producing a dashboard that cannot connect. Promote the deployed browser identity separately from localhost.

### Shared live database (Maincloud)

The Headcount module is published at **`rescuedb`**, using **`wss://maincloud.spacetimedb.com`**. [Database dashboard](https://spacetimedb.com/rescuedb). All default monitor, publish, status, promotion and live-verification commands target this database. No local database server is needed.

```bash
cd spacetimedb
npm ci
npm run typecheck
npm test
cd ../monitor
npm ci
npm run generate
npm run db:status
npm run dev
```

Open the Local URL printed by Vite. With the dashboard connected, in another terminal:

```bash
cd monitor
npm run promote -- --list
npm run promote
```

Reload the dashboard to enable dispatcher controls. `promote` grants access to every currently connected identity; use the Copy command button in New Simulation to promote just one. The publishing CLI identity must have operator access. The browser keeps its token in localStorage, so reloads retain the identity. Another browser profile or cleared site data requires promotion again.

The browser defaults to Maincloud even without an environment file. Optional overrides go in `monitor/.env.local` (see `.env.example`); restart Vite after editing. Node scripts read the same development environment as Vite and derive their CLI server from the WebSocket URL. `SPACETIME_DB` and `SPACETIME_SERVER` are optional CLI-only overrides; keep them consistent with the monitor target.

To deploy later module changes:

```bash
cd monitor
npm run db:publish
npm run generate
npm run db:status
```

Publishing refuses data deletion (`--delete-data=never`). Review any migration conflict rather than clearing the shared database. Publishing the module does not deploy the monitor website; run the monitor locally or host its built frontend separately.

```bash
npm run verify:live
```

**Live verification resets the target simulation.** Run it between demos, not during an active session. It tests subscriptions, authorization and token reuse with independent SDK clients and removes its temporary dispatcher afterward. Real-browser interaction in two windows is still a manual check.

### Optional local server or fallback

See [local server instructions](docs/RUN_LOCAL.md). The explicit local commands are `npm run db:start`, `npm run db:publish:local` and `npm run db:status:local`. To connect the monitor and promotion commands to local Headcount, set:

```dotenv
VITE_SPACETIME_URI=ws://localhost:3000
VITE_SPACETIME_DB=headcount
```

Remove those overrides to return to Maincloud. `npm run dev:local` instead uses an in-process fallback; it does not connect to Maincloud.

The walkthrough for the primary demo, an earthquake at Alder Court, is in [`docs/DEMO_SCENARIO.md`](docs/DEMO_SCENARIO.md).

**Local fallback.** `dev:local` runs this repo's actual module code, including `recompute_hpi`, inside SpacetimeDB's official in-memory test datastore, which runs in the Vite dev server. It exists for development and as a demo backup if the server or network fails. It is not a SpacetimeDB server: there is no persistence and no multi-client sync. The header shows which source is live.

Use **New Simulation** in the header to trigger a quake, power loss, fire or comms outage, and to fast-forward time.

One port per dashboard: `npm run dashboards` (from `monitor/`) starts one local dev server and opens each dashboard on its own localhost port. All ports forward to the same server, so they share one simulation. Ports live in `monitor/dashboards.json`: 5180 main dashboard (3D neighborhood model), 5181 operations overview, 5182 houses, 5183 live map, 5184 building view, 5185 analytics. 5186 CBRE is optional and only opens with `-- --all`. Use `npm run dashboards:live` for the published SpacetimeDB module, `-- --attach` to reuse a dev server already on 5179, and `-- --lan` to listen on all interfaces (phone, Pi, Tailscale).

Screens and deep links: `/` main dashboard (3D model of Cedar Hollow with the dispatch queue; falls back to a flat map without WebGL), `/?view=overview` operations overview (per-building unit layout and waiting list), `/?view=tree&b=<building>` building view, `/?view=houses` neighborhood view with every home drawn as a house, `/?view=map` live map, `/?view=analytics`, `/?view=log`, `/?h=<household>` opens a household, `/?app=cbre` property operations. Orb artwork can be swapped by dropping PNGs into `monitor/src/assets/orbs/` (names in the README there).

### CBRE view (estimate model, deprioritized)

Optional and not part of the primary State Farm demo. Kept as is.

The CBRE screen turns the same live events into per-building operational impact. It does **not** use or change the HPI and never ranks people. Inputs: confirmed quake epicenters (shaking at a building falls off linearly to zero at 520 map units), confirmed fires, and the share of nearby nodes on battery (buildings without their own nodes, the office and warehouse, use homes within 260 units, labeled "inferred"). Each building system (structure, elevator, power, HVAC, fire suppression, water) gets a failure probability from those inputs and the building's risk score. Expected downtime is the largest system downtime weighted by its probability (+48 h with a fire); expected repair cost is the probability-weighted sum. Revenue at risk = hourly revenue × occupancy × min(horizon, downtime) × max(failure odds, 0.6 × power-out share), plus a quarter month of revenue with a fire. All rents, costs, tenants and repair figures in `monitor/src/cbre/portfolio.ts` are invented.

The finance panel (`monitor/src/cbre/finance.ts`) re-prices those estimates with **synthetic** insurance and operating assumptions. Gross loss = revenue at risk over the horizon + expected repair cost. Deductible = 2% of building value when the loss is quake-driven (shaking > 5% and no fire), otherwise a flat $25,000. Property claim = max(0, repairs − deductible). Loss-of-rents claim = revenue lost after a 72 h waiting period. Retained loss = max(0, gross − property claim − loss-of-rents claim). Annual NOI = 12 × monthly revenue × occupancy × (1 − operating-expense ratio), with ratios of 0.42 multifamily, 0.38 office and 0.18 warehouse; NOI impact = retained loss ÷ annual NOI. The cash-flow chart books lost rent as it accrues and spreads repairs (and the matching property claim) evenly across the predicted downtime. None of this is a real policy, quote or forecast.

## The "found curve" (planned)

We plan to simulate the same disaster twice on synthetic data, once with first-come-first-served and once with Headcount's ranking and ladder, and compare the share of households accounted for over time. Results will be reported here, labeled as a simulation, only once they are measured.

## Honesty notes

- Hackathon prototype, not a certified life-safety device.
- Synthetic data only. No real people's data is used.
- The 911 hand-off is simulated. No real emergency service is contacted.
- Any statement about sponsors or real-world use describes what Headcount *could* integrate with, not an existing relationship.

## Team

Built at HackUTD 2026 by Avin, Hung, Aryan and Aahan.

### Gemini drafts on the hosted monitor

The neighborhood agent's **Draft with Gemini** button can draft without the Photon laptop server. Set `GEMINI_API_KEY` in Vercel's server environment (no `VITE_` prefix), optionally set `GEMINI_MODEL` (default `gemini-flash-latest`), and redeploy the `monitor` project. The same-origin `/api/draft` Node function calls Gemini; the key never enters the browser bundle. It receives only synthetic event flags and returns editable simulation wording. Drafting never sends a message. Photon is still required for sending. Plain `npm run dev` does not run Vercel functions; locally use the running Photon agent's draft endpoint or a Vercel development server.

Production build and six mocked endpoint checks passed. Live Gemini generation and Vercel deployment remain unverified until a server key is configured.
