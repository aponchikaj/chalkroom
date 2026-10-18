"""Shared helpers for the Chalkroom Live film audio: WAV IO, loudness, limiter.

numpy + scipy only. All audio is float64 arrays shaped (n, 2) at 48 kHz.
"""

import json
import os
import wave

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d, maximum_filter1d, uniform_filter1d

SR = 48000
DURATION = 150.0
N_TOTAL = int(round(DURATION * SR))

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.abspath(os.path.join(HERE, "..", ".."))
AUDIO_DIR = os.path.join(VIDEO_DIR, "audio")
SCRIPT_JSON = os.path.join(VIDEO_DIR, "script.json")


# ---------------------------------------------------------------- IO

def write_wav(path, x, bits=24):
    """Write float audio (n, 2) in [-1, 1] as 16- or 24-bit PCM stereo."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    x = np.clip(x, -1.0, 1.0 - 1e-9)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    if bits == 16:
        data = np.round(x * 32767.0).astype("<i2").tobytes()
        width = 2
    elif bits == 24:
        ints = np.round(x * 8388607.0).astype("<i4")
        b = ints.view(np.uint8).reshape(-1, 4)[:, :3]
        data = b.tobytes()
        width = 3
    else:
        raise ValueError("bits must be 16 or 24")
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(width)
        w.setframerate(SR)
        w.writeframes(data)


def read_wav(path):
    """Read 16/24/32-bit PCM WAV to float (n, 2). Mono is duplicated."""
    with wave.open(path, "rb") as w:
        ch, width, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if width == 2:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    elif width == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        ints = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8)
                | (b[:, 2].astype(np.int32) << 16))
        ints = np.where(ints & 0x800000, ints - 0x1000000, ints)
        x = ints.astype(np.float64) / 8388608.0
    elif width == 4:
        x = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2147483648.0
    else:
        raise ValueError("unsupported sample width %d" % width)
    x = x.reshape(-1, ch)
    if ch == 1:
        x = np.repeat(x, 2, axis=1)
    if sr != SR:
        g = np.gcd(sr, SR)
        x = signal.resample_poly(x, SR // g, sr // g, axis=0)
    return x[:, :2]


def fit_length(x, n=N_TOTAL):
    if len(x) >= n:
        return x[:n]
    pad = np.zeros((n - len(x), x.shape[1]))
    return np.concatenate([x, pad], axis=0)


# ---------------------------------------------------------------- levels

def db(v):
    return 20.0 * np.log10(np.maximum(v, 1e-12))


def undb(d):
    return 10.0 ** (d / 20.0)


def k_weight(x):
    """ITU-R BS.1770 K-weighting at 48 kHz."""
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b1, a1, x, axis=0)
    return signal.lfilter(b2, a2, y, axis=0)


def lufs_integrated(x):
    """Integrated loudness (LUFS) with absolute and relative gating."""
    y = k_weight(x)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    if len(y) < blk:
        return -np.inf
    ms = np.sum(y ** 2, axis=1)
    c = np.concatenate([[0.0], np.cumsum(ms)])
    starts = np.arange(0, len(y) - blk + 1, hop)
    z = (c[starts + blk] - c[starts]) / blk
    lk = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    z = z[lk > -70.0]
    if len(z) == 0:
        return -np.inf
    rel = -0.691 + 10 * np.log10(np.mean(z)) - 10.0
    lk2 = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    z = z[lk2 > rel]
    return -0.691 + 10 * np.log10(np.mean(z))


def loudness_windows(x, win=2.0):
    """Ungated K-weighted loudness per consecutive window (LUFS)."""
    y = k_weight(x)
    n = int(win * SR)
    out = []
    for i in range(0, len(y), n):
        seg = y[i:i + n]
        z = np.mean(np.sum(seg ** 2, axis=1))
        out.append(-0.691 + 10 * np.log10(max(z, 1e-20)))
    return np.array(out)


def true_peak_db(x):
    up = signal.resample_poly(x, 4, 1, axis=0)
    return db(np.max(np.abs(up)))


def sample_peak_db(x):
    return db(np.max(np.abs(x)))


def limiter(x, ceiling_db=-3.5, lookahead_ms=3.0, smooth_ms=40.0):
    """Look-ahead peak limiter, fully vectorised and never overshooting.

    gain = min over +-lookahead of (ceiling / peak), then a short moving
    average (which can only lower the gain at a peak, so no overshoot), then
    a longer release smoothing taken as the minimum with the fast curve.
    """
    ceil = undb(ceiling_db)
    peak = np.max(np.abs(x), axis=1)
    g = np.minimum(1.0, ceil / np.maximum(peak, 1e-12))
    L = max(1, int(lookahead_ms * 1e-3 * SR))
    gmin = minimum_filter1d(g, size=2 * L + 1)
    gfast = uniform_filter1d(gmin, size=L + 1)
    S = max(1, int(smooth_ms * 1e-3 * SR))
    gslow = uniform_filter1d(minimum_filter1d(g, size=2 * S + 1), size=S + 1)
    gain = np.minimum(gfast, gslow)
    y = x * gain[:, None]
    # last-resort safety, should never engage
    return np.clip(y, -ceil, ceil), float(db(np.min(gain)))


def normalize_lufs(x, target, ceiling_db, iters=3):
    """Gain to target LUFS, then limit to the true-peak ceiling. Iterates so
    limiting does not leave the result short of the target."""
    y = x.copy()
    gr = 0.0
    for _ in range(iters):
        cur = lufs_integrated(y)
        if not np.isfinite(cur):
            return y, -np.inf, gr
        y = y * undb(target - cur)
        y, gr = limiter(y, ceiling_db - 0.3)
        tp = true_peak_db(y)
        if tp > ceiling_db:
            y = y * undb(ceiling_db - tp - 0.05)
    return y, lufs_integrated(y), gr


# ---------------------------------------------------------------- script

def load_script():
    with open(SCRIPT_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def cue_intervals():
    s = load_script()
    return [(float(c["start"]), float(c["end"])) for c in s["cues"]]


def scene_of(t, scenes):
    for sc in scenes:
        if sc["start"] <= t < sc["end"]:
            return sc["id"]
    return scenes[-1]["id"] if t >= scenes[-1]["end"] else "pre"


def smooth_gain_curve(target_db, attack_ms, release_ms, rate=1000):
    """Smooth a control-rate gain curve given in dB (negative = attenuation).
    Attack = moving further down, release = coming back up. Returns linear
    gain at audio rate (N samples = len(target_db) * SR / rate)."""
    a_c = np.exp(-1.0 / (attack_ms * 1e-3 * rate))
    r_c = np.exp(-1.0 / (release_ms * 1e-3 * rate))
    out = np.empty_like(target_db)
    cur = 0.0
    for i, tgt in enumerate(target_db):
        c = a_c if tgt < cur else r_c
        cur = c * cur + (1 - c) * tgt
        out[i] = cur
    t_ctrl = np.arange(len(out)) / rate
    n = int(round(len(out) * SR / rate))
    t_aud = np.arange(n) / SR
    return undb(np.interp(t_aud, t_ctrl, out))


def ascii_plot(values, labels, lo=-50.0, hi=-10.0, width=50, marks=None):
    lines = []
    for v, lab in zip(values, labels):
        k = int(np.clip((v - lo) / (hi - lo), 0, 1) * width)
        extra = ""
        if marks:
            extra = "  " + marks.get(lab, "")
        lines.append("%s %6.1f |%s%s" % (lab, v, "#" * k, extra))
    return "\n".join(lines)


def write_png_gray(path, img):
    """Minimal grayscale 8-bit PNG writer (img: 2-D uint8, row 0 = top)."""
    import struct
    import zlib
    h, w = img.shape
    raw = b"".join(b"\x00" + img[r].tobytes() for r in range(h))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
