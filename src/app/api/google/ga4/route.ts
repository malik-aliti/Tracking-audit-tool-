import { NextRequest, NextResponse } from 'next/server'
import { fetchGA4Data, fetchGoogleAdsData } from '@/lib/platforms'
import { fetchGTMData } from '@/lib/gtm'

export async function POST(req: NextRequest) {
  try {
    const { accessToken, propertyId, customerId, containerId, scannedContainerIds } = await req.json()
    if (!accessToken) return NextResponse.json({ success: false, error: 'Token requis' }, { status: 401 })

    const [ga4, googleAds, gtm] = await Promise.allSettled([
      fetchGA4Data(accessToken, propertyId),
      fetchGoogleAdsData(accessToken, customerId),
      fetchGTMData(accessToken, containerId, scannedContainerIds),
    ])

    return NextResponse.json({
      success: true,
      ga4: ga4.status === 'fulfilled' ? ga4.value : null,
      googleAds: googleAds.status === 'fulfilled' ? googleAds.value : null,
      gtm: gtm.status === 'fulfilled' ? gtm.value : null,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
