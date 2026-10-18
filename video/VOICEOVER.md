# Voiceover script (Georgian)

Chalkroom Live demo film, 2:30. One cue = one subtitle on screen = one line of voice.
Source of truth: `script.json`. The timecodes below are copied from it (mm:ss.s, film time);
if they ever disagree, `script.json` wins.

Each cue shows: timecode in, timecode out, length, pace (characters per second), the Georgian
line to read, and an English gloss for non-Georgian readers (do not record the gloss).

## Recording tips

- **Pace.** Calm and warm, a teacher's voice, not an advert. Most cues sit at 12 to 16
  characters per second. Cues marked "tight" are above 17 chars/s: read them a little faster
  or let them run over and retime (below). Pause briefly at the gaps between cues; scene
  changes (marked by the headings) can take a slightly longer breath.
- **Names and terms.** "Chalkroom Live" in English ("chók-rum layv"). "PDA" letter by letter
  in English ("pi-di-ey"). "bump seed" in English. "QR" as "kyu-ar". "AI" as "ey-ay".
- **Room tone.** Record in one quiet room, 48 kHz mono WAV, about 30 cm from the mic, no music
  in the headphones. Leave 1 s of silence at the start.
- **One take per scene** is easiest to edit: read all cues of a scene in one go, then cut.
- **Delivery file.** Place the edited voice at `audio/voice.wav`, 150.0 s long, starting at
  film time 0, then uncomment the voice `<audio>` line in `index.html`.

## How to retime after recording

1. Listen to the recorded voice and note where each line really starts and ends.
2. Edit `start` and `end` of each cue in `script.json` (seconds, film time). Keep cues in
   order and non-overlapping; keep the scene windows (`scenes`) unless a scene must move.
3. Run `node tools/build-subs.mjs` (or `npm run subs`). It rewrites
   `compositions/subtitles.html` and `subtitles.ka.srt` and warns about overlaps.
4. Re-snapshot the changed spots (see CONVENTIONS.md) and check that on-screen beats still
   land on the voice; scene builders time their beats to these cues.

## s01-alone (00:00.0 to 00:11.0): Problem: alone with a video

**c01** `00:01.0 - 00:03.6` (2.6 s, 9.2 chars/s)

> ონლაინ კურსზე მარტო ხარ.

*On an online course you are on your own.*

**c02** `00:03.8 - 00:08.4` (4.6 s, 16.7 chars/s)

> ვიდეო ლაპარაკობს, შენ უსმენ. შენს კითხვას კი ფორუმზე დღეობით არავინ პასუხობს.

*The video talks, you listen. And for days nobody on the forum answers your question.*

**c03** `00:08.6 - 00:11.0` (2.4 s, 15.4 chars/s)

> ამიტომ კურსს უმეტესობა ვერ ამთავრებს.

*That is why most people never finish the course.*

## s02-classroom (00:11.0 to 00:22.0): Problem: one person stalls the room

**c04** `00:11.4 - 00:14.6` (3.2 s, 16.6 chars/s)

> საკლასო ოთახში ასე არ არის, მაგრამ იქ სხვა პრობლემაა:

*A classroom is different, but it has another problem:*

**c05** `00:14.8 - 00:18.4` (3.6 s, 16.4 chars/s)

> ერთი ცნობისმოყვარე მოსწავლე ათი კითხვით მთელ კლასს აჩერებს,

*one curious student stops the whole class with ten questions,*

**c06** `00:18.6 - 00:21.8` (3.2 s, 15.6 chars/s)

> მორცხვი კი იმავე კითხვას ხმამაღლა ვერასდროს სვამს.

*and the shy one never asks the same question out loud.*

## s03-one-to-one (00:22.0 to 00:30.0): Problem: AI tutors lose the group

**c07** `00:22.2 - 00:25.6` (3.4 s, 15.6 chars/s)

> AI მასწავლებელი პასუხობს, მაგრამ მხოლოდ ერთ ადამიანს.

*An AI tutor answers, but only one person.*

**c08** `00:25.8 - 00:29.6` (3.8 s, 15.8 chars/s)

> ჯგუფი იკარგება: საერთო ტემპი, სხვისი კითხვები, ერთად სწავლა.

*The group is lost: a shared pace, other people's questions, learning together.*

## s04-reveal (00:30.0 to 00:40.0): Reveal: Chalkroom Live

**c09** `00:30.8 - 00:33.2` (2.4 s, 10.0 chars/s)

> გაიცანით Chalkroom Live.

*Meet Chalkroom Live.*

**c10** `00:33.4 - 00:39.4` (6.0 s, 15.5 chars/s)

> ცოცხალი გაკვეთილი, რომელსაც AI მასწავლებელი ატარებს ერთ საერთო დაფაზე, ხუთამდე ადამიანისთვის.

*A live lesson taught by an AI tutor on one shared board, for up to five people.*

## s05-join (00:40.0 to 00:50.0): Join the room

**c11** `00:40.4 - 00:44.0` (3.6 s, 9.4 chars/s)

> ოთახში ბმულით ან QR კოდით შედიხარ.

*You join the room with a link or a QR code.*

**c12** `00:44.2 - 00:49.6` (5.4 s, 12.4 chars/s)

> მეგობრები ერთმანეთის მიყოლებით ჩნდებიან, ჰოსტი კი გაკვეთილს იწყებს.

*Friends appear one after another, and the host starts the lesson.*

## s06-lesson (00:50.0 to 01:04.0): The lesson draws in sync

**c13** `00:50.4 - 00:54.6` (4.2 s, 15.2 chars/s)

> მასწავლებელი ხატავს და ხსნის, და ყველას დაფა ერთდროულად იხატება,

*The tutor draws and explains, and everyone's board draws at the same moment,*

**c14** `00:54.8 - 00:57.8` (3.0 s, 8.0 chars/s)

> ლეპტოპზეც და ტელეფონზეც.

*on laptops and on phones.*

**c15** `00:58.0 - 01:03.6` (5.6 s, 12.5 chars/s)

> გაკვეთილი წინასწარ ჩაწერილი არ არის: ის ამ ჯგუფისთვის იქმნება, ახლავე.

*The lesson is not pre-recorded: it is made for this group, right now.*

## s07-triage (01:04.0 to 01:22.0): Questions and triage

**c16** `01:04.4 - 01:07.6` (3.2 s, 11.9 chars/s)

> კითხვის დასმა ნებისმიერ დროს შეგიძლია.

*You can ask a question at any time.*

**c17** `01:07.8 - 01:13.4` (5.6 s, 15.0 chars/s)

> გიომ და მარიმ ერთი და იგივე იკითხეს სხვადასხვა სიტყვით. ტრიაჟის აგენტი მათ აჯგუფებს.

*Gio and Mari asked the same thing in different words. The triage agent groups them.*

**c18** `01:13.6 - 01:16.8` (3.2 s, 14.7 chars/s)

> კლასი ერთ პასუხს მიიღებს და ორივეს დაასახელებს.

*The class gets one answer, and both of them are named.*

**c19** `01:17.0 - 01:21.6` (4.6 s, 14.1 chars/s)

> ყოველი კითხვა რამდენიმე წამში იღებს სტატუსს. არცერთი არ იკარგება.

*Every question gets a status within seconds. None gets lost.*

## s08-thread (01:22.0 to 01:38.0): A personal thread

**c20** `01:22.4 - 01:26.6` (4.2 s, 10.5 chars/s)

> ნიკა bump seed-ზე უკვე მესამე კითხვას სვამს.

*Nika is already asking his third question about the bump seed.*

**c21** `01:26.8 - 01:31.8` (5.0 s, 13.0 chars/s)

> ის იღებს პირად თემას: საკუთარ მასწავლებელს და საკუთარ მინი დაფას.

*He gets a personal thread: his own tutor and his own mini board.*

**c22** `01:32.0 - 01:37.6` (5.6 s, 10.9 chars/s)

> კლასი არ ჩერდება: მთავარი დაფა პატარა ფანჯარაში ცოცხლად ჩანს.

*The class does not stop: the main board stays live in a small window.*

## s09-check (01:38.0 to 01:52.0): Check, gate, Q&A beat

**c23** `01:38.4 - 01:42.0` (3.6 s, 17.2 chars/s, tight)

> ყოველი ნაწილი მოკლე შემოწმებით მთავრდება. ოთხიდან სამი მიხვდა.

*Every part ends with a short check. Three out of four got it.*

**c24** `01:42.2 - 01:46.0` (3.8 s, 14.7 chars/s)

> კლასი წინ მიდის, როცა ყველა მზადაა, და ნიკას არ ელოდება.

*The class moves on when everyone is ready, and does not wait for Nika.*

**c25** `01:46.2 - 01:51.6` (5.4 s, 14.3 chars/s)

> შემდეგ მასწავლებელი დაჯგუფებულ კითხვას დაფაზე პასუხობს და ავტორებს ასახელებს.

*Then the tutor answers the grouped question on the board and names who asked.*

## s10-catchup (01:52.0 to 02:02.0): Catch-up and shared notes

**c26** `01:52.4 - 01:56.4` (4.0 s, 13.3 chars/s)

> ნიკა ბრუნდება და მოკლე შეჯამებით ხედავს, რა გამოტოვა.

*Nika comes back and sees what he missed in a short summary.*

**c27** `01:56.6 - 02:01.6` (5.0 s, 12.0 chars/s)

> გაკვეთილის ბოლოს ყველას რჩება საერთო ჩანაწერები და ბარათები.

*At the end of the lesson everyone keeps shared notes and flashcards.*

## s11-agents (02:02.0 to 02:18.0): Four agents, one log

**c28** `02:02.4 - 02:07.4` (5.0 s, 10.4 chars/s)

> კულისებში ერთ კლასზე ოთხი აგენტი მუშაობს ერთდროულად:

*Behind the scenes, four agents work on one class at the same time:*

**c29** `02:07.6 - 02:11.0` (3.4 s, 18.5 chars/s, tight)

> მთავარი მასწავლებელი, პირადი მასწავლებელი, ტრიაჟი და მემატიანე.

*the lead tutor, the personal tutor, triage and the scribe.*

**c30** `02:11.2 - 02:17.6` (6.4 s, 15.8 chars/s)

> ყველაფერი ერთ ჟურნალში იწერება, უწყვეტი ნომრებით, ამიტომ ხუთივე ეკრანი ზუსტად ერთსა და იმავეს ხედავს.

*Everything is written to one log with gap-free numbers, so all five screens see exactly the same thing.*

## s12-end (02:18.0 to 02:30.0): End card

**c31** `02:18.4 - 02:22.6` (4.2 s, 12.1 chars/s)

> ეს არ არის ჩატბოტი ვიდეოს გვერდით. ეს თავად კლასია.

*This is not a chatbot next to a video. This is the class itself.*

**c32** `02:22.8 - 02:26.6` (3.8 s, 11.8 chars/s)

> კლასი, რომელიც არასდროს ელოდება ერთ ადამიანს.

*A class that never waits for one person.*

**c33** `02:27.0 - 02:29.6` (2.6 s, 12.3 chars/s)

> Chalkroom Live. ვისწავლოთ ერთად.

*Chalkroom Live. Let's learn together.*

