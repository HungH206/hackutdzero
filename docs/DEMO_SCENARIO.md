# Demo scenario: Earthquake at Alder Court

**SIMULATION.** Fictional neighborhood ("Cedar Hollow"), 40 synthetic households, simulated responders. No real emergency service is contacted, and the 911 hand-off is a simulated feed.

One disaster, from the first shake to everyone accounted for. It is also an automated test (`spacetimedb/test/alder-court.test.ts`), so the sequence below is what the module does, not what we hope it does.

## The story in one breath

An earthquake hits Alder Court, the oldest and highest-risk building, and the power goes out. Most residents press OK within minutes. **Mrs. Alvarez, 82, on an oxygen concentrator, never answers: her node went dark at the moment of the shaking.** Nobody called for her. Headcount noticed the silence, ranked her first, said why, and walked the ladder (emergency contact, neighbor knock, responders) until she was found. The message for State Farm: **find the households that would otherwise go unnoticed.**

## Run it

You need the module published and a dispatcher client. Two ways:

**A. No server (fastest, and the backup if the network fails).**

```bash
cd monitor && npm install && npm run dev:local     # open the URL it prints
```

**B. Real SpacetimeDB (the real demo path).**

```bash
spacetime start                                              # local server on :3000
spacetime publish --server local --module-path spacetimedb headcount
cd monitor && npm install && npm run generate && npm run dev
```

On the real server only **operators** may use the simulation controls, overrides and "mark found". The database owner (whoever published) is the first operator, and every browser starts read-only. With the dashboard open, make it a dispatcher:

```bash
cd monitor && npm run promote     # promotes every connected client, then reload the page
```

Nothing has to be copied. `npm run promote -- --list` shows who is connected and who is already a dispatcher, and `npm run promote -- 0x…` promotes one identity (the **New Simulation** panel shows each browser's, with Copy buttons).

Do this once per browser: the dashboard saves its token, so the identity survives reloads. A private window or another machine is a new identity. Other browsers stay read-only, which is deliberate and worth showing to judges.

Run these commands from this repo. The SpacetimeDB CLI reads a `spacetime.json` from the working directory, so running them inside another project folder targets that project's database instead.

## Walkthrough (scenario time; use +1 min and +5 min in the panel)

| When | What to do | What you should see |
|---|---|---|
| Before | Open the dashboard | "0 of 40 accounted for". Two homes are hatched "unknown": no sensor means unknown, never safe. |
| **+0** | **New Simulation, Earthquake** (near Alder Court), then **Power loss** (west side) | Quake **confirmed** by neighboring nodes (a lone spike would be ignored). "Are you OK?" goes to every sensored home. Mrs. Alvarez shows 180 min of backup power left. |
| **+2** | +1 min twice | The Patel family press **HELP**: found, needs help, straight to the simulated responders. |
| **+3** | +1 min | Mrs. Alvarez's prompt expires with no answer. She is **#1**, HPI about 71, "High", and step 2 (emergency contact) starts. The card reads "82, oxygen concentrator, 176 min of backup power left, limited mobility, lives alone, heavy-shake zone, silent 4 min". |
| **+6** | +1 min x3 | Step 3: a volunteer is asked to knock. HPI about 77. |
| **+9** | +1 min x3 | The (simulated) volunteer finds her and she needs help: **Found, needs help**, "Critical" (HPI about 84), responder dispatch. |
| **+19** | +5 min x2 | The (simulated) responders arrive: **Assisted**. She leaves the queue. |
| **+60** | +15 min x3 (to about +64) | **38 of 40 accounted for.** The two no-sensor homes are still "unknown". Nobody was ever marked injured because of silence alone. |

Show an override while it runs: open any household, add **+15** with a reason. The score moves by exactly 15, the reason appears on the card and in the timeline, and a row lands in the audit log. A blank reason is refused.

## The honest limits (say them out loud)

- Every resident response and every responder is **simulated**.
- The weights are **starting design values, not validated** (see [HPI.md](HPI.md)).
- Silence cannot tell "needs help" from "lost Wi-Fi". Headcount ranks that household higher, asks a human to verify, and shows its reasoning. It does not claim to know.
- Real hardware (M5GO wall screen, node firmware, phone app) is **not built yet**.

## Verifying it yourself

```bash
cd spacetimedb && npm test              # 85 tests, including this scenario minute by minute
cd monitor && npm run verify:live       # two real client identities against the published module
```

`verify:live` connects a dispatcher and a read-only observer to the real server, runs this scenario, and checks that the observer sees every change through its own subscription, that both converge on identical tables, and that the observer is refused every privileged action. It resets the target database's simulation state.
