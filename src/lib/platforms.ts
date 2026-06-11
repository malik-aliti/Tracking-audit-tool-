import { google } from 'googleapis'
import type { GA4Data, GoogleAdsData, MetaData } from '@/types'

export function getGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/google/callback`
  )
}

export function getGoogleAuthUrl(state: string): string {
  const oauth2Client = getGoogleOAuthClient()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/tagmanager.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
    prompt: 'consent',
  })
}

export async function exchangeGoogleCode(code: string) {
  const oauth2Client = getGoogleOAuthClient()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

export async function fetchGA4Data(accessToken: string, propertyId?: string): Promise<GA4Data | null> {
  try {
    const oauth2Client = getGoogleOAuthClient()
    oauth2Client.setCredentials({ access_token: accessToken })
    const analyticsAdmin = google.analyticsadmin({ version: 'v1beta', auth: oauth2Client })
    const analyticsData = google.analyticsdata({ version: 'v1beta', auth: oauth2Client })
    let pid = propertyId
    let propertyName = ''
    if (!pid) {
      const propsRes = await analyticsAdmin.properties.list({ filter: 'parent:accounts/-' })
      const props = propsRes.data.properties || []
      if (!props.length) return null
      pid = props[0].name?.replace('properties/', '') || ''
      propertyName = props[0].displayName || ''
    }
    const streamsRes = await analyticsAdmin.properties.dataStreams.list({ parent: `properties/${pid}` })
    const streams = (streamsRes.data.dataStreams || []).map(s => ({
      id: s.name?.split('/').pop() || '', name: s.displayName || '',
      measurementId: s.webStreamData?.measurementId || '',
      webStreamData: s.webStreamData ? { defaultUri: s.webStreamData.defaultUri || '' } : undefined,
    }))
    const convRes = await analyticsAdmin.properties.conversionEvents.list({ parent: `properties/${pid}` })
    const conversionEvents = (convRes.data.conversionEvents || []).map(e => ({
      name: e.eventName || '', isActive: e.deletable !== false, countingMethod: e.countingMethod || 'ONCE_PER_EVENT',
    }))
    let recentEvents: { name: string; count: number; timestamp: string }[] = []
    try {
      const runRes = await analyticsData.properties.runReport({
        property: `properties/${pid}`,
        requestBody: {
          dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: '20',
        },
      })
      recentEvents = (runRes.data.rows || []).map(r => ({
        name: r.dimensionValues?.[0]?.value || '', count: parseInt(r.metricValues?.[0]?.value || '0'), timestamp: new Date().toISOString(),
      }))
    } catch {}
    const enhancedMeasurement: GA4Data['enhancedMeasurement'] = {
      streamEnabled: true, scrollsEnabled: true, outboundClicksEnabled: true,
      siteSearchEnabled: false, videoEngagementEnabled: false, fileDownloadsEnabled: true,
      pageChangesEnabled: false, formInteractionsEnabled: false,
    }
    try {
      const emRes = await analyticsAdmin.properties.dataStreams.getEnhancedMeasurementSettings({
        name: `properties/${pid}/dataStreams/${streams[0]?.id}/enhancedMeasurementSettings`,
      })
      const em = emRes.data
      Object.assign(enhancedMeasurement, {
        streamEnabled: em.streamEnabled || false, scrollsEnabled: em.scrollsEnabled || false,
        outboundClicksEnabled: em.outboundClicksEnabled || false,
      })
    } catch {}
    return {
      propertyId: pid, propertyName: propertyName || `Property ${pid}`,
      measurementId: streams[0]?.measurementId || '', conversionEvents,
      keyEvents: conversionEvents.map(e => e.name), dataStreams: streams,
      recentEvents, enhancedMeasurement,
    }
  } catch (err) { console.error('GA4 fetch error:', err); return null }
}

export async function fetchGoogleAdsData(accessToken: string, customerId?: string): Promise<GoogleAdsData | null> {
  try {
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    if (!devToken) return null
    const listRes = await fetch('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
      headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': devToken },
    })
    if (!listRes.ok) return null
    const listData = await listRes.json()
    const customers: string[] = listData.resourceNames || []
    if (!customers.length) return null
    const cid = customerId || customers[0].replace('customers/', '')
    const queryRes = await fetch(`https://googleads.googleapis.com/v17/customers/${cid}/googleAds:searchStream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': devToken, 'Content-Type': 'application/json', 'login-customer-id': cid },
      body: JSON.stringify({ query: `SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type, customer.auto_tagging_enabled, customer.descriptive_name, customer.enhanced_conversions_settings.enhanced_conversions_for_leads_enabled FROM conversion_action WHERE conversion_action.status = 'ENABLED' LIMIT 20` }),
    })
    let conversionActions: GoogleAdsData['conversionActions'] = []
    let autoTaggingEnabled = false, enhancedConversionsEnabled = false, customerName = `Customer ${cid}`
    if (queryRes.ok) {
      const queryData = await queryRes.json()
      const results = queryData.flatMap((batch: any) => batch.results || [])
      if (results.length > 0) {
        customerName = results[0]?.customer?.descriptiveName || customerName
        autoTaggingEnabled = results[0]?.customer?.autoTaggingEnabled || false
        enhancedConversionsEnabled = results[0]?.customer?.enhancedConversionsSettings?.enhancedConversionsForLeadsEnabled || false
      }
      conversionActions = results.map((r: any) => ({ id: String(r.conversionAction?.id || ''), name: r.conversionAction?.name || '', status: r.conversionAction?.status || '', type: r.conversionAction?.type || '', enhancedConversionsEnabled }))
    }
    return { customerId: cid, customerName, conversionActions, enhancedConversionsEnabled, autoTaggingEnabled }
  } catch (err) { console.error('Google Ads error:', err); return null }
}

export function getMetaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID || '',
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/meta/callback`,
    scope: 'ads_read,business_management,pages_read_engagement',
    response_type: 'code', state,
  })
  return `https://www.facebook.com/v20.0/dialog/oauth?${params}`
}

export async function exchangeMetaCode(code: string): Promise<{ access_token: string } | null> {
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?` + new URLSearchParams({
      client_id: process.env.META_APP_ID || '', client_secret: process.env.META_APP_SECRET || '',
      redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/meta/callback`, code,
    }))
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function fetchMetaData(accessToken: string, pixelId?: string): Promise<MetaData | null> {
  try {
    const bizRes = await fetch(`https://graph.facebook.com/v20.0/me/businesses?fields=id,name,owned_pixels{id,name,advanced_matching_fields}&access_token=${accessToken}`)
    if (!bizRes.ok) return null
    const bizData = await bizRes.json()
    const pixels: any[] = []
    ;(bizData.data || []).forEach((biz: any) => { if (biz.owned_pixels?.data) pixels.push(...biz.owned_pixels.data) })
    if (!pixels.length) return null
    const pixel = pixelId ? pixels.find(p => p.id === pixelId) || pixels[0] : pixels[0]

    // Check CAPI: server_access_token presence = CAPI configured
    let capiConnected = false
    let serverEventsCount: number | undefined
    let deduplicationEnabled: boolean | undefined
    try {
      const pixelRes = await fetch(`https://graph.facebook.com/v20.0/${pixel.id}?fields=id,server_access_token&access_token=${accessToken}`)
      if (pixelRes.ok) {
        const pixelDetail = await pixelRes.json()
        capiConnected = !!(pixelDetail.server_access_token)
      }
    } catch {}

    // Event stats (7 days)
    const eventsRes = await fetch(`https://graph.facebook.com/v20.0/${pixel.id}/stats?aggregation=event&start_time=${Math.floor(Date.now()/1000)-7*24*3600}&end_time=${Math.floor(Date.now()/1000)}&access_token=${accessToken}`)
    const eventsData = eventsRes.ok ? await eventsRes.json() : { data: [] }
    const eventStats = (eventsData.data || []).map((e: any) => ({ name: e.event || '', count: e.count || 0, matchRate: e.match_rate_approx }))

    // Match rate from event stats (average across events with match rate data)
    const statsWithRate = eventStats.filter((e: any) => e.matchRate !== undefined && e.matchRate !== null)
    const matchRate = statsWithRate.length > 0
      ? Math.round(statsWithRate.reduce((sum: number, e: any) => sum + e.matchRate, 0) / statsWithRate.length)
      : undefined

    // Check deduplication: look for event_id in recent Meta pixel requests (browser side)
    // This is set in analyzer via network request inspection

    return {
      pixelId: pixel.id, pixelName: pixel.name || `Pixel ${pixel.id}`,
      advancedMatchingEnabled: !!(pixel.advanced_matching_fields?.length > 0),
      capiConnected, matchRate, eventStats,
      recentEvents: eventStats.map((e: any) => e.name), qualityScore: undefined,
      serverEventsCount, deduplicationEnabled,
    }
  } catch (err) { console.error('Meta error:', err); return null }
}
