import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// ── Lightweight scanner sans Puppeteer (fetch + regex) ──────────────────────
// Fonctionne en dev local ET sur Vercel sans Chrome
async function lightScan(url: string) {
  const start = Date.now()

  // Fetch the HTML
  let html = ''
  let finalUrl = url
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrackAudit/1.0)' },
      redirect: 'follow',
    })
    html = await res.text()
    finalUrl = res.url
  } catch (e: any) {
    throw new Error(`Impossible de charger l'URL : ${e.message}`)
  }

  const h = html.toLowerCase()

  // ── GTM detection ──────────────────────────────────────────────────────────
  const gtmMatch = html.match(/GTM-[A-Z0-9]+/g)
  const gtmContainers = gtmMatch ? [...new Set(gtmMatch)] : []
  const hasGTM = gtmContainers.length > 0

  // ── GA4 detection ──────────────────────────────────────────────────────────
  const ga4Match = html.match(/G-[A-Z0-9]{8,}/g)
  const ga4Ids = ga4Match ? [...new Set(ga4Match)] : []

  // ── Google Ads detection ───────────────────────────────────────────────────
  const awMatch = html.match(/AW-[0-9]{8,}/g)
  const googleAdsIds = awMatch ? [...new Set(awMatch)] : []

  // ── gtag detection ─────────────────────────────────────────────────────────
  const hasGtag = h.includes('gtag(') || h.includes('gtag.js')

  // ── Meta Pixel detection ───────────────────────────────────────────────────
  const pixelMatch = html.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d{10,})['"]/g)
  const metaPixelIds: string[] = []
  if (pixelMatch) {
    pixelMatch.forEach(m => {
      const idMatch = m.match(/(\d{10,})/)
      if (idMatch) metaPixelIds.push(idMatch[1])
    })
  }
  // Also check for pixel in script src
  if (h.includes('connect.facebook.net') || h.includes('fbevents.js')) {
    const srcMatch = html.match(/\/(\d{10,})\//g)
    if (srcMatch) srcMatch.forEach(m => {
      const id = m.replace(/\//g, '')
      if (id.length >= 10 && !metaPixelIds.includes(id)) metaPixelIds.push(id)
    })
  }

  // ── CMP detection ──────────────────────────────────────────────────────────
  let cmpDetected: string | null = null
  if (h.includes('onetrust') || h.includes('cookiepro')) cmpDetected = 'OneTrust'
  else if (h.includes('cookieyes') || h.includes('cookie-law-info')) cmpDetected = 'CookieYes'
  else if (h.includes('didomi')) cmpDetected = 'Didomi'
  else if (h.includes('axeptio')) cmpDetected = 'Axeptio'
  else if (h.includes('cookiebot')) cmpDetected = 'Cookiebot'
  else if (h.includes('tarteaucitron')) cmpDetected = 'Tarteaucitron'
  else if (h.includes('usercentrics')) cmpDetected = 'Usercentrics'
  else if (h.includes('quantcast')) cmpDetected = 'Quantcast'
  else if (h.includes('trustarcbar') || h.includes('trustarc')) cmpDetected = 'TrustArc'

  // ── TCF detection ──────────────────────────────────────────────────────────
  const hasTCF = h.includes('__tcfapi') || h.includes('tcf') || h.includes('euconsent')

  // ── Consent Mode detection ─────────────────────────────────────────────────
  const hasConsentDefault = h.includes("consent','default'") || h.includes('consent","default"') || h.includes("'consent', 'default'") || h.includes('"consent", "default"')
  const hasConsentUpdate = h.includes("consent','update'") || h.includes('consent","update"')

  // Detect wait_for_update (Mode Avancé indicator)
  const waitMatch = html.match(/wait_for_update['":\s]+(\d+)/)
  const waitForUpdate = waitMatch ? parseInt(waitMatch[1]) : 0

  // Detect the 4 consent params
  const hasAnalyticsStorage = h.includes('analytics_storage')
  const hasAdStorage = h.includes('ad_storage')
  const hasAdUserData = h.includes('ad_user_data')
  const hasAdPersonalization = h.includes('ad_personalization')
  const allConsentParams = hasAnalyticsStorage && hasAdStorage && hasAdUserData && hasAdPersonalization

  // ── Forms detection ────────────────────────────────────────────────────────
  const formMatches = html.match(/<form[^>]*>/gi) || []
  const emailInputs = (html.match(/type=['"]email['"]/gi) || []).length
  const telInputs = (html.match(/type=['"]tel['"]/gi) || []).length

  // ── iFrame detection ───────────────────────────────────────────────────────
  const iframeMatches = html.match(/<iframe[^>]+src=['"][^'"]+['"]/gi) || []
  const iframes = iframeMatches.map(m => {
    const srcMatch = m.match(/src=['"]([^'"]+)['"]/)
    const src = srcMatch ? srcMatch[1] : ''
    return {
      src: src.slice(0, 200),
      hasTracking: src.includes('facebook') || src.includes('google') || src.includes('doubleclick'),
    }
  })

  // ── CTA detection ──────────────────────────────────────────────────────────
  const ctaMatches = html.match(/class=['"][^'"]*(?:cta|btn|button)[^'"]*['"]/gi) || []

  // ── CAPI detection ─────────────────────────────────────────────────────────
  const hasCAPI = h.includes('conversions_api') || h.includes('capi') || h.includes('server_event')

  // ── Page type ──────────────────────────────────────────────────────────────
  const path = new URL(finalUrl).pathname.toLowerCase()
  let pageType: string = 'other'
  if (path === '/' || path === '/index' || path === '/index.html') pageType = 'home'
  else if (path.includes('landing') || path.includes('/lp/') || path.includes('-lp')) pageType = 'landing'
  else if (path.includes('checkout') || path.includes('cart') || path.includes('panier')) pageType = 'checkout'
  else if (path.includes('product') || path.includes('produit')) pageType = 'product'
  else if (path.includes('blog') || path.includes('article') || path.includes('news')) pageType = 'blog'
  else if (formMatches.length === 1) pageType = 'landing'

  // ── Title ──────────────────────────────────────────────────────────────────
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : ''

  // ── JS errors (can't detect without browser) ───────────────────────────────
  const jsErrors: string[] = []

  // ── Cookies (can't detect without browser) ─────────────────────────────────
  const cookies: any[] = []

  // ── dataLayer events (static detection) ───────────────────────────────────
  const dlMatches = html.match(/dataLayer\.push\(\{[^}]+event['"\s]*:['"]\s*([^'"]+)['"]/g) || []
  const dataLayerEvents = dlMatches.map(m => {
    const eventMatch = m.match(/event['"\s]*:['"]\s*([^'"]+)['"]/)
    return { event: eventMatch ? eventMatch[1] : 'unknown', keys: ['event'], preview: m.slice(0, 100) }
  })

  // Custom events (non-GTM)
  const customEvents = dataLayerEvents.filter(e =>
    e.event && !e.event.startsWith('gtm.') && !['cookie_consent_update'].includes(e.event)
  )

  // ── Network requests (static detection from scripts) ──────────────────────
  const networkRequests: any[] = []
  if (hasGTM) networkRequests.push({ url: 'https://www.googletagmanager.com/gtm.js', method: 'GET', status: 200, type: 'gtm', params: {} })
  if (ga4Ids.length > 0) networkRequests.push({ url: `https://www.google-analytics.com/g/collect?tid=${ga4Ids[0]}`, method: 'POST', status: 200, type: 'ga4', params: { tid: ga4Ids[0] } })
  if (metaPixelIds.length > 0) networkRequests.push({ url: `https://www.facebook.com/tr?id=${metaPixelIds[0]}&ev=PageView`, method: 'GET', status: 200, type: 'meta', params: { id: metaPixelIds[0], ev: 'PageView' } })

  // ── UTM params ─────────────────────────────────────────────────────────────
  const urlParams = new URLSearchParams(new URL(finalUrl).search)
  const hasGclid = urlParams.has('gclid') || urlParams.has('wbraid')

  // ── Build consentDefault object ────────────────────────────────────────────
  let consentDefault = null
  if (hasConsentDefault && allConsentParams) {
    // Try to detect values
    const denied = h.includes("analytics_storage':'denied'") || h.includes('analytics_storage":"denied"') || h.includes("analytics_storage': 'denied'")
    consentDefault = {
      analytics_storage: denied ? 'denied' : 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: waitForUpdate,
    }
  }

  const consentUpdate = hasConsentUpdate ? { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' } : null

  return {
    url,
    finalUrl,
    title,
    timestamp: new Date().toISOString(),
    hasGTM,
    gtmContainers,
    ga4Ids,
    googleAdsIds,
    hasGtag,
    dataLayerEvents,
    consentDefault,
    consentUpdate,
    metaPixelIds: [...new Set(metaPixelIds)],
    fbqEvents: [],
    hasCAPI,
    cmpDetected,
    hasTCF,
    cookieBannerVisible: !!cmpDetected,
    networkRequests,
    cookies,
    forms: formMatches.map((_, i) => ({ id: `form_${i}`, action: '', hasEmail: emailInputs > 0, hasTel: telInputs > 0, inputCount: 0 })),
    ctaElements: ctaMatches.length,
    emailInputs,
    telInputs,
    iframes,
    jsErrors,
    pageType,
    hasThankYouPage: path.includes('thank') || path.includes('merci') || path.includes('success'),
    // Extra metadata for analysis
    _meta: {
      hasConsentDefault,
      hasConsentUpdate,
      allConsentParams,
      waitForUpdate,
      isAdvancedMode: waitForUpdate > 0,
      scanDuration: Date.now() - start,
      scanMethod: 'fetch',
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ success: false, error: 'URL requise' }, { status: 400 })

    let parsed: URL
    try {
      parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    } catch {
      return NextResponse.json({ success: false, error: 'URL invalide — vérifiez le format (ex: https://votre-site.com)' }, { status: 400 })
    }

    const data = await lightScan(parsed.href)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('Scan error:', err)
    return NextResponse.json({ success: false, error: err.message || 'Erreur lors du scan' }, { status: 500 })
  }
}
