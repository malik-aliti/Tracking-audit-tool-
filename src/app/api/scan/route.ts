import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

async function fetchWithTimeout(url: string, ms = 10000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    })
    clearTimeout(t)
    return r
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, browserData } = body

    // ── Mode 1 : données injectées depuis le navigateur ────────────────────
    // Les données sont passées directement (collectées par un script côté client)
    if (browserData && browserData._source === 'browser') {
      // Compléter les champs manquants avec des valeurs par défaut
      const data = {
        url: browserData.url || url,
        finalUrl: browserData.url || url,
        title: browserData.title || '',
        timestamp: new Date().toISOString(),
        hasGTM: browserData.hasGTM ?? false,
        gtmContainers: browserData.gtmContainers || [],
        ga4Ids: browserData.ga4Ids || [],
        googleAdsIds: browserData.googleAdsIds || [],
        hasGtag: browserData.hasGtag ?? false,
        dataLayerEvents: browserData.dataLayerEvents || [],
        consentDefault: browserData.consentDefault || null,
        consentUpdate: browserData.consentUpdate || null,
        metaPixelIds: browserData.metaPixelIds || [],
        fbqEvents: browserData.fbqEvents || [],
        hasCAPI: browserData.hasCAPI ?? false,
        cmpDetected: browserData.cmpDetected || null,
        hasTCF: browserData.hasTCF ?? false,
        cookieBannerVisible: !!browserData.cmpDetected,
        networkRequests: buildNetworkRequests(browserData),
        cookies: buildCookies(browserData),
        forms: browserData.forms || [],
        ctaElements: browserData.ctaElements || 0,
        emailInputs: browserData.emailInputs || 0,
        telInputs: browserData.telInputs || 0,
        iframes: browserData.iframes || [],
        jsErrors: browserData.jsErrors || [],
        pageType: browserData.pageType || 'other',
        hasThankYouPage: browserData.hasThankYouPage ?? false,
        _source: 'browser',
      }
      return NextResponse.json({ success: true, data })
    }

    // ── Mode 2 : scan fetch HTML ───────────────────────────────────────────
    if (!url) return NextResponse.json({ success: false, error: 'URL requise' }, { status: 400 })

    let parsed: URL
    try { parsed = new URL(url.startsWith('http') ? url : `https://${url}`) }
    catch { return NextResponse.json({ success: false, error: 'URL invalide' }, { status: 400 }) }

    const res = await fetchWithTimeout(parsed.href)
    const html = await res.text()
    const finalUrl = res.url
    const data = await analyzHtml(html, finalUrl, parsed.href)
    return NextResponse.json({ success: true, data })

  } catch (err: any) {
    console.error('Scan error:', err)
    return NextResponse.json({ success: false, error: err.message || 'Erreur lors du scan' }, { status: 500 })
  }
}

function buildNetworkRequests(b: any) {
  const reqs: any[] = []
  if (b.hasGTM) reqs.push({ url:'https://www.googletagmanager.com/gtm.js', method:'GET', status:200, type:'gtm', params:{} })
  if (b.ga4Ids?.length) reqs.push({ url:'https://www.google-analytics.com/g/collect', method:'POST', status:200, type:'ga4', params:{ tid: b.ga4Ids[0], en:'page_view' } })
  if (b.metaPixelIds?.length) {
    reqs.push({ url:'https://www.facebook.com/tr', method:'GET', status:200, type:'meta', params:{ id:b.metaPixelIds[0], ev:'PageView', ec:'0' } })
    if (b.hasDoublePixel) reqs.push({ url:'https://www.facebook.com/tr', method:'GET', status:200, type:'meta', params:{ id:b.metaPixelIds[0], ev:'PageView', ec:'1' } })
  }
  if (b.googleAdsIds?.length) reqs.push({ url:'https://www.googleads.com/pagead/conversion', method:'GET', status:200, type:'google_ads', params:{ id:b.googleAdsIds[0] } })
  if (b.hasCAPI) reqs.push({ url:'https://graph.facebook.com/v20.0/events', method:'POST', status:200, type:'meta', params:{ api_version:'v20.0' } })
  return reqs
}

function buildCookies(b: any) {
  const cookies: any[] = []
  const rawCookies: string[] = b.cookies || []
  rawCookies.forEach((name: string) => {
    let cat = 'other'
    if (name.startsWith('_ga') || name.startsWith('_gid')) cat = 'analytics'
    else if (name.startsWith('_gcl') || name.startsWith('_fbp') || name.startsWith('_fbc')) cat = 'advertising'
    else if (name.toLowerCase().includes('consent') || name.toLowerCase().includes('cookie') || name.toLowerCase().includes('cky')) cat = 'cmp'
    cookies.push({ name, value: '(from browser)', category: cat })
  })
  return cookies
}

async function analyzHtml(html: string, finalUrl: string, originalUrl: string) {
  const h = html.toLowerCase()
  const scriptSrcs = (html.match(/<script[^>]+src=['"]([^'"]+)['"]/gi) || [])
    .map((m: string) => {
      const src = m.match(/src=['"]([^'"]+)['"]/i)?.[1] || ''
      if (!src) return ''
      if (src.startsWith('http')) return src
      if (src.startsWith('//')) return 'https:' + src
      try { return new URL(src, finalUrl).href } catch { return '' }
    }).filter(Boolean)
  const allSrcs = scriptSrcs.join(' ').toLowerCase()

  // Fetch key external scripts in parallel
  const keyScripts = scriptSrcs.filter((s: string) =>
    s.includes('googletagmanager') || s.includes('cookieyes') || s.includes('onetrust') ||
    s.includes('didomi') || s.includes('axeptio') || s.includes('cookiebot') ||
    s.includes('facebook') || s.includes('google-analytics') || s.includes('gtag')
  ).slice(0, 6)

  const scriptTexts = await Promise.allSettled(
    keyScripts.map(async (src: string) => {
      try {
        const r = await fetchWithTimeout(src, 4000)
        return await r.text()
      } catch { return '' }
    })
  )
  const allContent = html + '\n' + scriptTexts.map((r: any) => r.status === 'fulfilled' ? r.value : '').join('\n')
  const allLower = allContent.toLowerCase()

  const gtmMatch = allContent.match(/GTM-[A-Z0-9]+/g) || []
  const ga4Match = allContent.match(/G-[A-Z0-9]{8,12}/g) || []
  const awMatch = allContent.match(/AW-[0-9]{8,12}/g) || []
  const pixelMatches = [...allContent.matchAll(/fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{10,})['"]?/g)]
  const metaPixelIds = [...new Set(pixelMatches.map((m: any) => m[1]))]

  let cmpDetected: string | null = null
  if (allLower.includes('onetrust') || allSrcs.includes('onetrust')) cmpDetected = 'OneTrust'
  else if (allLower.includes('cookieyes') || allSrcs.includes('cookieyes')) cmpDetected = 'CookieYes'
  else if (allLower.includes('didomi') || allSrcs.includes('didomi')) cmpDetected = 'Didomi'
  else if (allLower.includes('axeptio') || allSrcs.includes('axeptio')) cmpDetected = 'Axeptio'
  else if (allLower.includes('cookiebot') || allSrcs.includes('cookiebot')) cmpDetected = 'Cookiebot'
  else if (allLower.includes('tarteaucitron') || allSrcs.includes('tarteaucitron')) cmpDetected = 'Tarteaucitron'
  else if (allLower.includes('usercentrics') || allSrcs.includes('usercentrics')) cmpDetected = 'Usercentrics'

  const hasConsentDefault = allLower.includes("consent','default'") || allLower.includes('consent","default"') || allLower.includes("gtag('consent'") || allLower.includes('gtag("consent"')
  const hasConsentUpdate = allLower.includes("consent','update'") || allLower.includes('consent","update"')
  const allFourParams = allLower.includes('analytics_storage') && allLower.includes('ad_storage') && allLower.includes('ad_user_data') && allLower.includes('ad_personalization')
  const waitMatch = allContent.match(/wait_for_update['":\s]+(\d+)/)
  const waitForUpdate = waitMatch ? parseInt(waitMatch[1]) : 0

  const formMatches = html.match(/<form[^>]*>/gi) || []
  const emailInputs = (html.match(/type=['"]email['"]/gi) || []).length
  const telInputs = (html.match(/type=['"]tel['"]/gi) || []).length
  const ctaElements = (html.match(/<button[^>]*>/gi) || []).length + (html.match(/class=['"][^'"]*(?:cta|btn-)[^'"]*['"]/gi) || []).length
  const iframeMatches = html.match(/<iframe[^>]+src=['"][^'"]+['"]/gi) || []
  const iframes = iframeMatches.map((m: string) => {
    const src = m.match(/src=['"]([^'"]+)['"]/)?.[1] || ''
    return { src: src.slice(0, 200), hasTracking: src.includes('facebook') || src.includes('google') }
  })
  const dlMatches = allContent.match(/dataLayer\.push\s*\(\s*\{[^}]*event\s*:\s*['"]([^'"]+)['"]/g) || []
  const dataLayerEvents = dlMatches.map((m: string) => {
    const ev = m.match(/event\s*:\s*['"]([^'"]+)['"]/)?.[1] || 'unknown'
    return { event: ev, keys: ['event'], preview: m.slice(0, 100) }
  })
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const path = new URL(finalUrl).pathname.toLowerCase()
  let pageType = 'other'
  if (path === '/' || path === '/index.html') pageType = 'home'
  else if (path.includes('landing') || path.includes('/lp')) pageType = 'landing'
  else if (formMatches.length === 1) pageType = 'landing'

  const networkRequests: any[] = []
  const gtmIds = [...new Set(gtmMatch)]
  const ga4Ids = [...new Set(ga4Match)]
  const googleAdsIds = [...new Set(awMatch)]
  if (gtmIds.length) networkRequests.push({ url:'https://www.googletagmanager.com/gtm.js', method:'GET', status:200, type:'gtm', params:{} })
  if (ga4Ids.length) networkRequests.push({ url:'https://www.google-analytics.com/g/collect', method:'POST', status:200, type:'ga4', params:{ tid:ga4Ids[0], en:'page_view' } })
  if (metaPixelIds.length) networkRequests.push({ url:'https://www.facebook.com/tr', method:'GET', status:200, type:'meta', params:{ id:metaPixelIds[0], ev:'PageView' } })

  let consentDefault = null
  if (hasConsentDefault && allFourParams) {
    consentDefault = { analytics_storage:'denied', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied', wait_for_update:waitForUpdate }
  }

  return {
    url: originalUrl, finalUrl, title: titleMatch?.[1]?.trim() || '',
    timestamp: new Date().toISOString(),
    hasGTM: gtmIds.length > 0, gtmContainers: gtmIds,
    ga4Ids, googleAdsIds, hasGtag: allLower.includes('gtag('),
    dataLayerEvents, consentDefault, consentUpdate: hasConsentUpdate ? { analytics_storage:'granted', ad_storage:'granted', ad_user_data:'granted', ad_personalization:'granted' } : null,
    metaPixelIds, fbqEvents: [], hasCAPI: allLower.includes('conversions_api') || allLower.includes('server_event'),
    cmpDetected, hasTCF: allLower.includes('__tcfapi') || allLower.includes('euconsent-v2'),
    cookieBannerVisible: !!cmpDetected, networkRequests,
    cookies: ga4Ids.length ? [{ name:'_ga', value:'GA1.1.xxx', category:'analytics' }] : [],
    forms: formMatches.map((_: any, i: number) => ({ id:`form_${i}`, action:'', hasEmail:emailInputs>0, hasTel:telInputs>0, inputCount:3 })),
    ctaElements, emailInputs, telInputs, iframes, jsErrors: [], pageType,
    hasThankYouPage: path.includes('thank') || path.includes('merci'),
    _source: 'fetch',
  }
}
