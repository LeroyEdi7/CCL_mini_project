import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPasswordSchema } from '@hmi/shared'
import { apiRequest } from '../../../lib/api-client'
import { AuthBackLink } from '../components/AuthBackLink'
import { AuthFeedback } from '../components/AuthFeedback'
import { AuthField } from '../components/AuthField'
import { AuthFormHeader } from '../components/AuthFormHeader'
import { AuthLayout } from '../components/AuthLayout'
import { AuthSubmitButton } from '../components/AuthSubmitButton'
import { PasswordGuidance } from '../components/PasswordGuidance'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const hasValidToken = token.length >= 32 && token.length <= 256
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [completed, setCompleted] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const formData = Object.fromEntries(new FormData(event.currentTarget).entries())
    const parsed = resetPasswordSchema.safeParse({ token, password: formData.password })
    const nextErrors: Record<string, string> = parsed.success
      ? {}
      : Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]))
    if (formData.password !== formData.confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.'
    if (Object.keys(nextErrors).length > 0 || !parsed.success) {
      setFieldErrors(nextErrors)
      return
    }
    setFieldErrors({})
    setBusy(true)
    try {
      await apiRequest('/reset-password', { method: 'POST', body: JSON.stringify(parsed.data) })
      setCompleted(true)
      setPassword('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reset your password. Request a new link and try again.')
    } finally {
      setBusy(false)
    }
  }

  return <AuthLayout>
    <AuthBackLink />
    <AuthFormHeader
      title={completed ? 'Password updated' : 'Reset your password'}
      subtitle={completed ? 'Your password has been changed. You can now sign in with your new password.' : 'Enter your new password below to complete the process.'}
    />
    {completed ? <Link className="auth-recovery-action" to="/login" viewTransition>Continue to sign in</Link> : !hasValidToken ? <>
      <AuthFeedback error="This reset link is missing or invalid. Request a new password reset link to continue." />
      <Link className="auth-recovery-action" to="/forgot-password" viewTransition>Request a new reset link</Link>
    </> : <form className="certify-auth-form" onSubmit={submit} noValidate>
      <AuthField id="reset-password" label="New password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} descriptionId="reset-password-guidance" error={fieldErrors.password} onChange={(event) => setPassword(event.currentTarget.value)} />
      <PasswordGuidance id="reset-password-guidance" password={password} />
      <AuthField id="reset-confirm-password" label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required error={fieldErrors.confirmPassword} />
      <AuthFeedback error={error} />
      {error && <Link className="auth-recovery-inline-link" to="/forgot-password" viewTransition>Request a new reset link</Link>}
      <AuthSubmitButton busy={busy}>Reset password</AuthSubmitButton>
    </form>}
  </AuthLayout>
}
