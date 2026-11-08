# Headcount

Inspiration

In a large disaster, help flows to whoever can call loudest. The people most at risk are often the ones who can't: an elderly neighbor on oxygen when the power fails, someone with no signal, someone who doesn't share a language with responders. State Farm's challenge asked how to "ensure no one is overlooked." We started from that sentence and asked a different question: who haven't we heard from?

What it does

Headcount has two halves.

1. A plug-in home node watches for shaking and tells a real disaster from a false alarm.

A slammed door is a short spike and is ignored.
Sustained, multi-axis shaking is only confirmed when two or more nearby homes agree within seconds.
After a confirmed event the node asks "Are you OK?" and the resident answers with one physical button. No phone or app is needed.
2. A live dispatch board gives every household a Headcount Priority Index (HPI) from 0 to 100:


where $L = 0.40E + 0.35S + 0.25C$ is the likelihood of trouble (exposure, silence, check-in status), $M = 0.5 + 0.5V$ weighs the consequence by vulnerability, and $K$ rises as a time-critical need, such as a medical device's backup battery, runs down.

(Plain text: HPI = 100 x L x M x K.)

Every ranking shows its reason in plain English, for example "82, oxygen concentrator, heavy-shake zone, silent 14 min." Responders can assign help, and a coverage meter shows whether any vulnerable group is being skipped.

How we built it

SpacetimeDB holds all live state (households, nodes, events, check-ins, assignments) and runs confirmation and ranking as server functions. The dashboard subscribes to the ranked queue, so changes appear on every screen instantly.
Sensor nodes built on [list actual hardware] send heartbeats and events over Wi-Fi.
A simulator generates [N] synthetic households around the real nodes.
A web dashboard shows the map, ranked queue, equity meter and timeline.
Fairness by design

We rank by need, never by worth. Inputs are need-based only; we deliberately exclude income, race, immigration status and insurance policy value. Every score is explainable, humans can override it, and every override is logged. Areas without sensors are shown as "unknown", never "safe".

Challenges we ran into

[Fill in honestly: tuning the shake classifier, Wi-Fi, learning SpacetimeDB for the first time, first hackathon, etc.]

Accomplishments we're proud of

A false-alarm filter running on real hardware. [confirm]
A ranking that explains itself.
[Add your simulated comparison result, if measured: minutes until the most vulnerable households get first contact, versus first-come-first-served. Label it as a simulation on synthetic data.]
What we learned

[Fill in.]

What's next

Real-world calibration of shake and fire detection, integration with utility and medical-device registries, multi-language check-ins, an offline mesh for when networks are down, and pilots with emergency managers and insurers.

