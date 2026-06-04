import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Mode 1: données injectées depuis le navigateur (Claude in Chrome)
    if (body.browserData && body.browserData._source === 'browser') {
      return NextResponse.json({ success: true, data: normalize(body.browserData) })
    }

    // Mode 2: scan fetch HTML
    const { url } = body
    if (!url) return NextResponse.json({ success: false, error: 'URL requise' }, { status: 400 })

    let parsed: URL
    try { parsed = new URL(url.startsWith('http') ? url : `https://${url}`) }
    catch { return NextResponse.json({ success: false, error: 'URL invalide' }, { status: 400 }) }

    const data = await fetchScan(parsed.href)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('Scan error:', err.message)
    return NextResponse.json({ success: false, error: err.message || 'Erreur scan' }, { status: 500 })
  }
}

function normalize(b: any) {
  const gtmContainers = b.gtmContainers || []
  const ga4Ids = b.ga4Ids || gtmContainers.filter((k: string) => k.startsWith('G-'))
  const metaPixelIds = b.metaPixelIds || (b.metaPixelId ? [b.metaPixelId] : [])
  const networkRequests: any[] = []
  if (b.hasGTM) networkRequests.push({ url: 'https://www.googletagmanager.com/gtm.js', method: 'GET', status: 200, type: 'gtm', params: {} })
  if (ga4Ids.length) networkRequests.push({ url: 'https://www.google-analytics.com/g/collect', method: 'POST', status: 200, type: 'ga4', params: { tid: ga4Ids[0], en: 'page_view' } })
  if (metaPixelIds.length) networkRequests.push({ url: 'https://www.facebook.com/tr', method: 'GET', status: 200, type: 'meta', params: { id: metaPixelIds[0], ev: 'PageView', ec: b.hasDoublePixel ? 'double' : '0' } })
  const cookies = (b.cookies || []).map((name: string) => {
    let cat = 'other'
    if (name.startsWith('_ga') || name.startsWith('_gid')) cat = 'analytics'
    else if (name.startsWith('_gcl') || name.startsWith('_fbp') || name.startsWith('FPLC')) cat = 'advertising'
    else if (name.toLowerCase().includes('consent') || name.toLowerCase().includes('cky')) cat = 'cmp'
    return { name, value: '', category: cat }
  })
  return {
    url: b.url || '', finalUrl: b.url || '', title: b.title || '',
    timestamp: new Date().toISOString(),
    hasGTM: b.hasGTM || false,
    gtmContainers: gtmContainers.filter((k: string) => k.startsWith('GTM-')),
    ga4Ids, googleAdsIds: b.googleAdsIds || [],
    hasGtag: b.hasGtag || false,
    dataLayerEvents: b.customEvents || [],
    consentDefault: b.consentDefault || null,
    consentUpdate: b.consentUpdate || null,
    metaPixelIds, fbqEvents: [],
    hasCAPI: b.hasCAPI || false,
    cmpDetected: b.cmpDetected || null,
    hasTCF: b.hasTCF || false,
    cookieBannerVisible: !!b.cmpDetected,
    networkRequests, cookies,
    forms: b.forms || [],
    ctaElements: b.ctaElements || 0,
    emailInputs: b.emailInputs || 0,
    telInputs: b.telInputs || 0,
    iframes: b.iframes || [],
    jsErrors: [],
    pageType: b.pageType || 'other',
    hasThankYouPage: b.hasThankYouPage || false,
    _source: 'browser',
  }
}

async function fetchScan(url: string) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  let html = '', finalUrl = url

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36', Accept: 'text/html,*/*' },
      redirect: 'follow',
    })
    clearTimeout(timer)
    html = await res.text()
    finalUrl = res.url
  } catch (e: any) {
    clearTimeout(timer)
    throw new Error(`Impossible de charger la page : ${e.message}`)
  }

  const h = html.toLowerCase()
  const srcs = (html.match(/<script[^>]+src=['"]([^'"]+)['"]/gi) || [])
    .map((m: string) => { const s = m.match(/src=['"]([^'"]+)['"]/i)?.[1] || ''; return s.startsWith('http') ? s : s.startsWith('//') ? 'https:' + s : '' })
    .filter(Boolean).join(' ').toLowerCase()

  const gtmIds = [...new Set(html.match(/GTM-[A-Z0-9]+/g) || [])]
  const ga4Ids = [...new Set(html.match(/G-[A-Z0-9]{8,12}/g) || [])]
  const awIds = [...new Set(html.match(/AW-[0-9]{8,12}/g) || [])]
  const pixelIds = [...new Set([...html.matchAll(/fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{10,})['"]?/g)].map(m => m[1]))]

  let cmp: string | null = null
  if (h.includes('onetrust') || srcs.includes('onetrust')) cmp = 'OneTrust'
  else if (h.includes('cookieyes') || srcs.includes('cookieyes')) cmp = 'CookieYes'
  else if (h.includes('didomi') || srcs.includes('didomi')) cmp = 'Didomi'
  else if (h.includes('axeptio') || srcs.includes('axeptio')) cmp = 'Axeptio'
  else if (h.includes('cookiebot') || srcs.includes('cookiebot')) cmp = 'Cookiebot'
  else if (h.includes('tarteaucitron') || srcs.includes('tarteaucitron')) cmp = 'Tarteaucitron'
  else if (h.includes('usercentrics') || srcs.includes('usercentrics')) cmp = 'Usercentrics'

  const hasCD = h.includes("consent','default'") || h.includes('consent","default"') || h.includes("gtag('consent'")
  const allFour = h.includes('analytics_storage') && h.includes('ad_storage') && h.includes('ad_user_data') && h.includes('ad_personalization')
  const wfu = parseInt(html.match(/wait_for_update['":\s]+(\d+)/)?.[1] || '0')

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || ''
  const path = new URL(finalUrl).pathname.toLowerCase()
  const pageType = path === '/' ? 'home' : path.includes('landing') || path.includes('/lp') ? 'landing' : path.includes('checkout') ? 'checkout' : 'other'

  const networkRequests: any[] = []
  if (gtmIds.length) networkRequests.push({ url: 'https://www.googletagmanager.com/gtm.js', method: 'GET', status: 200, type: 'gtm', params: {} })
  if (ga4Ids.length) networkRequests.push({ url: 'https://www.google-analytics.com/g/collect', method: 'POST', status: 200, type: 'ga4', params: { tid: ga4Ids[0], en: 'page_view' } })
  if (pixelIds.length) networkRequests.push({ url: 'https://www.facebook.com/tr', method: 'GET', status: 200, type: 'meta', params: { id: pixelIds[0], ev: 'PageView' } })

  return {
    url, finalUrl, title, timestamp: new Date().toISOString(),
    hasGTM: gtmIds.length > 0, gtmContainers: gtmIds, ga4Ids, googleAdsIds: awIds, hasGtag: h.includes('gtag('),
    dataLayerEvents: [], consentDefault: hasCD && allFour ? { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: wfu } : null,
    consentUpdate: null, metaPixelIds: pixelIds, fbqEvents: [],
    hasCAPI: h.includes('conversions_api') || h.includes('server_event'),
    cmpDetected: cmp, hasTCF: h.includes('__tcfapi'),
    cookieBannerVisible: !!cmp, networkRequests,
    cookies: ga4Ids.length ? [{ name: '_ga', value: '', category: 'analytics' }] : [],
    forms: (html.match(/<form[^>]*>/gi) || []).map((_: any, i: number) => ({ id: `form_${i}`, action: '', hasEmail: h.includes('type="email"'), hasTel: h.includes('type="tel"'), inputCount: 3 })),
    ctaElements: (html.match(/<button[^>]*>/gi) || []).length,
    emailInputs: (html.match(/type=['"]email['"]/gi) || []).length,
    telInputs: (html.match(/type=['"]tel['"]/gi) || []).length,
    iframes: [], jsErrors: [], pageType,
    hasThankYouPage: path.includes('thank') || path.includes('merci'),
    _source: 'fetch',
  }
}
