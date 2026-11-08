#!/usr/bin/env python3
"""Camera flame detector: an abnormal ORANGE patch in the picture means flame.

How it decides: each frame is shrunk, converted to hue/saturation/value, and the
share of bright, saturated, orange pixels is measured. The first few frames set a
baseline (so an orange sofa or a lamp does not count). A frame is "flame" when the
orange share rises clearly above the baseline for 2 frames in a row.

Use alone:
    python3 flame_color.py --image test.jpg      analyze one picture
    python3 flame_color.py --live                use the Pi camera, print JSON lines
Used by sensor_stream.py as a background thread (see start_camera_thread).
"""
import json, os, sys, threading, time

import numpy as np

# Orange in HSV: hue 10..40 degrees, strongly saturated, bright.
HUE_LO, HUE_HI = float(os.environ.get("HC_HUE_LO", "10")), float(os.environ.get("HC_HUE_HI", "40"))
SAT_MIN = float(os.environ.get("HC_SAT_MIN", "0.55"))
VAL_MIN = float(os.environ.get("HC_VAL_MIN", "0.55"))
FLAME_RISE = float(os.environ.get("HC_FLAME_FRAC", "0.004"))   # extra orange share that means flame
CONFIRM_FRAMES = 2


def orange_fraction(rgb):
    """rgb: HxWx3 uint8. Returns (fraction of orange pixels, mask)."""
    h, w = rgb.shape[:2]
    sy, sx = max(1, h // 120), max(1, w // 160)
    a = rgb[::sy, ::sx].astype(np.float32) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(axis=2), a.min(axis=2)
    d = mx - mn
    safe = np.where(d == 0, 1, d)
    hue = np.where(mx == r, ((g - b) / safe) % 6,
          np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4)) * 60.0
    sat = np.where(mx == 0, 0, d / np.where(mx == 0, 1, mx))
    mask = (d > 0) & (hue >= HUE_LO) & (hue <= HUE_HI) & (sat >= SAT_MIN) & (mx >= VAL_MIN)
    return float(mask.mean()), mask


class FlameDetector:
    def __init__(self):
        self.baseline = None
        self.warm = []
        self.streak = 0

    def update(self, rgb):
        frac, _ = orange_fraction(rgb)
        if self.baseline is None:            # learn the room from the first 5 frames
            self.warm.append(frac)
            if len(self.warm) >= 5:
                self.baseline = float(np.median(self.warm))
            return {"orange": round(frac, 5), "baseline": None, "flame": False, "learning": True}
        rise = frac - self.baseline
        hit = rise >= FLAME_RISE
        self.streak = self.streak + 1 if hit else 0
        flame = self.streak >= CONFIRM_FRAMES
        if not hit:                           # slowly follow lighting changes
            self.baseline += 0.02 * (frac - self.baseline)
        return {"orange": round(frac, 5), "baseline": round(self.baseline, 5), "rise": round(rise, 5),
                "flame": flame, "learning": False}


def _open_camera():
    from picamera2 import Picamera2
    cam = Picamera2()
    cam.configure(cam.create_still_configuration(main={"size": (640, 480), "format": "RGB888"}))
    cam.start()
    time.sleep(1.0)
    return cam


def start_camera_thread(on_result, interval=0.5):
    """Run the detector in a background thread. on_result(dict) gets every result and
    {'status': 'unavailable', 'message': ...} once if the camera cannot be opened."""
    def run():
        try:
            cam = _open_camera()
        except Exception as e:
            on_result({"status": "unavailable", "message": str(e)[:160]})
            return
        det = FlameDetector()
        on_result({"status": "ready"})
        while True:
            try:
                frame = cam.capture_array()          # RGB888 arrives as BGR order in memory
                res = det.update(frame[..., ::-1])
                res["status"] = "learning" if res["learning"] else "watching"
                on_result(res)
            except Exception as e:
                on_result({"status": "error", "message": str(e)[:160]})
                time.sleep(2)
            time.sleep(interval)
    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t


if __name__ == "__main__":
    if "--image" in sys.argv:
        from PIL import Image
        path = sys.argv[sys.argv.index("--image") + 1]
        frac, mask = orange_fraction(np.asarray(Image.open(path).convert("RGB")))
        print(json.dumps({"image": path, "orange": round(frac, 5),
                          "flame_like": frac >= FLAME_RISE * 3}))
    elif "--live" in sys.argv:
        def show(r): print(json.dumps(r), flush=True)
        start_camera_thread(show)
        while True: time.sleep(1)
    else:
        print(__doc__)
