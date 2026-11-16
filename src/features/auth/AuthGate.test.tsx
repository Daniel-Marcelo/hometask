import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SESSION_KEY, signIn, useAuth } from '../../lib/auth'
import { AuthGate } from './AuthGate'

// RTL auto-cleanup needs vitest globals, which this project doesn't enable.
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  localStorage.removeItem(SESSION_KEY)
})

/** Deterministic invite list for the allowlist tests. */
function stubInviteList(list: string): void {
  vi.stubEnv('VITE_ALLOWED_EMAILS', list)
}

/**
 * Signed-in content stub — stands in for the real app shell (routes,
 * tab bar) that AuthGate hides until the session is live.
 */
function SignedInProbe(): ReactNode {
  return <div>app content</div>
}

/** Drives the sign-out side of the useAuth contract from inside the gate. */
function SignOutProbe(): ReactNode {
  const { signOut } = useAuth()
  return (
    <button type="button" onClick={signOut}>
      Sign out
    </button>
  )
}

describe('AuthGate', () => {
  it('signed-out users see the sign-in page, not the app', () => {
    render(
      <AuthGate>
        <SignedInProbe />
      </AuthGate>,
    )

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Send magic link' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('app content')).not.toBeInTheDocument()
  })

  it('an allowlisted email signs in and reveals the app', async () => {
    stubInviteList('dan@example.com')
    const user = userEvent.setup()

    render(
      <AuthGate>
        <SignedInProbe />
      </AuthGate>,
    )
    await user.type(screen.getByLabelText('Email'), 'dan@example.com')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    // Mock magic-link shape: "Check your email" while the sign-in
    // promise is in flight, then the gate flips to the app.
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(await screen.findByText('app content')).toBeInTheDocument()

    // The mock persists the session like the real adapter will.
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toEqual({
      email: 'dan@example.com',
    })
  })

  it('a disallowed email (allowlist configured) shows "Not invited yet"', async () => {
    stubInviteList('dan@example.com')
    const user = userEvent.setup()

    render(
      <AuthGate>
        <SignedInProbe />
      </AuthGate>,
    )
    await user.type(screen.getByLabelText('Email'), 'stranger@example.com')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText('Not invited yet')).toBeInTheDocument()
    // Still signed out — the app never renders.
    expect(screen.queryByText('app content')).not.toBeInTheDocument()
  })

  it('signing out returns to the sign-in page', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: 'dan@example.com' }))
    const user = userEvent.setup()

    render(
      <AuthGate>
        <>
          <SignOutProbe />
          <div>app content</div>
        </>
      </AuthGate>,
    )
    expect(screen.getByText('app content')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(
      await screen.findByRole('button', { name: 'Send magic link' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('app content')).not.toBeInTheDocument()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('allowlist checks are case-insensitive', async () => {
    stubInviteList('Dan@Example.com , second@example.com')
    const user = userEvent.setup()

    render(
      <AuthGate>
        <SignedInProbe />
      </AuthGate>,
    )
    await user.type(screen.getByLabelText('Email'), 'dan@example.com')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText('app content')).toBeInTheDocument()
  })

  it('an empty allowlist allows any email (dev convenience)', async () => {
    // VITE_ALLOWED_EMAILS absent → no allowlist configured.
    const user = userEvent.setup()

    render(
      <AuthGate>
        <SignedInProbe />
      </AuthGate>,
    )
    await user.type(screen.getByLabelText('Email'), 'anyone@example.com')
    await user.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText('app content')).toBeInTheDocument()
  })

  it('stores the email trimmed and lower-cased', async () => {
    stubInviteList('dan@example.com')

    await signIn('  Dan@Example.com  ')

    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toEqual({
      email: 'dan@example.com',
    })
  })
})
