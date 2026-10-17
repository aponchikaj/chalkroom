---
name: Chalkroom Live
description: A live AI-taught class laid out as an open reference manual - tabbed sections, a printed leaf for the board, acetate for threads.
colors:
  paper: "#f2ede0"
  paper-2: "#e8e1d0"
  paper-3: "#ddd4bf"
  leaf: "#fbf8f1"
  leaf-edge: "#d9d0bb"
  acetate: "rgba(251, 249, 243, 0.96)"
  acetate-edge: "rgba(70, 60, 40, 0.28)"
  ink: "#1b1a17"
  ink-2: "#4a463d"
  ink-3: "#6b6557"
  rule: "#cdc4ae"
  rule-2: "#a99f88"
  action: "#f2c230"
  action-press: "#ddab16"
  action-ink: "#1b1a17"
  errata: "#d93a1c"
  errata-tint: "#fbe3dc"
  errata-ink: "#6e1a09"
  h-orange: "#e0672a"
  h-teal: "#0e7d79"
  h-grass: "#3d7a30"
  h-ultra: "#2b4cbd"
  h-violet: "#7449bd"
  h-sienna: "#93492a"
  ok: "#3f7f33"
  warn: "#a8560f"
  note: "#f6e7a6"
  note-ink: "#2e2a17"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "clamp(3rem, 7.4vw, 6.4rem)"
    fontWeight: 850
    lineHeight: 0.9
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 75"
  headline:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "clamp(1.4rem, 2.4vw, 2.1rem)"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 78"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 750
    lineHeight: 1.12
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 82"
  body:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum'"
  reading:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.14em"
    fontVariation: "'wdth' 78"
  button:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 88"
  stamp:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 80"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace"
    fontSize: "0.92em"
    fontWeight: 400
rounded:
  slip: "2px"
  leaf: "3px"
  rail-tab: "4px"
  divider-tab: "6px"
  punch: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.leaf}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.action-press}"
  button-primary-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.action}"
  button-secondary:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.leaf}"
    padding: "0 14px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-2}"
  button-secondary-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-small:
    padding: "0 10px"
    height: "28px"
  button-large:
    padding: "0 20px"
    height: "46px"
  button-danger:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.errata}"
    rounded: "{rounded.leaf}"
  input:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.leaf}"
    padding: "8px 11px"
    height: "38px"
  stamp:
    textColor: "{colors.ink}"
    typography: "{typography.stamp}"
    rounded: "{rounded.slip}"
    padding: "1px 7px"
    height: "20px"
  chip:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.slip}"
    padding: "0 8px"
    height: "22px"
  leaf:
    backgroundColor: "{colors.leaf}"
    rounded: "{rounded.leaf}"
    padding: "18px"
  acetate:
    backgroundColor: "{colors.acetate}"
    rounded: "{rounded.leaf}"
  errata-slip:
    backgroundColor: "{colors.errata-tint}"
    textColor: "{colors.errata-ink}"
    rounded: "{rounded.slip}"
    padding: "9px 12px"
  question-card:
    backgroundColor: "{colors.leaf}"
    rounded: "{rounded.leaf}"
    padding: "11px 12px 12px"
  check-option:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.leaf}"
    padding: "10px 12px"
    height: "44px"
  rail-tab:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.rail-tab}"
    padding: "7px 14px 6px"
  rail-tab-selected:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
  punch:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    rounded: "{rounded.punch}"
    size: "34px"
---

# Design System: Chalkroom Live

## Overview

**Creative North Star: "The Acetate Manual"**

The live class is a boxed-software reference manual lying open at a tabbed section. The lesson is the manual: each segment is a coloured divider tab on the fore edge, the shared whiteboard is the printed leaf in the middle of the page, people are punched holes along the binding, and a private thread is a sheet of milk acetate hinged over the leaf so the class stays visible underneath. Everything is cream stock and black print ink; colour is spent only where it carries meaning (a section, an action, an error).

Density is that of a reference manual, not a dashboard: condensed Archivo running heads and labels, Source Serif 4 for anything meant to be read as prose (captions, tutor answers, notes), and JetBrains Mono only for numbers, codes and times. Nothing eases or fades. Every state change is a two-frame mechanical step of 90 ms, and board figures plot on in discrete pen-plotter steps. The world refuses the video-call grid with a chat sidebar: no faces tiled, no bubble chat, no glassy dark panels.

The world is light only. `color-scheme` is set to `light` on `:root`; there is no dark theme.

**Key Characteristics:**
- Cream section board (paper), white printed leaf, milk acetate as the three material layers.
- Chrome yellow is the one action ink; vermilion is the one error ink.
- Six section hues on divider tabs, cycled per lesson segment.
- Condensed uppercase Archivo for heads, labels, stamps and buttons; serif for reading; mono for figures.
- Two-frame stepped motion (90 ms, `steps(2)`), hinged at the punched edge; never eased.
- Lucide line icons only; no emoji.

## Colors

Print on cream stock: warm neutrals carry the whole surface, one yellow means "you can act here", one vermilion means "something went wrong", and six section hues label the lesson's parts.

### Primary
- **Chrome Yellow** (action): the fill of the one primary pressable control on a surface (I'm ready, Submit, Start class, Send, Copy link, Open thread). Pressed it darkens to **Deep Chrome** (action-press); active it inverts to ink with yellow type. Yellow also marks the immediate states of acting: the focus halo on a text field (3px ring at 55% mix), the chosen check option (26% mix into leaf), the selected board shape (18% mix) and text selection.

### Secondary
- **Section Hues** (h-orange, h-teal, h-grass, h-ultra, h-violet, h-sienna): one per lesson segment in that order, cycled. They fill the divider tabs on the fore edge and drive `--section`, which tints the phase stamp, the "Grouped" stamp, the Q&A icon, the check spread bars and the current page thumbnail underline. Label ink on orange is ink; on the other five it is white (each keeps small text at 4.5:1).

### Tertiary
- **Vermilion** (errata, with errata-tint and errata-ink): errors only. The errata slip, invalid field border, wrong check option, error text, the danger button (End class confirm).
- **State Green** (ok): positive state words and marks: Ready, Answered, Correct, the correct spread bar, question credit.
- **Burnt Amber** (warn): caution words: gate held, warning notices, confusion heat on the board.

### Neutral
- **Section Board** (paper): the page everything sits on; body background, control bar, masthead.
- **Panel Stock** (paper-2): rails, tab column, learner messages, code wells, track backgrounds.
- **Pressed Stock** (paper-3): punch holes, unselected rail tabs, active option press.
- **Printed Leaf** (leaf) with **Leaf Edge** (leaf-edge): the board, leaves, question cards, inputs, buttons at rest.
- **Milk Acetate** (acetate) with **Acetate Edge**: overlays hinged over the leaf (threads, slips).
- **Print Ink** (ink), **Second Ink** (ink-2), **Faint Ink** (ink-3, still 4.5:1 on paper): text in three weights of emphasis.
- **Rule** and **Heavy Rule** (rule, rule-2): hairlines between entries, input borders, disabled outlines.
- **Sticky Note** (note, note-ink): sticky shapes on the board only.

### Named Rules
**The One Yellow Rule.** Chrome yellow fills only the primary pressable action, and only while it can be pressed: a disabled primary drops to a transparent outline (the Send button only turns yellow once there is something to send). Never a section hue, never decoration, never a status.

**The Errata Rule.** Vermilion appears only when something failed or would destroy something. It is never a section hue and never emphasis.

**The Section Ink Rule.** A segment's hue belongs to that segment's tab and the few marks that say "this part of the lesson"; it is never used for actions or errors.

## Typography

**Display Font:** Archivo Variable (with Archivo, system-ui), width axis 75 to 88
**Body Font:** Source Serif 4 Variable (with Georgia) for reading text
**Label/Mono Font:** JetBrains Mono 400 (with ui-monospace, Consolas)

**Character:** a condensed grotesque for the manual's running heads, tabs and stamps against a bookish serif for what the tutor and the class actually say. Body UI text uses tabular numerals throughout.

### Hierarchy
- **Display** (850, clamp(3rem, 7.4vw, 6.4rem), 0.9, wdth 75, uppercase): the title page only (Home and pre-join class name).
- **Headline** (800, clamp(1.4rem, 2.4vw, 2.1rem), 1.12, wdth 78): the class title in the masthead; the lobby title (clamp 1.5 to 2.2rem); h1 base is 2.75rem.
- **Title** (700 to 750, 1.125 to 1.5rem, wdth 80 to 82): h2/h3, thread title, check heading, slip titles, recap heading.
- **Body** (400, 0.9375rem, 1.45): all UI text; question titles at 680 weight, wdth 86.
- **Reading** (400, 1rem to 1.1rem, 1.5 to 1.55): captions (1.1rem), tutor answers, notes, check prompts, thread tutor replies, ledes. Ledes cap at 38 to 46ch.
- **Label** (700, 0.72rem, 0.14em, wdth 78, uppercase): panel headings, field labels, host label, rail tabs (0.1em).
- **Button** (650, 0.8125rem, 0.06em, wdth 88, uppercase).
- **Stamp** (750, 10.5px, 0.1em, wdth 80, uppercase).
- **Mono** (400, 0.92em): counts, timers, invite codes (clamp 2rem to 3.3rem, 0.14em tracking in the lobby), option keys, kbd hints, segment numbers.

### Named Rules
**The Mono-for-Figures Rule.** JetBrains Mono sets only numbers, codes, times and keys (seat counts, 0:30, invite codes, option letters, segment numbers, code on the board). Never words, never headings.

**The Serif-Is-Speech Rule.** If it is prose to be read (what the tutor says, what the class wrote down), it is Source Serif 4. Interface words stay in Archivo.

## Layout

The classroom is an open manual in four columns at desktop: binding (76px, punches), stage (fluid: Q&A strip, board leaf, captions, dock), rail (360px, Questions and Notes behind two small tabs) and the fore-edge tab rail (54px). A masthead running head sits above with a 1.5px ink rule; a control bar sits below with a 1.5px ink rule (host controls, ready strip, ask bar).

- **Board leaf** keeps a 1320 x 640 aspect and fits its container with container query units (`min(100cqw, 100cqh * 2.0625)`). The stage dock under the captions takes at most min(48%, 420px) so the board only shrinks a little while a check is open.
- **Thread layer** is absolutely positioned from 38% of the body to the tab rail (18% at tablet) so the class stays visible to its left.
- **Tablet (max-width 1180px):** columns 64px / fluid / 280px / 48px; voice word hidden; lobby QR hidden.
- **Phone (max-width 760px):** one column that scrolls as a page. Masthead carries people as a horizontal punch row; lesson tabs run horizontally under it (current tab takes the width, titles clamp to 2 or 3 lines); board at full width; rail below with min-height 58vh; ask bar on its own row; the thread leaf goes full-screen and opaque; overlays (lobby, recap) replace the board in the flow.
- **Container queries:** check card and Q&A strip stack below 620px; recap grid stacks below 760px; recap drops from the top of a short board below 320px height.
- **Entry pages** (Home, pre-join) are one manual leaf, max 1180px, with a two-column body (title and contents left, forms right set off by a rule, not a box) and fore-edge tabs; 1080px and 760px breakpoints.

Spacing has no custom properties; the rhythm in use is 4 / 8 / 12 / 18 / 28px, with 6, 10 and 14px as in-between steps inside dense components. Leaves pad 18px; the stage pads 18px 22px; the rail pads 14px.

## Elevation & Depth

Depth is material, not lighting: three stacked paper layers (section board, printed leaf, acetate) separated by a 1px edge line plus one long soft drop. Shadows exist only to say "this sheet lies on top of that one".

### Shadow Vocabulary
- **Leaf** (`box-shadow: 0 1px 0 var(--rule), 0 14px 28px -18px rgba(60, 45, 15, 0.45)`): the board, leaves, a question card that needs you, slips above the ask bar, the host confirm.
- **Acetate** (`box-shadow: 0 1px 0 var(--acetate-edge), 0 18px 34px -16px rgba(60, 45, 15, 0.38)`): thread leaf, check card, slips hinged over the board.
- **Punch hole** (`box-shadow: inset 0 2px 3px rgba(40, 30, 10, 0.35), 0 0 0 3px <person colour>`): the inset of a punched hole with the person's colour as a ring.
- **Acetate blur**: `backdrop-filter: blur(1.5px) saturate(0.7)` on desktop; on phones the acetate is opaque leaf and keeps only its edge and shadow.

### Named Rules
**The Lies-On-Top Rule.** A shadow means one sheet is laid over another. Question cards are ruled entries on the rail's leaf and stay flat; only the one that needs you (attention) takes the leaf shadow and an ink border.

**The Focus Economy Rule.** While a check or thread is in play, what is not in play falls back to the page: desaturate to 0.3 to 0.35 and drop opacity to 0.5 to 0.6, in a two-frame step.

## Shapes

Manuals have cut corners, not soft cards. Leaves, buttons, inputs and options take a 3px radius; stamps, chips, slips and errata take 2px; rail tabs round only their top corners (4px); divider tabs round only their outer edge (0 6px 6px 0 vertical, 6px 6px 0 0 horizontal). Circles are reserved for punch holes, the binding ring of an open seat (dashed), colour swatches and laser dots. Borders are print rules: 1.5px ink for controls, structure and the running-head and control-bar rules; 1px rule for hairlines between entries; dashed for pending, open or not-yet-available states. Disabled buttons carry a 135deg hatch of rule lines instead of greying out. Board strokes use square caps and mitred joins.

## Components

### Buttons
Tactile printed keys: uppercase condensed labels on a 1.5px ink outline.
- **Shape:** cut corner (3px).
- **Primary:** chrome yellow fill, ink type, 36px high, 0 14px padding. Large is 46px / 0 20px; small is 28px / 0 10px.
- **Secondary (default):** leaf fill, ink outline; hover steps to paper-2; active and `aria-pressed` invert to ink with paper type.
- **Ghost:** transparent border and fill; hover paper-2.
- **Danger:** vermilion type and border; hover errata-tint. Used only for a destructive confirm.
- **Disabled:** rule-2 outline, faint ink, hatched background; a disabled primary loses its yellow.
- **Icon button:** square 36px (28px small) with a lucide icon.
- **Motion:** background and transform change in `var(--step) steps(2)` (90 ms, two frames).

### Stamps
A printed status label: words first, colour only reinforces. 1.5px currentColor border, 2px radius, 10.5px uppercase at 0.1em, optional 12px lucide icon. Tones: pending (faint, dashed border), section (segment hue), ink, ok, action (yellow fill, rare), errata, muted. Question statuses read Sorting, Grouped (n asked), Coming up next, Answered, In your thread.

### Chips
Printed labels: leaf fill, 1px rule-2 border, 2px radius, 22px high, 0.72rem 600. Badge is the inverted ink variant (ink fill, paper type, 10px 800).

### Cards / Containers
- **Leaf:** leaf fill, 1px leaf-edge border, 3px radius, leaf shadow, 18px padding.
- **Acetate:** milk acetate fill, acetate-edge border, 3px radius, acetate shadow, slight backdrop blur (opaque on phones).
- **Punched:** a leaf may carry two 12px punched holes on its left edge (at 22% from top and bottom) to show it is hinged.

### Inputs / Fields
- **Style:** leaf fill, 1.5px rule-2 border, 3px radius, 38px high (46px large), placeholder in faint ink. Textareas use the reading serif.
- **Focus:** border goes to ink plus a 3px chrome yellow halo at 55% mix. Global `:focus-visible` elsewhere is a 2px ink outline offset 2px.
- **Error:** border goes vermilion; the message is an errata slip or error text.
- **Field label:** label style (0.72rem, 0.14em, uppercase, ink-2) above the field with a 6px gap.

### Navigation
- **Tab rail (fore edge):** one divider tab per segment, height proportional to running time (never below an estimated 3-minute segment), filled with the segment hue and its label ink. Title runs vertically in label style; running time below in mono (`0:30`, or `~3m` estimated). Done tabs desaturate to 0.55; upcoming tabs are inset 14px; the current tab extends to the edge and carries a 3px inset ink rule. On phones the rail runs horizontally across the top with the current tab growing to take the width.
- **Rail tabs:** two small divider tabs (Questions, Notes) with ink outline on paper-3; the selected one turns leaf and grows 3px taller to join the leaf beneath.
- **Masthead:** brand in 0.8125rem 800 wdth 75 at 0.16em, class title headline, segment line in ink-2, phase stamp and voice toggle at right.

### Punch (people)
A person is a punched hole on the binding edge: 34px (24px small) paper-3 circle with an inset shadow, ringed 3px in the person's colour, initial in 800 condensed. A 16px ink mark at bottom right shows ready (check) or in a thread (arrow up-right); a small ink "H" tab at top left marks the host. Away people lose the colour ring (2px rule-2) and fade to faint ink. An open seat is a dashed rule-2 ring.

### Errata Slip
The one place vermilion fills a surface: errata-tint ground, 1px vermilion border, 2px radius, errata-ink text at 0.8125rem, 9px 12px padding, a lucide icon and an optional dismiss. Above the ask bar it hangs as a slip so the bar never jumps.

### Check Spread
The check leaf lays options across the page in an auto-fit grid (min 190px, 44px high), each a leaf with a 1.5px rule-2 border and a mono option key. Chosen: ink border and yellow tint; correct: green border and 12% green; wrong: vermilion border and errata tint. After sending, unchosen options fall back to dashed outlines and yours stays in a 2px ink border. The result spread is a list of labelled 12px tracks (paper-2, 1px rule) with bars in the section hue, the correct bar in green, and counts in mono. Folded, the result becomes a small printed tab in the dock.

### Question Card
An entry ruled on the rail's leaf: leaf fill, 1px rule border, 3px radius, 11px 12px 12px padding, flat. Head row holds the status stamp and the anonymous +1 button; title in 0.9375rem 680; askers in uppercase 10.5px labels in a 52px margin column; inline answers in the reading serif under a rule. Settled cards fall back toward paper; the one needing attention gets an ink border and the leaf shadow.

### Thread Leaf
A milk acetate leaf hinged over the right of the stage and the rail. Head with the thread title and a small live picture-in-picture of the class board (168px, 132px tablet, 120px phone); the thread's own board; a transcript set as a script with the speaker in a 58px uppercase margin, learner lines in paper-2 boxes and tutor lines in the reading serif; a composer with a yellow Send. While open, the class board behind desaturates. On phones it is full-screen and opaque.

### Board Leaf
The shared whiteboard is the printed leaf: leaf fill, leaf edge, leaf shadow, 1320 x 640. Figures use print ink with the segment hue as accent; strokes are square-capped and plot on in `steps(8)` like a pen plotter, labels appear after half the stroke time; the camera moves in `steps(4)` over 360 ms. Captions sit under the leaf in the reading serif at 1.1rem behind a rule.

### Motion
- **Step** (`--step: 90ms`, `steps(2)`): every UI state change (hover, press, focus economy, toasts, hinge).
- **Hinge-in:** `perspective(1400px) rotateY(-14deg)` to none, from the left (punched) edge, in two frames.
- **Step-in:** opacity 0.4 to 1 in two frames (the only opacity entrance).
- **Reduced motion:** all animations and transitions collapse to 1 ms and one iteration.

## Do's and Don'ts

### Do:
- **Do** give each surface at most one chrome yellow primary action, and let it lose its yellow while disabled.
- **Do** reserve vermilion for the errata slip, invalid fields, wrong answers and the destructive confirm.
- **Do** colour lesson segments only with the six section hues, in order (orange, teal, grass, ultramarine, violet, sienna), with ink on orange and white on the rest.
- **Do** set numbers, codes, times and keys in JetBrains Mono, and only those.
- **Do** set spoken and written prose (captions, tutor answers, notes, prompts) in Source Serif 4.
- **Do** animate in two-frame steps (`var(--step) steps(2)`, 90 ms) and hinge new leaves from the punched edge.
- **Do** say status in words on a stamp first; colour only reinforces.
- **Do** use lucide line icons (12 to 16px, stroke 2 to 3), with a short word beside them wherever there is room (host controls keep their words on phones).
- **Do** show people as punched holes ringed in their colour, never as avatars or video tiles.
- **Do** make the acetate opaque on phones while keeping its edge and shadow.

### Don't:
- **Don't** use yellow for a section, a status, a warning or decoration.
- **Don't** use vermilion for emphasis or as a section hue.
- **Don't** ease or fade transitions (no `ease`, `ease-in-out` or smooth cross-fades); step them.
- **Don't** use emoji anywhere in the interface; reactions and marks are lucide icons and words.
- **Don't** use mono for words, labels or headings.
- **Don't** round corners past 3px on leaves, buttons and inputs; only punches and swatches are circles.
- **Don't** raise every card; only a sheet laid over another, or the one entry that needs you, gets a shadow.
- **Don't** build a video-call grid or a bubble chat sidebar; the class is the manual.
- **Don't** add a dark theme by inverting tokens; the world is printed stock and is light only.
