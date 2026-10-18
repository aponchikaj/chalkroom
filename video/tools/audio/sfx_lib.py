"""Synthesized one-shot SFX for the Chalkroom Live film (printed-manual world).

Every sound is made from sines and filtered noise, deterministic for a given
seed. render(name, seed) returns float stereo (n, 2) peaking at about -1 dBFS;
the mixer (mix_sfx.py) applies the per-sound LEVEL_DB balance.

Run this file to write previews:  python3 tools/audio/sfx_lib.py
-> audio/sfx/<name>.wav (16-bit stereo 48 kHz, preview level)
"""

import os
import sys

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audiolib import SR, AUDIO_DIR, write_wav, undb  # noqa: E402

NAMES = ["paper", "stamp", "plot", "key", "pop", "chime", "click", "thud", "whoosh", "swap"]

# Balance in the SFX stem, dB relative to a -1 dBFS one-shot. Tuned by measured
# loudness so a stamp reads as the heaviest event and keys/plot ticks stay small.
LEVEL_DB = {
    "paper": -12.0, "stamp": -5.0, "plot": -7.5, "key": -11.0, "pop": -10.0,
    "chime": -13.0, "click": -7.0, "thud": -9.0, "whoosh": -14.5, "swap": -11.5,
}


def _t(dur):
    n = int(dur * SR)
    return n, np.arange(n) / SR


def _bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x)


def _lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "lowpass", fs=SR, output="sos"), x)


def _hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "highpass", fs=SR, output="sos"), x)


def _att(n, a):
    e = np.ones(n)
    k = min(n, max(1, int(a * SR)))
    e[:k] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, k))
    return e


def _fade_out(x, d=0.01):
    k = min(len(x), int(d * SR))
    x[-k:] *= np.linspace(1, 0, k)[:, None] if x.ndim == 2 else np.linspace(1, 0, k)
    return x


def _stereo(m, pan=0.0, width=0.0, rng=None, side=None):
    th = (pan + 1) * np.pi / 4
    L, R = m * np.cos(th) * np.sqrt(2), m * np.sin(th) * np.sqrt(2)
    if width and side is not None:
        L, R = L + width * side, R - width * side
    return np.stack([L, R], axis=1)


def _norm(x, peak_db=-1.0):
    p = np.max(np.abs(x))
    return x * (undb(peak_db) / p) if p > 0 else x


def sweep_noise(rng, n, f_lo_start, f_lo_end, bw_ratio=1.8, bands=12):
    """Noise whose pass band slides from f_lo_start to f_lo_end (crossfaded bands)."""
    u = np.linspace(0, 1, n)
    centre = np.geomspace(f_lo_start, f_lo_end, n)
    edges = np.geomspace(min(f_lo_start, f_lo_end) / 1.3, max(f_lo_start, f_lo_end) * 1.3, bands)
    out = np.zeros(n)
    for c in edges:
        lo, hi = c / np.sqrt(bw_ratio), min(c * np.sqrt(bw_ratio), SR / 2 - 500)
        y = _bp(rng.standard_normal(n), lo, hi)
        w = np.exp(-(np.log(centre / c) ** 2) / (2 * 0.22 ** 2))
        out += y * w
    return out, u


# ------------------------------------------------------------------ sounds

def paper(rng):
    """Paper slide: band-passed noise sweep, 0.35 s."""
    n, t = _t(0.35)
    m, u = sweep_noise(rng, n, 900, 3800)
    body = _lp(rng.standard_normal(n), 700) * 0.5
    grain = (1 + 0.35 * _lp(rng.standard_normal(n), 60) / 0.05).clip(0.3, 2.0)   # paper fibre flutter
    env = np.sin(np.pi * np.clip(u / 0.85, 0, 1)) ** 1.4 * np.exp(-u * 1.2)
    m = (m + body) * grain * env
    side = _bp(rng.standard_normal(n), 1500, 5000) * env * 0.15
    return _fade_out(_stereo(m, 0.0, 1.0, side=side))


def stamp(rng):
    """Rubber stamp: low thump + short noise slap, with a rubbery mid knock."""
    n, t = _t(0.32)
    f = 58 + 60 * np.exp(-t / 0.018)
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.075)
    knock = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.03) * 0.45
    slap = _bp(rng.standard_normal(n), 350, 2600) * np.exp(-t / 0.011) * 0.55
    ink = _bp(rng.standard_normal(n), 2500, 6000) * np.exp(-((t - 0.012) ** 2) / 1e-5) * 0.08
    m = (thump + knock + slap + ink) * _att(n, 0.0012)
    return _fade_out(_stereo(m))


def plot(rng):
    """Pen plotter: a burst of 7 tiny ticks over 0.4 s, with a faint servo whir."""
    n, t = _t(0.42)
    m = np.zeros(n)
    times = np.sort(np.concatenate([[0.0], rng.uniform(0.03, 0.36, 6)]))
    for i, t0 in enumerate(times):
        k = int(t0 * SR)
        L = int(0.012 * SR)
        tt = np.arange(L) / SR
        f = rng.uniform(2600, 3400)
        tick = (np.sin(2 * np.pi * f * tt) * 0.5 + _hp(rng.standard_normal(L), 4000) * 0.6) * np.exp(-tt / 0.0018)
        m[k:k + L] += tick[: n - k] * rng.uniform(0.55, 1.0)
    whir = np.sin(2 * np.pi * (420 + 60 * np.sin(2 * np.pi * 7 * t)) * t) * 0.025
    whir *= np.sin(np.pi * t / t[-1]) ** 2
    m += whir
    return _fade_out(_stereo(m, rng.uniform(-0.15, 0.15)))


def key(rng):
    """Soft keyboard click: press + lighter release, low plastic body."""
    n, t = _t(0.11)
    m = np.zeros(n)
    for t0, g in ((0.0, 1.0), (rng.uniform(0.045, 0.06), 0.45)):
        k = int(t0 * SR)
        L = n - k
        tt = np.arange(L) / SR
        c = _bp(rng.standard_normal(L), 1800, 5200) * np.exp(-tt / 0.004)
        body = np.sin(2 * np.pi * rng.uniform(230, 270) * tt) * np.exp(-tt / 0.012) * 0.6
        m[k:] += g * (c + body)
    return _fade_out(_stereo(m * _att(n, 0.0005)))


def pop(rng):
    """Soft wooden pop for a person joining."""
    n, t = _t(0.16)
    f = 520 + 420 * np.exp(-t / 0.012)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035)
    wood = np.sin(2 * np.pi * 1320 * t) * np.exp(-t / 0.012) * 0.18
    air = _bp(rng.standard_normal(n), 800, 3000) * np.exp(-t / 0.006) * 0.2
    m = (tone + wood + air) * _att(n, 0.0015)
    return _fade_out(_stereo(m))


def chime(rng):
    """Gentle two-tone chime (a fifth up) for a correct answer."""
    n, t = _t(1.1)
    m = np.zeros(n)
    for t0, f, g in ((0.0, 783.99, 0.8), (0.11, 1174.66, 1.0)):   # G5 then D6
        k = int(t0 * SR)
        tt = t[: n - k]
        y = (np.sin(2 * np.pi * f * tt) + 0.18 * np.sin(2 * np.pi * 2.0 * f * tt) * np.exp(-tt / 0.15)
             + 0.07 * np.sin(2 * np.pi * 2.76 * f * tt) * np.exp(-tt / 0.08))
        m[k:] += g * y * np.exp(-tt / 0.32) * _att(len(tt), 0.004)
    return _fade_out(_stereo(m, 0.1), 0.05)


def click(rng):
    """UI click: tiny bright tick with a little body."""
    n, t = _t(0.05)
    m = (_hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.0012) * 0.7
         + np.sin(2 * np.pi * 2100 * t) * np.exp(-t / 0.004) * 0.35
         + np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.008) * 0.3)
    return _fade_out(_stereo(m * _att(n, 0.0003)))


def thud(rng):
    """Low dull tick for the problem beats (vermilion moments)."""
    n, t = _t(0.28)
    f = 92 + 30 * np.exp(-t / 0.02)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.06)
    dull = _lp(rng.standard_normal(n), 500) * np.exp(-t / 0.012) * 0.6
    m = (body + dull) * _att(n, 0.002)
    return _fade_out(_stereo(m))


def whoosh(rng):
    """Soft air for camera moves: 0.6 s, sweeps up then down, drifts L to R."""
    n, t = _t(0.6)
    u = np.linspace(0, 1, n)
    up, _ = sweep_noise(rng, n // 2, 400, 2200, bands=10)
    dn, _ = sweep_noise(rng, n - n // 2, 2200, 700, bands=10)
    m = np.concatenate([up, dn])
    env = np.sin(np.pi * u) ** 2.2
    m = _lp(m * env, 5000)
    th = (u * 0.8 - 0.4 + 1) * np.pi / 4
    return _fade_out(np.stack([m * np.cos(th), m * np.sin(th)], axis=1) * np.sqrt(2))


def swap(rng):
    """Very short paper flick for content swaps."""
    n, t = _t(0.12)
    m = _bp(rng.standard_normal(n), 2000, 7000) * np.exp(-t / 0.012)
    k = int(rng.uniform(0.025, 0.04) * SR)
    m[k:] += _bp(rng.standard_normal(n - k), 1500, 5000) * np.exp(-t[: n - k] / 0.008) * 0.5
    m += _lp(rng.standard_normal(n), 900) * np.exp(-t / 0.02) * 0.3
    return _fade_out(_stereo(m * _att(n, 0.001)))


SOUNDS = {nm: globals()[nm] for nm in NAMES}


def render(name, seed=0):
    if name not in SOUNDS:
        raise KeyError("unknown sfx %r (known: %s)" % (name, ", ".join(NAMES)))
    rng = np.random.default_rng(seed)
    return _norm(SOUNDS[name](rng), -1.0)


def main():
    out_dir = os.path.join(AUDIO_DIR, "sfx")
    os.makedirs(out_dir, exist_ok=True)
    for nm in NAMES:
        x = render(nm, seed=1)
        x = np.concatenate([np.zeros((int(0.02 * SR), 2)), x * undb(-2.0), np.zeros((int(0.1 * SR), 2))])
        p = os.path.join(out_dir, nm + ".wav")
        write_wav(p, x, bits=16)
        print("wrote %-40s %.3f s" % (os.path.relpath(p, os.path.dirname(AUDIO_DIR)), len(x) / SR))


if __name__ == "__main__":
    main()
