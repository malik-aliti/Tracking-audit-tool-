import { NextRequest, NextResponse } from 'next/server'
import { fetchGA4Data, fetchGoogleAdsData } from '@/lib/platforms'
import { fetchGTMData } from '@/lib/gtm'

export async function POST(req: NextRequest) {
  try {
    const { accessToken, propertyId, customerId, containerId, scannedGtmIds } = await req.json()
    if (!accessToken) return NextResponse.json({ success: false, error: 'Token requis' }, { status: 401 })

    // 1. Fetch GTM FIRST to extract IDs from container tags
    const gtm = await fetchGTMData(accessToken, containerId, scannedGtmIds)

    // 2. Extract Measurement ID from GTM Web GA4 config tag → use it to find the right GA4 property
    const gtmMeasurementId = gtm?.checks?.ga4MeasurementId
    const resolvedPropertyId = propertyId || undefined // user-provided takes priority
    const ga4Hint = gtmMeasurementId || undefined // fallback: use GTM's GA4 config tag

    // 3. Extract Google Ads conversion IDs from GTM if available
    const gtmGoogleAdsId = gtm?.checks?.googleAdsConversionTags?.[0]

    // 4. Fetch GA4 + Google Ads in parallel, using GTM-derived IDs
    const [ga4, googleAds] = await Promise.allSettled([
      fetchGA4Data(accessToken, resolvedPropertyId, ga4Hint),
      fetchGoogleAdsData(accessToken, customerId),
    ])

    return NextResponse.json({
      success: true,
      ga4: ga4.status === 'fulfilled' ? ga4.value : null,
      googleAds: googleAds.status === 'fulfilled' ? googleAds.value : null,
      gtm,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
