import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { apiDownload, apiFetch } from '../../lib/api-client'

type Certificate = {
  id: string
  certificateNumber: string
  eventId: string
  eventName: string
  title: string
  description: string | null
  status: 'draft' | 'issued' | 'revoked'
  issuedAt: string | null
  revokedAt: string | null
  createdAt: string
}
type CertificateList = { certificates: Certificate[]; total: number; page: number; pageSize: number }
type Verification =
  | { result: 'not_found'; valid: false }
  | { result: 'valid' | 'revoked'; valid: boolean; certificate: { certificateNumber: string; title: string; participantName: string; eventName: string; issuedAt: string | null; revokedAt: string | null } }

const friendlyError = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString() : '—'

export function MyCertificatesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [previewId, setPreviewId] = useState('')
  const params = new URLSearchParams({ page: String(page), pageSize: '50' })
  if (search.trim()) params.set('search', search.trim())
  if (status) params.set('status', status)
  const certificates = useQuery({
    queryKey: ['my-certificates', search, status, page],
    queryFn: () => apiFetch<CertificateList>(`/me/certificates?${params.toString()}`),
  })
  const download = useMutation({
    mutationFn: (certificate: Certificate) => apiDownload(`/certificates/${certificate.id}/pdf`).then((blob) => ({ blob, certificate })),
    onSuccess: ({ blob, certificate }) => saveBlob(blob, `${certificate.certificateNumber}.pdf`),
  })
  const [previewUrl, setPreviewUrl] = useState('')
  const preview = useMutation({
    mutationFn: (certificateId: string) => apiDownload(`/certificates/${certificateId}/pdf?disposition=inline`),
    onSuccess: (blob) => setPreviewUrl(URL.createObjectURL(blob)),
  })
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [previewUrl])
  return <main className="auth-shell"><section className="auth-card event-card certificate-page">
    <p className="eyebrow">HMI CERTIFICATES</p><h1>My certificates</h1>
    <div className="certificate-toolbar">
      <label className="field">Search certificates<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Certificate number, event, title" /></label>
      <label className="field">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option><option value="issued">Issued</option><option value="revoked">Revoked</option><option value="draft">Draft</option></select></label>
    </div>
    {certificates.isLoading ? <p role="status">Loading certificates…</p> : certificates.error ? <p className="notice error" role="alert">{friendlyError(certificates.error)}</p> : certificates.data?.certificates.length ? <>
      <p className="notice">{certificates.data.total} certificate{certificates.data.total === 1 ? '' : 's'} found.</p>
      <ul className="certificate-list">{certificates.data.certificates.map((certificate) => <li key={certificate.id}>
        <div><strong>{certificate.title}</strong><span>{certificate.eventName} · {certificate.certificateNumber}</span><span>Issued {formatDate(certificate.issuedAt)} · <StatusLabel status={certificate.status} /></span></div>
        <div className="certificate-actions">
          {certificate.status !== 'draft' && <><button className="button-secondary" type="button" onClick={() => { setPreviewId(certificate.id); setPreviewUrl(''); preview.mutate(certificate.id) }}>Preview</button><button className="button-secondary" type="button" disabled={download.isPending} onClick={() => download.mutate(certificate)}>{download.isPending ? 'Preparing…' : 'Download PDF'}</button></>}
          <Link to={`/events/${certificate.eventId}`}>Event</Link>
        </div>
      </li>)}</ul>
      {download.error && <p className="notice error" role="alert">{friendlyError(download.error)}</p>}
      <Pagination page={page} pageSize={50} total={certificates.data.total} onPage={setPage} />
    </> : <p className="empty-state">No certificates match these filters.</p>}
    <p className="certificate-back"><Link to="/account">Back to account</Link></p>
    {previewId && <section className="pdf-preview" aria-label="Certificate PDF preview">
      <div className="pdf-preview-heading"><h2>Certificate preview</h2><button className="button-secondary" type="button" onClick={() => { setPreviewId(''); setPreviewUrl(''); preview.reset() }}>Close preview</button></div>
      {preview.isPending ? <p role="status">Loading PDF…</p> : preview.error ? <p className="notice error" role="alert">{friendlyError(preview.error)}</p> : previewUrl && <iframe title="Certificate PDF" src={previewUrl} />}
    </section>}
  </section></main>
}

export function PublicCertificateVerificationPage() {
  const { token = '' } = useParams()
  const verification = useQuery({ queryKey: ['public-certificate-verification', token], queryFn: () => apiFetch<Verification>(`/verify/${encodeURIComponent(token)}`), enabled: Boolean(token), retry: false })
  return <main className="auth-shell"><section className="auth-card event-card verification-card">
    <p className="eyebrow">HMI CERTIFICATES</p><h1>Certificate verification</h1>
    {verification.isLoading ? <p role="status">Checking the current certificate record…</p>
      : verification.error ? <p className="notice error" role="alert">{friendlyError(verification.error)}</p>
        : verification.data?.result === 'not_found' ? <div className="verification-status is-invalid"><strong>Certificate not found</strong><p>This verification code does not match an issued certificate.</p></div>
          : verification.data && <>
            <div className={`verification-status ${verification.data.valid ? 'is-valid' : 'is-invalid'}`}><strong>{verification.data.valid ? 'Valid certificate' : 'Revoked certificate'}</strong><p>{verification.data.valid ? 'The current certificate record is valid.' : 'The current certificate record has been revoked.'}</p></div>
            <dl className="event-details verification-details"><dt>Certificate</dt><dd>{verification.data.certificate.certificateNumber}</dd><dt>Recipient</dt><dd>{verification.data.certificate.participantName}</dd><dt>Event</dt><dd>{verification.data.certificate.eventName}</dd><dt>Title</dt><dd>{verification.data.certificate.title}</dd><dt>Issued</dt><dd>{formatDate(verification.data.certificate.issuedAt)}</dd>{verification.data.certificate.revokedAt && <><dt>Revoked</dt><dd>{formatDate(verification.data.certificate.revokedAt)}</dd></>}</dl>
          </>}
    <p className="certificate-back"><Link to="/">Return to HMI Certificates</Link></p>
  </section></main>
}

function StatusLabel({ status }: { status: Certificate['status'] }) {
  return <span className={`status-label status-${status}`}>{status}</span>
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages < 2) return null
  return <nav className="pagination" aria-label="Certificate pages"><button className="button-secondary" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="button-secondary" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></nav>
}
