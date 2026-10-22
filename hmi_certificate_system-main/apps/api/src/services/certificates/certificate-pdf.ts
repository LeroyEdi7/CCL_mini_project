import { createElement } from 'react'
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'

export type CertificatePdfInput = {
  certificateNumber: string
  participantName: string
  eventName: string
  title: string
  description: string | null
  issuerName: string
  issuedAt: Date
  verificationUrl: string
}

const styles = StyleSheet.create({
  page: { padding: 34, backgroundColor: '#f5f2e9' },
  frame: { flex: 1, border: '3 solid #183c3a', padding: 28, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  eyebrow: { fontSize: 11, letterSpacing: 3, color: '#53736d', marginBottom: 18 },
  title: { fontSize: 32, color: '#183c3a', fontFamily: 'Times-Bold', textAlign: 'center', marginBottom: 16 },
  copy: { fontSize: 13, color: '#435451', textAlign: 'center', marginBottom: 12 },
  recipient: { fontSize: 27, color: '#a57934', fontFamily: 'Times-Bold', textAlign: 'center', marginBottom: 12 },
  event: { fontSize: 18, color: '#183c3a', textAlign: 'center', marginBottom: 10 },
  description: { maxWidth: 480, fontSize: 11, color: '#53615f', textAlign: 'center', marginBottom: 26 },
  footer: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 20 },
  signature: { borderTop: '1 solid #8b9b94', minWidth: 180, paddingTop: 7 },
  signatureName: { fontSize: 11, color: '#183c3a' },
  signatureLabel: { fontSize: 8, color: '#788781', marginTop: 3 },
  qr: { width: 66, height: 66 },
  number: { position: 'absolute', bottom: 14, right: 18, fontSize: 8, color: '#788781' },
})

export async function renderCertificatePdf(input: CertificatePdfInput): Promise<Buffer> {
  const qr = await QRCode.toDataURL(input.verificationUrl, { errorCorrectionLevel: 'M', margin: 1, width: 220 })
  const document = createElement(Document, null,
    createElement(Page, { size: 'A4', orientation: 'landscape', style: styles.page },
      createElement(View, { style: styles.frame },
        createElement(Text, { style: styles.eyebrow }, 'HMI CERTIFICATE OF ACHIEVEMENT'),
        createElement(Text, { style: styles.title }, input.title),
        createElement(Text, { style: styles.copy }, 'This certificate is proudly presented to'),
        createElement(Text, { style: styles.recipient }, input.participantName),
        createElement(Text, { style: styles.copy }, 'for successful participation in'),
        createElement(Text, { style: styles.event }, input.eventName),
        input.description ? createElement(Text, { style: styles.description }, input.description) : null,
        createElement(View, { style: styles.footer },
          createElement(View, { style: styles.signature },
            createElement(Text, { style: styles.signatureName }, input.issuerName),
            createElement(Text, { style: styles.signatureLabel }, `Issued ${input.issuedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}`),
          ),
          createElement(Image, { style: styles.qr, src: qr }),
        ),
        createElement(Text, { style: styles.number }, `Certificate ${input.certificateNumber}`),
      ),
    ),
  )
  return Buffer.from(await renderToBuffer(document))
}
