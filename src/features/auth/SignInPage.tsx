import { useState } from 'react'
import type { FormEvent } from 'react'
import { NotInvitedError, useAuth } from '../../lib/auth'

/**
 * Magic-link sign-in screen.
 *
 * The mock auto-signs-in once `signIn` resolves (after the magic-link
 * beat), so the "Check your email" state is brief. The real adapter will
 * keep the user on this screen until they open the emailed link.
 */
export function SignInPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const address = email.trim()

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (address === '') {
      setError('Enter your email address')
      return
    }
    setError(null)
    setSent(true)
    try {
      await signIn(address)
    } catch (err) {
      // Not on the invite list (or the mock could not sign in): back to the
      // form with the reason, so the address can be corrected.
      setSent(false)
      setError(
        err instanceof NotInvitedError
          ? 'Not invited yet'
          : 'Something went wrong — try again.',
      )
    }
  }

  return (
    <main className="ht-auth">
      <h1 className="ht-auth__title">HomeTask</h1>
      {sent ? (
        <>
          <p className="ht-auth__sent">Check your email</p>
          <p className="ht-auth__hint">
            We sent a sign-in link to {address}. Open it on this device.
          </p>
        </>
      ) : (
        <form className="ht-auth__form" onSubmit={handleSubmit} noValidate>
          <p className="ht-auth__lede">
            Your renovation in one place. Sign in and we’ll send you a magic
            link.
          </p>
          <label className="ht-auth__label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="ht-auth__input"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {error !== null && (
            <p className="ht-auth__error" role="alert">
              {error}
            </p>
          )}
          <button className="ht-auth__submit" type="submit">
            Send magic link
          </button>
        </form>
      )}
    </main>
  )
}
