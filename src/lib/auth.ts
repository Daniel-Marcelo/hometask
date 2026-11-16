import { useEffect, useSyncExternalStore } from 'react'
import { isEmailAllowed } from './allowlist'

/**
 * Mock magic-link auth — local-only until the Supabase adapter (Task 15)
 * swaps the internals for a real session stream.
 *
 * The exported contract (`AuthState` / `useAuth`) is what callers depend
 * on and must not change when that swap happens.
 *
 * The client-side allowlist is UX only: real enforcement is server-side
 * (Supabase RLS). "Not invited yet" is guidance, not security.
 */

export type AuthState = {
  status: 'loading' | 'signed_out' | 'signed_in'
  email: string | null
}

/** Session persistence key — only this module touches it. */
export const SESSION_KEY = 'hometask.session.v1'

/** Mock magic-link delay: keeps the "Check your email" beat observable. */
const SIGN_IN_DELAY_MS = 400

/** Distinguishable rejection for emails outside the invite allowlist. */
export class NotInvitedError extends Error {
  constructor() {
    super('Not invited yet')
    this.name = 'NotInvitedError'
  }
}

/** The email of the persisted session, or null when there is none. */
function readSessionEmail(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'email' in parsed &&
      typeof (parsed as { email: unknown }).email === 'string'
    ) {
      return (parsed as { email: string }).email
    }
    return null
  } catch {
    return null
  }
}

/** Persist the session; a blocked write must not break the sign-in. */
function writeSession(email: string): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email }))
  } catch (error) {
    console.warn(`hometask: could not persist session to "${SESSION_KEY}"`, error)
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch (error) {
    console.warn(`hometask: could not clear session "${SESSION_KEY}"`, error)
  }
}

/**
 * One session store for the whole app (like the repo singleton): every
 * `useAuth()` caller sees the same state, and `signIn` / `signOut` publish
 * to all of them.
 */
let current: AuthState = { status: 'loading', email: null }
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function getSnapshot(): AuthState {
  return current
}

function publish(next: AuthState): void {
  if (current.status === next.status && current.email === next.email) return
  current = next
  for (const listener of listeners) listener()
}

/**
 * Mock `signIn`: validate the allowlist (case-insensitive, trimmed), store
 * the session, then resolve after the magic-link beat. Disallowed emails
 * reject immediately with `NotInvitedError` ("Not invited yet").
 */
export async function signIn(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase()
  if (!isEmailAllowed(normalized)) throw new NotInvitedError()
  writeSession(normalized)
  // Mock beat: this resolves on its own so the shell is usable without a
  // mail server. The real adapter waits for the user to open the emailed
  // link instead of signing them in here.
  await new Promise((resolve) => setTimeout(resolve, SIGN_IN_DELAY_MS))
  publish({ status: 'signed_in', email: normalized })
}

/** Mock `signOut`: clear the persisted session, back to signed_out. */
export function signOut(): void {
  clearSession()
  publish({ status: 'signed_out', email: null })
}

/** The persisted session is the source of truth on every mount. */
function hydrate(): void {
  const email = readSessionEmail()
  publish(
    email === null
      ? { status: 'signed_out', email: null }
      : { status: 'signed_in', email },
  )
}

/**
 * The auth contract consumed by the gate and the sign-in page.
 *
 * Starts at `status: "loading"` and resolves on mount from the persisted
 * session, so the app never flashes its content before the session is
 * known. The state shape is exactly what the real adapter exposes.
 */
export function useAuth(): AuthState & {
  signIn(email: string): Promise<void>
  signOut(): void
} {
  const state = useSyncExternalStore(subscribe, getSnapshot)

  useEffect(() => {
    hydrate()
  }, [])

  return { ...state, signIn, signOut }
}
