import { google } from 'googleapis'
import type { GA4Data, GoogleAdsData, MetaData, LinkedInData } from '@/types'

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

export function getLinkedInAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID || '',
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/linkedin/callback`,
    state,
    scope: 'r_ads r_ads_reporting r_organization_social openid profile email',
  })
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`
}

export async function exchangeLinkedInCode(code: string): Promise<{ access_token: string } | null> {
  try {
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/linkedin/callback`,
        client_id: process.env.LINKEDIN_CLIENT_ID || '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
      }),
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function fetchLinkedInData(accessToken: string, accountId?: string): Promise<LinkedInData | null> {
  try {
    const headers = { Authorization: `Bearer ${accessToken}`, 'LinkedIn-Version': '202401' }

    // Fetch ad accounts
    const accountsRes = await fetch(
      'https://api.linkedin.com/v2/adAccountsV2?q=search&search.type.values[0]=BUSINESS&search.status.values[0]=ACTIVE&count=10',
      { headers }
    )
    if (!accountsRes.ok) return null
    const accountsData = await accountsRes.json()
    const accounts: any[] = accountsData.elements || []
    if (!accounts.length) return null

    const account = accountId
      ? accounts.find(a => String(a.id) === accountId) || accounts[0]
      : accounts[0]
    const aid = String(account.id)
    const accountUrn = `urn:li:sponsoredAccount:${aid}`

    // Fetch campaigns for this account
    const campaignsRes = await fetch(
      `https://api.linkedin.com/v2/adCampaignsV2?q=search&search.account.values[0]=${encodeURIComponent(accountUrn)}&count=20`,
      { headers }
    )
    let campaigns: LinkedInData['campaigns'] = []
    if (campaignsRes.ok) {
      const campaignsData = await campaignsRes.json()
      campaigns = (campaignsData.elements || []).map((c: any) => ({
        id: String(c.id),
        name: c.name || `Campaign ${c.id}`,
        status: c.status || 'UNKNOWN',
        type: c.type || 'UNKNOWN',
        objectiveType: c.objectiveType || 'UNKNOWN',
      }))
    }

    // Fetch analytics for last 30 days
    const end = new Date()
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    const analyticsRes = await fetch(
      `https://api.linkedin.com/v2/adAnalyticsV2?q=analytics&pivot=ACCOUNT&dateRange.start.day=${start.getDate()}&dateRange.start.month=${start.getMonth() + 1}&dateRange.start.year=${start.getFullYear()}&dateRange.end.day=${end.getDate()}&dateRange.end.month=${end.getMonth() + 1}&dateRange.end.year=${end.getFullYear()}&timeGranularity=ALL&accounts[0]=${encodeURIComponent(accountUrn)}&fields=costInLocalCurrency,impressions,clicks,externalWebsiteConversions`,
      { headers }
    )
    let totalSpend: number | undefined
    let totalImpressions: number | undefined
    let totalClicks: number | undefined
    if (analyticsRes.ok) {
      const analyticsData = await analyticsRes.json()
      const el = analyticsData.elements?.[0]
      if (el) {
        totalSpend = el.costInLocalCurrency ? parseFloat(el.costInLocalCurrency) : undefined
        totalImpressions = el.impressions
        totalClicks = el.clicks
      }
    }

    return {
      accountId: aid,
      accountName: account.name || `Account ${aid}`,
      currency: account.currency || 'EUR',
      status: account.status || 'ACTIVE',
      campaigns,
      totalSpend,
      totalImpressions,
      totalClicks,
    }
  } catch (err) { console.error('LinkedIn error:', err); return null }
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
    const eventsRes = await fetch(`https://graph.facebook.com/v20.0/${pixel.id}/stats?aggregation=event&start_time=${Math.floor(Date.now()/1000)-7*24*3600}&end_time=${Math.floor(Date.now()/1000)}&access_token=${accessToken}`)
    const eventsData = eventsRes.ok ? await eventsRes.json() : { data: [] }
    const eventStats = (eventsData.data || []).map((e: any) => ({ name: e.event || '', count: e.count || 0, matchRate: e.match_rate_approx }))
    return {
      pixelId: pixel.id, pixelName: pixel.name || `Pixel ${pixel.id}`,
      advancedMatchingEnabled: !!(pixel.advanced_matching_fields?.length > 0),
      capiConnected: false, matchRate: undefined, eventStats,
      recentEvents: eventStats.map((e: any) => e.name), qualityScore: undefined,
    }
  } catch (err) { console.error('Meta error:', err); return null }
}
