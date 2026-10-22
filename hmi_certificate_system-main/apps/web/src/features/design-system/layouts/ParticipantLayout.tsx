import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../../lib/use-auth'

export function ParticipantLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  return <div className="participant-layout">
    <header className="participant-topbar">
      <Link className="certify-wordmark" to="/">Certify</Link>
      <nav aria-label="Participant navigation">
        <NavLink to="/certificates">My Certificates</NavLink>
        <NavLink to="/verify">Verify a certificate</NavLink>
      </nav>
      <details className="participant-account-menu">
        <summary aria-label="Open account menu"><span className="account-avatar">{user?.name?.slice(0, 1) ?? 'P'}</span><span>{user?.name ?? 'Participant'}</span></summary>
        <div className="participant-account-popover"><Link to="/account">Account</Link><button type="button" onClick={() => void logout()}>Sign out</button></div>
      </details>
    </header>
    <div className="participant-content">{children}</div>
    <footer className="participant-footer"><Link className="certify-wordmark" to="/">Certify</Link><span>Create. Issue. Verify.</span></footer>
  </div>
}
