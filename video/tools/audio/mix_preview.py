"""Mix the film audio.

Always writes audio/music_ducked.wav: the music ducked about 4 dB during every
subtitle cue in script.json (a stand-in for the future voice; 150 ms attack,
400 ms release). The film uses this file until the real voice exists.

Then writes audio/mix_preview.wav:
  - with audio/voice.wav present: music ducked about 8 dB under the detected
    voice (150 ms attack, 400 ms release) + sfx + voice;
  - without a voice: music_ducked + sfx.
Prints LUFS and true peak of every stem and of the mix.

Usage:
  python3 tools/audio/mix_preview.py            # auto: uses voice.wav if it exists
  python3 tools/audio/mix_preview.py --no-voice # ignore voice.wav even if present
  python3 tools/audio/mix_preview.py --voice other.wav --out other_mix.wav
"""

import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audiolib import (SR, N_TOTAL, AUDIO_DIR, read_wav, write_wav, fit_length,  # noqa: E402
                      cue_intervals, smooth_gain_curve, lufs_integrated, true_peak_db,
                      limiter, db)

CUE_DUCK_DB = -4.0
VOICE_DUCK_DB = -8.0
ATTACK_MS, RELEASE_MS = 150.0, 400.0
MIX_CEILING_DBTP = -1.0
RATE = 1000  # control rate for gain curves


def cue_duck_curve():
    tgt = np.zeros(int(150.0 * RATE))
    for a, b in cue_intervals():
        # start slightly early so the attack is mostly done when the voice starts
        i0, i1 = int(max(0, a - 0.12) * RATE), int(b * RATE)
        tgt[i0:i1] = CUE_DUCK_DB
    return fit_length(smooth_gain_curve(tgt, ATTACK_MS, RELEASE_MS, RATE)[:, None])[:, 0]


def voice_duck_curve(voice):
    """Voice activity from a 30 ms RMS at 1 kHz control rate, 200 ms hold."""
    mono = np.abs(voice).max(axis=1)
    hop = SR // RATE
    n = len(mono) // hop
    sq = (voice[: n * hop] ** 2).mean(axis=1).reshape(n, hop).mean(axis=1)
    w = 30
    rms = np.sqrt(np.convolve(sq, np.ones(w) / w, mode="same"))
    lev = db(rms)
    thr = max(-50.0, np.percentile(lev, 99) - 30.0)
    active = lev > thr
    hold = 200
    # hold: extend each active run by `hold` ms
    idx = np.where(active)[0]
    act = np.zeros(n, bool)
    for i in idx:
        act[i:i + hold] = True
    tgt = np.where(act, VOICE_DUCK_DB, 0.0)
    tgt = np.pad(tgt, (0, max(0, int(150 * RATE) - n)))[: int(150 * RATE)]
    pct = 100.0 * act.mean()
    return fit_length(smooth_gain_curve(tgt, ATTACK_MS, RELEASE_MS, RATE)[:, None])[:, 0], thr, pct


def report(name, x):
    print("  %-18s %7.2f LUFS   TP %6.2f dBTP" % (name, lufs_integrated(x), true_peak_db(x)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-voice", action="store_true")
    ap.add_argument("--voice", default=os.path.join(AUDIO_DIR, "voice.wav"))
    ap.add_argument("--out", default=os.path.join(AUDIO_DIR, "mix_preview.wav"))
    a = ap.parse_args()

    music = fit_length(read_wav(os.path.join(AUDIO_DIR, "music.wav")))
    sfx_p = os.path.join(AUDIO_DIR, "sfx.wav")
    sfx = fit_length(read_wav(sfx_p)) if os.path.exists(sfx_p) else np.zeros_like(music)
    voice_p = a.voice
    use_voice = os.path.exists(voice_p) and not a.no_voice

    g_cue = cue_duck_curve()
    music_ducked = music * g_cue[:, None]
    write_wav(os.path.join(AUDIO_DIR, "music_ducked.wav"), music_ducked, bits=24)

    print("stems:")
    report("music.wav", music)
    report("music_ducked.wav", music_ducked)
    if np.any(sfx):
        report("sfx.wav", sfx)
    else:
        print("  sfx.wav            silent (no cues yet)")

    if use_voice:
        voice = fit_length(read_wav(voice_p))
        g_v, thr, pct = voice_duck_curve(voice)
        report("voice.wav", voice)
        print("voice activity: threshold %.1f dBFS, active %.0f %% of the film; music ducked %.0f dB under it"
              % (thr, pct, VOICE_DUCK_DB))
        mix = music * g_v[:, None] + sfx + voice
        mode = "music (ducked under voice) + sfx + voice"
    else:
        mix = music_ducked + sfx
        mode = "music_ducked (cue stand-in) + sfx, no voice"

    pre_tp = true_peak_db(mix)
    if pre_tp > MIX_CEILING_DBTP:
        mix, gr = limiter(mix, MIX_CEILING_DBTP - 0.3)
        print("limiter engaged: max gain reduction %.2f dB" % -gr)
    write_wav(a.out, mix, bits=24)
    print("mix (%s):" % mode)
    report("mix_preview.wav", mix)
    print("wrote audio/music_ducked.wav and %s (150.0 s)" % a.out)


if __name__ == "__main__":
    main()
