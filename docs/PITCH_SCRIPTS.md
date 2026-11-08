# Headcount: video script, live demo run sheet, in-person pitch

All three tell the same story: **Mrs. Alvarez, 82, on oxygen, goes silent after an earthquake. Nobody calls for her. Headcount notices the silence, ranks her first, says why, and climbs the ladder until she is found, then hands her to her State Farm agent.**

Rules for every version (AGENTS.md):
- Say "simulated" for responders, the 911 hand-off and the neighborhood.
- Never claim we contacted real emergency services.
- Never say "AI decides". The HPI is a transparent formula; the command dock is search, not AI. Gemini only reads incoming texts in the Photon agent.

Speaking pace: about 150 words per minute. Each spoken script below is about 2:30.

---

## 1. Video (target 2:30, hard max 3:00)

Record screen at 1440×900. Live site: https://headcount-psi.vercel.app (or the local hosts). Record the Pi shot on a phone.

| Time | Picture | Voice-over |
|---|---|---|
| 0:00–0:15 | Black, then text: "After a disaster, the people who need help most are often the ones who can't call." Cut to the Pi node on a table. | "After an earthquake, the people who need help most are often the ones who can't ask for it. An 82-year-old on oxygen. A family with a newborn. Someone who doesn't speak English. Emergency lines flood, and silence gets lost." |
| 0:15–0:30 | Title card: **Headcount. Everyone found.** Then the main 3D dashboard, all clear, "40 households monitored". | "Headcount flips that. It's a plug-in home sensor plus a live dispatch board, and its core idea is simple: silence is a signal." |
| 0:30–0:50 | Hand shakes the Pi (shock sensor). Buzzer beeps. Cut to dashboard: quake confirmed, check-ins sent. | "Each home has a node with shock, flame, heat and motion sensors. When two or more nearby nodes report sustained shaking, the quake is confirmed, so one bumped sensor never sets off an alarm. Every home is asked: are you OK?" |
| 0:50–1:15 | Dispatch queue. Zoom to rank 1: Mrs. Alvarez, HPI and the reason line. | "Most people press OK. Mrs. Alvarez doesn't. Her node went quiet right when the shaking started. Headcount ranks every household with the Headcount Priority Index, and it always shows why: 82, oxygen concentrator, minutes of battery left, lives alone, silent." |
| 1:15–1:40 | Escalation ladder steps: check-in → emergency contact → neighbor knock → responder (simulated). Show a Photon text on a phone if recorded. | "Then it escalates, cheapest first. A check-in. Her emergency contact. A text to a neighbor who's already confirmed safe, asking them to knock. Only then a responder. In this demo, responders and the 911 hand-off are simulated." |
| 1:40–2:00 | Mrs. Alvarez flips to Found, needs help → Assisted. Counter climbs. | "A neighbor finds her and she needs help, so she jumps to critical and a responder is dispatched. Minutes, not hours, and nobody had to call." |
| 2:00–2:20 | State Farm agent view (`?app=agent`), Mrs. Alvarez selected: "Shared with you by Headcount", next steps. | "Once she's found, her State Farm agent gets the hand-off: what happened, when, and what to do next, like opening a claim or arranging temporary housing. Ranking is by need only, never by policy value." |
| 2:20–2:30 | Counter reaches the end; "Everyone found." Then the tech line and team names. | "Built on SpacetimeDB, so every screen, sensor and phone shares one live source of truth. Headcount. Everyone found." |

Shots to capture before recording: the Pi shake (phone video), one Photon text arriving on a phone, the agent view with Mrs. Alvarez "Assisted".

---

## 2. Live demo run sheet (for judges, about 2:30)

**Setup, 5 minutes before:**
1. Pi script running on friscogoons (`nohup python3 -u headcount_node.py > headcount_node.log 2>&1 &`). Confirm Mrs. Alvarez shows "Live sensor" on the agent view.
2. Laptop on the phone hotspot. Open three tabs: main (`/`), Houses (`/?view=houses`), agent (`/?app=agent`).
3. The browser must be a dispatcher (promoted once) so New Simulation works. Reset first: New Simulation → Reset.
4. Backup if the network dies: `cd monitor && npm run dashboards` (local simulation, no internet needed).

**Clicks, in order:**

| # | Do | Say (short) |
|---|---|---|
| 1 | Show main screen, all clear | "Forty homes, one neighborhood, all fictional." |
| 2 | **Shake the Pi** for 3 seconds, then New Simulation → Earthquake near Alder Court | "That's a real sensor. Two nodes agree, so the quake is confirmed." |
| 3 | Point at the dispatch queue. Click rank 1, Mrs. Alvarez | "She's silent. Here's exactly why she's first." |
| 4 | Fast-forward +1 min a few times. Watch the ladder step up | "Cheapest help first: contact, neighbor, then responders." |
| 5 | Switch to Houses | "The calm view, for a wall screen or a neighbor." |
| 6 | Fast-forward until she's Assisted. Switch to the agent tab | "Now her State Farm agent picks it up." |
| 7 | Fast-forward until the counter tops out | "Everyone found." |

If a judge asks to break it: open any household, add an override with a reason. Show it lands in the audit log; a blank reason is refused.

---

## 3. In-person pitch (spoken, about 2:30)

> **Open (0:00–0:20)**
> After a disaster, the people who most need help are often the ones who can't ask for it. Phones are down, 911 is flooded, and the 82-year-old on oxygen just goes quiet. Nobody notices silence.
>
> **The idea (0:20–0:45)**
> We built Headcount. It keeps a running count of who's been found after a disaster, and its core idea is that silence is a signal. If your home goes quiet when everyone else checks in, you move up the list.
>
> **How it works (0:45–1:30)** *(start the live demo here)*
> Every home gets a small node. This one's a Raspberry Pi with shock, flame, heat and motion sensors. When nearby nodes agree there's sustained shaking, the quake is confirmed and every home gets asked, "Are you OK?" Most people press OK. Mrs. Alvarez doesn't.
> Headcount ranks everyone with our priority index, and it always shows its reason: her age, her oxygen, how much battery she has left, how long she's been silent. Then it escalates, cheapest first: her emergency contact, then a text through Photon to a neighbor who's already safe, then a responder. The responders here are simulated.
>
> **State Farm (1:30–2:00)**
> For State Farm, the challenge was making sure no one is overlooked. When she's found, her agent gets the hand-off: what happened and what to do next. And we're strict about fairness: ranking is by need only. Never income, never insurance value, and every score can be overridden by a human with a logged reason.
>
> **Tech (2:00–2:20)**
> It all runs on SpacetimeDB. The scoring lives in one place on the server, so the sensors, the dashboards, the phones and the agent view all see the same live data the moment it changes.
>
> **Close (2:20–2:30)**
> No one should be left unaccounted for because they couldn't make a call. Headcount. Everyone found.

**Likely questions (one line each):**
- *What if the Wi-Fi is just out?* Area-wide silence with no shaking counts as an outage and is discounted. When it's unclear, we ask a human to check; we don't guess.
- *Is the score validated?* No. The weights are starting design values. It's transparent and overridable on purpose.
- *Privacy?* Synthetic data only. Phone numbers stay on the agent machine; the database stores a hash.
- *What's real today?* The SpacetimeDB backend, scoring, escalation, dashboards, the Pi sensor node and the Photon texting agent. Responders, residents and the 911 feed are simulated.
