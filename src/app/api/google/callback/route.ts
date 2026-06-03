import { NextRequest, NextResponse } from 'next/server'
import { exchangeGoogleCode, fetchGA4Data } from '@/lib/platforms'
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state') || ''
  if (!code) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?error=google_auth_failed`)
  try {
    const tokens = await exchangeGoogleCode(code)
    const ga4Data = await fetchGA4Data(tokens.access_token || '')
    const payload = encodeURIComponent(JSON.stringify({
      platform: 'google', accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
      ga4PropertyId: ga4Data?.propertyId, ga4PropertyName: ga4Data?.propertyName, ga4MeasurementId: ga4Data?.measurementId,
    }))
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?google_connected=1&payload=${payload}&state=${state}`)
  } catch (err) {
    console.error('Google callback error:', err)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?error=google_callback_failed`)
  }
}
