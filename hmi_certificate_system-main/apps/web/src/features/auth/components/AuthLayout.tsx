import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import '../styles/auth.css'

export function AuthLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <main className="auth-page">
      <section className="auth-frame" aria-label="Certify account access">
        <aside className="auth-brand-panel">
          <div className="auth-brand-copy">
            <Link className="auth-wordmark" to="/" aria-label="Certify home">Certify</Link>
            <h1>Create. Issue. Verify.</h1>
            <p>A simple and secure way to manage digital certificates for your events.</p>
          </div>
          <div className="certificate-art" aria-hidden="true">
            <div className="certificate-sheet">
              <span className="certificate-ornament">❧ &nbsp; ❧</span>
              <span className="certificate-title">Certificate of<br />achievement</span>
              <span className="certificate-rule" />
              <span className="certificate-caption">In recognition of excellence</span>
            </div>
          </div>
          <span className="brand-shape brand-shape-one" />
          <span className="brand-shape brand-shape-two" />
        </aside>
        <section className="auth-form-panel">
          <div className="auth-form-content" key={location.pathname}>{children}</div>
        </section>
      </section>
    </main>
  )
}
