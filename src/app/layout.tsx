import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TrackAudit — Diagnostic de tracking',
  description: 'Audit complet : RGPD, Consent Mode v2, GA4, GTM, Google Ads, Meta.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, padding: 0, background: '#f8f9fa' }}>{children}</body>
    </html>
  )
}
