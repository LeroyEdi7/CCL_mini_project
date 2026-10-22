import { FileQuestion } from 'lucide-react'

export function NotFoundIllustration() {
  return <div className="not-found-illustration" aria-hidden="true">
    <FileQuestion className="not-found-document-icon" />
    <span className="not-found-document-caption">DOCUMENT NOT FOUND</span>
  </div>
}
