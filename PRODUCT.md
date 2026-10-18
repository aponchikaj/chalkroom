# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Study groups**: three to five friends learning a topic together before an exam, on their own
  schedule. They want a shared pace and shared notes.
- **Self-learners**: people who want a course with other people instead of watching video alone.
  They join an open room that starts soon.
- Inside every class there are two recurring roles: **the curious one**, who wants to ask ten
  follow-ups without annoying anyone, and **the quiet one**, who wants to ask without speaking up.
- One member is the **host**: they start the class and can override the pace (skip, hold, slower,
  end). Defaults should mean the host rarely needs to act.

## Product Purpose

Chalkroom Live turns an online course into a live class taught by an AI tutor on a shared
whiteboard, for up to five people. The tutor draws and narrates; everyone sees the same board in
sync. Anyone can ask at any time, a triage agent groups similar questions so the class gets one
answer, and a learner who wants to go deeper gets a personal side tutor (a thread) while the class
keeps moving. Checks after each segment and ready votes keep the group together.

Success: a group finishes a lesson together, every question gets a visible answer path within
seconds, and nobody is held back or left behind.

## Positioning

Recorded-video platforms (Khan Academy, Coursera, Udemy) leave learners alone with a forum;
1:1 AI tutors lose the group. Chalkroom Live is the only one where the lecture itself is generated
live for this group and adapts to its confusion, with several AI agents (lead tutor, thread tutors,
triage, scribe) working on one shared classroom at once.

## Operating Context

- A live session of about 45 minutes, in segments of 2 to 4 minutes, each ending in a quick check
  and a ready gate, then a short Q&A beat.
- Join in about 10 seconds from an invite link or QR code: type a name, pick a colour, no signup
  (anonymous accounts that can be claimed later).
- Voice plays locally on each device (browser text-to-speech) with captions; people may listen
  with sound off. Questions can be typed, spoken (push to talk) or pinned to shapes on the board.
- Laptops and phones in the same class. The hackathon demo runs on three laptops and one phone,
  on stage, on venue Wi-Fi, for about three minutes.
- After class: shared notes, the learner's questions and answers, proposed flashcards.

## Capabilities and Constraints

- Up to 5 seats per room. One active thread per learner. A learner in a thread never holds up the
  ready gate.
- UX rules from the design: never block the class on one person; no question goes into a void
  (a visible status within about 5 seconds); always know where you are (main or thread, what you
  missed, what comes next); group first, then individual (+1 is anonymous, group answers credit
  everyone who asked); the host rarely needs to act; fast feedback (first board shape within
  1 to 2 seconds).
- Question statuses: grouped (with asker count), coming up next, answered inline, offered a thread.
- The whiteboard content is drawn by the AI from Board Script (boxes, arrows, formulas, code,
  tables, charts, Mermaid diagrams). The web app renders it; learners do not edit the shared board.
- Out of scope for the hackathon demo (slides only): lobby of public rooms, community course
  catalog, quiz duel, teach-back, shared deck, calendar invites, replays.

## Brand Commitments

- Name: **Chalkroom Live** (from Chalkroom v1, an open-source single-learner AI classroom).
- Plain text, no emoji anywhere: in UI copy, code, docs and messages. Status is said in words;
  icons are SVG components (lucide-react).

## Evidence on Hand

- `docs/design.md`: the full product design (journey, screens, agents, demo script).
- A static demo lesson on Solana Program Derived Addresses, replayed on the landing page
  (`packages/web/src/screens/landing/demoLesson.ts`).
- No users, testimonials, metrics or press exist yet; none may be invented.

## Product Principles

1. The class never waits for one person.
2. Every question visibly goes somewhere.
3. You always know where you are and what you missed.
4. The group comes first; individuals are credited, never exposed.
5. The board is the lesson; everything else supports it.
