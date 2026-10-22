import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/button'
import { NotFoundIllustration } from '../components/NotFoundIllustration'
import '../styles/not-found.css'

export function NotFoundPage() {
  const navigate = useNavigate()

  function goBack() {
    const historyIndex = (window.history.state as { idx?: unknown } | null)?.idx
    if (typeof historyIndex === 'number' && historyIndex > 0) navigate(-1)
    else navigate('/account')
  }

  return <main className="not-found-page">
    <section className="not-found-content" aria-labelledby="not-found-heading">
      <Link className="not-found-wordmark" to="/" aria-label="Certify home">Certify</Link>
      <NotFoundIllustration />
      <p className="not-found-code">404</p>
      <h1 id="not-found-heading">Page not found</h1>
      <p className="not-found-description">The page you’re looking for doesn’t exist or may have been moved.</p>
      <div className="not-found-actions">
        <Button className="not-found-button" size="lg" type="button" onClick={() => navigate('/account')}>Back to dashboard</Button>
        <Button className="not-found-button" variant="outline" size="lg" type="button" onClick={goBack}>Go back</Button>
      </div>
    </section>
  </main>
}
