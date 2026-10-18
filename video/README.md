# Chalkroom Live: demo film

The 2:30 Georgian demo film for the Hacktoberfest Georgia 2026 jury, built with
[HyperFrames](https://www.npmjs.com/package/hyperframes) (HTML + GSAP scenes rendered to MP4).
Everything on screen is Georgian, with burned-in Georgian subtitles; the voiceover is recorded by
the team.

| File | What it is |
|---|---|
| `PLAN.md` | The director's plan: story, look, motion, every scene. |
| `script.json` | Scene windows and the 33 subtitle cues (the voiceover script). Source of truth for timing. |
| `VOICEOVER.md` | The script for recording, with timecodes, pace and an English gloss. |
| `SUBMISSION.md` | Ready-to-paste submission text (Georgian and English), video description with chapters. |
| `CONVENTIONS.md` | How scenes are built: kit API, classroom shell, type scale, handoffs, gotchas. |
| `index.html` | Root composition: the 12 scenes, subtitles, grain, audio. |
| `compositions/` | One file per scene (`s01-alone.html` ... `s12-end.html`) and `subtitles.html` (generated). |
| `assets/` | Fonts (self-hosted), `chalk.css` and `kit.js` (design kit), `classroom.css/js` (classroom shell), GSAP. |
| `audio/` | Cue files per scene (`cues/*.json`) and the rebuilt stems (WAVs are not in git). |
| `tools/` | `build-subs.mjs` (subtitles), `audio/*.py` (score, SFX, mixes), `hf.sh` (one-Chrome-at-a-time wrapper). |
| `poster/` | Thumbnail (`thumbnail.html`, PNG at 1920 and 1280, JPEG at 1280). |
| `renders/` | Rendered MP4s, storyboard and stills (not in git). |

## Run it

From this folder (Node 22, ffmpeg, Python 3 with numpy and scipy):

```sh
python3 tools/audio/score.py          # audio/music.wav (deterministic, about 20 s)
python3 tools/audio/mix_sfx.py        # audio/sfx.wav from audio/cues/*.json
python3 tools/audio/mix_preview.py --no-voice   # audio/music_ducked.wav (used by the film)
node tools/build-subs.mjs             # compositions/subtitles.html and subtitles.ka.srt

npm run dev        # Studio preview in the browser: scrub the timeline
npm run check      # lint + runtime + layout + contrast gate
sh tools/hf.sh snapshot --at 30,56,78 --no-end -o snapshots/look   # stills at film times
npm run render     # final MP4 to renders/chalkroom-live-ka.mp4 (one worker; about 8 GB RAM machine)
```

HyperFrames is pinned to 0.8.169 and always runs with `HYPERFRAMES_SKIP_SKILLS=1`, so nothing is
installed outside this folder.

## Add the recorded voice

1. Record from `VOICEOVER.md` (48 kHz mono WAV, one quiet room). Edit it into one file that
   starts at film time 0 and is 150.0 s long: `audio/voice.wav`. Keep a backup outside git.
2. Retime: listen, then change each cue's `start` and `end` in `script.json` to where the line
   really is, and run `node tools/build-subs.mjs`.
3. Mix: `python3 tools/audio/mix_preview.py` (it picks up `audio/voice.wav`) writes
   `audio/mix_preview.wav` = music ducked about 8 dB under the voice + SFX + voice. In
   `index.html`, replace the `music` and `sfx` audio lines with one line playing
   `audio/mix_preview.wav`, and leave the `voice` line commented (the voice is already in the
   mix). Do not run the mixer while a render is reading the audio files.
4. `npm run check`, a few snapshots around changed cues, then `npm run render`.
5. Loudness for delivery: the mix sits at about -24 LUFS so the voice has room; bring the
   finished file to a normal playback level without touching the picture:
   `ffmpeg -i renders/chalkroom-live-ka.mp4 -c:v copy -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 192k renders/chalkroom-live-ka-loud.mp4`

If a line runs much longer than its scene, move the scene windows in `script.json` and in
`index.html` together (they are copied by hand), and tell whoever owns that scene: each scene
times its beats to its cues.

## Rules the film follows

The product's design system (`../DESIGN.md`): cream paper, ink, one yellow action, vermilion
only for problems, six section hues; Georgian in Noto Sans Georgian and Noto Serif Georgian
matched to Archivo and Source Serif 4; UI changes step like the app, board strokes plot like a
pen plotter, only the camera moves smoothly. Plain text, no emoji. Only measured numbers.
