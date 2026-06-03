import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TrackAudit — Diagnostic de tracking complet',
  description: 'Auditez votre tracking digital : RGPD, Consent Mode v2, GA4, Google Ads Enhanced Conversions, Meta Advanced Matching, CAPI.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
