export function AuthFeedback({ error, message }: { error?: string; message?: string }) {
  if (error) return <p className="auth-feedback auth-feedback-error" role="alert">{error}</p>
  if (message) return <p className="auth-feedback auth-feedback-success" role="status">{message}</p>
  return null
}
