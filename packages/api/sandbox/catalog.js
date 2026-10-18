// Every REST endpoint of the API, for the sandbox console. Keep in step with the controllers
// and with Api in packages/schema/src/live.ts. `:param` values come from the console context.
// Every route is built; `built: false` with `task: '...'` would tag one that is only in the contract.
// Every 429 carries Retry-After; a request refused with 400 does not count toward a rate limit.
// Learner routes on an unknown room answer 404 (403 when it exists and you are not a member).
// A Supabase Auth outage answers 503, not 401.

export const ENDPOINTS = [
  { group: 'System', name: 'Health', method: 'GET', path: '/health', auth: false,
    note: 'Which model the API runs: anthropic, gemini or groq.' },
  { group: 'System', name: 'Sandbox settings', method: 'GET', path: '/sandbox/config.json', auth: false,
    note: 'Supabase URL, anon key and model for this console. Only while the sandbox is on.' },

  { group: 'Account', name: 'My account', method: 'GET', path: '/me',
    note: 'Profile (from the signup trigger), avatar URL, email, settings, 2FA state.' },
  { group: 'Account', name: 'Edit profile', method: 'PATCH', path: '/me',
    body: () => ({ username: 'ana_k', displayName: 'Ana K', color: '#a8dc9f', bio: 'Learning Solana.' }),
    note: 'Any subset. Username: 3-24 letters, digits or _; 409 when taken (case-insensitive).' },
  { group: 'Account', name: 'My settings', method: 'GET', path: '/me/settings', note: 'Defaults until first saved.' },
  { group: 'Account', name: 'Change settings', method: 'PATCH', path: '/me/settings',
    body: () => ({ tutorVoice: true, voiceRate: 1.25, captions: true, reducedMotion: false, theme: 'dark', language: 'en', emailNotifications: true }),
    note: 'Any subset. Text only for people: these settings control the tutor voice, not a microphone.' },
  { group: 'Account', name: 'Avatar: get upload URL', method: 'POST', path: '/me/avatar/upload-url', body: () => ({ contentType: 'image/png' }),
    note: '200. Then upload the file with storage.from("avatars").uploadToSignedUrl(path, token, file), then commit. 20 per hour.' },
  { group: 'Account', name: 'Avatar: commit upload', method: 'POST', path: '/me/avatar', body: () => ({ path: '<path from upload-url>' }),
    note: '200 with my account. 400 until the file is uploaded.' },
  { group: 'Account', name: 'Avatar: remove', method: 'DELETE', path: '/me/avatar', note: '204.' },
  { group: 'Two-factor', name: '2FA state', method: 'GET', path: '/me/2fa',
    note: 'Works before the second factor is passed. mfaPassed false: other routes answer 401 mfa_required.' },
  { group: 'Two-factor', name: 'Email code: send', method: 'POST', path: '/me/2fa/email/send', body: () => ({ purpose: 'enable' }),
    note: '202. purpose: enable | disable | login. Read the code in Mailpit: http://127.0.0.1:55424. 5 per hour.' },
  { group: 'Two-factor', name: 'Email code: verify', method: 'POST', path: '/me/2fa/email/verify', body: () => ({ purpose: 'enable', code: '123456' }),
    note: 'Same purpose as sent. 5 wrong tries lock the code (429). Authenticator apps: Supabase mfa.enroll/challenge/verify.' },
  { group: 'Account', name: 'Public profile', method: 'GET', path: '/users/:username', note: 'Case-insensitive. No email.' },
  { group: 'Account', name: 'My kudos', method: 'GET', path: '/me/kudos',
    note: 'Questions and people my shared threads helped, and how many threads I shared.' },
  { group: 'Account', name: 'Delete my account', method: 'DELETE', path: '/me',
    note: '204. 409 while you host a room that has not ended. Permanent.' },

  { group: 'Rooms', name: 'Preview by invite code', method: 'GET', path: '/rooms/code/:code', auth: false,
    note: 'Pre-join screen. No membership or token needed.' },
  { group: 'Rooms', name: 'Create room', method: 'POST', path: '/rooms', learn: 'room',
    body: () => ({ title: 'Solana PDAs', goal: '', visibility: 'private' }),
    note: 'The caller becomes host. displayName and color are optional (default: profile). Subscribes the caller.' },
  { group: 'Rooms', name: 'Join room', method: 'POST', path: '/rooms/join', learn: 'room',
    body: (u, c) => ({ inviteCode: c.code }),
    note: '201 for a new member, 200 for one coming back. At most 5 members (409 when full); 409 "the class has ended" for someone new. displayName and color are optional. Subscribes the caller.' },
  { group: 'Rooms', name: 'Leave room', method: 'POST', path: '/rooms/:roomId/leave', body: () => ({}),
    note: '204. 403 for someone who never joined, 404 for an unknown room.' },
  { group: 'Rooms', name: 'Start class (host)', method: 'POST', path: '/rooms/:roomId/start', body: () => ({}),
    note: '202. The tutor plans and streams segment 0. 409 when the class already started or ended.' },
  { group: 'Rooms', name: 'Ready vote', method: 'POST', path: '/rooms/:roomId/ready', body: (u, c) => ({ segment: Number(c.segment) }),
    note: '204. 409 unless the room is at the check of that segment.' },
  { group: 'Rooms', name: 'Host action (host)', method: 'POST', path: '/rooms/:roomId/host', body: () => ({ action: 'skip' }),
    note: '202. action: skip | hold | resume | slower | end. 409 on an ended class.' },
  { group: 'Rooms', name: 'Answer check', method: 'POST', path: '/rooms/:roomId/checks/:checkId/answer', body: () => ({ answer: 1 }),
    note: '204. mcq: option index; numeric: a number; tf: true or false. 409 once closed.' },
  { group: 'Rooms', name: 'React to a shape', method: 'POST', path: '/rooms/:roomId/reactions', body: () => ({ shapeId: 'pda', kind: 'confused' }),
    note: '204. kind: confused | got_it. Same call again removes it. 409 on an ended class.' },

  { group: 'Rooms', name: 'Moderate a member (host)', method: 'POST', path: '/rooms/:roomId/moderate',
    body: () => ({ userId: '<member user id>', action: 'mute' }), note: '204. action: mute | unmute | kick. Kicked members cannot rejoin or read the room.' },

  { group: 'Host tools', name: 'Control the tutor (host)', method: 'POST', path: '/rooms/:roomId/host/control', body: () => ({ action: 'pause' }),
    note: '202. action: pause | resume | slower | skip. 409 when the class has not started or has ended; Skip outside a check 409.' },
  { group: 'Host tools', name: 'Re-explain shapes (host)', method: 'POST', path: '/rooms/:roomId/host/reexplain',
    body: () => ({ shapeIds: ['pda'], label: 'the PDA diagram' }),
    note: '202 with { ok, clusterId }. Answered in the next Q&A. 409 when the class has not started or has ended.' },
  { group: 'Host tools', name: 'Pin a question (host)', method: 'POST', path: '/rooms/:roomId/host/pin', body: (u, c) => ({ questionId: c.questionId }),
    note: '202 with { ok, clusterId }. Its group is answered in the next Q&A. 409 when the class has not started or has ended.' },
  { group: 'Host tools', name: 'Check answers (host)', method: 'GET', path: '/rooms/:roomId/host/checks/:checkId/answers',
    note: 'Who answered and whether correctly. 404 for a check not in this room.' },

  { group: 'Activities', name: 'Duel: start (host)', method: 'POST', path: '/rooms/:roomId/duel', body: () => ({ count: 5, secondsPerQuestion: 20 }),
    note: '201 with { duelId }. Only while the class is at a check; 409 otherwise or while an activity runs.' },
  { group: 'Activities', name: 'Duel: answer', method: 'POST', path: '/rooms/:roomId/duel/answer',
    body: () => ({ duelId: '<duelId from start>', index: 0, answer: 1 }),
    note: '204. 409 once the question closed or when answered twice.' },
  { group: 'Activities', name: 'Teach-back: start (host)', method: 'POST', path: '/rooms/:roomId/teachback',
    body: () => ({ concept: 'Why a PDA has no private key' }),
    note: '201 with { teachbackId }. concept defaults to the segment objective. Same 409s as the duel.' },
  { group: 'Activities', name: 'Teach-back: volunteer', method: 'POST', path: '/rooms/:roomId/teachback/volunteer',
    body: () => ({ teachbackId: '<teachbackId from start>' }), note: '204. 409 when someone already volunteered.' },
  { group: 'Activities', name: 'Teach-back: explain', method: 'POST', path: '/rooms/:roomId/teachback/explain',
    body: () => ({ teachbackId: '<teachbackId from start>', text: 'A PDA is derived from seeds and a program id, off the curve, so no key can sign for it.' }),
    note: '204. The volunteer only (403 otherwise).' },

  { group: 'Questions', name: 'Ask', method: 'POST', path: '/rooms/:roomId/questions', learn: 'question',
    body: () => ({ text: 'Why can a PDA not sign?' }), note: 'Rate limit: 6 per minute per user (429). 409 on an ended class.' },
  { group: 'Questions', name: 'Vote +1 (toggle)', method: 'POST', path: '/questions/:questionId/vote', body: () => ({}), note: '204.' },
  { group: 'Questions', name: 'Unmerge from its group', method: 'POST', path: '/questions/:questionId/unmerge', body: () => ({}),
    note: '200. The asker or the host (403 otherwise). 409 when it is not grouped with others or went to a thread.' },

  { group: 'Threads', name: 'Open thread', method: 'POST', path: '/rooms/:roomId/threads', learn: 'thread',
    body: () => ({ topic: 'bump seeds' }),
    note: '201 new thread, 200 when accepting an offer with { "threadId": "..." }; or { "questionId": "..." }. 409 races (offer gone, one already open) and on an ended class.' },
  { group: 'Threads', name: 'Message thread tutor', method: 'POST', path: '/threads/:threadId/messages',
    body: () => ({ text: 'Why does it start at 255?' }), note: '202. 403 for a removed (kicked) member, the thread owner too.' },
  { group: 'Threads', name: 'Join thread', method: 'POST', path: '/threads/:threadId/join', body: () => ({}),
    note: '200. A classmate peeking joins and may write. 409 for your own or a closed thread.' },
  { group: 'Threads', name: 'Close thread', method: 'POST', path: '/threads/:threadId/close', body: () => ({}), note: '204.' },
  { group: 'Threads', name: 'Share to class', method: 'POST', path: '/threads/:threadId/share', body: () => ({}),
    note: 'The owner. 403 for a removed (kicked) member, the thread owner too. 409 when there is nothing to share yet.' },
  { group: 'Sources', name: 'List sources', method: 'GET', path: '/rooms/:roomId/sources', note: 'Status: pending, processing, ready or failed.' },
  { group: 'Sources', name: 'Add a link', method: 'POST', path: '/rooms/:roomId/sources/url', body: () => ({ url: 'https://solana.com/docs/core/pda' }), note: 'Fetched by the ingest worker; private addresses are refused. 30 per hour.' },
  { group: 'Sources', name: 'File: upload URL', method: 'POST', path: '/rooms/:roomId/sources/upload-url', body: () => ({ fileName: 'handout.pdf', contentType: 'application/pdf', size: 1024 }), note: '200. Then upload to the signed URL (resources bucket) and commit. 30 per hour.' },
  { group: 'Sources', name: 'File: commit upload', method: 'POST', path: '/rooms/:roomId/sources', body: () => ({ path: '<path from upload-url>', title: 'Handout' }),
    note: '201 for a new source, 200 when the same file is already a source.' },
  { group: 'Sources', name: 'Remove source', method: 'DELETE', path: '/sources/:sourceId', note: '204.' },

  { group: 'Notes', name: 'Edit note block', method: 'PUT', path: '/rooms/:roomId/notes/:blockId',
    body: (u, c) => ({ markdown: 'Edited in the sandbox', version: Number(c.blockVersion) }),
    note: '409 when version is stale.' },

  { group: 'Cards', name: 'Review a card', method: 'POST', path: '/cards/:cardId/review', body: () => ({ rating: 'good' }),
    note: '201 first review, 200 after. rating: again | hard | good | easy. 409 when the card is not in the deck.' },

  { group: 'Courses', name: 'Catalog', method: 'GET', path: '/courses', note: 'Add ?q= to search.' },
  { group: 'Courses', name: 'One course', method: 'GET', path: '/courses/:courseId', note: '404 for a private course that is not yours.' },
  { group: 'Courses', name: 'Course FAQ', method: 'GET', path: '/courses/:courseId/faq' },
  { group: 'Courses', name: 'Create course', method: 'POST', path: '/courses',
    body: () => ({ title: 'Solana basics', goal: 'Accounts, PDAs and transactions', visibility: 'public' }),
    note: 'Without syllabusMd the planner drafts one. Rate limit: 20 per hour (429).' },
  { group: 'Courses', name: 'Edit course (owner)', method: 'PATCH', path: '/courses/:courseId',
    body: () => ({ goal: 'Accounts, PDAs, transactions and fees' }), note: 'Any subset; {} is 400 nothing to update. 403 for anyone but the owner.' },
  { group: 'Courses', name: 'Fork course', method: 'POST', path: '/courses/:courseId/fork', body: () => ({ title: 'My Solana basics' }),
    note: 'A private copy owned by the caller.' },
  { group: 'Courses', name: 'Rate course', method: 'POST', path: '/courses/:courseId/rating', body: () => ({ stars: 5 }),
    note: '204. One per user, replaces.' },
  { group: 'Courses', name: 'Lobby', method: 'GET', path: '/lobby', note: 'Open public rooms (lobby or live) with free seats.' },

  { group: 'Library', name: 'Replays', method: 'GET', path: '/replays', note: 'Finished public classes, newest first.' },
  { group: 'Library', name: 'Replay a class', method: 'GET', path: '/rooms/:roomId/replay',
    note: 'Members, or anyone signed in for a finished public class; 403 otherwise.' },
  { group: 'Library', name: 'Book next session (host)', method: 'POST', path: '/rooms/:roomId/next',
    body: () => ({ startsAt: new Date(Date.now() + 7 * 86400000).toISOString(), title: 'Solana PDAs, part 2' }),
    note: '201 new booking, 200 when it moves the existing booking. 409 when the next session already started.' },
];

/** Replace :params from the context; report the ones that are still empty. */
export function fillPath(path, ctx) {
  const missing = [];
  const out = path.replace(/:(\w+)/g, (_, k) => {
    const v = ctx[k];
    if (v === undefined || v === null || v === '') missing.push(k);
    return encodeURIComponent(v ?? '');
  });
  return { path: out, missing };
}
