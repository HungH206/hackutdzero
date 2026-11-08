#!/usr/bin/env python3
"""Headcount home node for a Raspberry Pi.

Drives ONE household (default: Mrs. Alvarez, household 1) on the published
SpacetimeDB module (Maincloud `rescuedb`) over plain HTTPS. No Tailscale is
needed for this; Tailscale is only for SSH.

Sensors (digital, active level configurable):
  shock   -> report_event(kind="shake", value=peak g estimate, durationS)
  flame   -> report_event(kind="flame", value=1)
  DS18B20 -> report_event(kind="temp", value=rise in C) when it rises fast
  buzzer  -> beeps once when an event reaches the server
Every 10 s it sends heartbeat(householdId, onBattery=False).

First run creates an identity token and prints the identity. An operator must
then bind it once:  register_node(householdId, device=<identity>)
(see hardware/pi/README.md). Tokens live in ~/.headcount_token, never in git.
"""
import glob, json, os, sys, time, urllib.request, urllib.error

SERVER = os.environ.get("HC_SERVER", "https://maincloud.spacetimedb.com")
DB = os.environ.get("HC_DB", "rescuedb")
HOUSEHOLD = int(os.environ.get("HC_HOUSEHOLD", "1"))
PIN_SHOCK = int(os.environ.get("HC_PIN_SHOCK", "17"))
PIN_FLAME = int(os.environ.get("HC_PIN_FLAME", "27"))
PIN_BUZZER = int(os.environ.get("HC_PIN_BUZZER", "22"))
ACTIVE_LOW = os.environ.get("HC_ACTIVE_LOW", "1") == "1"   # most KY-0xx modules pull low on trigger
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

def read_temp_c():
    for dev in glob.glob("/sys/bus/w1/devices/28-*/w1_slave"):
        lines = open(dev).read().splitlines()
        if lines and lines[0].endswith("YES"):
            return int(lines[1].split("t=")[1]) / 1000.0
    return None

def main():
    try:
        from gpiozero import DigitalInputDevice, Buzzer
    except ImportError:
        print("Install gpiozero: sudo apt install python3-gpiozero"); sys.exit(1)
    shock = DigitalInputDevice(PIN_SHOCK, pull_up=ACTIVE_LOW)
    flame = DigitalInputDevice(PIN_FLAME, pull_up=ACTIVE_LOW)
    buzzer = Buzzer(PIN_BUZZER)
    token = get_token()
    print("Headcount node: household %d on %s/%s" % (HOUSEHOLD, SERVER, DB))

    last_hb = 0; shake_start = None; shake_hits = 0; flame_sent = 0
    base_temp = read_temp_c(); last_temp_check = time.time()
    while True:
        t = time.time()
        if t - last_hb >= 10:
            call(token, "heartbeat", {"householdId": HOUSEHOLD, "onBattery": False}); last_hb = t

        # Shock: count hits; a burst lasting > 2 s is "sustained" and gets reported.
        if shock.value:
            shake_hits += 1
            shake_start = shake_start or t
        elif shake_start and t - shake_start > 0.6:
            dur = t - shake_start
            if dur >= 2.0:
                g = min(2.0, 0.2 + shake_hits / 200.0)  # rough intensity from hit density
                print("shake %.1fs ~%.2fg" % (dur, g))
                if call(token, "report_event", {"householdId": HOUSEHOLD, "kind": "shake", "value": g, "durationS": round(dur, 1)}): buzzer.beep(0.15, 0.1, 1)
            shake_start = None; shake_hits = 0

        if flame.value and t - flame_sent > 30:
            print("flame")
            if call(token, "report_event", {"householdId": HOUSEHOLD, "kind": "flame", "value": 1.0, "durationS": 0.0}): buzzer.beep(0.15, 0.1, 2)
            flame_sent = t

        if t - last_temp_check > 5:
            c = read_temp_c(); last_temp_check = t
            if c is not None and base_temp is not None:
                rise = c - base_temp
                if rise >= 8:
                    call(token, "report_event", {"householdId": HOUSEHOLD, "kind": "temp", "value": round(rise, 1), "durationS": 5.0})
                    base_temp = c  # don't resend the same rise
                elif rise < -2:
                    base_temp = c

        time.sleep(0.01)

if __name__ == "__main__":
    main()
