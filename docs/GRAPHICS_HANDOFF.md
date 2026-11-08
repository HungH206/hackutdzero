# Graphics handoff: monitor dashboards

This is for the next agent (or person) taking over the **visual layer**: a full revamp of the graphics, layout and styling of every dashboard. The data layer, scoring and backend are finished enough for the demo. Do not change them. Change how things look.

Read `AGENTS.md` first (hard rules), then this file. The full design brief is [`prompts/design/apple-grade-design-system.md`](../prompts/design/apple-grade-design-system.md). Start from Aryan's branch `design/main-3d` (the 3D main screen) and work on `design/cohesive`. The look is light and professional, with one fictional satellite map base shared by every map (brief, section 5).

Deadline: final submission **Sun Nov 8, 12 PM CT**, with judging 1-4 PM. Keep every screen working at every commit. If a redesign isn't done by about 10 AM, ship what works.

---

## 1. Run it in 30 seconds

```bash
cd monitor
npm install
npm run dashboards          # one dev server + one localhost port per dashboard
```

| Port | Dashboard | Default screen | Main files |
|---|---|---|---|
| 5180 | Main: 3D Cedar Hollow + dispatch queue | `graph` | `src/ui/command/*` (on `design/main-3d`) |
| 5181 | Operations overview | `overview` | `src/ui/overview/*` |
| 5182 | Houses | `houses` | `src/ui/houses/*` |
| 5183 | Live map | `map` | `src/ui/MapCanvas.tsx`, `QueuePanel.tsx`, `DetailCard.tsx` |
| 5184 | Building view (drill-down) | `tree` | `src/ui/py/Drill.tsx` |
| 5185 | Analytics | `analytics` | `src/ui/Analytics.tsx`, `Gauges.tsx` |

- Every port forwards to **one** Vite server on 5179. That server runs the SpacetimeDB module in-process (`HEADCOUNT_SOURCE=local`), so all ports share one simulation.
- Ports are configured in `monitor/dashboards.json`. A URL `?view=` overrides the port default. Other deep links: `?h=<householdId>` and `?b=<buildingId>`.
- Trigger a disaster with the **New Simulation** button in the header. Headless alternative: `curl -X POST http://127.0.0.1:5179/__headcount/call -d '{"reducer":"sim_quake","args":{"x":200,"y":160,"magnitude":1}}'`.
- Other reducers: `sim_fire {householdId}`, `sim_power_loss {x,y,radius}`, `sim_fast_forward {minutes}` (1-240), `sim_reset {}`.
- Typecheck with `npx tsc --noEmit -p .`. Do this before every commit.
- Screenshot without a browser session:
  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
    --hide-scrollbars --window-size=1440,900 --virtual-time-budget=3000 \
    --screenshot=/tmp/shot.png "http://127.0.0.1:5181/"
  ```
  Check every screen twice: once after `sim_reset` (all clear) and once after quake, fire and power loss (incident).

---

## 2. Rules the revamp must keep (from AGENTS.md)

1. **Clients never compute priority.** HPI, band, rank, reason and factor breakdown (`E S C V K L M`) come only from the `priority` table. You may display them however you want. Do not re-derive, re-weight or re-sort by anything except `rank` or `hpi`.
2. **Synthetic data only.** Visible labels must say that simulated data is simulated. The 911 hand-off is simulated, and so is the map imagery ("Simulated imagery · Cedar Hollow is fictional").
3. **Need-based ranking only.** Do not add income, race, immigration status or insurance value to any household display or sort.
4. **Every score shows its reason.** Wherever a household's priority appears prominently, its `reason` string must be reachable in one click.
5. **No secrets** and no `.env` in the repo. Do not commit the reference media (see section 6).
6. **Be honest in docs.** If you change what a screen shows, update the README Status table and the "Screens and deep links" paragraph.

---

## 3. Data contract (what a screen can use)

Every app screen gets data from `useHeadcount()` (`src/data/HeadcountProvider.tsx`):

```ts
const { snapshot, actions, connection } = useHeadcount();
const view = useView(snapshot);                       // src/data/derive.ts
const now  = useScenarioNow(snapshot.clockOffsetMicros);
```

- `snapshot`: raw tables (`src/data/types.ts`).
  - Tables: `buildings, households, nodes, disasters, checkins, escalations, priorities, overrides, timeline`.
  - Also `clockOffsetMicros`.
- `view`: lookups built from the snapshot.
  - `hh`, `prio`, `node`, `checkin`, `esc` and `building` are Maps keyed by id.
  - `queue` holds open households in rank order.
  - `counts` holds the totals: `total`, `ok`, `help`, `assisted`, `unresolved`, `unknown` and `accounted`.
  - `disasterActive`.
- `actions`: the only writes a screen may make.
  - Reducer calls: `setFinalState`, `overridePriority`, `submitCheckin`, plus `sim*` for the demo panel.
  - Each returns a Promise. Disable the button while it's pending and show errors through the existing `onError` / `err-toast`.
- `connection`: `{source: 'local'|'spacetimedb', status, detail}`. Keep a visible indicator.
- Helpers in `derive.ts`:
  - Text formatting: `clockText`, `countdown`, `agoText`, `fmtMin`.
  - Label tables: `STEP_LABEL`, `FINAL_LABEL`, `CHECKIN_LABEL`.
  - Analytics data: `bandOf`, `foundCurve`, `timesToFound`, `median`, `ladderFunnel`, `bandCounts`.
- Household world coordinates match `MapCanvas`. Buildings have `x, y, w, h`, and the responder station is the exported `STATION`.

---

## 4. Screen inventory: what each one must still do

You can replace any markup, CSS or SVG. The **behaviour** in each row is what judges will click through in the demo.

| Screen | Must keep |
|---|---|
| **Header** (`ui/py/Header.tsx`, every screen except Overview) | Switch between all screens. Zoom and filter controls on the graph. Analytics button with an open-count badge. Bell that opens the event log with an unread count. New Simulation (`ui/DemoPanel.tsx`). Scenario clock with a fast-forward offset. Connection status. Search (⌘K focuses the command dock). |
| **Network graph** (`ui/py/Graph.tsx`) | Neighborhood sun at the center, building hubs around it, household nodes around their building. Node style shows status. Rank badges on the top households. Click a household to open `PyDetail`. Click a building to drill into the tree. Pan and zoom. Filter: all / open / critical and needs help. |
| **Analysis + command dock** (`ui/py/Analysis.tsx`, `ui/CommandDock.tsx`) | Concern cards (fire, power clocks, help requests, silent, unknown; from `ui/py/concerns.ts`) that select a household. The dock takes text commands (`quake`, `fire`, `ff 10`, `reset`, household names) and shows the median time-to-found and next power clock. |
| **Household detail** (`ui/py/Detail.tsx` on graph and tree, `ui/DetailCard.tsx` on map) | Name, building and unit. HPI with band and **reason**. Factor breakdown. Ladder step and next-step countdown. Backup-power minutes. Minutes silent. Check-in state. Buttons for Found OK, Needs help and Assisted. Override with a logged reason (DetailCard). |
| **Time rail and legend** (`ui/py/TimeRail.tsx`, `ui/py/Legend.tsx`) | Scenario-minute axis with an activity trace. Counts per status. Accounted %. |
| **Building view** (`ui/py/Drill.tsx`) | Building switcher. Category groups (help, open, power, silent, found, unknown) that fan out to their households with HPI and ladder progress. |
| **Houses** (`ui/houses/Houses.tsx`) | Every household drawn **recognizably as a house**: the user asked for this specifically, and it should stay calm and easy on the eyes. Status by color plus pins for urgent, help and fire. Responder routes for dispatched households. Summary card. Color key. Card for the selected house with a link to the full record. |
| **Live map** (`ui/MapCanvas.tsx` + `QueuePanel` + `DetailCard` + `Legend`) | Map layers (heat, hazard, responders, outage, power) with toggles. Ranked queue whose hover is linked to the map. Fly-to on select. |
| **Overview** (`ui/overview/Overview.tsx`) | Stat pills, building title with prev/next, and tabs for Units, Escalations and Alerts. Unit layout by floor with priority chips. Waiting list that expands to a record with actions. Its own icon rail links to the other screens. |
| **Analytics** (`ui/Analytics.tsx`, `Gauges.tsx`) | Found curve over time, ladder funnel, band counts, coverage and equity meter. |
| **Event log** (`ui/EventLog.tsx`) | Timeline rows by severity. Click a row to select its household. |
| **Toasts** (`ui/Toasts.tsx`) | At most 2 at a time, dismissible. Click one to select the household. Must not cover primary actions. Positions per screen are in `py.css` (`.screen-*` rules). |

---

## 5. Current visual system (what you are replacing)

- **Fonts:** bundled locally, so nothing loads from the internet at the venue. They are Outfit Variable, JetBrains Mono 400/500 and Roboto Condensed 400/600, imported in `main.tsx`. You can swap fonts, but keep them bundled through `@fontsource`. Venue Wi-Fi is unreliable.
- **CSS layers:**
  - `styles.css`: base tokens and the shared classes (map stage, queue, detail card, toasts, analytics page).
  - `py.css`: dark teal/gold skin on `.py-app`. It overrides tokens and positions panels per screen through `.screen-<name>` classes on the root.
  - Each newer screen has its own CSS file: `overview.css` (`.ov-*`), `houses.css` (`.hs-*`), and on `design/main-3d` `command.css`.
- **Root class:** `App.tsx` renders `app py-app screen-<screen> [has-detail] [incident]`, so CSS can react to the current screen, an open detail panel, and an active incident.
- **Orbs:** `ui/py/Orb.tsx` draws the graph nodes in SVG. Dropping PNGs named `sun, rose, violet, mint, sky, amber, ember, slate, focus` into `src/assets/orbs/` replaces them automatically (`import.meta.glob`). This is the easiest hook if the new graphics are rendered images.
- **Icons:** `ui/Icon.tsx` is a small set of inline SVG paths. Add icons there instead of pulling in an icon font.
- **Motion:** SVG `animateMotion` sparks on the graph and dashed-route animation on the houses. Keep `prefers-reduced-motion` rules for anything new.

The user's feedback so far: the first map-first design "doesn't look good". Earlier circles and backgrounds looked "too AI like". They want each screen to take **heavy** inspiration from its reference, matching it closely on design without copying it.

---

## 6. Design references (local only, not in git)

The user sends these as `headcount-design-references.zip`. They are untracked on purpose (`design-refs/` is in `.gitignore`), so **do not commit them**.

| File | Use it for |
|---|---|
| `R01_main-graph_network.mp4` | Building view drill and the command dock composition. Structure only; re-create it on light surfaces. |
| `R02_houses_terrain-card.webp` | **Houses**: tilt, tilt-shift depth of field, frosted card with a thin oversized numeral. |
| `R03_overview_fleet-app.mp4` | **Overview**: rail, stat pills, tabs, cutaway cells, waiting list, gauges, warning bars. Converted to light. |
| `R04_analytics_workspace.jpg` | **Analytics**: floating cards over a map, bubble matrix, radar, legend with range slider, side panel. |
| `R05_analytics_executive-kpis.webp` | **Analytics**: KPI comparison tiles, "before vs now" line chart, treemap. |
| `R06_map_satellite-city-topdown.jpg` | **Every map**: satellite imagery, white haloed labels, control cluster, scale bar, place card. |
| `R07_map_satellite-regional.jpg` | Satellite palette at regional zoom (Houses wide view). |
| `R08_map_satellite-rooftop-closeup.webp` | Roof, tree-canopy and shadow detail. |
| `R09_map_pin-over-rooftops.png` | The red teardrop pin for urgent households. |
| `R10_map_3d-aerial-callouts.webp` | **Main 3D screen**: tilted aerial, callout pills, filter chips, round glass buttons. |

The satellite look must be **generated for the fictional Cedar Hollow** (procedural paint in `sitePlan.ts`, or an optional generated texture aligned to it). No real imagery, map tiles, map APIs or map-provider branding.

---

## 7. Known weak spots worth fixing in the revamp

- The graph orbs and backgrounds are still procedural SVG. This is the user's biggest complaint area.
- Houses: house glyphs are small at 1440×900. The two homes in the south have no building lot under them. The office and warehouse lots are empty rectangles.
- Overview: the floor stack leaves dead space under short buildings. There is no responsive layout below about 1180 px beyond stacking.
- Map screen (`MapCanvas.tsx`) is the oldest styling and only re-colored. It should move to the shared satellite base with the USGS-style list beside the map.
- The 3D main screen's ground is a flat light site plan. The user wants it to look like a satellite map view (R06-R10).
- Screens other than the 3D main screen are still dark. The target is one light appearance everywhere (brief, section 3.1).

---

## 8. Do not touch (unless the user asks)

- `spacetimedb/` (module, `recompute_hpi`, HPI math in `src/hpi.ts`) and the README HPI section.
- `monitor/src/data/*` (provider, types, derive). Read-only for a visual revamp.
- `monitor/local-bridge.ts`, `vite.config.ts`, `scripts/dashboards.mjs`, `dashboards.json` (the port setup).
- `monitor/src/cbre/` and port 5186 (out of scope for this pass).

## 9. Working agreement

- Work on `design/cohesive` (from `design/main-3d`). Do **not** push to `main` without telling the team.
- Commit one screen at a time. Run `tsc` and take before/after screenshots of all-clear and incident.
- End commit messages with the attribution lines your harness specifies.
- Update the README Status table and "Screens and deep links" if any screen's capabilities change.
