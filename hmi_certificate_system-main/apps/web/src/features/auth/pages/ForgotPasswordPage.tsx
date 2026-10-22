import { useState, type FormEvent } from 'react'
import { forgotPasswordSchema } from '@hmi/shared'
import { apiRequest } from '../../../lib/api-client'
import { AuthBackLink } from '../components/AuthBackLink'
import { AuthFeedback } from '../components/AuthFeedback'
import { AuthField } from '../components/AuthField'
import { AuthFormHeader } from '../components/AuthFormHeader'
import { AuthLayout } from '../components/AuthLayout'
import { AuthSubmitButton } from '../components/AuthSubmitButton'

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget).entries()))
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.')
      return
    }
    setFieldError('')
    setBusy(true)
    try {
      const result = await apiRequest<{ message: string }>('/forgot-password', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      })
      setMessage(result.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not request a reset link. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <AuthLayout>
    <AuthBackLink />
    <AuthFormHeader title="Forgot password?" subtitle="Enter your email address and we’ll send you a link to reset your password." />
    <form className="certify-auth-form" onSubmit={submit} noValidate>
      <AuthField id="forgot-email" label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required error={fieldError} />
      <AuthFeedback error={error} message={message} />
      <AuthSubmitButton busy={busy}>Send reset link</AuthSubmitButton>
    </form>
    {message && <p className="auth-recovery-followup">If you don’t see the message soon, check your spam folder.</p>}
  </AuthLayout>
}
