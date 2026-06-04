import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TrackAudit — Diagnostic de tracking',
  description: 'Audit complet : RGPD, Consent Mode v2, GA4, Google Ads, Meta Pixel.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
