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
  sound  -> local only (the module has no sound kind)
Plus heartbeat every 10 s. Sends run in a background thread, so a slow network
never freezes the sensors.

Every trigger gives an instant reaction for judges: a chirp, an ACTIVE line on the
dashboard, and a line in the event list. Token lives in ~/.headcount_token (never in git).
Flags: --dry (print instead of sending), --no-camera, --plain (no screen redraw).
"""
import json, os, queue, sys, threading, time, urllib.request, urllib.error
from collections import deque
from datetime import datetime

VERSION = "v5"
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
PIR_WARMUP = int(os.environ.get("HC_PIR_WARMUP", "20"))
COOLDOWN = {"shock": 8, "flame": 15, "heat": 15, "motion": 10, "sound": 3}  # s between reports

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
def analyze_scene(image_path):
    """PLACEHOLDER. Later: send image_path to Gemini, return its classification."""
    return {"summary": "Gemini not connected yet (placeholder)", "people": None, "hazards": []}

def camera_worker():
    try:
        from picamera2 import Picamera2
        c = Picamera2()
        c.configure(c.create_still_configuration(main={"size": (1280, 720)}))
        c.start(); time.sleep(1)
        os.makedirs("captures", exist_ok=True)
        cam["status"] = "ready"
    except Exception as e:
        cam["status"] = "unavailable (%s)" % str(e)[:40]
        return
    while True:
        alert = snap_now.wait(timeout=10)
        snap_now.clear()
        path = os.path.join("captures", f"alert_{datetime.now():%H%M%S}.jpg" if alert else "latest.jpg")
        try:
            c.capture_file(path)
        except Exception as e:
            cam["status"] = "error (%s)" % str(e)[:40]; continue
        r = analyze_scene(path)
        cam.update(status="ready", at=time.time(), summary=r["summary"])
        if alert:
            add_event("Camera alert snapshot saved: " + path)

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
    last_hb = last_draw = 0.0

    while True:
        t = time.time()
        if t - last_hb >= 10:
            send("heartbeat", {"householdId": HOUSEHOLD, "onBattery": False}); last_hb = t

        for n, s in sensors.items():
            if s.value == idle[n]:
                continue
            first = last_seen[n] is None or t - last_seen[n] > 3
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
