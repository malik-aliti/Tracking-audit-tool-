import { NextRequest, NextResponse } from 'next/server'
import { fetchGA4Data, fetchGoogleAdsData } from '@/lib/platforms'
export async function POST(req: NextRequest) {
  try {
    const { accessToken, propertyId, customerId } = await req.json()
    if (!accessToken) return NextResponse.json({ success: false, error: 'Token requis' }, { status: 401 })
    const [ga4, googleAds] = await Promise.allSettled([fetchGA4Data(accessToken, propertyId), fetchGoogleAdsData(accessToken, customerId)])
    return NextResponse.json({ success: true, ga4: ga4.status === 'fulfilled' ? ga4.value : null, googleAds: googleAds.status === 'fulfilled' ? googleAds.value : null })
  } catch (err: any) { return NextResponse.json({ success: false, error: err.message }, { status: 500 }) }
}
