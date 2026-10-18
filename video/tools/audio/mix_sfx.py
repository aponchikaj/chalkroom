"""Render the SFX stem audio/sfx.wav (150.0 s) from audio/cues/*.json.

Each cue file is a JSON array of {"t": film_seconds, "name": <sfx name>,
optional "gain": dB, optional "dur": s for "key" typing bursts}, or an object {"scene", "start", "cues": [same items]}.
Names: paper, stamp, plot, key, pop, chime, click, thud, whoosh, swap
(see sfx_lib.py).

Every hit gets a tiny deterministic variation (pitch +-3 %, gain +-1.5 dB,
seeded from name, time and file) so repeats do not sound robotic. The stem is
normalised to about -26 LUFS integrated and limited to -5 dBTP so it sits
under a voice. With no cue files it writes 150 s of silence.

Usage:
  python3 tools/audio/mix_sfx.py [--cues-dir DIR] [--out PATH] [--target LUFS] [--no-normalize]
"""

import argparse
import glob
import json
import os
import sys
import zlib

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audiolib import (SR, N_TOTAL, AUDIO_DIR, write_wav, load_script, scene_of,  # noqa: E402
                      normalize_lufs, lufs_integrated, true_peak_db, undb)
import sfx_lib  # noqa: E402

CEILING_DBTP = -5.0
MAX_BOOST_DB = 6.0   # never push sparse SFX up by more than this to reach the target


def load_cues(cues_dir):
    cues = []
    files = sorted(glob.glob(os.path.join(cues_dir, "*.json")))
    for fp in files:
        try:
            with open(fp, "r", encoding="utf-8") as f:
                arr = json.load(f)
        except Exception as e:
            print("warning: cannot read %s: %s" % (fp, e))
            continue
        if isinstance(arr, dict) and isinstance(arr.get("cues"), list):
            arr = arr["cues"]          # {"scene":..., "start":..., "cues": [...]} form
        if not isinstance(arr, list):
            print("warning: %s is neither a JSON array nor an object with a 'cues' array, skipped" % fp)
            continue
        for j, c in enumerate(arr):
            try:
                t = float(c["t"])
                nm = str(c["name"])
                g = float(c.get("gain", 0.0))
            except Exception:
                print("warning: %s item %d malformed, skipped: %r" % (os.path.basename(fp), j, c))
                continue
            if nm not in sfx_lib.SOUNDS:
                print("warning: %s item %d unknown name %r, skipped" % (os.path.basename(fp), j, nm))
                continue
            if not (0.0 <= t < 150.0):
                print("warning: %s item %d time %.3f outside 0-150 s, skipped" % (os.path.basename(fp), j, t))
                continue
            dur = float(c.get("dur", 0.0) or 0.0)
            if nm == "key" and dur > 0:
                # A typing burst: one soft click per character at about 18 chars/s,
                # with a fixed jitter pattern so it does not sound mechanical.
                n = max(1, int(dur * 18))
                for k in range(n):
                    tk = t + k / 18.0 + (0.012 if k % 3 == 1 else -0.006 if k % 3 == 2 else 0.0)
                    if 0.0 <= tk < 150.0:
                        cues.append(dict(t=tk, name=nm, gain=g - 3.0, file=os.path.basename(fp)))
                continue
            cues.append(dict(t=t, name=nm, gain=g, file=os.path.basename(fp)))
    cues.sort(key=lambda c: (c["t"], c["name"]))
    return files, cues


_CACHE = {}


def one_shot(name, variant):
    key = (name, variant)
    if key not in _CACHE:
        _CACHE[key] = sfx_lib.render(name, seed=1000 + variant)
    return _CACHE[key]


def varied(c):
    seed = zlib.crc32(("%s|%.3f|%s" % (c["name"], c["t"], c["file"])).encode())
    rng = np.random.default_rng(seed)
    x = one_shot(c["name"], int(rng.integers(0, 4)))       # 4 noise variants per sound
    pitch = 1.0 + rng.uniform(-0.03, 0.03)
    gain_db = sfx_lib.LEVEL_DB[c["name"]] + c["gain"] + rng.uniform(-1.5, 1.5)
    n_out = int(len(x) / pitch)
    src = np.arange(n_out) * pitch
    y = np.stack([np.interp(src, np.arange(len(x)), x[:, ch]) for ch in range(2)], axis=1)
    return y * undb(gain_db), pitch, gain_db


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cues-dir", default=os.path.join(AUDIO_DIR, "cues"))
    ap.add_argument("--out", default=os.path.join(AUDIO_DIR, "sfx.wav"))
    ap.add_argument("--target", type=float, default=-26.0)
    ap.add_argument("--no-normalize", action="store_true")
    a = ap.parse_args()

    files, cues = load_cues(a.cues_dir)
    out = np.zeros((N_TOTAL + SR * 2, 2))
    for c in cues:
        y, _, _ = varied(c)
        i = int(round(c["t"] * SR))
        out[i:i + len(y)] += y
    out = out[:N_TOTAL]
    # the end card must be silent at the very end
    out[int(149.95 * SR):] *= 0.0

    print("cue files: %d in %s" % (len(files), a.cues_dir))
    if not cues:
        write_wav(a.out, out, bits=24)
        print("no cues: wrote 150.0 s of silence to %s" % a.out)
        return

    raw = lufs_integrated(out)
    if a.no_normalize:
        res, lufs = out, raw
    else:
        tgt = min(a.target, raw + MAX_BOOST_DB)
        res, lufs, _ = normalize_lufs(out, tgt, CEILING_DBTP)
    write_wav(a.out, res, bits=24)

    sc = load_script()["scenes"]
    per_scene, per_name = {}, {}
    for c in cues:
        s = scene_of(c["t"], sc)
        per_scene.setdefault(s, {}).setdefault(c["name"], 0)
        per_scene[s][c["name"]] += 1
        per_name[c["name"]] = per_name.get(c["name"], 0) + 1
    print("cues: %d total" % len(cues))
    for s in sc:
        d = per_scene.get(s["id"], {})
        tot = sum(d.values())
        detail = ", ".join("%s %d" % (k, v) for k, v in sorted(d.items()))
        print("  %-15s %5.1f-%5.1f  %3d  %s" % (s["id"], s["start"], s["end"], tot, detail))
    print("by sound: " + ", ".join("%s %d" % (k, v) for k, v in sorted(per_name.items())))
    print("loudness: raw %.2f LUFS -> %.2f LUFS integrated, true peak %.2f dBTP"
          % (raw, lufs, true_peak_db(res)))
    print("wrote %s (%.3f s)" % (a.out, len(res) / SR))


if __name__ == "__main__":
    main()
