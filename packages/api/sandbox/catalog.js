// Every REST endpoint of the API, for the sandbox console. Keep in step with the controllers
// and with Api in packages/schema/src/live.ts. `:param` values come from the console context.
// `built: false` marks routes that exist in the contract but are not implemented yet.

export const ENDPOINTS = [
  { group: 'System', name: 'Health', method: 'GET', path: '/health', auth: false,
    note: 'Which model the API runs: mock or anthropic.' },

  { group: 'Account', name: 'My account', method: 'GET', path: '/me',
    note: 'Profile (from the signup trigger), avatar URL, email, 2FA state.' },

  { group: 'Rooms', name: 'Preview by invite code', method: 'GET', path: '/rooms/code/:code', auth: false,
    note: 'Pre-join screen. No membership or token needed.' },
  { group: 'Rooms', name: 'Create room', method: 'POST', path: '/rooms', learn: 'room',
    body: () => ({ title: 'Solana PDAs', goal: '', visibility: 'private' }),
    note: 'The caller becomes host. displayName and color are optional (default: profile). Subscribes the caller.' },
  { group: 'Rooms', name: 'Join room', method: 'POST', path: '/rooms/join', learn: 'room',
    body: (u, c) => ({ inviteCode: c.code }),
    note: 'At most 5 members (409 when full). displayName and color are optional. Subscribes the caller.' },
  { group: 'Rooms', name: 'Leave room', method: 'POST', path: '/rooms/:roomId/leave', body: () => ({}) },
  { group: 'Rooms', name: 'Start class (host)', method: 'POST', path: '/rooms/:roomId/start', body: () => ({}),
    note: '202. The tutor plans and streams segment 0.' },
  { group: 'Rooms', name: 'Ready vote', method: 'POST', path: '/rooms/:roomId/ready', body: (u, c) => ({ segment: Number(c.segment) }),
    note: '409 unless the room is at the check of that segment.' },
  { group: 'Rooms', name: 'Host action (host)', method: 'POST', path: '/rooms/:roomId/host', body: () => ({ action: 'skip' }),
    note: 'action: skip | hold | resume | slower | end' },
  { group: 'Rooms', name: 'Answer check', method: 'POST', path: '/rooms/:roomId/checks/:checkId/answer', body: () => ({ answer: 1 }),
    note: 'mcq: option index; numeric: a number; tf: true or false. 409 once closed.' },
  { group: 'Rooms', name: 'React to a shape', method: 'POST', path: '/rooms/:roomId/reactions', body: () => ({ shapeId: 'pda', kind: 'confused' }),
    note: 'kind: confused | got_it. Same call again removes it.' },

  { group: 'Questions', name: 'Ask', method: 'POST', path: '/rooms/:roomId/questions', learn: 'question',
    body: () => ({ text: 'Why can a PDA not sign?' }), note: 'Rate limit: 6 per minute per user (429).' },
  { group: 'Questions', name: 'Vote +1 (toggle)', method: 'POST', path: '/questions/:questionId/vote', body: () => ({}) },

  { group: 'Threads', name: 'Open thread', method: 'POST', path: '/rooms/:roomId/threads', learn: 'thread',
    body: () => ({ topic: 'bump seeds' }), built: false, task: 'B4',
    note: 'Or accept an offer with { "threadId": "..." }, or { "questionId": "..." }.' },
  { group: 'Threads', name: 'Message thread tutor', method: 'POST', path: '/threads/:threadId/messages',
    body: () => ({ text: 'Why does it start at 255?' }), built: false, task: 'B4' },
  { group: 'Threads', name: 'Close thread', method: 'POST', path: '/threads/:threadId/close', body: () => ({}), built: false, task: 'B4' },
  { group: 'Threads', name: 'Share to class', method: 'POST', path: '/threads/:threadId/share', body: () => ({}), built: false, task: 'B4' },

  { group: 'Notes', name: 'Edit note block', method: 'PUT', path: '/rooms/:roomId/notes/:blockId',
    body: (u, c) => ({ markdown: 'Edited in the sandbox', version: Number(c.blockVersion) }), built: false, task: 'B3',
    note: '409 when version is stale.' },
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
