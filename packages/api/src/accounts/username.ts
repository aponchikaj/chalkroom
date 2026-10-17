// Same rule as the profiles_username_format check: [A-Za-z0-9_]{3,24}. Uniqueness ignores case
// and is enforced by the database (citext unique).
export function usernameProblem(u: string): string | null {
  if (u.length < 3) return 'too short (3 to 24 characters)';
  if (u.length > 24) return 'too long (3 to 24 characters)';
  if (!/^[A-Za-z0-9_]+$/.test(u)) return 'use only letters, digits and _';
  return null;
}
