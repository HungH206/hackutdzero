#!/usr/bin/env python3
"""Headcount home node for a Raspberry Pi (v5).

One script: every sensor, a live terminal dashboard, a camera snapshot loop with a
Gemini placeholder, and reporting to the real Headcount database (Maincloud
`rescuedb`) as household 1, Mrs. Alvarez.

Wiring (BCM GPIO numbers):
  sound 17 | heat 27 | flame 22 | shock 23 (physical 16) | motion/PIR 24 (physical 18) | buzzer 25

What goes to the database (report_event):
  shock  -> "shake", reported as a sustained 4 s episode (the switch only pulses once)
  flame  -> "flame" value 1
  heat   -> "temp" value 10 (flame + heat together confirms a fire)
  motion -> "motion" (someone is moving inside; lowers the silence penalty)
  sound  -> "sound" (timeline note)
  camera -> "camera" after an alert snapshot (timeline note; Gemini later)
Plus heartbeat every 10 s. Sends run in a background thread, so a slow network
never freezes the sensors.

Every trigger gives an instant reaction for judges: a chirp, an ACTIVE line on the
dashboard, and a line in the event list. Token lives in ~/.headcount_token (never in git).
Flags: --dry (print instead of sending), --no-camera, --plain (no screen redraw).
"""
import json, os, queue, sys, threading, time, urllib.request, urllib.error
from collections import deque
from datetime import datetime

VERSION = "v9"
SERVER = os.environ.get("HC_SERVER", "https://maincloud.spacetimedb.com")
DB = os.environ.get("HC_DB", "rescuedb")
HOUSEHOLD = int(os.environ.get("HC_HOUSEHOLD", "1"))
PINS = {"shock": 23, "motion": 24, "flame": 22, "heat": 27, "sound": 17}
LABELS = {"shock": "Shock/Quake", "motion": "Person/motion", "flame": "Flame",
          "heat": "Heat", "sound": "Loud noise"}
PIN_BUZZER = 25
TOKEN_FILE = os.path.expanduser("~/.headcount_token")
DRY = "--dry" in sys.argv
CAMERA = "--no-camera" not in sys.argv
PLAIN = "--plain" in sys.argv
# Shock is strict: it needs SHOCK_PULSES separate impacts within SHOCK_WINDOW seconds.
SHOCK_PULSES = int(os.environ.get("HC_SHOCK_PULSES", "4"))
SHOCK_WINDOW = float(os.environ.get("HC_SHOCK_WINDOW", "2.0"))
PIR_WARMUP = int(os.environ.get("HC_PIR_WARMUP", "20"))
COOLDOWN = {"shock": 8, "flame": 15, "heat": 15, "motion": 0, "sound": 10}  # s between reports

events = deque(maxlen=10)
lock = threading.Lock()
net = {"ok": None, "sent": 0, "err": ""}
cam = {"status": "off", "at": None, "summary": ""}
q = queue.Queue(maxsize=200)
snap_now = threading.Event()

def add_event(msg):
    with lock:
        events.appendleft(f"{datetime.now():%H:%M:%S}  {msg}")
    if PLAIN:
        print(msg, flush=True)

# ---------- network ----------
def http(method, path, body=None, token=None):
    req = urllib.request.Request(SERVER + path, method=method,
                                 data=None if body is None else json.dumps(body).encode())
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=8) as r:
        return r.read().decode()

def get_token():
    if os.path.exists(TOKEN_FILE):
        return open(TOKEN_FILE).read().strip()
    res = json.loads(http("POST", "/v1/identity"))
    with open(TOKEN_FILE, "w") as f:
        f.write(res["token"])
    os.chmod(TOKEN_FILE, 0o600)
    print("New node identity:", res["identity"])
    print("A dispatcher must run register_node(%d, <identity>) once." % HOUSEHOLD)
    return res["token"]

def send(reducer, args, note=None):
    try:
        q.put_nowait((reducer, args, note))
    except queue.Full:
        pass

def net_worker(token):
    while True:
        reducer, args, note = q.get()
        if DRY:
            net.update(ok=True, sent=net["sent"] + 1)
            continue
        try:
            http("POST", "/v1/database/%s/call/%s" % (DB, reducer), args, token)
            net.update(ok=True, sent=net["sent"] + 1)
            if note:
                add_event("-> database: " + note)
        except urllib.error.HTTPError as e:
            net.update(ok=False, err="%s %s" % (e.code, e.read().decode()[:60]))
        except Exception as e:
            net.update(ok=False, err=str(e)[:60])

def report(kind, value, dur, note):
    send("report_event", {"householdId": HOUSEHOLD, "kind": kind, "value": value, "durationS": dur}, note)

# ---------- camera (Gemini placeholder) ----------
FIRE_FRACTION = float(os.environ.get("HC_FIRE_FRACTION", "0.02"))  # share of the frame that must look like flame
FIRE_FRAMES = 2       # consecutive frames needed, so one red shirt flash does not count
FIRE_EVERY = 1.0      # seconds between colour checks

def fire_fraction(rgb):
    """Share of pixels that are bright, saturated red/orange (flame-coloured)."""
    import numpy as np
    r = rgb[..., 0].astype(np.int16); g = rgb[..., 1].astype(np.int16); b = rgb[..., 2].astype(np.int16)
    fire = (r > 180) & (r - b > 90) & (g > b) & (r >= g) & (g < 200)
    return float(fire.mean())

def analyze_scene(image_path):
    """PLACEHOLDER for Gemini. The colour check below runs on every frame meanwhile."""
    return {"summary": "Gemini not connected yet (placeholder)", "people": None, "hazards": []}

def camera_worker():
    try:
        from picamera2 import Picamera2
        c = Picamera2()
        c.configure(c.create_video_configuration(main={"size": (320, 240), "format": "RGB888"}))
        c.start(); time.sleep(1)
        os.makedirs("captures", exist_ok=True)
        cam["status"] = "ready"
    except Exception as e:
        cam["status"] = "unavailable (%s)" % str(e)[:40]
        return
    streak = 0; last_fire = 0.0; last_snap = 0.0
    while True:
        snap_now.wait(timeout=FIRE_EVERY)
        alert = snap_now.is_set(); snap_now.clear()
        try:
            frame = c.capture_array()[..., ::-1]  # RGB888 arrives as BGR; flip to RGB
            frac = fire_fraction(frame)
        except Exception as e:
            cam["status"] = "error (%s)" % str(e)[:40]; time.sleep(1); continue
        streak = streak + 1 if frac >= FIRE_FRACTION else 0
        cam.update(status="ready", at=time.time(), summary="flame colour %.1f%%" % (frac * 100))
        t = time.time()
        if streak >= FIRE_FRAMES and t - last_fire > 15:
            last_fire = t
            add_event("Camera sees fire colours (%.1f%% of frame)" % (frac * 100))
            report("flame", 1.0, 0.0, "camera: fire colours")
            report("temp", 10.0, 5.0, "camera: fire (heat assumed)")
            alert = True
        if alert or t - last_snap > 10:
            last_snap = t
            path = os.path.join("captures", f"alert_{datetime.now():%H%M%S}.jpg" if alert else "latest.jpg")
            try:
                c.capture_file(path)
                analyze_scene(path)
                if alert:
                    add_event("Camera alert snapshot saved: " + path)
            except Exception:
                pass

# ---------- main ----------
def main():
    try:
        from gpiozero import DigitalInputDevice, OutputDevice
    except ImportError:
        print("Install gpiozero: sudo apt install python3-gpiozero"); sys.exit(1)
    sensors = {n: DigitalInputDevice(p, pull_up=False) for n, p in PINS.items()}
    buzzer = OutputDevice(PIN_BUZZER)
    token = None if DRY else get_token()
    threading.Thread(target=net_worker, args=(token,), daemon=True).start()
    if CAMERA:
        cam["status"] = "starting"
        threading.Thread(target=camera_worker, daemon=True).start()

    buzzer.on(); time.sleep(0.15); buzzer.off()
    print(f"Headcount node {VERSION}: household {HOUSEHOLD} on {SERVER}/{DB}")
    print(f"Warming up PIR ({PIR_WARMUP}s), stay out of its view...", flush=True)
    time.sleep(PIR_WARMUP)
    idle = {n: s.value for n, s in sensors.items()}
    idle["shock"] = 0   # pulses HIGH on impact
    idle["motion"] = 0  # PIR is HIGH while it sees motion
    add_event("Node online")

    last_seen = {n: None for n in PINS}
    last_sent = {n: 0.0 for n in PINS}
    chirp_until = 0.0
    pulses = deque(); prev_shock = 0
    prev_motion = 1  # ignore the HIGH it starts in
    last_hb = last_draw = 0.0

    while True:
        t = time.time()
        if t - last_hb >= 10:
            send("heartbeat", {"householdId": HOUSEHOLD, "onBattery": False}); last_hb = t

        v = sensors["shock"].value
        if v and not prev_shock:
            pulses.append(t)
            if PLAIN: print("shock pulse %d/%d" % (len(pulses), SHOCK_PULSES), flush=True)
        prev_shock = v
        while pulses and t - pulses[0] > SHOCK_WINDOW:
            pulses.popleft()
        hard_shake = len(pulses) >= SHOCK_PULSES

        # Motion: this sensor has no knobs and stays HIGH while anything moves, so a
        # constant HIGH means nothing. Only a LOW -> HIGH change (it went quiet, then saw
        # movement) counts. Demo pattern: cover it ~3 s, then uncover and wave.
        m = sensors["motion"].value
        motion_edge = m and not prev_motion
        if not m and prev_motion:
            add_event("Motion sensor quiet (ready)")
        prev_motion = m

        for n, s in sensors.items():
            if n == "motion":
                if not motion_edge:
                    continue
            elif n == "shock":
                if not hard_shake:
                    continue
                pulses.clear()
            elif s.value == idle[n]:
                continue
            first = n == "motion" or last_seen[n] is None or t - last_seen[n] > 3
            last_seen[n] = t
            if first:
                add_event(f"{LABELS[n]} detected")
                chirp_until = t + 0.08
            if t - last_sent[n] < COOLDOWN[n]:
                continue
            last_sent[n] = t
            if n == "shock":
                report("shake", 0.6, 4.0, "sustained shaking (4 s)"); snap_now.set()
            elif n == "flame":
                report("flame", 1.0, 0.0, "flame"); snap_now.set()
            elif n == "heat":
                report("temp", 10.0, 5.0, "heat rise +10 C")
            elif n == "motion":
                report("motion", 1.0, 0.0, "motion inside")
            elif n == "sound":
                report("sound", 1.0, 0.0, "loud noise")

        hot = [n for n in PINS if last_seen[n] and t - last_seen[n] < 5]
        alarm = "flame" in hot and "heat" in hot
        if alarm:
            buzzer.value = int(t * 6) % 2 == 0      # fast beeping: fire
        else:
            buzzer.value = t < chirp_until           # chirp per trigger

        if not PLAIN and t - last_draw >= 0.5:
            last_draw = t
            draw(sensors, idle, last_seen, t, alarm)
        time.sleep(0.01)

def draw(sensors, idle, last_seen, t, alarm):
    B, R = "\033[1m", "\033[0m"
    if net["ok"] is None: db = "connecting..."
    elif net["ok"]: db = f"connected ({net['sent']} sent)"
    else: db = "OFFLINE - " + net["err"]
    cs = cam["status"] + (f" | snapshot {t - cam['at']:.0f}s ago | {cam['summary']}" if cam["at"] else "")
    out = [f"{B}HEADCOUNT NODE {VERSION}{R}  household {HOUSEHOLD} (Mrs. Alvarez)  {datetime.now():%H:%M:%S}", "",
           ("\033[41;97m  FIRE: flame + heat  \033[0m" if alarm else "  Status: monitoring"),
           f"  Database: {db}{'  [DRY RUN]' if DRY else ''}", f"  Camera:   {cs}", "",
           f"  {'SENSOR':<15}{'NOW':<9}LAST TRIGGER"]
    for n in PINS:
        now = "\033[43;30mACTIVE\033[0m  " if sensors[n].value != idle[n] else "quiet    "
        ago = "never" if last_seen[n] is None else f"{t - last_seen[n]:.0f}s ago"
        out.append(f"  {LABELS[n]:<15}{now}{ago}")
    out += ["", "  Recent events:"]
    with lock:
        out += ["    " + e for e in events]
    out += ["", "  Ctrl+C to stop"]
    sys.stdout.write("\033[H\033[2J" + "\n".join(out) + "\n"); sys.stdout.flush()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
