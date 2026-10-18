"""Original score for the Chalkroom Live film: audio/music.wav (150.0 s).

Fully synthesized with numpy/scipy, deterministic (fixed seeds).

Tempo map: every scene boundary the film cares about is a bar line. Each
section has a whole number of beats and its own tempo between 102 and 105.0
BPM (so the drift is inaudible), with an occasional 3/4, 2/4 or 1/4 bar as a
turnaround. Bars land exactly on 0, 11, 22, 30, 50, 64, 82, 98, 112, 122,
138 and the final chord on 146.

Key: D minor for the problem act (0-30), D major from the reveal (30).

Run:  python3 tools/audio/score.py [--target LUFS]   (default -24 LUFS integrated)
Writes audio/music.wav (24-bit stereo 48 kHz) and audio/beatgrid.json.
"""

import json
import os
import sys

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audiolib import (SR, N_TOTAL, AUDIO_DIR, write_wav, cue_intervals,  # noqa: E402
                      normalize_lufs, true_peak_db, lufs_integrated, db, undb)

TARGET_LUFS = -24.0
CEILING_DBTP = -3.5

# ------------------------------------------------------------------ tempo map
# (id, start, end, bar lengths in beats)
SECTIONS = [
    ("s01", 0.0, 11.0, [4, 4, 4, 4, 3]),          # problem: alone
    ("s02", 11.0, 22.0, [4, 4, 4, 4, 3]),         # problem: classroom
    ("s03", 22.0, 30.0, [4, 4, 4, 2]),            # problem: 1:1 tutors
    ("s04", 30.0, 50.0, [4, 4, 4, 4, 4, 4, 4, 4, 3]),  # reveal + join (bar 4 = s05)
    ("s06", 50.0, 64.0, [4, 4, 4, 4, 4, 4]),      # lesson
    ("s07", 64.0, 82.0, [4, 4, 4, 4, 4, 4, 4, 3]),  # triage
    ("s08", 82.0, 98.0, [4, 4, 4, 4, 4, 4, 4]),   # thread
    ("s09", 98.0, 112.0, [4, 4, 4, 4, 4, 4]),     # check
    ("s10", 112.0, 122.0, [4, 4, 4, 4, 1]),       # catch-up (last beat = break)
    ("s11", 122.0, 138.0, [4, 4, 4, 4, 4, 4, 4]),  # agents build
    ("s12", 138.0, 146.0, [4, 4, 4, 2]),          # end card, final chord at 146
]
FINAL_CHORD_T = 146.0


def build_grid():
    bars = []
    for sid, t0, t1, lens in SECTIONS:
        beats = sum(lens)
        bd = (t1 - t0) / beats
        t = t0
        for i, n in enumerate(lens):
            bars.append(dict(sec=sid, i=i, t0=t, beat=bd, n=n, bpm=60.0 / bd))
            t += n * bd
    return bars


BARS = build_grid()
SEC = {}
for b in BARS:
    SEC.setdefault(b["sec"], []).append(b)


def T(sec, bar, beat=0.0):
    b = SEC[sec][bar]
    return b["t0"] + beat * b["beat"]


# ------------------------------------------------------------------ notes
_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(name):
    pc = _PC[name[0]]
    rest = name[1:]
    if rest and rest[0] in "#b":
        pc += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + pc


def hz(name_or_midi):
    m = midi(name_or_midi) if isinstance(name_or_midi, str) else name_or_midi
    return 440.0 * 2 ** ((m - 69) / 12.0)


# ------------------------------------------------------------------ voices
RNG = np.random.default_rng(20261018)


def env_attack(n, att):
    e = np.ones(n)
    a = min(n, max(1, int(att * SR)))
    e[:a] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    return e


def pluck(freq, dur, vel=0.7, bright=0.5, kind="keys"):
    """Soft plucked piano / marimba / bell, additive with per-partial decay."""
    if kind == "keys":
        tau = 1.5 * (261.6 / freq) ** 0.35
        parts = []
        for k in range(1, 9):
            f = k * freq * np.sqrt(1 + 0.00035 * k * k)
            if f > 9000:
                break
            parts.append((f, (1.0 / k ** 1.4) * bright ** ((k - 1) * 0.8), tau / (1 + 0.55 * (k - 1))))
        att = 0.005
    elif kind == "marimba":
        tau = 0.55 * (261.6 / freq) ** 0.4
        parts = [(freq, 1.0, tau), (freq * 3.93, 0.30 * bright, tau * 0.16),
                 (freq * 9.6, 0.08 * bright, tau * 0.06)]
        att = 0.003
    elif kind == "bell":
        tau = 2.2
        parts = [(freq, 1.0, tau), (freq * 2.0, 0.25 * bright, tau * 0.6),
                 (freq * 2.76, 0.22 * bright, tau * 0.35), (freq * 5.4, 0.06 * bright, tau * 0.15)]
        att = 0.004
    else:
        raise ValueError(kind)
    rel = 0.18
    n = int((dur + rel + 0.05) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f, a, tau_k in parts:
        if f >= SR / 2 - 1000:
            continue
        y += a * np.sin(2 * np.pi * f * t + RNG.uniform(0, 0.3)) * np.exp(-t / tau_k)
    e = env_attack(n, att)
    off = int(dur * SR)
    if off < n:
        e[off:] *= np.exp(-(t[off:] - t[off]) / (rel / 4))
    return vel * y * e


def felt_bass(freq, dur, vel=0.7):
    n = int((dur + 0.12) * SR)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * freq * t) + 0.28 * np.sin(4 * np.pi * freq * t)
         + 0.07 * np.sin(6 * np.pi * freq * t))
    e = env_attack(n, 0.012) * np.exp(-t / 1.4)
    off = int(dur * SR)
    e[off:] *= np.exp(-(t[off:] - t[off]) / 0.03)
    return vel * y * e


def kick(vel=0.8):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 64 * np.exp(-t / 0.028)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.20)
    body *= env_attack(n, 0.0015)
    click = RNG.standard_normal(n) * np.exp(-t / 0.0025) * 0.10
    click = signal.sosfilt(signal.butter(2, [800, 3000], "bandpass", fs=SR, output="sos"), click)
    return vel * (body + click)


_HP_HAT = signal.butter(4, 6500, "highpass", fs=SR, output="sos")
_BP_SHK = signal.butter(2, [3500, 9000], "bandpass", fs=SR, output="sos")
_BP_RIM = signal.butter(2, [1400, 2600], "bandpass", fs=SR, output="sos")


def hat(vel=0.5, length=0.035):
    n = int(0.15 * SR)
    t = np.arange(n) / SR
    x = signal.sosfilt(_HP_HAT, RNG.standard_normal(n))
    return vel * x * np.exp(-t / length) * env_attack(n, 0.001)


def shaker(vel=0.5):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    x = signal.sosfilt(_BP_SHK, RNG.standard_normal(n))
    e = (1 - np.exp(-t / 0.008)) * np.exp(-t / 0.035)
    return vel * x * e


def rim(vel=0.4):
    """Soft wooden rim tick (kept quiet: it sits in the voice band)."""
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    x = signal.sosfilt(_BP_RIM, RNG.standard_normal(n)) * np.exp(-t / 0.012)
    tone = np.sin(2 * np.pi * 620 * t) * np.exp(-t / 0.02)
    return vel * (0.6 * x + 0.5 * tone) * env_attack(n, 0.001)


def pad_chord(notes, dur, bright=0.35, att=0.5, rel=0.9, vel=0.5):
    """Warm detuned additive pad; returns stereo (n, 2)."""
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for nm in notes:
        f0 = hz(nm)
        for side, det in ((0, -0.0035), (1, 0.0035), (0, 0.0), (1, 0.0)):
            f = f0 * (1 + det)
            y = np.zeros(n)
            for k in range(1, 7):
                fk = k * f
                if fk > 7000:
                    break
                y += (1.0 / k) * bright ** (k - 1) * np.sin(2 * np.pi * fk * t + RNG.uniform(0, 2 * np.pi))
            out[:, side] += y
    e = env_attack(n, att)
    off = int(dur * SR)
    tail = n - off
    e[off:] *= np.cos(np.linspace(0, np.pi / 2, tail)) ** 2
    out *= (e * vel / (2.0 * len(notes)))[:, None]
    return out


# ------------------------------------------------------------------ buses
BUS_NAMES = ["kick", "bass", "keys", "lead", "pad", "perc", "fx", "marimba", "bell"]
BUS = {k: np.zeros((N_TOTAL + SR * 4, 2)) for k in BUS_NAMES}
KICK_TIMES = []


def place(bus, t, x, pan=0.0, gain=1.0):
    if t < 0 or t >= 150.0:
        return
    i = int(round(t * SR))
    if x.ndim == 1:
        th = (pan + 1) * np.pi / 4
        x = np.stack([x * np.cos(th), x * np.sin(th)], axis=1) * np.sqrt(2)
    j = min(len(BUS[bus]), i + len(x))
    BUS[bus][i:j] += gain * x[: j - i]


CUES = cue_intervals()


def in_cue(t, pre=0.12, post=0.05):
    return any(a - pre <= t <= b + post for a, b in CUES)


def lead(t, name, dur_s, vel=0.7, kind="keys"):
    """Lead melody note. Inside a subtitle cue (where the voice will speak) it
    drops about 8 dB and loses its upper partials, so the 1-4 kHz band stays
    clear; in the gaps between cues it speaks up."""
    if in_cue(t):
        g, br = 0.40, 0.22
    else:
        g, br = 1.0, 0.55
    place("lead", t, pluck(hz(name), dur_s, vel * g, br, kind), pan=0.18)


def play_lead(sec, notes, kind="keys", vel=0.7):
    """notes: list of (bar, beat, note, dur_beats[, vel])."""
    for nt in notes:
        bar, beat, nm, d = nt[:4]
        v = nt[4] if len(nt) > 4 else vel
        b = SEC[sec][bar]
        lead(T(sec, bar, beat), nm, d * b["beat"], v, kind)


def k(t, vel=0.8):
    KICK_TIMES.append(round(t, 4))
    place("kick", t, kick(vel))


def bassnote(t, name, dur_s, vel=0.7):
    place("bass", t, felt_bass(hz(name), dur_s, vel))


def chord_pad(sec, bar, notes, bright=0.35, vel=0.5, att=0.5, beats=None):
    b = SEC[sec][bar]
    d = (beats if beats is not None else b["n"]) * b["beat"]
    place("pad", T(sec, bar), pad_chord(notes, d + 0.15, bright, att, vel=vel))


def comp(sec, bar, notes, pattern, vel=0.35, bright=0.35, kind="keys", bus="keys", pan=-0.25, dur=0.9):
    """Accompaniment pluck pattern: pattern = list of (beat, note index or list)."""
    b = SEC[sec][bar]
    for beat, idx in pattern:
        if beat >= b["n"]:
            continue
        idxs = idx if isinstance(idx, (list, tuple)) else [idx]
        for j in idxs:
            nm = notes[j % len(notes)]
            v = vel * (0.85 + 0.3 * RNG.random())
            place(bus, T(sec, bar, beat) + RNG.uniform(0, 0.006),
                  pluck(hz(nm), dur * b["beat"], v, bright, kind), pan=pan)


def perc_line(sec, bar, kind, step, vel, accent=None, pan=0.3, start=0.0, stop=None):
    b = SEC[sec][bar]
    stop = b["n"] if stop is None else stop
    beat = start
    while beat < stop - 1e-6:
        v = vel
        if accent is not None and abs((beat % 1.0) - accent) < 1e-6:
            v *= 1.5
        v *= 0.85 + 0.3 * RNG.random()
        x = {"hat": hat, "shaker": shaker, "rim": rim}[kind](v)
        place("perc", T(sec, bar, beat), x, pan=pan)
        beat += step


# ------------------------------------------------------------------ harmony
# chord = (bass note, pad voicing, comp notes)
CH = {
    "Dm9": ("D2", ["D3", "F3", "A3", "E4"], ["D4", "F4", "A4", "E5"]),
    "Bbmaj7": ("Bb1", ["Bb2", "D3", "F3", "A3"], ["Bb3", "D4", "F4", "A4"]),
    "Gm9": ("G1", ["G2", "Bb2", "D3", "A3"], ["G3", "Bb3", "D4", "A4"]),
    "Dm/A": ("A1", ["A2", "D3", "F3", "A3"], ["A3", "D4", "F4", "A4"]),
    "A7sus": ("A1", ["A2", "D3", "E3", "G3"], ["A3", "D4", "E4", "G4"]),
    "Gm7": ("G1", ["G2", "Bb2", "D3", "F3"], ["G3", "Bb3", "D4", "F4"]),
    "Dm": ("D2", ["D3", "F3", "A3", "D4"], ["D4", "F4", "A4", "D5"]),
    "Cadd9": ("C2", ["C3", "E3", "G3", "D4"], ["C4", "E4", "G4", "D5"]),
    "A7": ("A1", ["A2", "C#3", "E3", "G3"], ["A3", "C#4", "E4", "G4"]),
    "Bb6": ("Bb1", ["Bb2", "D3", "F3", "G3"], ["Bb3", "D4", "F4", "G4"]),
    "Csus2": ("C2", ["C3", "D3", "G3", "C4"], ["C4", "D4", "G4", "C5"]),
    "A": ("A1", ["A2", "C#3", "E3", "A3"], ["A3", "C#4", "E4", "A4"]),
    # D major world
    "D": ("D2", ["D3", "F#3", "A3", "D4"], ["D4", "F#4", "A4", "D5"]),
    "Dadd9": ("D2", ["D3", "F#3", "A3", "E4"], ["D4", "F#4", "A4", "E5"]),
    "Bm7": ("B1", ["B2", "D3", "F#3", "A3"], ["B3", "D4", "F#4", "A4"]),
    "Bm": ("B1", ["B2", "D3", "F#3", "B3"], ["B3", "D4", "F#4", "B4"]),
    "Gmaj7": ("G1", ["G2", "B2", "D3", "F#3"], ["G3", "B3", "D4", "F#4"]),
    "G": ("G1", ["G2", "B2", "D3", "G3"], ["G3", "B3", "D4", "G4"]),
    "Asus": ("A1", ["A2", "D3", "E3", "A3"], ["A3", "D4", "E4", "A4"]),
    "D/F#": ("F#1", ["F#2", "A2", "D3", "A3"], ["F#3", "A3", "D4", "A4"]),
    "Em7": ("E2", ["E3", "G3", "B3", "D4"], ["E4", "G4", "B4", "D5"]),
    "A/C#": ("C#2", ["C#3", "E3", "A3", "E4"], ["C#4", "E4", "A4", "E5"]),
    "F#m7": ("F#1", ["F#2", "A2", "C#3", "E3"], ["F#3", "A3", "C#4", "E4"]),
    "Dmaj9": ("D2", ["D3", "F#3", "C#4", "E4"], ["D4", "F#4", "C#5", "E5"]),
}


def harmony(sec, chords, pad_bright=0.35, pad_vel=0.5, bass=None, bass_vel=0.6):
    for i, name in enumerate(chords):
        if name is None:
            continue
        bn, pv, _ = CH[name]
        chord_pad(sec, i, pv, pad_bright, pad_vel)
        if bass == "whole":
            b = SEC[sec][i]
            bassnote(T(sec, i), bn, b["n"] * b["beat"] * 0.97, bass_vel)


def bass_groove(sec, bar, name, pattern, vel=0.65):
    """pattern: list of (beat, semitone offset or note name, dur_beats)."""
    root = CH[name][0]
    b = SEC[sec][bar]
    for beat, off, d in pattern:
        if beat >= b["n"]:
            continue
        nm = off if isinstance(off, str) else midi(root) + off
        bassnote(T(sec, bar, beat), nm, d * b["beat"], vel * (0.92 + 0.12 * RNG.random()))


# riser: noise bands that open upward
_BANDS = [(300, 700), (700, 1500), (1500, 3500), (3500, 8000)]
_BAND_SOS = [signal.butter(2, bd, "bandpass", fs=SR, output="sos") for bd in _BANDS]


def riser(t0, t1, vel=0.12):
    n = int((t1 - t0) * SR)
    u = np.linspace(0, 1, n)
    out = np.zeros((n, 2))
    for bi, sos in enumerate(_BAND_SOS):
        centre = (bi + 0.5) / len(_BANDS)
        w = np.exp(-((u * 1.1 - centre) ** 2) / 0.06) * (0.3 + 0.7 * u)
        for ch in range(2):
            out[:, ch] += signal.sosfilt(sos, RNG.standard_normal(n)) * w
    out *= (u ** 2.2)[:, None] * vel
    out[-int(0.03 * SR):] *= np.linspace(1, 0, int(0.03 * SR))[:, None]
    place("fx", t0, out)


def swell(t_end, notes, length=1.6, vel=0.35):
    """Reversed-envelope pad swell that lands on t_end."""
    n = int(length * SR)
    p = pad_chord(notes, length, 0.45, 0.01, 0.01, vel)[:n]
    u = np.linspace(0, 1, n)
    p *= (u ** 3)[:, None]
    p[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))[:, None]
    place("fx", t_end - length, p)


def wash(t, vel=0.06, tau=1.4):
    n = int(4 * SR)
    tt = np.arange(n) / SR
    sos = signal.butter(2, [4500, 11000], "bandpass", fs=SR, output="sos")
    x = np.stack([signal.sosfilt(sos, RNG.standard_normal(n)) for _ in range(2)], axis=1)
    x *= (np.exp(-tt / tau) * env_attack(n, 0.02))[:, None] * vel
    place("fx", t, x)


# ================================================================== arrange

def problem_act():
    # ---- s01 (0-11) Dm, sparse; a soft clock pulse, no kick
    s = "s01"
    harmony(s, ["Dm9", "Bbmaj7", "Gm9", "Dm/A", "A7sus"], pad_bright=0.22, pad_vel=0.42)
    for i, nm in enumerate(["Dm9", "Bbmaj7", "Gm9", "Dm/A", "A7sus"]):
        notes = CH[nm][2]
        comp(s, i, notes, [(0, 0), (1, 2), (2, 1), (3, 2)], vel=0.16, bright=0.25, dur=0.6)
        perc_line(s, i, "hat", 1.0, 0.035, pan=-0.2)          # clock-like tick
    play_lead(s, [
        (0, 0, "A4", 1.0, 0.28), (0, 1, "D5", 2.5, 0.3),     # before c01 (1.0 s)
        (1, 2, "C5", 1.5), (2, 0, "Bb4", 1.0), (2, 1.5, "A4", 2.0),
        (3, 2, "F4", 1.0), (4, 0, "E4", 2.5),
    ], vel=0.5)

    # ---- s02 (11-22) small change at 11: felt bass enters, 8th pulse, shaker
    s = "s02"
    chords = ["Bbmaj7", "Gm7", "Dm", "Cadd9", "A7sus"]
    harmony(s, chords, pad_bright=0.25, pad_vel=0.45, bass="whole", bass_vel=0.45)
    for i, nm in enumerate(chords):
        notes = CH[nm][2]
        comp(s, i, notes, [(0, 0), (0.5, 2), (1, 1), (1.5, 2), (2, 0), (2.5, 2), (3, 1), (3.5, 3)],
             vel=0.13, bright=0.25, dur=0.45)
        perc_line(s, i, "shaker", 0.5, 0.045, accent=0.5, pan=0.3)
    play_lead(s, [
        (0, 0, "D5", 1.5, 0.6),                                # gap 11.0-11.4
        (1, 2, "C5", 1.0), (1, 3, "Bb4", 1.0), (2, 0, "A4", 2.0),
        (3, 1, "G4", 1.0), (3, 2, "E5", 1.5), (4, 0, "C#5", 1.0), (4, 1.5, "E5", 1.5),
    ], vel=0.5)

    # ---- s03 (22-30) change at 22: rising arpeggio, brighter pad, swell into 30
    s = "s03"
    chords = ["Gm9", "Bb6", "Csus2", "A"]
    harmony(s, chords, pad_bright=0.32, pad_vel=0.5, bass="whole", bass_vel=0.5)
    for i, nm in enumerate(chords):
        notes = CH[nm][2]
        comp(s, i, notes, [(x * 0.5, x) for x in range(8)], vel=0.12 + 0.03 * i, bright=0.3, dur=0.5)
        perc_line(s, i, "shaker", 0.5, 0.05 + 0.01 * i, accent=0.5, pan=0.3)
    play_lead(s, [
        (0, 0, "D5", 1.0), (0, 2, "Bb4", 1.0), (1, 0, "F5", 1.5), (1, 2, "D5", 1.0),
        (2, 0, "G5", 1.5), (2, 2, "E5", 1.0),
        (3, 0, "A4", 1.0, 0.65), (3, 1, "C#5", 1.0, 0.7),       # gap 29.6-30.8 -> D5 at 30
    ], vel=0.5)
    riser(T(s, 2), 30.0, vel=0.035)
    swell(30.0, ["A2", "E3", "A3", "C#4"], length=1.8, vel=0.32)


def reveal_and_join():
    # ---- s04 reveal (30-40) + s05 join (from bar 4 = 39.14 s); D major
    s = "s04"
    chords = ["D", "Bm7", "Gmaj7", "A", "D/F#", "G", "Em7", "A", "A7"]
    harmony(s, chords, pad_bright=0.4, pad_vel=0.5)
    wash(30.0, vel=0.035)
    for i, nm in enumerate(chords):
        b = SEC[s][i]
        # kick on 1 and 3 (bar 0 downbeat lands on exactly 30.0 s)
        for beat in ([0, 2] if b["n"] == 4 else [0]):
            k(T(s, i, beat), 0.8)
        if i >= 4 and b["n"] == 4:
            k(T(s, i, 2.5), 0.45)  # join: a ghost kick adds lift
        if i < 4:
            bass_groove(s, i, nm, [(0, 0, 1.4), (1.5, 0, 0.5), (2, 7, 1.0), (3, 12, 0.5), (3.5, 7, 0.5)])
        else:
            bass_groove(s, i, nm, [(0, 0, 0.9), (1, 0, 0.4), (1.5, 12, 0.4), (2, 7, 0.9),
                                   (3, 0, 0.4), (3.5, 10 if nm == "A7" else 9, 0.4)])
        notes = CH[nm][2]
        comp(s, i, notes, [(0, [0, 1, 2]), (1.5, [1, 3]), (2.5, [0, 2])], vel=0.11, bright=0.3, dur=0.7)
        if i < 4:
            perc_line(s, i, "hat", 1.0, 0.05, start=0.5, pan=-0.2)          # offbeat hats
        else:
            perc_line(s, i, "shaker", 0.25, 0.045, accent=0.5, pan=0.3)    # s05: 16th shaker
            perc_line(s, i, "hat", 1.0, 0.045, start=0.5, pan=-0.2)
    play_lead(s, [
        (0, 0, "D5", 0.5, 0.6), (0, 0.5, "F#5", 0.5, 0.6), (0, 1, "A5", 2.0, 0.55),  # 30.0-30.8
        (1, 0, "B4", 1.0), (1, 1.5, "A4", 1.0), (1, 3, "F#4", 1.0),
        (2, 0, "G4", 1.0), (2, 1, "B4", 1.0), (2, 2.5, "D5", 1.5),
        (3, 0, "C#5", 1.5), (3, 2, "E5", 2.0),
        (4, 0.5, "A4", 0.5), (4, 1, "D5", 0.5), (4, 1.5, "F#5", 0.5), (4, 2, "E5", 1.5),  # gap 39.4-40.4
        (5, 0, "D5", 1.0), (5, 2, "B4", 1.0), (6, 0, "G4", 1.0), (6, 1.5, "B4", 1.0),
        (7, 0, "A4", 2.0), (8, 1, "C#5", 1.0), (8, 2.5, "E5", 0.5, 0.7),  # gap 49.6-50.4
    ], vel=0.6)


def lesson():
    # ---- s06 (50-64): new layer = marimba 8th ostinato ("the board plots")
    s = "s06"
    chords = ["D", "A/C#", "Bm7", "Gmaj7", "Em7", "Asus"]
    harmony(s, chords, pad_bright=0.38, pad_vel=0.45)
    for i, nm in enumerate(chords):
        for beat in (0, 2, 3.5):
            k(T(s, i, beat), 0.75 if beat != 3.5 else 0.4)
        bass_groove(s, i, nm, [(0, 0, 0.9), (1, 0, 0.4), (1.5, 7, 0.4), (2, 0, 0.9),
                               (2.75, 12, 0.25), (3, 7, 0.9)])
        notes = CH[nm][2]
        lo = [nn[:-1] + str(int(nn[-1]) - 1) for nn in notes]   # an octave down
        comp(s, i, lo, [(x * 0.5, [0, 2, 1, 3, 2, 1, 3, 2][x]) for x in range(8)],
             vel=0.22, bright=0.6, kind="marimba", bus="marimba", pan=0.35, dur=0.45)
        perc_line(s, i, "shaker", 0.25, 0.045, accent=0.5, pan=0.3)
        perc_line(s, i, "hat", 1.0, 0.05, start=0.5, pan=-0.2)
        if i == 5:
            comp(s, i, CH["A"][2], [(2, [0, 1, 2])], vel=0.1)
    play_lead(s, [
        (0, 0, "F#5", 0.5, 0.75), (0, 0.5, "A5", 1.5, 0.7),       # 50.0-50.4 gap
        (1, 0, "E5", 1.0), (1, 2, "C#5", 1.5), (2, 0, "D5", 1.0), (2, 1, "B4", 1.0),
        (3, 0, "D5", 2.0), (4, 0, "E5", 1.0), (4, 2, "G5", 1.0),
        (5, 3, "C#5", 0.5, 0.7), (5, 3.5, "E5", 0.5, 0.7),          # 63.6-64.4 gap
    ], vel=0.6)


def triage():
    # ---- s07 (64-82): drop on bar 0, then rim clicks + syncopated bass
    s = "s07"
    chords = ["G", "A", "F#m7", "Bm7", "G", "A", "D", "A7"]
    harmony(s, chords, pad_bright=0.36, pad_vel=0.5)
    for i, nm in enumerate(chords):
        b = SEC[s][i]
        if i == 0:
            bass_groove(s, i, nm, [(0, 0, 3.8)], vel=0.6)            # drop: pad, bass, lead only
            continue
        for beat in ((0, 1.75, 2) if b["n"] == 4 else (0, 2)):
            k(T(s, i, beat), 0.75 if beat != 1.75 else 0.4)
        bass_groove(s, i, nm, [(0, 0, 0.6), (0.75, 0, 0.25), (1.5, 12, 0.4), (2, 7, 0.6),
                               (2.75, 7, 0.25), (3.25, 12, 0.5)], vel=0.62)
        perc_line(s, i, "rim", 2.0, 0.05, start=1.0, pan=-0.1)     # new layer: soft rim on 2 and 4
        perc_line(s, i, "shaker", 0.25, 0.04, accent=0.5, pan=0.3)
        notes = CH[nm][2]
        comp(s, i, notes, [(0.5, [1, 2]), (1.5, [0, 3]), (3, [1, 2])], vel=0.1, bright=0.3, dur=0.5)
        if i in (6, 7):
            lo = [nn[:-1] + str(int(nn[-1]) - 1) for nn in notes]
            comp(s, i, lo, [(x * 0.5, [0, 1, 2, 3][x % 4]) for x in range(8)],
                 vel=0.16, bright=0.6, kind="marimba", bus="marimba", pan=0.35, dur=0.4)
    play_lead(s, [
        (0, 0, "B4", 1.0, 0.7), (0, 0.5, "D5", 1.0, 0.7), (0, 2, "G5", 2.0),  # 64.0-64.4 gap
        (1, 0, "E5", 1.0), (1, 1.5, "C#5", 1.5), (2, 0, "A4", 1.0), (2, 2, "C#5", 1.0),
        (3, 0, "D5", 1.5), (3, 2, "F#5", 1.5), (4, 0, "G5", 1.0), (4, 1, "D5", 1.0),
        (5, 0, "E5", 2.0), (6, 0, "F#5", 1.0), (6, 2, "A5", 1.5),
        (7, 2.5, "A4", 0.5, 0.65),                                    # 81.6 gap
    ], vel=0.6)


def thread():
    # ---- s08 (82-98): intimate, half-time kick, a bell counter-line
    s = "s08"
    chords = ["Bm7", "Gmaj7", "D", "A", "Bm7", "Gmaj7", "Asus"]
    harmony(s, chords, pad_bright=0.45, pad_vel=0.55)
    for i, nm in enumerate(chords):
        k(T(s, i, 0), 0.7)
        if i % 2 == 1:
            k(T(s, i, 2.5), 0.35)
        bass_groove(s, i, nm, [(0, 0, 2.4), (2.5, 7, 1.4)], vel=0.55)
        perc_line(s, i, "hat", 1.0, 0.04, start=0.5, pan=-0.2)
        notes = CH[nm][2]
        comp(s, i, notes, [(0, [0, 2]), (2, [1, 3])], vel=0.1, bright=0.28, dur=1.5)
        if i == 6:
            comp(s, i, CH["A"][2], [(2, [1, 2])], vel=0.1)
    play_lead(s, [
        (0, 0, "B4", 1.0, 0.65),                                      # 82.0-82.4 gap
        (0, 2, "F#5", 2.0), (1, 2, "D5", 2.0), (2, 2, "A5", 2.0), (3, 1, "E5", 2.0),
        (4, 2, "F#5", 2.0), (5, 1, "B5", 2.0),
        (6, 3, "C#5", 0.5, 0.65), (6, 3.5, "E5", 0.5, 0.65),         # 97.6-98.4 gap
    ], kind="bell", vel=0.32)


def check():
    # ---- s09 (98-112): full groove back, keys syncopation, rim
    s = "s09"
    chords = ["D", "G", "Bm7", "A", "G", "Asus"]
    harmony(s, chords, pad_bright=0.4, pad_vel=0.48)
    for i, nm in enumerate(chords):
        for beat in (0, 2, 2.5):
            k(T(s, i, beat), 0.78 if beat != 2.5 else 0.45)
        bass_groove(s, i, nm, [(0, 0, 0.9), (1, 0, 0.4), (1.5, 7, 0.4), (2, 0, 0.4),
                               (2.5, 12, 0.4), (3, 7, 0.5), (3.5, 5 if nm != "Bm7" else 3, 0.4)])
        perc_line(s, i, "shaker", 0.25, 0.048, accent=0.5, pan=0.3)
        perc_line(s, i, "hat", 1.0, 0.05, start=0.5, pan=-0.2)
        perc_line(s, i, "rim", 2.0, 0.045, start=1.0, pan=-0.1)
        notes = CH[nm][2]
        comp(s, i, notes, [(0, [0, 1, 2]), (0.75, [1, 3]), (2, [0, 2]), (2.75, [1, 3])],
             vel=0.1, bright=0.32, dur=0.5)
    play_lead(s, [
        (0, 0, "F#5", 1.0, 0.7),                                      # 98.0-98.4 gap
        (0, 2, "A5", 1.0), (1, 0, "G5", 1.5), (1, 2, "D5", 1.0), (2, 0, "F#5", 1.0),
        (2, 2, "B4", 1.0), (3, 0, "C#5", 2.0), (4, 0, "B4", 1.0), (4, 2, "D5", 1.0),
        (5, 3, "A4", 0.5, 0.7), (5, 3.5, "D5", 0.5, 0.7),            # 111.6-112.4 gap
    ], vel=0.6)


def catchup():
    # ---- s10 (112-122): lighter; marimba "notes writing" 16ths; 1-beat break
    s = "s10"
    chords = ["Gmaj7", "D/F#", "Em7", "A", None]
    harmony(s, chords, pad_bright=0.38, pad_vel=0.48)
    for i, nm in enumerate(chords[:4]):
        k(T(s, i, 0), 0.7)
        k(T(s, i, 2), 0.55)
        bass_groove(s, i, nm, [(0, 0, 1.8), (2, 7, 0.9), (3, 0, 0.9)], vel=0.55)
        perc_line(s, i, "hat", 0.5, 0.03, pan=-0.2)
        notes = CH[nm][2]
        lo = [nn[:-1] + str(int(nn[-1]) - 1) for nn in notes]
        pat = [(x * 0.25, [0, 1, 2, 3, 2, 1][x % 6]) for x in range(16) if x % 4 != 3]
        comp(s, i, lo, pat, vel=0.12, bright=0.55, kind="marimba", bus="marimba", pan=0.35, dur=0.3)
    play_lead(s, [
        (0, 0, "B4", 1.0, 0.7),                                       # 112.0-112.4 gap
        (0, 2, "D5", 2.0), (1, 1, "A4", 2.0), (2, 0, "G4", 1.0), (2, 2, "B4", 1.5),
        (3, 0, "C#5", 2.0),
        (4, 0, "A4", 0.5, 0.7), (4, 0.5, "D5", 0.5, 0.7),            # 121.4-122 break
    ], vel=0.55)
    swell(122.0, ["B2", "F#3", "B3", "D4"], length=1.5, vel=0.3)


def agents_build():
    # ---- s11 (122-138): a layer per bar, rising figure, peak 136-138
    s = "s11"
    chords = ["Bm", "G", "D", "A", "Bm", "G", "Asus"]
    for i, nm in enumerate(chords):
        bright = 0.36 + 0.035 * i
        bn, pv, notes = CH[nm]
        chord_pad(s, i, pv, bright, 0.48 + 0.03 * i)
        if i == 6:
            chord_pad(s, i, ["A3", "C#4", "E4", "A4"], 0.5, 0.25, att=1.2)  # sus resolves upward
        # kick: 1 and 3, then four on the floor from bar 4, 8ths on the last half bar
        beats = [0, 2] if i < 4 else [0, 1, 2, 3]
        if i == 6:
            beats = [0, 1, 2, 3, 3.5]
        for beat in beats:
            k(T(s, i, beat), 0.62 + 0.03 * i)
        bass_groove(s, i, nm, [(0, 0, 0.9), (1, 0, 0.4), (1.5, 12, 0.4), (2, 7, 0.9),
                               (3, 0, 0.4), (3.5, 12, 0.4)], vel=0.6 + 0.02 * i)
        if i >= 1:   # + keys 8th arpeggio
            comp(s, i, notes, [(x * 0.5, [0, 1, 2, 3, 2, 1, 2, 3][x]) for x in range(8)],
                 vel=0.09 + 0.01 * i, bright=0.3 + 0.03 * i, dur=0.45)
        if i >= 2:   # + 16th shaker
            perc_line(s, i, "shaker", 0.25, 0.04 + 0.005 * i, accent=0.5, pan=0.3)
        perc_line(s, i, "hat", 1.0, 0.045, start=0.5, pan=-0.2)
        if i >= 4:   # + rim
            perc_line(s, i, "rim", 2.0, 0.045, start=1.0, pan=-0.1)
        if i >= 3:   # rising marimba figure, 8ths then 16ths
            lo = [nn[:-1] + str(int(nn[-1]) - 1) for nn in notes] + notes
            step = 0.5 if i < 5 else 0.25
            nsteps = int(4 / step)
            pat = [(x * step, min(x * len(lo) // nsteps, len(lo) - 1)) for x in range(nsteps)]
            comp(s, i, lo, pat, vel=0.12 + 0.015 * i, bright=0.6, kind="marimba", bus="marimba",
                 pan=0.35, dur=0.4)
    play_lead(s, [
        (0, 0, "F#5", 1.0, 0.7), (0, 2, "D5", 1.0),                   # 122.0-122.4 gap
        (1, 0, "B4", 1.0), (1, 2, "D5", 1.0), (2, 0, "F#5", 1.0), (2, 2, "A5", 1.0),
        (3, 0, "E5", 2.0), (4, 0, "F#5", 1.0), (4, 2, "B5", 1.0), (5, 0, "D6", 1.0), (5, 2, "B5", 1.0),
        (6, 0, "A5", 1.0), (6, 1, "B5", 1.0), (6, 2, "C#6", 1.0), (6, 3, "E6", 1.0, 0.7),  # peak
    ], vel=0.55)
    riser(T(s, 4), 138.0, vel=0.05)
    swell(138.0, ["A2", "E3", "A3", "C#4", "E4"], length=2.0, vel=0.3)


def end_card():
    # ---- s12 (138-146) resolve; final Dmaj9 at 146 rings out by 150
    s = "s12"
    chords = ["D", "Gmaj7", "Em7", "Asus"]
    harmony(s, chords, pad_bright=0.42, pad_vel=0.5, bass="whole", bass_vel=0.55)
    wash(138.0, vel=0.055, tau=1.8)
    k(138.0, 0.85)
    k(T(s, 0, 2), 0.5)
    for i, nm in enumerate(chords):
        notes = CH[nm][2]
        comp(s, i, notes, [(0, [0, 1, 2, 3])] if i < 3 else [(0, [0, 2]), (1, [1, 3])],
             vel=0.11, bright=0.32, dur=3.0 if i < 3 else 1.5)
    play_lead(s, [
        (0, 0, "F#5", 1.0, 0.7), (0, 0.5, "A5", 1.5, 0.7),          # 138.0-138.4 gap
        (1, 0, "B5", 2.0), (2, 0, "G5", 1.0), (2, 2, "E5", 2.0), (3, 0, "E5", 1.0),
    ], vel=0.5)
    # final chord: rolled Dmaj9 at 146.0, rings out
    t = FINAL_CHORD_T
    bassnote(t, "D2", 3.6, 0.55)
    place("pad", t, pad_chord(["D3", "A3", "C#4", "E4", "F#4"], 2.6, 0.38, 0.05, 1.3, 0.55))
    for j, nm in enumerate(["D3", "A3", "F#4", "C#5", "E5"]):
        place("keys", t + j * 0.035, pluck(hz(nm), 3.6, 0.2, 0.4), pan=-0.3 + 0.15 * j)
    lead(146.0 + 0.6, "A5", 2.5, 0.55)   # 146.6-147.0 gap: a last high note


def mixdown():
    gains = {"kick": undb(-6), "bass": undb(-7), "keys": undb(-6), "lead": undb(-5),
             "pad": undb(-9), "perc": undb(-8), "fx": undb(-8), "marimba": undb(-8), "bell": undb(-6)}
    dry = np.zeros_like(BUS["kick"])
    send = np.zeros_like(BUS["kick"])
    sends = {"kick": 0.0, "bass": 0.0, "keys": 0.25, "lead": 0.32, "pad": 0.3,
             "perc": 0.12, "fx": 0.2, "marimba": 0.2, "bell": 0.4}
    for nm in BUS_NAMES:
        x = BUS[nm] * gains[nm]
        if nm == "bass":
            x = signal.sosfilt(signal.butter(2, 380, "lowpass", fs=SR, output="sos"), x, axis=0)
        if nm in ("keys", "lead", "marimba", "pad"):
            # tame the voice band slightly on everything melodic
            x = peaking(x, 2500, -2.5, 0.8)
        dry += x
        send += x * sends[nm]
    # reverb: decorrelated decaying noise IR, darkened, 18 ms pre-delay
    rng = np.random.default_rng(7)
    n_ir = int(2.2 * SR)
    t = np.arange(n_ir) / SR
    ir = rng.standard_normal((n_ir, 2)) * np.exp(-t / 0.32)[:, None]
    ir = signal.sosfilt(signal.butter(2, 5200, "lowpass", fs=SR, output="sos"), ir, axis=0)
    ir = signal.sosfilt(signal.butter(1, 220, "highpass", fs=SR, output="sos"), ir, axis=0)
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    pre = int(0.018 * SR)
    wet = np.stack([signal.fftconvolve(send[:, c], ir[:, c])[: len(send)] for c in range(2)], axis=1)
    wet = np.concatenate([np.zeros((pre, 2)), wet[:-pre]], axis=0) * 0.55
    mix = dry + wet
    mix = signal.sosfilt(signal.butter(2, 28, "highpass", fs=SR, output="sos"), mix, axis=0)
    mix = mix[:N_TOTAL]
    # ending: ring out from 146 s, silent by 149.9 s
    tt = np.arange(N_TOTAL) / SR
    fade = np.ones(N_TOTAL)
    a, b = 147.6, 149.85
    m = (tt >= a) & (tt < b)
    fade[m] = np.cos(np.linspace(0, np.pi / 2, m.sum())) ** 2
    fade[tt >= b] = 0.0
    return mix * fade[:, None]


def peaking(x, f0, gain_db, q):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return signal.lfilter(b, a, x, axis=0)


def main():
    problem_act()
    reveal_and_join()
    lesson()
    triage()
    thread()
    check()
    catchup()
    agents_build()
    end_card()
    mix = mixdown()
    pre_lufs = lufs_integrated(mix)
    target = TARGET_LUFS
    if "--target" in sys.argv:
        target = float(sys.argv[sys.argv.index("--target") + 1])
    mix, lufs, gr = normalize_lufs(mix, target, CEILING_DBTP)
    out = os.path.join(AUDIO_DIR, "music.wav")
    write_wav(out, mix, bits=24)

    grid = {
        "note": "Beat grid of audio/music.wav. Times are film seconds. Every scene boundary listed "
                "in 'sections' is a bar line. Use 'beats' to place SFX and stepped motion on the music.",
        "sections": [dict(id=s, start=a, end=b, bars=len(l), beats=sum(l),
                          bpm=round(60.0 * sum(l) / (b - a), 3)) for s, a, b, l in SECTIONS],
        "final_chord": FINAL_CHORD_T,
        "bars": [dict(t=round(b["t0"], 4), beats=b["n"], bpm=round(b["bpm"], 3), section=b["sec"])
                 for b in BARS],
        "beats": [round(b["t0"] + j * b["beat"], 4) for b in BARS for j in range(b["n"])],
        "kicks": sorted(set(KICK_TIMES)),
    }
    with open(os.path.join(AUDIO_DIR, "beatgrid.json"), "w") as f:
        json.dump(grid, f, indent=1)

    print("wrote %s  (%.3f s, 48 kHz, 24-bit stereo)" % (out, len(mix) / SR))
    print("loudness: pre-norm %.2f LUFS -> %.2f LUFS integrated, true peak %.2f dBTP, limiter max GR %.2f dB"
          % (pre_lufs, lufs, true_peak_db(mix), gr))
    first = min(t for t in KICK_TIMES if t >= 30.0 - 1e-6)
    print("first kick at or after 30.0 s: %.4f s (planned 30.0000)" % first)
    print("bars at scene boundaries:")
    for s, a, b, l in SECTIONS:
        print("  %s  %6.2f-%6.2f  %2d bars  %2d beats  %.3f BPM" % (s, a, b, len(l), sum(l), 60.0 * sum(l) / (b - a)))


if __name__ == "__main__":
    main()
