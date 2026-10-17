# Polish plan: the Class Notebook (2026-10-18)

Goal: an app nobody can find a fault with. It should feel like a real notebook and classroom,
with ruled pages, handwriting where people and the tutor write, and smooth, interactive motion.
It also gets a landing page, a better free voice, and fixes for every UX and technical gap the
audits found.

The evidence is in `.impeccable/scratch/polish/` (gitignored, local only):
- `ux/`: UX critique and screenshots
- `visual/`: notebook mockups `board.html` and `notes.html`, plus `fonts.css`
- `landing/`: `landing.html` mockup
- `tech/`: performance audit
- `tts/`: Kokoro proof

Read the mockups before building.

## 1. Direction: "The Class Notebook"

The Acetate Manual becomes a notebook people write in. These stay as they are:
- the cream desk (`--paper`)
- punched holes for people
- divider tabs for segments
- chrome yellow only on the one primary action of a region
- vermilion only for errors
- no emoji, lucide icons only

Where each surface goes:

| Surface | Becomes |
|---|---|
| Board | A ruled notebook leaf. Pale blue rules every 40 board px (half the 80 px Board Script cell, so `gridToPx` centres sit on the grid). Three punched holes. A margin rule in the **segment hue**, never red. The tutor writes in blue-black pen (`--pen #1f2b4d`). Diagram boxes are cards whose leaf fill hides the rules. Highlights are a section-hue marker band. Code stays mono; KaTeX stays typeset. |
| Notes | A ruled page in graphite (`--pencil`). Editors' initials and colour dot in the margin. Highlighter is a section-hue band low on the line. |
| Questions | Sticky notes (pale `--note`, not the action yellow) with a tape strip and a ±1deg tilt. A group is a stack. Answered ones fade toward leaf, with the answer on a strip in reading serif. Your own sticky has an ink outline. |
| Threads | Tracing paper (the acetate token) held by a binder clip. |
| Checks | A worksheet slip. The result is a rubber stamp in green ink ("Correct, 3 of 4"). |
| Home | The notebook's contents page: dotted leaders, mono page numbers. |
| Auth | A library card. |
| Account | "This notebook belongs to" on a cover label. |
| Landing | A composition notebook on a desk (section 5). |

**Never hand-drawn:** buttons, inputs, stamps, tabs, the host bar, timers, counts, invite codes,
option keys and seat counts stay Archivo or JetBrains Mono. Lists of controls get no ruled
background, and controls get no texture.

## 2. Type (all OFL; self-host with @fontsource packages, preload the latin woff2s)

| Role | Font | Use |
|---|---|---|
| Board hand | Kalam 400/700 | Body 28 px on the 40 px rule; titles 700 at 44 px; labels 20-22 px (board px) |
| Notes and questions hand | Shantell Sans variable (wght, INFM 55-70; subset or static weights, no more than about 60 KB) | Notes 17/32 (16/30 on phones); stickies 500, 19/1.35 |
| Display | Gochi Hand | Masthead class title, landing hero |
| UI | Archivo (kept) | All controls |
| Reading | Source Serif 4 (kept), then Noto Serif Georgian | Captions, answers |
| Mono | JetBrains Mono (kept) | Numbers, code |
| Georgian | Noto Sans Georgian via `unicode-range`, `size-adjust: 88%`, same metric overrides | No Google handwriting face covers Georgian |

**Ruled-line alignment:** every hand face, including the fallbacks, gets
`ascent-override: 78%; descent-override: 22%; line-gap-override: 0%`. Then a `.ruled`
utility draws a `repeating-linear-gradient` with a background offset computed from
`--lh`, `--fs` and `--pad-top`, and gaps between blocks are whole rules. The full CSS is in
`.impeccable/scratch/polish/visual/fonts.css`.

**The board:** the rules are an SVG pattern with a 40 px pitch. `Lines` in `Shapes.tsx` uses
`dominantBaseline="alphabetic"` and snaps baselines to multiples of 40.

**Settings:** a "Plain type" preference swaps every hand face for Source Serif and Archivo,
for legibility and dyslexia.

## 3. Motion 2.0

DESIGN.md's "nothing eases, two-frame steps" rule changes:
- The 90 ms step stays for button presses.
- Layout changes and drawing ease.
- No animation library in the classroom. Use CSS plus the View Transitions API through a
  `transition(fn)` helper that just runs `fn` where the browser lacks support or the person
  prefers reduced motion.
- The landing page may use more.

| Moment | Spec | Reduced motion |
|---|---|---|
| Handwriting write-on (board text) | `clip-path: inset()` sweep, about 28 ms per character, `cubic-bezier(.45,.05,.4,1)`, one line at a time, block or inline-block elements only | Appears |
| Pen draw (lines, boxes, arrows) | `stroke-dashoffset`, 450-700 ms, replacing `steps(8)` | Appears |
| Sticky note arrives | 560 ms `(.2,1.25,.35,1)` from -40 px and -7deg; regrouping animates with a view transition | Fade |
| Segment change | Page turn: 600 ms rotateY around the binding, shadow sweep | 150 ms crossfade |
| Check result | Stamp: scale 1.9 to 1 with tilt, 380 ms `(.2,1.6,.35,1)` | Appears |
| Route change, rail tabs, thread drawer, check fold | View transitions, 180 ms | Instant, but still visible |

Replace the blanket 1 ms reduced-motion rule in `styles.css` with per-moment fallbacks.

## 4. Pages fill the screen

Every page shorter than the viewport still fills it. The main leaf or sheet gets
`min-height: calc(100dvh - <header> - var(--page-gap-bottom))`, ending a clear margin (24-32 px,
plus the safe area) above the bottom edge instead of stopping short. This covers Home tabs, auth,
account, class page, courses, replays, the not-found page and the landing page.

## 5. Landing page (signed-out "/")

Use the mockup (`landing/landing.html`, `v3-desktop.png`):
- Headline: **FIVE SEATS. ONE BOARD. NO ONE LEFT BEHIND.**
- On the right, the real board component replays the mock-tutor PDA lesson on a timer. People
  appear as punched holes, and two questions merge into a grouped sticky.
- Hand-lettered notes in Kalam.
- Fore-edge divider tabs as navigation.

Sections:
1. Start: "Start a class" goes to `/signup?next=/`; the invite-code box goes to `/r/CODE`.
2. Questions: the four routes, plus a check result.
3. Threads: the side-tutor sheet and the catch-up card.
4. After class: notes and flashcards.
5. How it's built: the four agents, the one-writer log, the mock tutor runs offline.
6. Close: the call to action again, plus the Hacktoberfest Georgia 2026 / GeoSafety credit.

Honest copy only. No numbers except product limits. Never say "hold Space to talk" or
"no signup"; both are false now.

Routing: on `/`, signed-out visitors get the lazy-loaded `<Landing/>` before the login gate,
including while auth is still loading. Signed-in visitors get Home.

**Optional three.js hero:** a 3D notebook on a desk that opens onto the live board.
- Libraries: three, @react-three/fiber and only the drei helpers needed, lazy-loaded after first
  paint, about 250 KB.
- Models: CC0 Poly Haven `binder_notebook`, `SchoolDesk_01`, `stationery_supplies`; Draco, 1k
  textures, kept in `packages/web/public/landing/`.
- The 2D hero shows until the scene is ready.
- Phones (fewer than 4 cores or no WebGL2) and reduced motion get the 2D hero or a still image.

## 6. Voice and sound

- **Natural voice:** Kokoro-82M via kokoro-js in a Web Worker (Apache 2.0), English only.
  - WebGPU with fp32 when `navigator.gpu` exists, else WASM q8 (about 90 MB, downloaded once).
  - Only on desktop with `deviceMemory` of 4 or more and no save-data; otherwise the system voice.
  - Same promise contract as `speakBrowser` (resolves when the audio ends), so `player.ts`
    timing is unchanged.
  - Prefetch the next sentence.
  - Fall back to the system voice on any error or a slow first sentence.
- **Setting:** a device-level "Voice: Natural / System / Off" (localStorage, no schema change),
  with the note "Natural downloads a 90 MB voice once". Delete the dead OpenAI/ElevenLabs
  `speakServer` path.
- **Sound effects:** off by default, one toggle, very quiet. All CC0, trimmed to short clips,
  in `packages/web/public/sfx/`:
  - page turn: freesound 136778 (davidbain)
  - pencil scribble: freesound 742623 (WaltzOfTheWifi)
  - soft bell for a check or gate: freesound 571512 (LegitCheese)
  - sticky peel for a grouped question: freesound 474580 (Keegan_Miner)
  - UI clicks: Kenney Interface Sounds (github.com/Calinou/kenney-interface-sounds)

## 7. UX fixes (from the critique; severity in brackets)

1. [blocker] **The ready gate opens while the tutor is still drawing.** Show Ready, Skip and
   the timer only after this device has finished playing the segment, or after the check is
   answered (`ReadyStrip.tsx:109`, `HostControls.tsx:60`; `CheckCard.tsx:41` already waits for
   playback).
2. [major] **Ready without answering.** Submitting a check also marks you ready. An unanswered
   ready shows as "Ready, no answer".
3. [major] **The host cannot see who is lost.** A host-only "Who answered" list per check
   (name: correct / wrong / no answer), and confused counts per person on the binding.
4. [major] **No host controls while teaching.**
   - Add Pause / Resume of the tutor's narration on the host's device, with a notice to the
     class. If a class-wide pause needs the API, add it as a new additive endpoint.
   - "Re-explain this" on a selected shape, and "Pin to next Q&A" on a question card. Both may
     reuse ask/cluster routes or add additive endpoints with a working mock.
   - Post a notice to the class when the host uses Slower or Skip.
5. [major] **Phones.**
   - The board gets a pen-following camera at a readable size, with "Whole page" and
     pinch-zoom.
   - The host controls collapse into one "Host" menu.
   - The segment tabs become a thin progress line.
   - Tap targets at least 44 px; safe areas top and bottom.
6. [major] **"Lost / Got it" is hidden.** Make it a permanent pair in the control bar, targeting
   the current figure.
7. [major] **The class end is not clean.** Stop narration (done in PR #8), hide the ask bar and
   captions, switch the rail to Notes, and show "Nobody answered" instead of "0 of 0".
8. [major] **Catch-up competes with the open check.** Show catch-up first and fold the check
   until it is dismissed. While a thread is open, label the main ask box "Ask the class".
9. [major] **Keyboard and screen readers.**
   - Copy Home's tab pattern to the rail tabs (aria-controls, arrow keys).
   - Count badges on the tabs, plus a polite live announcement for new questions.
   - A "Select current figure" key so the board is usable without a mouse.
10. [minor] **First run.**
    - The topic box starts empty.
    - Invite links open Sign up first, with "Log in" second.
    - Add a real not-found page.
    - After class, Home shows "You just finished X: open the class page".
    - Replays gets the account menu and is reachable from Home.
    - Replay rows show the time and the people.
11. [minor] **Small fixes.**
    - Show the gate timer inside the ready strip.
    - Show Quiz duel and Teach-back only while a check is open.
    - Show the host elapsed time and time left in the segment.
    - Show the lesson objectives in the lobby.
    - Pin the board to the top in every phase.
    - Make the segment titles readable (no sideways truncation).

## 8. Technical fixes (from the audit)

1. **One 1.38 MB entry chunk.**
   - Lazy-load every route.
   - Load KaTeX, highlight.js and their CSS only when a formula or code shape appears.
   - Put a static first screen in `index.html`.
   - Preload the fonts.
   - Remove `chunkSizeWarningLimit: 4000`.
2. **The phone layout jumps 0.32 at class start.**
   - Reserve the tab-strip and control-bar heights from the lobby on.
   - Give `.board-wrap` `aspect-ratio: 1320/640` with a minimum height.
   - Make the lobby leaf an overlay.
3. **Shift-click multi-select is broken.** The `ShapeView` memo comparator keeps a stale
   handler (`Shapes.tsx:316-326`). The handler must read `useRoom.getState().selection`.
4. **No error boundary.** Add one around the classroom and one per board shape; KaTeX or mermaid
   failures show a slip, not a blank page.
5. **Focus.**
   - Escape on menus returns focus to the button that opened them.
   - After `navigate()`, focus the page heading and `scrollTo(0, 0)` on forward navigation.
6. **Optimistic updates.**
   - `AskBar` puts the returned row into the store at once (or shows a pending card).
   - The thread "Back to class" closes first and rolls back if the call fails.
   - `fetch` gets `AbortSignal.timeout(10000)`.
7. **Selection re-renders the whole classroom.** Move the selection read out of
   `ClassroomView` into Board and AskBar.

Keep what already works: board frame times, first shape within about 1 s, laser isolation, and
the reconnect banner.

## Lanes (file ownership; one agent per lane)

| Lane | Owns |
|---|---|
| **F, Foundation** (runs first) | `packages/web/index.html`; `styles.css` tokens and global rules; `ui/*`; new `ui/motion.ts` (transition helper); `ui/ErrorBoundary.tsx`; `lib/router.ts`; `main.tsx` (lazy routes, landing route stub, not-found route); `vite.config.ts`; font packages; DESIGN.md (direction, type, motion 2.0, page-fill rule) |
| **B, Board** | `board/*` |
| **C, Classroom and host** | `screens/ClassroomView.tsx`, `classroom.css`, `features/gate`, `features/check`, `features/people`, `features/layers`, `features/lobby`, `features/activities`; additive API endpoints in new files, contract additions in `live.ts` |
| **R, Rail, threads, notes** | `features/rail`, `features/ask`, `features/thread`, `features/notes`, `features/materials` |
| **P, Pages** | `screens/Home.tsx`, `screens/home/*`, `screens/auth/*`, `screens/account/*` (preferences UI from lane V goes here), `screens/shelf/*`, `screens/courses/*`, `screens/library/*`, `screens/RoomRoute.tsx`, the not-found page body |
| **L, Landing** | new `screens/landing/*`, `public/landing/*` |
| **V, Voice and sound** | `lib/speaker.ts`, `lib/player.ts`, new `lib/kokoro.worker.ts`, new `lib/sfx.ts`, `lib/preferences.ts`, `public/sfx/*` |
