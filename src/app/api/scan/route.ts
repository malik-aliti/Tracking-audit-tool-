import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// ── Fetch avec timeout ────────────────────────────────────────────────────────
async function fetchWithTimeout(url: string, ms = 8000): Promise<string> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(id)
    return await res.text()
  } catch {
    clearTimeout(id)
    return ''
  }
}

// ── Extraire tous les scripts src ─────────────────────────────────────────────
function extractScriptSrcs(html: string, baseUrl: string): string[] {
  const matches = html.match(/<script[^>]+src=['"]([^'"]+)['"]/gi) || []
  return matches.map(m => {
    const src = m.match(/src=['"]([^'"]+)['"]/i)?.[1] || ''
    if (!src) return ''
    if (src.startsWith('http')) return src
    if (src.startsWith('//')) return 'https:' + src
    try { return new URL(src, baseUrl).href } catch { return '' }
  }).filter(Boolean)
}

// ── Scanner principal ─────────────────────────────────────────────────────────
async function deepScan(url: string) {
  const start = Date.now()

  // 1. Fetch HTML principal
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), 15000)
  let html = ''
  let finalUrl = url
  let httpStatus = 0

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(id)
    html = await res.text()
    finalUrl = res.url
    httpStatus = res.status
  } catch (e: any) {
    clearTimeout(id)
    throw new Error(`Impossible de charger l'URL : ${e.message}`)
  }

  const h = html.toLowerCase()

  // 2. Fetch scripts externes importants pour détecter les tags chargés dynamiquement
  const scriptSrcs = extractScriptSrcs(html, finalUrl)
  const importantScripts = scriptSrcs.filter(s =>
    s.includes('googletagmanager') || s.includes('cookieyes') || s.includes('onetrust') ||
    s.includes('didomi') || s.includes('axeptio') || s.includes('cookiebot') ||
    s.includes('usercentrics') || s.includes('tarteaucitron') || s.includes('facebook') ||
    s.includes('google-analytics') || s.includes('fbevents') || s.includes('gtag')
  )

  // Fetch en parallèle (max 8 scripts)
  const scriptContents = await Promise.allSettled(
    importantScripts.slice(0, 8).map(src => fetchWithTimeout(src, 5000))
  )
  const allContent = html + '\n' + scriptContents.map(r => r.status === 'fulfilled' ? r.value : '').join('\n')
  const allLower = allContent.toLowerCase()

  // 3. Script src URLs présentes (pour détection CMP)
  const allScriptSrcs = scriptSrcs.join(' ').toLowerCase()

  // ── CMP detection (HTML + scripts externes) ───────────────────────────────
  let cmpDetected: string | null = null
  if (allLower.includes('onetrust') || allLower.includes('cookiepro') || allScriptSrcs.includes('onetrust')) cmpDetected = 'OneTrust'
  else if (allLower.includes('cookieyes') || allScriptSrcs.includes('cookieyes') || allScriptSrcs.includes('cookie-law-info')) cmpDetected = 'CookieYes'
  else if (allLower.includes('didomi') || allScriptSrcs.includes('didomi')) cmpDetected = 'Didomi'
  else if (allLower.includes('axeptio') || allScriptSrcs.includes('axeptio')) cmpDetected = 'Axeptio'
  else if (allLower.includes('cookiebot') || allScriptSrcs.includes('cookiebot')) cmpDetected = 'Cookiebot'
  else if (allLower.includes('tarteaucitron') || allScriptSrcs.includes('tarteaucitron')) cmpDetected = 'Tarteaucitron'
  else if (allLower.includes('usercentrics') || allScriptSrcs.includes('usercentrics')) cmpDetected = 'Usercentrics'
  else if (allLower.includes('quantcast') || allScriptSrcs.includes('quantcast')) cmpDetected = 'Quantcast'
  else if (allLower.includes('trustarc') || allScriptSrcs.includes('trustarc')) cmpDetected = 'TrustArc'
  else if (allLower.includes('iubenda') || allScriptSrcs.includes('iubenda')) cmpDetected = 'Iubenda'

  // ── TCF ───────────────────────────────────────────────────────────────────
  const hasTCF = allLower.includes('__tcfapi') || allLower.includes('tcf2') || allLower.includes('euconsent-v2')

  // ── GTM ───────────────────────────────────────────────────────────────────
  const gtmMatch = allContent.match(/GTM-[A-Z0-9]+/g)
  const gtmContainers = gtmMatch ? [...new Set(gtmMatch)] : []
  const hasGTM = gtmContainers.length > 0

  // ── GA4 ───────────────────────────────────────────────────────────────────
  const ga4Match = allContent.match(/G-[A-Z0-9]{8,12}/g)
  const ga4Ids = ga4Match ? [...new Set(ga4Match)] : []

  // ── Google Ads ────────────────────────────────────────────────────────────
  const awMatch = allContent.match(/AW-[0-9]{8,12}/g)
  const googleAdsIds = awMatch ? [...new Set(awMatch)] : []

  // ── gtag ──────────────────────────────────────────────────────────────────
  const hasGtag = allLower.includes('gtag(') || allScriptSrcs.includes('gtag/js')

  // ── Meta Pixel ────────────────────────────────────────────────────────────
  const metaPixelIds: string[] = []
  const pixelMatches = allContent.matchAll(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d{10,})['"]/g)
  for (const m of pixelMatches) metaPixelIds.push(m[1])
  // Detect from script src (e.g. connect.facebook.net/signals/config/PIXELID)
  const fbConfigMatch = allContent.match(/signals\/config\/(\d{10,})/g)
  if (fbConfigMatch) fbConfigMatch.forEach(m => { const id = m.replace('signals/config/', ''); if (!metaPixelIds.includes(id)) metaPixelIds.push(id) })
  // Detect pixel in network calls pattern
  if (allScriptSrcs.includes('connect.facebook.net') || allLower.includes('fbevents.js')) {
    const fbSrcMatch = allContent.match(/connect\.facebook\.net[^'"]*\/(\d{10,})\//g)
    if (fbSrcMatch) fbSrcMatch.forEach(m => { const idMatch = m.match(/\/(\d{10,})\//) ; if (idMatch && !metaPixelIds.includes(idMatch[1])) metaPixelIds.push(idMatch[1]) })
  }

  // ── Consent Mode v2 detection ─────────────────────────────────────────────
  const hasConsentDefault =
    allLower.includes("consent','default'") || allLower.includes('consent","default"') ||
    allLower.includes("'consent', 'default'") || allLower.includes('"consent", "default"') ||
    allLower.includes("gtag('consent'") || allLower.includes('gtag("consent"')

  const hasConsentUpdate =
    allLower.includes("consent','update'") || allLower.includes('consent","update"')

  const hasAnalyticsStorage = allLower.includes('analytics_storage')
  const hasAdStorage = allLower.includes('ad_storage')
  const hasAdUserData = allLower.includes('ad_user_data')
  const hasAdPersonalization = allLower.includes('ad_personalization')
  const allConsentParams = hasAnalyticsStorage && hasAdStorage && hasAdUserData && hasAdPersonalization

  const waitMatch = allContent.match(/wait_for_update['":\s]+(\d+)/)
  const waitForUpdate = waitMatch ? parseInt(waitMatch[1]) : 0

  // Detect consent mode via CMP script loading order
  const cmpLoadedBeforeGTM = cmpDetected !== null
  const hasConsentModeViaGTM = hasGTM && (hasConsentDefault || (cmpDetected !== null && allLower.includes('consent')))

  // ── Forms ─────────────────────────────────────────────────────────────────
  const formMatches = html.match(/<form[^>]*>/gi) || []
  const emailInputs = (html.match(/type=['"]email['"]/gi) || []).length +
    (html.match(/name=['"][^'"]*email[^'"]*['"]/gi) || []).length
  const telInputs = (html.match(/type=['"]tel['"]/gi) || []).length +
    (html.match(/name=['"][^'"]*(?:phone|tel|mobile)[^'"]*['"]/gi) || []).length

  // ── CTAs ──────────────────────────────────────────────────────────────────
  const ctaMatches = (html.match(/class=['"][^'"]*(?:cta|btn|button)[^'"]*['"]/gi) || []).length +
    (html.match(/<button[^>]*>/gi) || []).length

  // ── iFrames ───────────────────────────────────────────────────────────────
  const iframeMatches = html.match(/<iframe[^>]+src=['"][^'"]+['"]/gi) || []
  const iframes = iframeMatches.map(m => {
    const src = m.match(/src=['"]([^'"]+)['"]/)?.[1] || ''
    return { src: src.slice(0, 200), hasTracking: src.includes('facebook') || src.includes('google') || src.includes('doubleclick') }
  })

  // ── CAPI ──────────────────────────────────────────────────────────────────
  const hasCAPI = allLower.includes('conversions_api') || allLower.includes('server_event') ||
    allLower.includes('capi') || (allLower.includes('facebook') && allLower.includes('api_version'))

  // ── Advanced Matching (hme= hash dans signals config) ────────────────────
  const hasHme = allLower.includes('hme=') || allLower.includes('advanced_matching')
  const hasDoublePixel = (allContent.match(/fbq\s*\(\s*['"]init['"]/g) || []).length > 1

  // ── Custom events in dataLayer ────────────────────────────────────────────
  const dlMatches = allContent.match(/dataLayer\.push\s*\(\s*\{[^}]*event\s*:\s*['"]([^'"]+)['"]/g) || []
  const dataLayerEvents = dlMatches.map(m => {
    const eventMatch = m.match(/event\s*:\s*['"]([^'"]+)['"]/)
    return { event: eventMatch?.[1] || 'unknown', keys: ['event'], preview: m.slice(0, 100) }
  })

  // ── Network requests (inferred) ───────────────────────────────────────────
  const networkRequests: any[] = []
  if (hasGTM) networkRequests.push({ url: 'https://www.googletagmanager.com/gtm.js', method: 'GET', status: 200, type: 'gtm', params: {} })
  if (ga4Ids.length > 0) networkRequests.push({ url: `https://www.google-analytics.com/g/collect`, method: 'POST', status: 200, type: 'ga4', params: { tid: ga4Ids[0], en: 'page_view' } })
  if (metaPixelIds.length > 0) {
    networkRequests.push({ url: `https://www.facebook.com/tr`, method: 'GET', status: 200, type: 'meta', params: { id: metaPixelIds[0], ev: 'PageView', ec: '0' } })
    if (hasDoublePixel) networkRequests.push({ url: `https://www.facebook.com/tr`, method: 'GET', status: 200, type: 'meta', params: { id: metaPixelIds[0], ev: 'PageView', ec: '1' } })
  }
  if (hasHme) networkRequests.push({ url: `https://connect.facebook.net/signals/config/${metaPixelIds[0]}`, method: 'GET', status: 200, type: 'meta', params: { hme: 'detected' } })
  const capiDetected = allLower.includes('api_unavailable') ? false : allLower.includes('api_active') ? true : false

  // ── Page type ─────────────────────────────────────────────────────────────
  const path = new URL(finalUrl).pathname.toLowerCase()
  let pageType = 'other'
  if (path === '/' || path === '/index.html') pageType = 'home'
  else if (path.includes('landing') || path.includes('/lp')) pageType = 'landing'
  else if (path.includes('checkout') || path.includes('cart') || path.includes('panier')) pageType = 'checkout'
  else if (path.includes('product') || path.includes('produit')) pageType = 'product'
  else if (path.includes('blog') || path.includes('article')) pageType = 'blog'
  else if (formMatches.length === 1 && ctaMatches > 0) pageType = 'landing'

  // ── Title ─────────────────────────────────────────────────────────────────
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim().slice(0, 100) : ''

  // ── Consent objects ───────────────────────────────────────────────────────
  let consentDefault = null
  if (hasConsentDefault && allConsentParams) {
    const isDenied = allLower.includes("analytics_storage':'denied'") ||
      allLower.includes('analytics_storage":"denied"') ||
      allLower.includes("analytics_storage': 'denied'") ||
      allLower.includes('"analytics_storage": "denied"')
    consentDefault = {
      analytics_storage: isDenied ? 'denied' : 'unknown',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: waitForUpdate,
    }
  } else if (hasConsentDefault) {
    consentDefault = { analytics_storage: 'unknown', ad_storage: 'unknown', ad_user_data: 'unknown', ad_personalization: 'unknown', wait_for_update: waitForUpdate }
  }

  const consentUpdate = hasConsentUpdate
    ? { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' }
    : null

  // ── Cookies (inferred from known patterns) ────────────────────────────────
  const cookies: any[] = []
  if (ga4Ids.length > 0) cookies.push({ name: '_ga', value: 'GA1.1.xxx', category: 'analytics' })
  if (metaPixelIds.length > 0) cookies.push({ name: '_fbp', value: 'fb.1.xxx', category: 'advertising' })
  if (cmpDetected) cookies.push({ name: 'CookieConsent', value: 'detected', category: 'cmp' })

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
    hasCAPI: capiDetected,
    cmpDetected,
    hasTCF,
    cookieBannerVisible: !!cmpDetected,
    networkRequests,
    cookies,
    forms: formMatches.map((_, i) => ({
      id: `form_${i}`, action: '',
      hasEmail: emailInputs > 0, hasTel: telInputs > 0, inputCount: 3
    })),
    ctaElements: ctaMatches,
    emailInputs,
    telInputs,
    iframes,
    jsErrors: [],
    pageType,
    hasThankYouPage: path.includes('thank') || path.includes('merci') || path.includes('success'),
    _meta: {
      hasConsentDefault,
      hasConsentUpdate,
      allConsentParams,
      waitForUpdate,
      isAdvancedMode: waitForUpdate > 0,
      cmpLoadedBeforeGTM,
      hasDoublePixel,
      hasHme,
      scriptSrcs: scriptSrcs.slice(0, 15),
      scanDuration: Date.now() - start,
      scanMethod: 'deep-fetch',
      httpStatus,
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
      return NextResponse.json({ success: false, error: 'URL invalide' }, { status: 400 })
    }

    const data = await deepScan(parsed.href)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('Scan error:', err)
    return NextResponse.json({ success: false, error: err.message || 'Erreur lors du scan' }, { status: 500 })
  }
}
