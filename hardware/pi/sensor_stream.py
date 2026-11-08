#!/usr/bin/env python3
"""Headcount Pi sensor stream: read the pins, print one JSON object per line.

Meant to be run over SSH by the laptop dashboard (monitor/pi-bridge.ts):
    ssh friscogoons@100.76.23.86 python3 -u sensor_stream.py

It only READS sensors and prints. It never talks to the internet or the database.
Same wiring as sensor_node.py. Only one program can hold the GPIO pins at a time,
so stop headcount_node.py / sensor_node.py on the Pi first.

Lines:
  {"type":"state", ...}   about 5 per second: raw pins, activity 0..1, edge counts, local risk
  {"type":"event", ...}   one per trigger (flame, heat, shock, sound, motion)
"""
import json, sys, threading, time

PINS = {"flame": 22, "heat": 27, "shock": 24, "sound": 17}
MOTION_PIN = 23
BUZZER_PIN = 25
WEIGHTS = {"flame": 45, "heat": 30, "shock": 25, "sound": 10}
HALF_LIFE = {"flame": 8, "heat": 20, "shock": 6, "sound": 4}
OCCUPIED_FOR = 60
_env = __import__("os").environ.get
MOTION_HOLD = float(_env("HC_MOTION_HOLD", "3"))        # seconds the PIR must stay high
MOTION_EDGES = int(_env("HC_MOTION_EDGES", "3"))        # or this many re-triggers...
MOTION_WINDOW = float(_env("HC_MOTION_WINDOW", "8"))    # ...within this many seconds
MOTION_COOLDOWN = float(_env("HC_MOTION_COOLDOWN", "20"))  # min seconds between motion events
WARMUP = float(__import__("os").environ.get("HC_WARMUP", "10"))
BEEP = __import__("os").environ.get("HC_BUZZER", "1") == "1"

try:
    from gpiozero import DigitalInputDevice, OutputDevice
except ImportError:
    print(json.dumps({"type": "error", "message": "gpiozero missing: sudo apt install python3-gpiozero"}), flush=True)
    sys.exit(1)

try:
    hazards = {n: DigitalInputDevice(p, pull_up=False) for n, p in PINS.items()}
    motion = DigitalInputDevice(MOTION_PIN, pull_up=False)
    buzzer = OutputDevice(BUZZER_PIN)
except Exception as e:  # usually "GPIO busy": another script holds the pins
    print(json.dumps({"type": "error", "message": f"{e}. Run: pkill -f headcount_node.py; pkill -f sensor_node.py"}), flush=True)
    sys.exit(1)

lock = threading.Lock()
edges = {n: 0 for n in PINS}        # edges since last loop
edge_total = {n: 0 for n in PINS}   # edges since start
pending = []                        # events to print

def cb(n):
    def f():
        with lock:
            edges[n] += 1
            edge_total[n] += 1
    return f

for n, d in hazards.items():
    d.when_activated = cb(n)
    d.when_deactivated = cb(n)

def out(obj):
    print(json.dumps(obj, separators=(",", ":")), flush=True)

def beep(sec=0.08):
    if BEEP:
        buzzer.on(); time.sleep(sec); buzzer.off()

beep(0.15)
t0 = time.monotonic()
while time.monotonic() - t0 < WARMUP:
    out({"type": "state", "warming": True, "warmupLeft": round(WARMUP - (time.monotonic() - t0), 1),
         "pins": {**{n: d.value for n, d in hazards.items()}, "motion": motion.value}})
    time.sleep(0.5)

idle = {n: d.value for n, d in hazards.items()}
with lock:
    for n in edges: edges[n] = 0

activity = {n: 0.0 for n in PINS}
last_seen = {n: None for n in PINS}
last_motion = None
motion_total = 0
prev_motion = 0
high_since = None
rises = []
last_tick = last_out = time.monotonic()
out({"type": "event", "kind": "online", "t": time.time()})

while True:
    now = time.monotonic()
    dt, last_tick = now - last_tick, now
    with lock:
        fired = [n for n, c in edges.items() if c]
        for n in fired: edges[n] = 0
        totals = dict(edge_total)
    for n, d in hazards.items():
        if n in fired or d.value != idle[n]:
            if last_seen[n] is None or now - last_seen[n] > 2:
                out({"type": "event", "kind": n, "t": time.time()})
                beep()
            last_seen[n] = now
            activity[n] = 1.0
    m = motion.value
    # Motion only counts when it is held high for MOTION_HOLD s, or re-triggers
    # MOTION_EDGES times within MOTION_WINDOW s. A single blip is ignored.
    if m and not prev_motion:
        high_since = now
        rises.append(now)
    if not m:
        high_since = None
    rises = [x for x in rises if now - x <= MOTION_WINDOW]
    confirmed = bool(m) and ((high_since is not None and now - high_since >= MOTION_HOLD) or len(rises) >= MOTION_EDGES)
    if confirmed:
        if last_motion is None or now - last_motion > MOTION_COOLDOWN:
            motion_total += 1
            out({"type": "event", "kind": "motion", "t": time.time()})
        last_motion = now
    prev_motion = m
    occupied = last_motion is not None and now - last_motion < OCCUPIED_FOR

    for n in activity:
        activity[n] *= 0.5 ** (dt / HALF_LIFE[n])
    risk = min(100.0, sum(WEIGHTS[n] * activity[n] for n in PINS))
    if risk >= 70 or (activity["flame"] > 0.3 and activity["heat"] > 0.3): level = "EMERGENCY"
    elif risk >= 40: level = "WARNING"
    elif risk >= 15: level = "WATCH"
    else: level = "SAFE"

    if now - last_out >= 0.2:
        last_out = now
        out({"type": "state", "warming": False, "t": time.time(),
             "pins": {**{n: d.value for n, d in hazards.items()}, "motion": m},
             "idle": idle,
             "activity": {n: round(v, 3) for n, v in activity.items()},
             "lastSeenAgo": {n: (None if last_seen[n] is None else round(now - last_seen[n], 1)) for n in PINS},
             "lastMotionAgo": None if last_motion is None else round(now - last_motion, 1),
             "edges": totals, "motionCount": motion_total,
             "occupied": occupied, "risk": round(risk, 1), "level": level})
    time.sleep(0.01)
