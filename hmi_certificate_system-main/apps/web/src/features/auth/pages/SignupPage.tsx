import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { registerSchema } from '@hmi/shared'
import { apiRequest } from '../../../lib/api-client'
import { AuthFeedback } from '../components/AuthFeedback'
import { AuthField } from '../components/AuthField'
import { AuthFooter } from '../components/AuthFooter'
import { AuthFormHeader } from '../components/AuthFormHeader'
import { AuthLayout } from '../components/AuthLayout'
import { AuthSubmitButton } from '../components/AuthSubmitButton'
import { PasswordGuidance } from '../components/PasswordGuidance'

export function SignupPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setError('')
    setMessage('')
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const parsed = registerSchema.safeParse({ name: data.name, email: data.email, password: data.password })
    const errors: Record<string, string> = parsed.success
      ? {}
      : Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]))
    if (data.password !== data.confirmPassword) errors.confirmPassword = 'Passwords do not match.'
    if (Object.keys(errors).length > 0 || !parsed.success) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setBusy(true)
    try {
      await apiRequest('/register', { method: 'POST', body: JSON.stringify(parsed.data) })
      setMessage('Your account was created. Check your email for a verification link before signing in.')
      form.reset()
      setPassword('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create your account. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <AuthLayout>
    <AuthFormHeader title="Create your account" subtitle="Get started managing certificates for your events." />
    <form className="certify-auth-form" onSubmit={submit} noValidate>
      <AuthField id="signup-name" label="Full name" name="name" autoComplete="name" required error={fieldErrors.name} />
      <AuthField id="signup-email" label="Email" name="email" type="email" autoComplete="email" required error={fieldErrors.email} />
      <AuthField id="signup-password" label="Password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} error={fieldErrors.password} onChange={(event) => setPassword(event.currentTarget.value)} />
      <PasswordGuidance password={password} />
      <AuthField id="signup-confirm-password" label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required error={fieldErrors.confirmPassword} />
      <AuthFeedback error={error} message={message} />
      <AuthSubmitButton busy={busy}>Create account</AuthSubmitButton>
    </form>
    <AuthFooter>Already have an account? <Link to="/login" viewTransition>Sign in</Link></AuthFooter>
  </AuthLayout>
}
