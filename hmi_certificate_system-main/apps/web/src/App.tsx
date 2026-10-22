import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { apiRequest } from './lib/api-client'
import { useAuth } from './lib/use-auth'
import './App.css'
import { EventDetailsPage, EventFormPage, EventListPage } from './features/events/events'
import { LoginPage } from './features/auth/pages/LoginPage'
import { SignupPage } from './features/auth/pages/SignupPage'
import { ForgotPasswordPage } from './features/auth/pages/ForgotPasswordPage'
import { ResetPasswordPage } from './features/auth/pages/ResetPasswordPage'
import { NotFoundPage } from './features/errors/pages/NotFoundPage'
import { MyCertificatesPage, PublicCertificateVerificationPage } from './features/certificates/certificates'
import { AdminWorkspace } from './features/admin/AdminWorkspace'

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="auth-shell"><p>Restoring your session…</p></main>
  return user ? children : <Navigate to="/login" replace />
}

function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">HMI CERTIFICATES</p><h1>{title}</h1>{children}{footer && <div className="auth-footer">{footer}</div>}</section></main>
}

function VerifyPage() {
  const [query] = useSearchParams()
  const token = query.get('token')
  const [message, setMessage] = useState(token ? 'Verifying your email…' : 'Verification link is missing its token.')
  const [error, setError] = useState(!token)
  const started = useRef(false)
  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    void apiRequest<{ message: string }>('/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then((result) => setMessage(result.message)).catch((cause: unknown) => { setMessage(cause instanceof Error ? cause.message : 'Verification failed.'); setError(true) })
  }, [token])
  return <AuthLayout title="Email verification"><p className={error ? 'notice error' : 'notice'}>{message}</p><Link to="/login">Continue to sign in</Link></AuthLayout>
}

function AccountPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function signOut() {
    setBusy(true); setError('')
    try { await logout(); navigate('/login') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not sign out. Please try again.') }
    finally { setBusy(false) }
  }
  return <AuthLayout title="Your account"><p>Signed in as <strong>{user?.name}</strong></p><p>{user?.email}</p><p><Link to="/admin/dashboard">Open admin workspace</Link></p><p><Link to="/events">Manage events</Link></p><p><Link to="/certificates">My certificates</Link></p>{error && <p className="notice error" role="alert">{error}</p>}<button disabled={busy} onClick={signOut}>{busy ? 'Signing out…' : 'Sign out'}</button></AuthLayout>
}

function AppRoutes() {
  const { user } = useAuth()
  return <Routes>
    <Route path="/" element={<Navigate to={user ? '/admin/dashboard' : '/login'} replace />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<SignupPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/verify-email" element={<VerifyPage />} />
    <Route path="/verify/:token" element={<PublicCertificateVerificationPage />} />
    <Route path="/account" element={<Protected><AccountPage /></Protected>} />
    <Route path="/admin/*" element={<Protected><AdminWorkspace /></Protected>} />
    <Route path="/certificates" element={<Protected><MyCertificatesPage /></Protected>} />
    <Route path="/events" element={<Protected><EventListPage /></Protected>} />
    <Route path="/events/new" element={<Protected><EventFormPage mode="create" /></Protected>} />
    <Route path="/events/:eventId" element={<Protected><EventDetailsPage /></Protected>} />
    <Route path="/events/:eventId/edit" element={<Protected><EventFormPage mode="edit" /></Protected>} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
}

export default function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>
}
