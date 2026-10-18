# Chalkroom Live: submission and video copy

Ready-to-paste text for the Hacktoberfest Georgia 2026 submission and wherever the film is
uploaded. Georgian first, English second. Every claim is backed by `docs/design.md`,
`docs/TASKS.md` or the code; nothing here is invented. Fill the two links in brackets before
posting.

- Repository: https://github.com/aponchikaj/HACKTOBER
- Live demo: [demo URL]
- Video: [video URL]
- Team: კოტე ბიბილაური (frontend, design system), ლაზარე მირზიაშვილი (backend, agents)
- Tracks: 01 Make It Better, 02 Multiplayer Agentic

## Georgian

**სათაური:** Chalkroom Live: ცოცხალი გაკვეთილი AI მასწავლებლით, ერთად

**ერთი წინადადებით:** ხუთამდე ადამიანი უერთდება ცოცხალ გაკვეთილს, რომელსაც AI მასწავლებელი
ატარებს ერთ საერთო დაფაზე; კითხვები კლასს არასდროს აჩერებს.

**პრობლემა.** ონლაინ კურსზე მარტო ხარ: ვიდეო ლაპარაკობს, კითხვას კი ფორუმზე დღეობით არავინ
პასუხობს. საკლასო ოთახში ერთი ცნობისმოყვარე მოსწავლე მთელ კლასს აჩერებს, მორცხვი კი კითხვას
ვერ სვამს. AI მასწავლებლები პასუხობენ, მაგრამ მხოლოდ ერთ ადამიანს: ჯგუფი იკარგება.

**გადაწყვეტა.**
- ერთი საერთო გაკვეთილი: მთავარი მასწავლებელი ხატავს და ხსნის დაფაზე, ყველას ეკრანზე
  სინქრონულად. გაკვეთილი წინასწარ ჩაწერილი არ არის, ის ამ ჯგუფისთვის იქმნება.
- კითხვა ნებისმიერ დროს: ტრიაჟის აგენტი მსგავს კითხვებს აჯგუფებს და თითოეულს გზას უჩენს:
  კლასს, შემდეგ ნაწილს, მოკლე პასუხს ან პირად თემას. ყოველი კითხვა რამდენიმე წამში იღებს
  სტატუსს.
- პირადი თემა: ვისაც სიღრმე უნდა, საკუთარ მასწავლებელს და მინი დაფას იღებს, კლასი კი
  აგრძელებს. დაბრუნებისას მოკლე შეჯამება ხვდება.
- კლასი თავად ირჩევს ტემპს: შემოწმება ყოველი ნაწილის ბოლოს და მზადყოფნის ხმა; თემაში მყოფი
  კლასს არ აჩერებს. ბოლოს ყველას საერთო ჩანაწერები და ბარათები რჩება.

**რატომ არის კრეატიული.** ეს არ არის ჩატბოტი ვიდეოს გვერდით: თავად კლასია აგებული AI-ზე. ერთ
კლასზე ოთხი აგენტი მუშაობს ერთდროულად (მთავარი მასწავლებელი, პირადი მასწავლებელი, ტრიაჟი,
მემატიანე) და კონფლიქტის გარეშე, რადგან დაფა არის ერთი ჟურნალი ერთი ჩამწერით და უწყვეტი
ნომრებით.

**ტექნოლოგია.** React + Vite (ვები), NestJS (API და აგენტები), Supabase (Postgres, RLS,
realtime), Zod-ით შემოწმებული Board Script, Claude Haiku 5.5 production-ში და სათადარიგო
mock მასწავლებელი, რომელიც სრულ გაკვეთილს ქსელის გარეშეც ატარებს.

## English

**Title:** Chalkroom Live: a live class taught by AI, together

**One line:** Up to five people join a live class taught by an AI tutor on one shared
whiteboard; questions never stall the class.

**Problem.** Online courses leave you alone: the video talks, and a forum question waits days
for an answer. A real classroom lets one curious student stall everyone while a shy one never
asks. AI tutors answer, but only one person at a time, so the group is lost.

**Solution.**
- One shared lesson: a lead tutor draws and narrates on a board everyone sees in sync. The
  lesson is generated live for this group, not recorded.
- Ask any time: a triage agent groups similar questions and routes each one to the class, a
  later segment, a short inline answer or a personal thread. Every question gets a visible
  status within seconds (triage routes within about 4.5 s, measured).
- Personal threads: a learner who wants to go deeper gets their own tutor and mini board while
  the class keeps moving, and a catch-up card on return.
- The class sets the pace: a check after each segment and ready votes; a learner in a thread
  never holds up the gate. Shared notes and flashcards at the end.

**Why it is creative.** Not a chatbot next to a video: the class itself is built on AI. Four
agents (lead tutor, thread tutor, triage, scribe) work on one classroom at once without
conflicts, because the board is an append-only log with a single writer and gap-free
sequence numbers.

**How it is built.** React + Vite web app, NestJS API and agents, Supabase (Postgres, row
level security, realtime), Board Script validated with Zod, Claude Haiku 5.5 in production
and a scripted mock tutor that runs a full class offline. Tested with 103 unit tests, 105 API
end-to-end tests and 50 database checks (counts from `docs/TASKS.md`, 2026-10-17).

## Video description (YouTube or similar)

Chalkroom Live: ცოცხალი გაკვეთილი AI მასწავლებლით, ხუთამდე ადამიანისთვის, ერთ საერთო დაფაზე.
Hacktoberfest Georgia 2026.

A live class taught by an AI tutor on one shared whiteboard for up to five people. Questions
never stall the class. Georgian with Georgian subtitles.

00:00 პრობლემა: ონლაინ კურსზე მარტო ხარ
00:11 პრობლემა: ერთი ადამიანი კლასს აჩერებს
00:22 პრობლემა: AI მასწავლებელი მხოლოდ ერთს პასუხობს
00:30 Chalkroom Live
00:40 ოთახში შესვლა
00:50 გაკვეთილი ყველას ეკრანზე ერთდროულად
01:04 კითხვები და ტრიაჟი
01:22 პირადი თემა
01:38 შემოწმება და მზადყოფნა
01:52 შეჯამება და ჩანაწერები
02:02 ოთხი აგენტი, ერთი ჟურნალი
02:18 ვისწავლოთ ერთად

Code: https://github.com/aponchikaj/HACKTOBER
Team: კოტე ბიბილაური, ლაზარე მირზიაშვილი

## Short post (about 280 characters)

Chalkroom Live: a live class taught by AI for up to five people on one shared board.
Questions never stall the class: a triage agent groups them, deep dives get their own tutor,
and four agents share one gap-free log. Hacktoberfest Georgia 2026. [video URL]
