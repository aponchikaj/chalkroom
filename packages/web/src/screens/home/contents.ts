// Lane P: the notebook's contents, shared by Home (its divider tabs and contents list) and the
// not-found page, so both list the same entries with the same page numbers. Replays is the last
// entry: it leaves Home, so it carries an arrow instead of a page number.

export const TABS = [
  { id: 'start', label: 'Start', short: 'Start', entry: 'Start a class' },
  { id: 'join', label: 'Join', short: 'Join', entry: 'Join with a code' },
  { id: 'lobby', label: 'Lobby', short: 'Lobby', entry: 'Open classes' },
  { id: 'courses', label: 'Courses', short: 'Courses', entry: 'Courses' },
  { id: 'classes', label: 'Your classes', short: 'Classes', entry: 'Your classes' },
  { id: 'how', label: 'How it works', short: 'How', entry: 'How a class runs' },
] as const;

export type Tab = (typeof TABS)[number]['id'];

export const REPLAYS = { path: '/replays', entry: 'Replays of finished classes' } as const;
