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

1. **Install.** A plug-in node registers a household and its (opt-in) profile: location, age, mobility, powered medical equipment and its backup runtime, language.
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
| $s$ | Minutes since the last signal (heartbeat or check-in) after the event |
| $\alpha$ | $+0.2$ if the heartbeat stopped **abruptly** at the moment of shaking or fire, otherwise 0 |
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

**Where it is implemented:** the HPI is computed in one place, the SpacetimeDB `recompute_hpi` reducer. It runs after every relevant event (shaking confirmed, check-in, power lost, heartbeat lost) and on a scheduled tick, and it writes each household's score, factor breakdown and reason string to a `priority` table. The map, queue and every other surface only **read** that table, so they can never disagree.

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
- **Nodes** report heartbeats and events. Real nodes and simulated ones look identical to the server.

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
| SpacetimeDB module (tables and reducers) | In progress |
| Household simulator (synthetic data) | Planned |
| Monitor dashboard (counter, ranked queue, ladder) | Planned |
| Live priority map | Planned |
| In-house wall screen (M5GO) | Planned |
| Phone web app | Planned |
| CBRE operations dashboard | Planned |
| Demo control panel (trigger events, fast-forward time) | Planned |
| Node firmware (heartbeat, shake classifier, buttons) | Planned |
| Power-loss clock | Planned |
| Escalation ladder | Planned |
| "Found curve" simulation vs. first-come-first-served baseline | Planned |

## Running it

*Setup instructions will be added once the code is in the repo.*

## The "found curve" (planned)

We plan to simulate the same disaster twice on synthetic data, once with first-come-first-served and once with Headcount's ranking and ladder, and compare the share of households accounted for over time. Results will be reported here, labeled as a simulation, only once they are measured.

## Honesty notes

- Hackathon prototype, not a certified life-safety device.
- Synthetic data only. No real people's data is used.
- The 911 hand-off is simulated. No real emergency service is contacted.
- Any statement about sponsors or real-world use describes what Headcount *could* integrate with, not an existing relationship.

## Team

Built at HackUTD 2026 by Avin, Hung, Aryan and Aahan.
