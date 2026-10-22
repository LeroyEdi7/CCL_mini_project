import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loginSchema } from '@hmi/shared'
import { apiRequest } from '../../../lib/api-client'
import { useAuth } from '../../../lib/use-auth'
import { AuthFeedback } from '../components/AuthFeedback'
import { AuthField } from '../components/AuthField'
import { AuthFooter } from '../components/AuthFooter'
import { AuthFormHeader } from '../components/AuthFormHeader'
import { AuthLayout } from '../components/AuthLayout'
import { AuthSubmitButton } from '../components/AuthSubmitButton'

export function LoginPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const parsed = loginSchema.safeParse(data)
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
      return
    }
    setFieldErrors({})
    setBusy(true)
    try {
      await apiRequest('/login', { method: 'POST', body: JSON.stringify(parsed.data) })
      await refresh()
      navigate('/admin/dashboard')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <AuthLayout>
    <AuthFormHeader title="Welcome back" subtitle="Sign in to your account to continue." />
    <form className="certify-auth-form" onSubmit={submit} noValidate>
      <AuthField id="login-email" label="Email" name="email" type="email" autoComplete="email" required error={fieldErrors.email} />
      <AuthField id="login-password" label="Password" name="password" type="password" autoComplete="current-password" required error={fieldErrors.password} />
      <div className="auth-form-topline"><Link to="/forgot-password" viewTransition>Forgot password?</Link></div>
      <AuthFeedback error={error} />
      <AuthSubmitButton busy={busy}>Sign in</AuthSubmitButton>
    </form>
    <AuthFooter>Don’t have an account? <Link to="/register" viewTransition>Create account</Link></AuthFooter>
  </AuthLayout>
}
