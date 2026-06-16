/**
 * Resolves a stored value that could be either a Firebase UID or a plain name string
 * to a human-readable display name.
 *
 * Firebase UIDs are base62, typically 28 chars. If the value matches a user by id,
 * return that user's name. Otherwise treat the value as already being a name and
 * return it as-is (covers legacy records that stored names directly).
 */
export function resolveUserDisplay(
  value: string | undefined | null,
  users: Array<{ id: string; name?: string; email?: string }>,
  fallback = ''
): string {
  if (!value) return fallback;
  const user = users.find(u => u.id === value);
  if (user) return user.name || user.email || fallback;
  return value; // already a plain name string
}
