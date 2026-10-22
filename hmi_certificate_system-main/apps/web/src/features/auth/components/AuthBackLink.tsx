import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function AuthBackLink() {
  return <Link className="auth-back-link" to="/login" viewTransition><ArrowLeft aria-hidden="true" />Back to sign in</Link>
}
