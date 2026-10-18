# Hacktoberfest Tbilisi 2026: submission form

Field by field, ready to paste. Closes Sunday 18 October 2026 at 12:00 Tbilisi time. One
submission per team, final once confirmed.

## Project title

Chalkroom Live

## Demo or project URL

[YouTube link to renders/chalkroom-live-ka.mp4, 2:30, upload as Unlisted]

## What it does

Chalkroom Live turns an online course into a live class. Up to five people join one room and an
AI tutor teaches them on a shared whiteboard: it writes, draws and narrates, and everyone sees the
same board at the same moment.

Anyone can type a question at any time, and the class never stops for it. A triage agent groups
similar questions ("3 asked") and sends each one where it belongs: answered for the whole class,
covered in the next segment, a short inline reply, or a personal thread. A learner who wants to go
deeper gets their own side tutor with a mini board while the class keeps moving, and a catch-up
card when they come back. Each segment ends with a quick check and a ready vote, so the group moves
together. The class ends with shared notes and flashcards.

Four AI agents (lead tutor, thread tutor, triage, scribe) work on one classroom at once without
conflicts: the board is an append-only event log with a single writer and gap-free sequence
numbers, so late joiners and reconnects replay it exactly.

GitHub: https://github.com/aponchikaj/HACKTOBER
Live app: [web URL]

Stack: React + Vite + Zustand (web), NestJS (API and agents), Supabase (Postgres, row level
security, Realtime, Auth with 2FA), Zod-validated Board Script shared by web and API, Claude Haiku
5.5 in production with a scripted backup tutor that runs a full class offline. API deployed on
Fly.io. Over 250 automated tests: unit, API end to end, database (pgTAP) and a three-browser class
run.

## Tracks

- [x] 01 Make it better: online courses rebuilt as if AI were there from day one; the lecture is
      generated live for this group instead of a chatbot next to a video.
- [x] 02 Multiplayer: up to five people in one live class, plus four agents sharing one classroom.
- [ ] 03 Mobile native: no (the web app works on phones, but it is not native).
- [ ] 04 Desktop native: no.
- [ ] Solana Ideathon: no. The demo lesson teaches Solana PDAs, but the product does not run on
      Solana.

## Who built it

- Lazare Mirziashvili: backend, AI agents, database, deploy
- Kote Bibilauri: frontend, design system, the notebook classroom

## Before you press confirm

1. Make the repo public. https://github.com/aponchikaj/HACKTOBER answers 404 to a logged-out
   visitor right now, so judges cannot open it.
2. Upload the film to YouTube as Unlisted and paste the link above. Title and description with
   chapters are in `SUBMISSION.md`.
3. Fill or delete the "Live app" line. The API is up (https://chalkroom-api.fly.dev/health answers
   ok on claude-haiku-5-5); the web app URL is not recorded anywhere in the repo.
4. Open every link in a private window before confirming.
