# Headcount Priority Index (HPI): what each factor means and how far to trust it

**SIMULATION.** All households, readings and responder steps are synthetic. The 911 hand-off is simulated.

The formula lives in [README.md](../README.md#headcount-priority-index-hpi) and is computed in exactly one place: `recompute` in `spacetimedb/src/index.ts`, using the pure functions in `spacetimedb/src/hpi.ts`. Dashboards only read the `priority` table.

## What the HPI is, and is not

- It is a **sort order for human follow-up**: which households should a welfare check reach first. It answers "who haven't we heard from, and who loses the most if we are late?"
- It is **not** a diagnosis, an injury estimate, or a decision about who deserves help. Nobody is dropped from the queue because of a low score; every household with a sensor stays in it until a check-in, a ladder outcome, or a dispatcher resolves it.
- **All weights and thresholds are starting design values.** They have not been validated against real events. We checked that the formula is deterministic, monotone and reproduces the README worked examples (see Tests below). We did not check that these weights match real-world outcomes.

```
HPI = clamp(0..100,  100 · L · M · K  +  A  +  override)
L   = 0.40·E + 0.35·S + 0.25·C          (likelihood the household is in trouble now)
M   = 0.5 + 0.5·V                       (consequence if left alone, 0.5 to 1.0)
K   = max(K_power, K_fire)              (clock, 1.0 to 1.5)
```

## Factors

| Factor | Meaning | Weight / range | Source | Main uncertainty | Why it is there |
|---|---|---|---|---|---|
| **E** exposure | How hard this household was hit | `1 − (1−Eq)(1−Ef)`; `Eq = 0.6·I + 0.4·B`; `Ef = 0.5·F + 0.35·T + 0.15·N` | Confirmed shaking at the node, building profile, flame and temperature sensors, neighbor sensors | `B` (building risk) is a hand-set number per building. Peak/duration normalization (1 g, 30 s) is a guess. | A household that was shaken hard or is on fire is more likely to need help than one far from the event. |
| **I** shaking intensity | Peak and duration at the node | `0.5·min(1, peak/1 g) + 0.5·min(1, duration/30 s)`; **0 unless confirmed** | Node accelerometer, confirmed by 2+ nearby nodes within 10 s | A single node cannot be trusted (door slam). Confirmation needs neighbors, so sparse areas confirm late or never. | False-alarm filter. |
| **B** building risk | Age, construction, height | 0 to 1, from the seed data | Synthetic building table | Invented for the demo. | Older, taller buildings fail worse. |
| **S** silence | How long we have heard nothing **after an event** | `λ · min(1, δ·min(1, s/20) + α)` | Heartbeat and check-in timestamps | **The central uncertainty.** Silence has many innocent causes (dead Wi-Fi, a phone charging elsewhere, a node unplugged). See the section below. | The brief: ensure no one is overlooked, including people who cannot call. |
| **C** check-in | Did the resident answer "Are you OK?" | OK 0, prompt pending 0.35, no response after 3 min 0.7, HELP 1.0 | Wall screen or phone button | A person can press OK while not OK, or fail to press while fine (asleep, hearing impaired). | A direct answer beats any inference. |
| **V** vulnerability | Would a delay be worse for this household | `min(1, 0.35 medical + 0.25 age 75+ + 0.25 mobility + 0.15 alone + 0.15 language barrier + 0.10 infant)` | Opt-in household profile | Profile may be stale or incomplete. Weights are judgment calls. Age 75 is a hard line. | A late welfare check costs more for someone on oxygen than for a healthy adult. |
| **K** clock | Is time running out | `K_power = 1 + 0.5·(1 − min(1, TTH/240))`, `TTH = backup runtime − minutes since mains loss`; `K_fire = 1.5` if flame in own unit | Node `power_lost`, profile backup runtime, flame sensor | Backup runtime is self-reported and degrades. Only households with powered medical equipment get a power clock. | Medical equipment on battery has a real deadline. |
| **A** aging | Minutes unresolved | `min(10, floor(minutes/10))` points | Check-in prompt time | None to speak of. | Nobody waits forever, even at a low score. |
| **override** | A dispatcher's adjustment | −30 to +30 points, **reason required** | Dispatcher | Human judgment, which is the point. | Local knowledge the sensors do not have. Every override is logged (see below). |

### Floors

- **Help floor:** if the resident pressed HELP (`C = 1`), `L` is at least 0.9.
- **Fire floor:** if flame is confirmed in the household's own unit, `L` is at least 0.9.
- **No sensor:** the household is **not scored**. It shows as "unknown", never "safe".
- **Resolved** (Found OK, Assisted): leaves the queue and keeps its marker.

### How V should, and should not, be used

`V` is deliberately need-based: medical equipment, mobility, age, living alone, language, infant. It never uses income, race, immigration status, or policy value. It multiplies the score by at most 2 (`M` runs 0.5 to 1.0), so it moves a household up the queue faster; it never removes anyone from it. It is a planning signal for who needs a welfare check sooner and what accommodation to bring (an interpreter, a stretcher), **not** a judgment about anyone's worth and not a validated clinical risk score. Residents opt in, and a dispatcher can override it.

## Silence is not injury

A household that stops transmitting is not classified as hurt. Concretely:

1. **Silence only counts after a confirmed event.** With no confirmed quake or fire, an offline node scores `S = 0` and the row reads "node offline N min, cause unknown: verify (not assumed hurt)". It does not start a check-in or the ladder.
2. **Silence counts from the event, not from the last signal.** A node that went offline an hour before the quake gets no backdated silence and no abrupt-loss bonus; its row says "node was already offline before the event".
3. **Abrupt loss at the moment of the event** adds only `α = +0.2` to `S` (it is suggestive, not proof).
4. **Moving, not responding** halves silence (`δ = 0.5`): motion in the last 5 minutes means someone is there.
5. **Area-wide silence with no shaking here** halves it again (`λ = 0.5`): at least 3 nearby sensors, 60% or more of them quiet together, and no shaking at this node. That pattern looks like a communications outage, not 12 people in trouble.
6. **A node that keeps sending heartbeats is never silent** (`S = 0`) even if nobody presses a button. That household is still escalated, through `C = 0.7` (unanswered prompt), which is a different and weaker claim.
7. **Silence never sets a final state.** `Found, OK`, `Found, needs help` and `Assisted` come only from a check-in answer, a ladder outcome (an emergency contact, a volunteer's knock, responders), or a dispatcher. A real node that goes silent runs the whole ladder and ends **Unresolved**, still in the queue, until a person resolves it.

What the system **cannot** tell apart: a person who needs help from a person whose node simply lost power or Wi-Fi at the same moment as a quake. It does not pretend to. It ranks the household higher, asks a human to verify it, and shows why.

## Escalation ladder

| Step | Action (simulated) | Wait before the next step |
|---|---|---|
| 1 | "Are you OK?" prompt on the node | `max(1, 6·(1 − 0.75·HPI/100))` min: 6 min at HPI 0, 1.5 min at 100 |
| 2 | Notify emergency contact | same |
| 3 | Ask a neighbor or volunteer to knock | same |
| 4 | Dispatch responders (hand-off to a **simulated** 911 feed) | 10 min, then the simulated responders arrive |

- HPI of 85 or more at step 1 skips straight to step 4.
- An unanswered prompt becomes "no response" after 3 minutes.
- HELP goes straight to step 4. An OK answer at any step ends the ladder.
- The wait is recomputed from the **current** score every tick, so a rising score pulls the next step earlier.
- Steps 2 to 4 are **simulated outcomes**. Nothing is sent to a real person or service.

## Overrides and audit

`override_priority` is dispatcher-only, needs a reason (1 to 280 characters), a finite delta in [−30, +30], and writes a row to `override_log` (household, delta, reason, who, when) plus a timeline entry. Refused overrides leave no row. The audit log survives a demo reset (`sim_reset`).

## Who may change what

`operator` and `node_owner` are private tables: clients cannot read them.

| Action | Who |
|---|---|
| `override_priority`, `set_final_state`, `recompute_hpi`, `register_node`, `add_operator`, `remove_operator`, every `sim_*` | Operators (dispatchers). The database publisher is the first operator. |
| `submit_checkin`, `heartbeat`, `report_event` for a household | An identity an operator bound to that household with `register_node`, or an operator. A dispatcher answering for a resident is recorded as `dispatcher (id)`, never as the resident. |
| `tick` | The scheduler only. |

## Tests (what is checked, and what is not)

`cd spacetimedb && npm test` runs the module's own datastore harness. It covers: the three README worked examples; determinism; each factor's boundaries and monotonicity; silence rules including missing-data cases; the communications-outage discount; the backup-power countdown; override validation, audit and persistence; ladder timing against `ladderWaitMinutes`; fast-forward equivalence (one jump equals the same minutes stepped); authorization for every gated reducer; and the Alder Court scenario end to end.

Not checked: that the weights predict real outcomes (there are no real outcomes here), real sensors, or real hardware heartbeats.
