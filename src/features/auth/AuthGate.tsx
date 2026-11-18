import type { ReactNode } from 'react'
import { useAuth } from '../../lib/auth'
import { SignInPage } from './SignInPage'

/** Minimal splash: the app name on the warm ground while the session loads. */
function Splash(): ReactNode {
  return (
    <div className="ht-splash" role="status">
      <p className="ht-splash__name">HomeTask</p>
    </div>
  )
}

/**
 * Gate the app behind a session: the app itself only renders for a
 * signed-in user. `loading` shows the splash, `signed_out` the sign-in
 * page, `signed_in` the app.
 */
export function AuthGate({ children }: { children: ReactNode }): ReactNode {
  const { status } = useAuth()

  if (status === 'loading') return <Splash />
  if (status === 'signed_out') return <SignInPage />
  return <>{children}</>
}
