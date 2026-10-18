# Film audio

All audio here is synthesized by the Python scripts in `tools/audio/` (numpy + scipy, no
downloads, fixed random seeds, so every run gives the same files). All WAVs are 48 kHz stereo,
150.000 s long unless noted. The levels below were measured, nobody has listened to them yet.

## Files

| File | What it is |
|---|---|
| `music.wav` | Original score, 24-bit. Normalised to -24 LUFS integrated, true peak -7.9 dBTP. Bed under a voice. |
| `music_ducked.wav` | `music.wav` ducked 4 dB during every subtitle cue in `script.json` (150 ms attack, 400 ms release). A stand-in for the voice. **The film uses this file until the real voice exists.** About -27.4 LUFS. |
| `sfx.wav` | SFX stem rendered from `cues/*.json`. Normalised to about -26 LUFS integrated, limited to -5 dBTP. Silent if there are no cue files. |
| `mix_preview.wav` | `music_ducked.wav` + `sfx.wav`, or, once `voice.wav` exists: music ducked 8 dB under the voice + sfx + voice. Limited to -1 dBTP. |
| `sfx/<name>.wav` | 16-bit previews of each one-shot: paper, stamp, plot, key, pop, chime, click, thud, whoosh, swap. |
| `cues/*.json` | SFX cue lists written by the scenes (see below). |
| `beatgrid.json` | Machine-readable tempo map: sections, every bar, every beat, every kick time. Use it to place SFX and stepped motion on the music. |
| `music_spectrogram.png` | Spectrogram of `music.wav` (log frequency 30 Hz-16 kHz, dark = loud, ticks every 10 s, dotted rows at 1 and 4 kHz). |
| `voice.wav` | Does not exist yet. Slot for the recorded Georgian voiceover. |

## Re-run (from the `video/` folder)

```sh
python3 tools/audio/score.py          # -> audio/music.wav, audio/beatgrid.json (about 20 s)
python3 tools/audio/sfx_lib.py        # -> audio/sfx/<name>.wav previews
python3 tools/audio/mix_sfx.py        # -> audio/sfx.wav from audio/cues/*.json, prints cues per scene
python3 tools/audio/mix_preview.py    # -> audio/music_ducked.wav, audio/mix_preview.wav, prints LUFS
python3 tools/audio/analyze.py        # measures audio/music.wav: LUFS, peaks, per-scene RMS,
                                      #   kick grid check, 2 s loudness plot, spectrogram PNG
python3 tools/audio/analyze.py audio/mix_preview.wav --no-png   # any other file
```

Run `mix_sfx.py` and then `mix_preview.py` again whenever a scene adds or changes its cue file.

Options: `score.py --target -18` renders the score at another loudness (for example if the film
ships without a voice and needs to be louder); `mix_sfx.py --cues-dir DIR --out PATH --target
LUFS --no-normalize`; `mix_preview.py --no-voice`, `--voice PATH`, `--out PATH`.

## SFX cue files

One file per scene, `audio/cues/<scene-id>.json`. Either a bare JSON array or an object with a
`cues` array; each item is `{"t": film_seconds, "name": "<sound>", "gain": dB}` (`gain` optional,
default 0). Unknown names and times outside 0-150 s are skipped with a warning. Every hit gets a
small deterministic variation (pitch +-3 %, gain +-1.5 dB, one of four noise variants), so
repeats do not sound robotic. The per-sound balance is `LEVEL_DB` in `tools/audio/sfx_lib.py`.

Note: the stem is normalised as a whole, so adding cues in one scene slightly changes the level
of all the others. Use `gain` for relative balance inside a scene, not to fix the overall level.

## Adding the recorded voice later

1. Export the voiceover as one file, 150.0 s long, aligned to film time 0, and save it as
   `audio/voice.wav` (any PCM WAV; mono is fine, other sample rates are resampled to 48 kHz).
2. Run `python3 tools/audio/mix_preview.py`. It detects `voice.wav`, ducks the music about 8 dB
   under the detected speech (150 ms attack, 400 ms release) and writes
   `audio/mix_preview.wav` with music + sfx + voice. It prints the loudness of each stem and the
   mix; aim the voice at about -16 to -18 LUFS before mixing.
3. In `index.html`, swap the audio: either replace the `music_ducked.wav` + `sfx.wav` tracks with
   the single `mix_preview.wav`, or keep separate tracks and point the music track at a version
   ducked under the voice (and enable the commented `voice.wav` slot). Then re-render.
4. If the voice timing differs from `script.json`, retime the cues there first, so subtitles and
   the cue-based duck match the real speech.

## Beat grid

The tempo is about 104 BPM, adjusted per section (102 to 105 BPM) so every scene boundary in the
film is a bar line. Some sections end on a short bar (3/4, 2/4 or one beat) as a turnaround.
Bars land exactly on 0, 11, 22, 30, 50, 64, 82, 98, 112, 122 and 138 s; the final chord is at
146.0 s and rings out to silence by 149.85 s. The kick enters on the downbeat at exactly 30.000 s.

| Section | Window (s) | Bars | Beats | BPM | Bar times (s) |
|---|---|---|---|---|---|
| s01 alone | 0-11 | 5 (4,4,4,4,3) | 19 | 103.64 | 0.00 2.32 4.63 6.95 9.26 |
| s02 classroom | 11-22 | 5 (4,4,4,4,3) | 19 | 103.64 | 11.00 13.32 15.63 17.95 20.26 |
| s03 one-to-one | 22-30 | 4 (4,4,4,2) | 14 | 105.00 | 22.00 24.29 26.57 28.86 |
| s04 reveal + s05 join | 30-50 | 9 (4 x 8, 3) | 35 | 105.00 | 30.00 32.29 34.57 36.86 39.14 41.43 43.71 46.00 48.29 |
| s06 lesson | 50-64 | 6 | 24 | 102.86 | 50.00 52.33 54.67 57.00 59.33 61.67 |
| s07 triage | 64-82 | 8 (4 x 7, 3) | 31 | 103.33 | 64.00 66.32 68.65 70.97 73.29 75.61 77.94 80.26 |
| s08 thread | 82-98 | 7 | 28 | 105.00 | 82.00 84.29 86.57 88.86 91.14 93.43 95.71 |
| s09 check | 98-112 | 6 | 24 | 102.86 | 98.00 100.33 102.67 105.00 107.33 109.67 |
| s10 catch-up | 112-122 | 5 (4,4,4,4,1) | 17 | 102.00 | 112.00 114.35 116.71 119.06 121.41 (one-beat break) |
| s11 agents | 122-138 | 7 | 28 | 105.00 | 122.00 124.29 126.57 128.86 131.14 133.43 135.71 |
| s12 end | 138-146 | 4 (4,4,4,2) | 14 | 105.00 | 138.00 140.29 142.57 144.86, final chord 146.00 |

The 40 s scene boundary (s04 to s05) is not a bar line; the join layer (16th shaker, ghost
kick, new bass pattern) enters on the bar at 39.14 s, with a lead fill in the cue gap at
39.4-40.4 s.

## The score, section by section

- **0-11 (s01):** D minor, very sparse. Dark pad, a quiet quarter-note pluck figure and a soft
  clock tick. No kick, no bass.
- **11-22 (s02):** the first small change, right at 11.0: a felt bass enters, the pluck figure
  moves to eighths and a quiet shaker joins. Still minor (Bbmaj7, Gm7, Dm, Cadd9, A7sus).
- **22-30 (s03):** the second change at 22.0: a rising eighth-note arpeggio, a brighter pad, a
  soft noise riser and a reversed swell that lands on 30.0. A lead pickup (A, C#) falls in the
  29.6-30.8 gap between subtitles.
- **30 (s04 reveal):** the lift into D major. Kick and bass enter on the downbeat at 30.000 s,
  with a soft air wash and a D-F#-A lead statement before the voice starts at 30.8.
- **39.1-50 (s05 join):** a 16th shaker, a ghost kick on beat 3-and and a busier bass line.
- **50-64 (s06 lesson):** a new layer, a marimba eighth-note ostinato, like the pen plotter
  drawing the board.
- **64-82 (s07 triage):** opens with a drop (pad, bass and lead only, no drums for one bar),
  then the groove returns with a soft rim click on 2 and 4 and a syncopated bass.
- **82-98 (s08 thread):** intimate. Half-time kick, sustained bass, a soft bell counter-line,
  a brighter pad.
- **98-112 (s09 check):** the full groove is back (kick on 1, 3 and 3-and, shaker, rim, syncopated
  keys).
- **112-122 (s10 catch-up):** lighter. Kick on 1 and 3, marimba sixteenths "writing notes", then
  a one-beat break at 121.4 s with a swell into 122.
- **122-138 (s11 agents):** the build. One layer per bar: kick and bass, keys arpeggio, 16th
  shaker, a rising marimba figure, four-on-the-floor kick and rim, a brightening pad, then the
  figure in sixteenths, a noise riser and a lead climbing to E6. Peak at 136-138 s.
- **138-150 (s12 end):** resolves on D at 138 (one kick, a soft wash), then Gmaj7, Em7 and Asus
  with no drums, and a rolled Dmaj9 at 146.0 that rings out. A last high A in the 146.6-147.0
  gap; fully silent from 149.85 s.

## Voice-friendly mixing

- The lead melody is written as note lists per section (`tools/audio/score.py`). Notes that start
  inside a subtitle cue are played about 8 dB softer and darker (fewer upper partials). The
  brighter melodic phrases are placed in the gaps between cues.
- All melodic buses have a -2.5 dB dip at 2.5 kHz.
- Measured: the 1-4 kHz band of `music.wav` is 10 dB lower inside cues (-47.7 dBFS) than in the
  gaps (-37.7 dBFS) over 30-146 s.
