# Chalkroom Live: demo film plan (director's cut)

A 2:30 film for the Hacktoberfest Georgia 2026 jury. Georgian everywhere: on-screen copy, board
content, UI labels and burned-in subtitles. The team records the Georgian voiceover later, over
the subtitle timings in `script.json`. The film must make sense with the sound off.

## What the jury must leave with

1. **Problem:** online courses leave you alone; a real classroom lets one person stall everyone;
   AI tutors are 1:1 and lose the group.
2. **Solution:** a live class taught by an AI tutor on one shared board, for up to five people.
3. **Why it is creative:** questions never stall the class (triage groups them, threads take the
   deep dives), the class sets its own pace, and four agents share one classroom without
   conflicts (one append-only log, one writer, gap-free sequence numbers).
4. **It is real:** every screen is the product's own design system and the product's own demo
   lesson (Solana PDAs from `packages/mock-tutor`), translated to Georgian.

Track fit (say it visually in s11/s12): **01 Make It Better** (online courses rebuilt as if AI was
there from day one) and **02 Multiplayer Agentic** (several agents on one shared classroom).

## Sources of truth

- `../DESIGN.md`: colours, type, components, motion. Every frame must look like this product.
- `../docs/design.md`: product, agents, demo script. `../PRODUCT.md`: principles.
- `../docs/pitch/img/*.png`: real screenshots of the web app (2880x1800). Use them as layout
  reference; rebuild the UI in HTML/CSS in Georgian rather than placing English screenshots.
- `script.json`: scene windows and subtitle cues (the voiceover script). Times are final-film
  seconds.

## Format

- 1920x1080, 30 fps, 150.0 s. HyperFrames (HTML + GSAP), rendered to MP4.
- One root `index.html` mounts 12 scene compositions (`compositions/sNN-*.html`) by
  `data-composition-src` with `data-start`/`data-duration` from `script.json`, plus a subtitles
  layer and the audio.
- Machine: MacBook M1, 8 GB RAM, about 1-2 GB free. Never run full renders in parallel; render
  with `--workers 1` or `2`. Use `npx hyperframes snapshot` for checks.

## Look: "The Acetate Manual", on film

The whole film lives on the product's printed-manual world: cream section board (paper
`#f2ede0`), white printed leaves (`#fbf8f1`), milk acetate overlays, print ink `#1b1a17`.
Colour only where it means something:

- **Chrome yellow `#f2c230`**: the one pressable action in a frame (I'm ready, Ask, Send, Join).
- **Vermilion `#d93a1c`**: only for problems and wrong answers (in the problem act it marks the
  pain: the stalled progress bar, the unanswered forum post).
- **Section hues** in order orange `#e0672a`, teal `#0e7d79`, grass `#3d7a30`, ultramarine
  `#2b4cbd`, violet `#7449bd`, sienna `#93492a`: lesson segment tabs, and the film's chapter tabs.
- **Green `#3f7f33`**: ready, answered, correct.
- Person colours (punch rings): ანა yellow `#f2c230`, ნიკა blue `#6aa9e0`, გიო green
  `#7fbf6a`, მარი pink `#e48aa8`.
- Paper grain: a very subtle noise overlay on every scene (SVG feTurbulence, opacity 0.04 to
  0.06), plus a soft vignette. No glows, no gradients on UI chrome, no glassy dark panels, no dark
  frames. Light world only.
- Shadows only mean "this sheet lies on top" (leaf and acetate shadows from DESIGN.md).

### Type (Georgian)

Georgian glyphs come from Noto, matched to the site's fonts on the same width axis:

| Role | Latin (site) | Georgian | Settings |
|---|---|---|---|
| Display, heads, labels, stamps, buttons | Archivo Variable | **Noto Sans Georgian** variable | wght 700-850, wdth 75-82 (condensed, like Archivo) |
| Reading: subtitles, tutor speech, answers, notes, prompts | Source Serif 4 | **Noto Serif Georgian** variable | wght 400-500, wdth 100 |
| Numbers, codes, times, keys | JetBrains Mono | (digits only) | |

- Font stacks put the Latin face first: `'Archivo', 'Noto Sans Georgian', sans-serif` and
  `'Source Serif 4', 'Noto Serif Georgian', serif`. Georgian text falls through to Noto.
- Self-host all fonts as woff2 in `assets/fonts/` (no network at render time).
- Uppercase labels: Georgian has real capitals (Mtavruli). Use `text-transform: uppercase` with
  0.08-0.12em tracking for stamps, tabs and labels only if the font renders Mtavruli correctly
  (verify in a snapshot); otherwise keep labels in normal case.
- The Serif-Is-Speech rule holds: subtitles and anything the tutor or a person says are serif.
- Minimum on-screen text 28 px; headlines 64 px and up; max about 8 words per text block outside
  the UI recreations.

### Motion language

Three speeds, used consistently:

1. **UI state changes step**, like the product: two-frame steps, 90 ms (`ease: "steps(2)"`).
   Stamps change, buttons press (invert to ink), punches light up, cards hinge in from the
   punched edge (`rotateY(-14deg)` to 0, stepped).
2. **Board figures plot on like a pen plotter**: strokes draw in `steps(8)`, labels appear after
   half the stroke time. This is the product's signature; make it the film's signature.
3. **The camera is smooth**: push-ins, pull-backs and pans on `power3.inOut` / `expo.inOut`, 0.8
   to 1.6 s. The camera keeps each state filling the frame; pull back to reveal scale.

Rules: no bouncy easing, no particle bursts, no lone fades (entrances move 2 to 3 properties:
opacity plus y or scale or rotateY). Stagger lists by 0.08 to 0.15 s. Exits are faster than
entrances. Anything on screen for more than 2 s gets secondary motion (a caption line advancing,
a stroke plotting, a cursor drifting). Never more than 3 s without a new event.

A **cursor** drives interactions: a small ink arrow cursor with a name pill in the person's
colour, real clicks (press scale 0.92 plus a step-in ring), typing at about 18 chars/s.

### Continuity: no hard cuts

Each scene's last frame hands off to the next scene's first frame through a shared element
(listed per scene below). Scenes are separate files built by different people, so match these
handoffs exactly: same element, same position, size and colour at the boundary.

### Subtitles

Burned in, bottom of frame, from `script.json` cues. Noto Serif Georgian 40 px, weight 500, ink
on a leaf strip (`#fbf8f1` at 0.94, 1.5 px ink rule on top, 3 px radius, leaf shadow), max width
1400 px, centred, max two lines, bottom margin 54 px. Cue in: step-in (opacity 0.4 to 1 in two
frames, y 6 px to 0); out: two-frame step. Scenes keep their important content out of the bottom
170 px band. Also export `subtitles.ka.srt` from the same cues.

## Scenes

Times are film seconds. "Copy" is the exact Georgian on screen (besides subtitles).

### s01-alone (0-11): alone with a video

Open on a single video player as a printed leaf on the cream board, slightly tilted, camera
close. A course video plays (an abstract lecture slide: a grey play head moving, a small static
lecturer silhouette made of shapes, no stock imagery). A cursor types a question into a forum
box beside it: "რატომ ვერ აწერს PDA ხელს?" and posts. The post gets a timestamp in mono that
ticks forward: "1 დღე", "3 დღე", "7 დღე", while a "0 პასუხი" counter stays at zero (vermilion
outline stamp). Camera pulls back: the course progress bar under the player stalls at 12% and
turns into a dashed vermilion line. Final beat: the leaf slides down and dims (focus economy:
desaturate 0.35, opacity 0.5).
Copy: player title "ონლაინ კურსი · ლექცია 4 / 38", forum "კითხვა ფორუმზე", stamp "0 პასუხი",
progress label "პროგრესი 12%".
Handoff out: the dimmed leaf shrinks to a small rectangle at frame centre that becomes the front
desk of s02.

### s02-classroom (11-22): one person stalls the room

A top-down classroom diagram in the manual style: 20 punch holes in rows (people), a lectern
leaf at the top. One punch (ring in orange, label "ცნობისმოყვარე") raises question marks: small
stamps "?" pile up beside it, counting 1 to 10 in mono. Each time, the other 19 punches lose a
little colour, and a "კლასი ელოდება" timer in mono runs. Then focus moves to a quiet punch at the
back (ring in blue, label "მორცხვი"): a question slip writes itself above it ("მეც ეს მინდოდა
მეკითხა"), hesitates, and deletes letter by letter, unsent.
Handoff out: camera pushes into the quiet punch; it becomes the single person at the centre of
s03.

### s03-one-to-one (22-30): AI tutors lose the group

One person (punch) with a 1:1 tutor chat leaf: a short exchange in serif, answered fast (it
works). Then the camera pulls back: five people, each with their own separate chat leaf,
drifting apart on the board; dashed lines between them break one by one. Labels fade in by the
broken links: "საერთო ტემპი", "სხვისი კითხვები", "ერთად სწავლა", each crossed with a vermilion
rule. Final beat: the five chat leaves slide together and stack into one neat pile at centre.
Handoff out: the pile of leaves at centre, which becomes the closed manual in s04.

### s04-reveal (30-40): Chalkroom Live

The pile closes into a printed manual cover (cream stock, ink rules, six section-hue divider tabs
on the fore edge). The cover opens on a hinge from the punched edge to the title page: big
condensed display "Chalkroom Live" (Archivo 850, wdth 75) and under it in Georgian display
(Noto Sans Georgian 800, condensed) "ცოცხალი გაკვეთილი. ერთი დაფა. ხუთამდე ადამიანი." Three
lines appear one by one on stepped timing as the voice names them. A small stamp: "Hacktoberfest
Georgia 2026". The six tabs flick in one by one (boom boom boom, stepped).
Handoff out: the title page's leaf becomes the room lobby leaf in s05 (same leaf, contents swap
with a short blur).

### s05-join (40-50): join the room

Lobby leaf: room title "Solana PDA-ები", invite code in big mono "PDA-42K" (tracking 0.14em), a
QR code (drawn from squares, decorative), seats "0/5". A phone mockup slides in from the right
(simple ink outline), a cursor taps "შესვლა". People appear as punched holes along the binding,
one per beat: ანა (host, small ink "H" tab), ნიკა, გიო, მარი; seats count 1/5 to 4/5 in mono;
the fifth seat stays a dashed open ring. Host cursor (ანა) presses the yellow button
"გაკვეთილის დაწყება" (press: invert to ink with yellow type).
Handoff out: the camera pushes into the lobby leaf, which becomes the board leaf of s06.

### s06-lesson (50-64): the lesson draws in sync

The classroom in the product layout (from `docs/pitch/img/board.png`), in Georgian: masthead
"CHALKROOM LIVE · Solana PDA-ები", segment line "ნაწილი 1 / 3: რა არის PDA?", phase stamp
"ასწავლის" (section orange), punches on the binding, fore-edge tabs ("რა არის PDA?", "bump-ის
პოვნა", "ხელმოწერა invoke_signed-ით").
The board plots on, pen-plotter style: title "PDA: პროგრამიდან მიღებული მისამართი", box
"საფულე (აქვს გასაღები)", box "პროგრამა", arrow labelled "seeds + bump", circle "PDA", formula
in serif "PDA = H(seeds, programId, bump)", a sticky note "PDA-ს ხელს მხოლოდ პროგრამა აწერს".
The caption line under the board, serif: "შედეგი მრუდის გარეთაა, ამიტომ პირადი გასაღები მას არ
აქვს."
Mid-scene, the camera pulls back to reveal the same board drawing in sync on three laptops and a
phone (four device outlines, each plotting the same stroke at the same moment, with a tiny
per-device name: ანა, ნიკა, გიო, მარი). Then it pushes back into one board.
Handoff out: the camera ends framing the classroom with the question rail visible on the right.

### s07-triage (64-82): questions and triage

Camera on the question rail and the ask bar. Two cursors (გიო green, მარი pink) type in the ask
bar at different moments: გიო "რატომ ვერ აწერს PDA ხელს ტრანზაქციას?", მარი "PDA თავად რატომ ვერ
მოაწერს ხელს?". Both cards appear with a dashed "სორტირდება" stamp. A triage agent marker (a
small labelled tag "ტრიაჟი") sweeps across; the two cards slide together and merge into one
card titled "რატომ ვერ აწერს PDA ხელს?", stamp "დაჯგუფდა · 2 იკითხა" (section hue), askers listed
in a margin column "გიო", "მარი", note "მასწავლებელი ამას მთელ კლასს უპასუხებს".
Then the four routes, as four stamps fanning out from the triage tag, one per beat, each with a
one-line example card:
- "კლასისთვის" (class): the grouped card.
- "შემდეგ ნაწილში" (later): "რა არის bump seed?" with "გაკვეთილი ამას შემდეგ ნაწილში ხსნის".
- "ნაპასუხებია" (inline, green): "programId ჰეშში შედის?" with the answer in serif "კი. ამიტომ
  იგივე seeds სხვა პროგრამაში სხვა PDA-ს იძლევა."
- "პირადი თემა" (thread): handled in s08, shown here as the fourth stamp only.
A mono readout in the corner: "სტატუსი ≤ 5 წმ".
Handoff out: the "პირადი თემა" stamp stays lit and moves to ნიკა's punch.

### s08-thread (82-98): a personal thread

ნიკა (blue) asks "bump seed როგორ ირჩევა?"; a small counter by the punch shows "3-ე კითხვა
bump-ზე". An offer slip hinges in over the ask bar: "გინდა bump seeds 1:1 გაარჩიო?" with a yellow
"თემის გახსნა" button; ნიკა's cursor clicks. The milk acetate thread leaf hinges in from the
right over the stage (layout from `docs/pitch/img/thread.png`): title "bump seeds", subtitle
"შენი 1:1 მასწავლებელთან. კლასი გრძელდება.", a mini board that plots "bump 255 მრუდზე" ->
"bump 254 მრუდზე" -> "bump 253 მრუდის გარეთ" (the last box in green), and the transcript: "შენ:
bump seed როგორ ირჩევა?" / "მასწავლებელი: პირველი მნიშვნელობა 255-დან ქვემოთ, რომელიც ჰეშს
მრუდიდან გადაიყვანს." In the thread head, a live picture-in-picture of the class board keeps
drawing (segment 2: a bar chart plotting). ნიკა's punch on the binding gets the small ink
up-right arrow mark. The main class behind the acetate desaturates (focus economy) but keeps
moving.
Handoff out: the acetate slides away to the right; the class board comes back to full colour
with the check card rising at the bottom.

### s09-check (98-112): check, ready gate, Q&A beat

Check card (acetate, hinged from the bottom): prompt in serif "ვის შეუძლია PDA-ს ხელის
მოწერა?", four options in a spread with mono keys: A "საფულის მფლობელს", B "პროგრამას", C
"ნებისმიერს", D "არავის". Three cursors choose; B lights green, one wrong pick shows vermilion.
Result bars in the section hue, correct bar green, mono counts, headline "4-დან 3 მიხვდა".
Then the ready strip: "მზად: ანა, გიო, მარი" punches get check marks one per beat; ნიკა shows the
arrow mark and the label "თემაშია, არ აჩერებს"; the gate opens (stamp "კლასი გრძელდება").
Q&A beat: the grouped question card flies to the board; the board plots a short answer "პირადი
გასაღები არ არსებობს -> მხოლოდ პროგრამას შეუძლია ხელის მოწერა (invoke_signed)" and a credit
line under it "იკითხეს: გიომ და მარიმ".
Handoff out: the board leaf stays; a catch-up slip hinges in over it.

### s10-catchup (112-122): catch-up and shared notes

ნიკა returns ("კლასში დაბრუნება" button pressed). A catch-up slip: "სანამ თემაში იყავი: ნაწილი
2, bump-ის პოვნა", a three-line summary in serif, and two buttons "ნახვა 2x" and "შეჯამების
წაკითხვა". Then a pull-back to the recap leaf (layout like `docs/pitch/img/recap.png`): heading
"ჩანაწერები", segment notes writing themselves line by line (the scribe), a "ძირითადი" list, the
class questions with answers, and a stack of flashcards that fans out (front: "ვის შეუძლია PDA-ს
ხელის მოწერა?"). Small export chips: "Markdown", "Anki".
Handoff out: the camera pulls far back; the recap leaf becomes one tile in the s11 system view.

### s11-agents (122-138): four agents, one log

The "how it works" scene, still on paper. The classroom as a small leaf in the centre; four agent
cards around it, appearing one per beat, each a labelled leaf with a lucide-style line icon and
a one-line job:
- "მთავარი მასწავლებელი": "ხატავს და ხსნის დაფაზე"
- "პირადი მასწავლებელი": "ერთი თითოეულ თემაზე"
- "ტრიაჟი": "აჯგუფებს და ანაწილებს კითხვებს"
- "მემატიანე": "წერს შეჯამებებს და ჩანაწერებს"
Then all four write into one log: a vertical ledger strip of numbered entries in mono ("#41
board", "#42 say", "#43 check", "#44 answer_cluster"...), each new entry stepping in with the next
number, no gaps, while five small screens on the right update in lockstep. A small stamp "ერთი
ჩამწერი · უწყვეტი seq". Two track tabs flick in at the end, in section hues: "01 Make It Better"
and "02 Multiplayer Agentic".
Real numbers allowed here (measured in `docs/TASKS.md`, keep exact): "ტრიაჟი ≤ 4.5 წმ", "ხუთამდე
ადგილი ოთახში". Do not invent users, ratings or metrics.
Handoff out: the ledger strip folds up into a single closed leaf at centre.

### s12-end (138-150): end card

The leaf opens to the title page again (rhymes with s04): "ეს არ არის ჩატბოტი ვიდეოს გვერდით."
then, replacing it with a stepped swap, "ეს თავად კლასია." Then the principle in display Georgian:
"კლასი არასდროს ელოდება ერთ ადამიანს." Final card (from 146 s, hold 4 s, no subtitle covering
it after 149.6 s): "Chalkroom Live" display, "ვისწავლოთ ერთად." under it, the six section tabs,
a footer line in label style: "Hacktoberfest Georgia 2026 · კოტე ბიბილაური · ლაზარე მირზიაშვილი".
The last frame holds still for 1 s.

## Audio

No voice in the build; the team records the Georgian voiceover later. Build:

- **Music:** an original score synthesized in Python (numpy, no downloads): warm, confident,
  around 104 BPM, soft piano/marimba-like plucks, felt bass, light kick and hats. Arc: quiet and
  slightly minor in the problem act (0-30 s), a lift into major with the kick entering at the
  reveal (30 s), steady groove through the demo, a build into the agents scene (122 s), resolve
  and ring out on the end card. Mixed low so a voice sits on top (target about -24 LUFS for the
  music bed).
- **SFX, all synthesized:** paper slide (filtered noise sweep) for leaves, stamp thunk for status
  stamps, pen-plotter ticks for board strokes, soft key clicks for typing, a pop for each punch
  joining, a two-tone chime for "correct", a low dull tick for the vermilion problem beats.
  Placed from a cue list exported by each scene (time in film seconds).
- Deliver stems: `audio/music.wav`, `audio/sfx.wav`, and the mix inside the render. Leave
  `audio/voice.wav` as a slot in `index.html` (commented) for the recorded voiceover.

## Verification gates

1. `npx hyperframes check` passes (layout overflow, contrast, timing).
2. Snapshot every scene at its start, middle and end, plus each boundary at +-0.1 s; contact
   sheet; fix overlaps, overflow, empty frames, unreadable text, missing Georgian glyphs (tofu
   boxes), subtitles colliding with content.
3. Draft render at low quality, watched at normal speed (storyboard 1 frame per second).
4. Final render `--workers 1`, 30 fps, high quality.

## Deliverables

- `renders/chalkroom-live-ka.mp4` (with music and SFX, subtitles burned in)
- `renders/chalkroom-live-ka-nosubs.mp4` (optional, if time allows)
- `subtitles.ka.srt`, `VOICEOVER.md` (the script with timecodes for recording)
- `audio/music.wav`, `audio/sfx.wav`
- `renders/storyboard.png` (1 frame per 2 s)

## Director's decisions (overturn any in one reply)

- HyperFrames over Remotion: scenes are plain HTML/CSS, so the product's own design tokens and
  fonts carry over directly, and it has `check` and `snapshot` gates built in.
- The lesson on screen is the product's real demo lesson (Solana PDAs), translated to Georgian,
  so the film matches the live stage demo.
- UI motion is stepped like the product; only the camera moves smoothly.
- Noto Sans Georgian / Noto Serif Georgian for Georgian, matched to Archivo / Source Serif 4.
- Names on screen: ანა (host), ნიკა, გიო, მარი, as in the product's demo.
- No metrics beyond what `docs/TASKS.md` measured; no users or testimonials (none exist).
