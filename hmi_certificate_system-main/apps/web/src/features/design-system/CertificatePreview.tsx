import { StatusPill, type CertificateStatus } from './StatusPill'

export type CertificateSignatory = { name: string; title: string }
export type CertificatePreviewProps = {
  title: string
  name: string
  organization: string
  signatories: CertificateSignatory[]
  status?: CertificateStatus
  certificateNumber?: string
  issuedAt?: string
}

export function CertificatePreview({ title, name, organization, signatories, status, certificateNumber, issuedAt }: CertificatePreviewProps) {
  return <article className="certificate-artboard" aria-label={`Certificate preview: ${title} for ${name}`}>
    {status && <div className="certificate-artboard-status"><StatusPill status={status} /></div>}
    <div className="certificate-paper">
      <div className="certificate-paper-inner">
        <span className="certificate-laurel" aria-hidden="true">✺</span>
        <p className="certificate-organization">{organization}</p>
        <h2>{title}</h2>
        <p className="certificate-presented">This certificate is presented to</p>
        <p className="certificate-recipient">{name}</p>
        <p className="certificate-description">In recognition of participation and achievement.</p>
        {issuedAt && <p className="certificate-issued-date">Issued {issuedAt}</p>}
        <div className="certificate-signatories">
          {signatories.slice(0, 2).map((signatory, index) => <div className="certificate-signatory" key={`${signatory.name}-${index}`}>
            <span className="certificate-signature-line" />
            <strong>{signatory.name}</strong><span>{signatory.title}</span>
          </div>)}
        </div>
        {certificateNumber && <p className="certificate-number">Certificate ID · {certificateNumber}</p>}
      </div>
    </div>
  </article>
}
