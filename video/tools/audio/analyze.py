"""Measure a rendered WAV (default audio/music.wav). Measurement only: nobody listened.

Prints: ffmpeg loudnorm + own BS.1770 integrated loudness, true peak, clipping,
per-scene RMS and loudness, kick onsets measured from the file against the
planned grid (audio/beatgrid.json), a 2-second loudness plot as text.
Writes <name>_spectrogram.png next to the analysed file (numpy-only PNG).

Usage:
  python3 tools/audio/analyze.py [path.wav] [--no-png]
"""

import json
import os
import re
import subprocess
import sys

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audiolib import (SR, AUDIO_DIR, read_wav, lufs_integrated, true_peak_db,  # noqa: E402
                      sample_peak_db, loudness_windows, load_script, db, ascii_plot,
                      write_png_gray, cue_intervals)

FFMPEG = "/opt/homebrew/bin/ffmpeg"


def ffmpeg_loudness(path):
    try:
        r = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", path, "-af",
                            "loudnorm=print_format=json", "-f", "null", "-"],
                           capture_output=True, text=True, timeout=300)
        m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S)
        if not m:
            return None
        j = json.loads(m.group(0))
        return float(j["input_i"]), float(j["input_tp"]), float(j["input_lra"])
    except Exception as e:  # ffmpeg missing or failed
        print("ffmpeg loudness failed:", e)
        return None


def kick_onsets(x):
    """Low-band onset detector (35-160 Hz). Beating between kick and bass makes a
    plain envelope unreliable, so this uses an energy ratio: energy in the next
    12 ms over energy in the 30 ms before (ending 2 ms early). A kick jumps from
    near nothing to full level in about 2 ms, so the ratio peaks at its onset."""
    mono = x.mean(axis=1)
    sos = signal.butter(4, [35, 160], "bandpass", fs=SR, output="sos")
    lb = signal.sosfilt(sos, mono)          # causal, so no pre-ringing before onsets
    c = np.concatenate([[0.0], np.cumsum(lb ** 2)])
    n = len(lb)
    post, pre, gap = int(0.012 * SR), int(0.030 * SR), int(0.002 * SR)
    i = np.arange(pre + gap, n - post)
    e_post = (c[i + post] - c[i]) / post
    e_pre = (c[i - gap] - c[i - gap - pre]) / pre
    floor = 1e-7
    ratio = (e_post + floor) / (e_pre + floor)
    lvl = e_post > np.percentile(e_post, 60)
    ratio = np.where(lvl, ratio, 0)
    peaks, _ = signal.find_peaks(ratio, height=3.0, distance=int(0.10 * SR))
    return (i[peaks]) / SR


def detector_latency():
    """Calibrate the detector on an isolated synthetic kick at exactly 1.0 s."""
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 64 * np.exp(-t / 0.028)
    kk = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.20)
    y = np.zeros((2 * SR, 2))
    y[SR:SR + n] += kk[:, None] * 0.3
    det = kick_onsets(y)
    return float(det[np.argmin(np.abs(det - 1.0))] - 1.0)


def spectrogram_png(x, path, width=1500, height=400):
    mono = x.mean(axis=1)
    nfft, hop = 4096, max(1, len(mono) // width)
    win = np.hanning(nfft)
    cols = []
    for c in range(width):
        i = c * hop
        seg = mono[i:i + nfft]
        if len(seg) < nfft:
            seg = np.pad(seg, (0, nfft - len(seg)))
        cols.append(np.abs(np.fft.rfft(seg * win)))
    S = np.array(cols).T  # freq x time
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    # log-frequency rows from 30 Hz to 16 kHz
    fr = np.geomspace(30, 16000, height)
    idx = np.clip(np.searchsorted(freqs, fr), 0, len(freqs) - 1)
    img = db(S[idx] + 1e-9)
    img = np.clip((img - (img.max() - 80)) / 80, 0, 1)
    img = (255 * (1 - img[::-1])).astype(np.uint8)   # dark = loud, high freq on top
    # mark every 10 s and the 1 kHz / 4 kHz rows lightly
    for s in range(0, 151, 10):
        cx = min(width - 1, int(s / 150 * width))
        img[:, cx] = np.minimum(img[:, cx], 170)
    for f in (1000, 4000):
        r = height - 1 - int(np.searchsorted(fr, f))
        img[r, ::4] = 120
    write_png_gray(path, img)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    path = args[0] if args else os.path.join(AUDIO_DIR, "music.wav")
    x = read_wav(path)
    sc = load_script()
    print("file: %s  (%.3f s)" % (path, len(x) / SR))
    print("NOTE: measured only, not listened to.")

    ff = ffmpeg_loudness(path)
    own = lufs_integrated(x)
    if ff:
        print("ffmpeg loudnorm: I = %.2f LUFS, TP = %.2f dBTP, LRA = %.1f LU" % ff)
    print("own BS.1770:     I = %.2f LUFS, TP (4x) = %.2f dBTP, sample peak %.2f dBFS"
          % (own, true_peak_db(x), sample_peak_db(x)))
    clipped = int(np.sum(np.abs(x) >= 0.999))
    print("clipping: %d samples at or above 0.999 FS -> %s" % (clipped, "none" if clipped == 0 else "WARNING"))

    print("\nper-scene level:")
    print("  scene            window       RMS dBFS   LUFS(ungated)")
    for s in sc["scenes"]:
        a, b = int(s["start"] * SR), int(s["end"] * SR)
        seg = x[a:b]
        rms = db(np.sqrt(np.mean(seg ** 2)))
        lw = loudness_windows(seg, win=s["end"] - s["start"])[0]
        print("  %-15s %5.1f-%5.1f   %7.2f    %7.2f" % (s["id"], s["start"], s["end"], rms, lw))

    tail = x[int(149.9 * SR):]
    print("\nlast 0.1 s peak: %.1f dBFS (should be silent)" % sample_peak_db(tail))

    gpath = os.path.join(AUDIO_DIR, "beatgrid.json")
    if os.path.exists(gpath) and os.path.basename(path).startswith("music"):
        grid = json.load(open(gpath))
        planned = np.array(grid["kicks"])
        lat = detector_latency()
        det = kick_onsets(x) - lat
        errs = []
        for p in planned:
            j = np.argmin(np.abs(det - p))
            errs.append(det[j] - p)
        errs = np.array(errs)
        good = np.abs(errs) < 0.02
        first = det[det >= 29.9][0] if np.any(det >= 29.9) else float("nan")
        pre = det[det < 29.9]
        print("\nkick check (onsets measured from the file, 35-160 Hz energy-ratio detector,"
              " latency %.1f ms calibrated on an isolated kick and removed):" % (lat * 1000))
        print("  first measured low-band onset after 29.9 s: %.4f s (planned kick at 30.0000 s, error %+.1f ms)"
              % (first, (first - 30.0) * 1000))
        print("  planned kicks: %d, matched within 20 ms: %d, median |error| %.1f ms, max |error| of matched %.1f ms"
              % (len(planned), int(good.sum()), np.median(np.abs(errs[good])) * 1000,
                 np.max(np.abs(errs[good])) * 1000))
        print("  low-band onsets before 29.9 s (no kick is written there; these are felt-bass note attacks): %d" % len(pre))
        bars = [b["t"] for b in grid["bars"]]
        print("  bar lines at scene boundaries: " + ", ".join("%.2f" % s["start"] for s in grid["sections"])
              + ", final chord %.2f" % grid["final_chord"])
        print("  bars total: %d" % len(bars))

    print("\nloudness every 2 s (ungated K-weighted, LUFS); c = subtitle cue active, | = scene start")
    lw = loudness_windows(x, 2.0)
    cues = cue_intervals()
    starts = {int(s["start"]) // 2 * 2 for s in sc["scenes"]}
    labels, marks = [], {}
    for i, v in enumerate(lw):
        t = i * 2
        lab = "%s%5.0fs %s" % ("|" if t in starts else " ", t,
                               "c" if any(a < t + 2 and b > t for a, b in cues) else " ")
        labels.append(lab)
    print(ascii_plot(lw, labels, lo=-50, hi=-14, width=48, marks=marks))

    if "--no-png" not in sys.argv:
        png = os.path.splitext(path)[0] + "_spectrogram.png"
        spectrogram_png(x, png)
        print("\nspectrogram: %s (log freq 30 Hz-16 kHz, dark = loud, ticks every 10 s, dotted rows at 1 and 4 kHz)" % png)


if __name__ == "__main__":
    main()
