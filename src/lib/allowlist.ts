/**
 * Client-side invite allowlist, read lazily per call (test-friendly:
 * `vi.stubEnv` works without module re-imports).
 *
 * Source: `VITE_ALLOWED_EMAILS`, comma-separated. An empty or absent list
 * allows any email — dev convenience while the real invite list isn't
 * configured yet. UX only; real enforcement is server-side (RLS).
 */

export function getAllowedEmails(): string[] {
  const raw: string = import.meta.env.VITE_ALLOWED_EMAILS ?? ''
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '')
}

/** Whether `email` may sign in (compared case-insensitive and trimmed). */
export function isEmailAllowed(email: string): boolean {
  const list = getAllowedEmails()
  if (list.length === 0) return true
  return list.includes(email.trim().toLowerCase())
}
