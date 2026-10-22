import { CircleAlert, CircleCheck, CircleDot, Clock3, XCircle } from 'lucide-react'

export type CertificateStatus = 'valid' | 'issued' | 'live' | 'completed' | 'upcoming' | 'draft' | 'pending' | 'failed' | 'revoked'

const statusLabels: Record<CertificateStatus, string> = {
  valid: 'Valid', issued: 'Issued', live: 'Live', completed: 'Completed', upcoming: 'Upcoming',
  draft: 'Draft', pending: 'Pending', failed: 'Failed', revoked: 'Revoked',
}

export function StatusPill({ status }: { status: CertificateStatus }) {
  const icon = status === 'valid' || status === 'issued' ? <CircleCheck aria-hidden="true" />
    : status === 'live' ? <CircleDot aria-hidden="true" />
      : status === 'pending' || status === 'upcoming' ? <Clock3 aria-hidden="true" />
        : status === 'failed' ? <CircleAlert aria-hidden="true" />
          : status === 'revoked' ? <XCircle aria-hidden="true" /> : null

  return <span className={`status-pill status-pill--${status}`}>
    {icon}{statusLabels[status]}
  </span>
}
