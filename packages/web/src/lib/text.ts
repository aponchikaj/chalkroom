// Small text helpers shared by features.

/** "Gio", "Gio and Mari", "Ana, Gio and Mari". */
export const joinNames = (names: string[]) =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** How a person is named to the viewer: "You" for themselves. */
export const nameFor = (userId: string | null | undefined, name: string, me: string | null) => (userId && userId === me ? 'You' : name);
