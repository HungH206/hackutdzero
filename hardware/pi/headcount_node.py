#!/usr/bin/env python3
"""Headcount home node for a Raspberry Pi.

Drives ONE household (default: Mrs. Alvarez, household 1) on the published
SpacetimeDB module (Maincloud `rescuedb`) over plain HTTPS. No Tailscale is
needed for this; Tailscale is only for SSH.

Sensors (digital, active level configurable):
  shock   -> report_event(kind="shake", value=peak g estimate, durationS)
  flame   -> report_event(kind="flame", value=1)
  heat    -> report_event(kind="temp", value=10)
  motion  -> report_event(kind="motion") (person present)
  buzzer  -> beeps when an event reaches the server
Every 10 s it sends heartbeat(householdId, onBattery=False).

First run creates an identity token and prints the identity. An operator must
then bind it once:  register_node(householdId, device=<identity>)
(see hardware/pi/README.md). Tokens live in ~/.headcount_token, never in git.
"""
import json, os, sys, time, urllib.request, urllib.error

SERVER = os.environ.get("HC_SERVER", "https://maincloud.spacetimedb.com")
DB = os.environ.get("HC_DB", "rescuedb")
HOUSEHOLD = int(os.environ.get("HC_HOUSEHOLD", "1"))
# Wiring of the team node (matches sensor_node.py on the Pi).
PINS = {"sound": 17, "heat": 27, "flame": 22, "motion": 23, "shock": 24}
PIN_BUZZER = 25
TOKEN_FILE = os.path.expanduser("~/.headcount_token")
DRY = "--dry" in sys.argv  # print instead of calling the server

def http(method, path, body=None, token=None):
    req = urllib.request.Request(SERVER + path, method=method,
                                 data=None if body is None else json.dumps(body).encode())
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read().decode()

def get_token():
    if os.path.exists(TOKEN_FILE):
        return open(TOKEN_FILE).read().strip()
    res = json.loads(http("POST", "/v1/identity"))
    with open(TOKEN_FILE, "w") as f: f.write(res["token"])
    os.chmod(TOKEN_FILE, 0o600)
    print("New node identity:", res["identity"])
    print("Ask a dispatcher to run register_node with householdId=%d and this identity." % HOUSEHOLD)
    return res["token"]

def call(token, reducer, args):
    if DRY:
        print("[dry]", reducer, args); return True
    try:
        http("POST", "/v1/database/%s/call/%s" % (DB, reducer), args, token); return True
    except urllib.error.HTTPError as e:
        print("!", reducer, e.code, e.read().decode()[:200]); return False
    except Exception as e:  # network blip: keep running, the dashboard will show silence
        print("!", reducer, e); return False

def main():
    try:
        from gpiozero import DigitalInputDevice, OutputDevice
    except ImportError:
        print("Install gpiozero: sudo apt install python3-gpiozero"); sys.exit(1)
    # Same wiring and idle-baseline logic as the team's sensor_node.py.
    sensors = {n: DigitalInputDevice(p, pull_up=False) for n, p in PINS.items()}
    buzzer = OutputDevice(PIN_BUZZER)
    token = get_token()
    print("Headcount node: household %d on %s/%s" % (HOUSEHOLD, SERVER, DB))
    if not DRY:
        print("Warming up PIR (30s)..."); time.sleep(30)
    idle = {n: s.value for n, s in sensors.items()}
    idle["motion"] = 0

    def beep(n=1):
        for _ in range(n):
            buzzer.on(); time.sleep(0.12); buzzer.off(); time.sleep(0.08)

    last_hb = 0; shake_start = None; shake_last = 0; shake_hits = 0
    sent = {"flame": 0, "heat": 0, "motion": 0}
    while True:
        t = time.time()
        if t - last_hb >= 10:
            call(token, "heartbeat", {"householdId": HOUSEHOLD, "onBattery": False}); last_hb = t
        hit = {n: s.value != idle[n] for n, s in sensors.items()}

        # Shock (or loud sound with it): a burst of hits spanning >= 2 s is sustained shaking.
        # The shock module barely fires on this node; the sound sensor picks up the vibration strongly.
        if hit["shock"] or hit["sound"]:
            shake_hits += 1; shake_last = t
            shake_start = shake_start or t
        elif shake_start and t - shake_last > 1.5:
            dur = shake_last - shake_start
            print("shock burst %.1fs, %d hits" % (dur, shake_hits))
            if dur >= 0.5:
                g = min(2.0, 0.3 + shake_hits / 100.0)
                print("shake %.1fs ~%.2fg" % (dur, g))
                if call(token, "report_event", {"householdId": HOUSEHOLD, "kind": "shake", "value": g, "durationS": round(dur, 1)}): beep(1)
            shake_start = None; shake_hits = 0

        if hit["flame"] and t - sent["flame"] > 30:
            print("flame"); sent["flame"] = t
            if call(token, "report_event", {"householdId": HOUSEHOLD, "kind": "flame", "value": 1.0, "durationS": 0.0}): beep(2)
        if hit["heat"] and t - sent["heat"] > 30:
            print("heat"); sent["heat"] = t
            call(token, "report_event", {"householdId": HOUSEHOLD, "kind": "temp", "value": 10.0, "durationS": 5.0})
        if hit["motion"] and t - sent["motion"] > 20:
            sent["motion"] = t
            call(token, "report_event", {"householdId": HOUSEHOLD, "kind": "motion", "value": 1.0, "durationS": 0.0})

        time.sleep(0.01)

if __name__ == "__main__":
    main()
