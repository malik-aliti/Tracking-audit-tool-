import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, browserData } = body

    // Mode 1 : données collectées par Claude in Chrome (priorité absolue)
    if (browserData && browserData._source === 'browser') {
      const data = normalizeBrowserData(browserData)
      return NextResponse.json({ success: true, data })
    }

    // Mode 2 : scan HTML fetch (fallback)
    if (!url) return NextResponse.json({ success: false, error: 'URL requise' }, { status: 400 })
    let parsed: URL
    try { parsed = new URL(url.startsWith('http') ? url : `https://${url}`) }
    catch { return NextResponse.json({ success: false, error: 'URL invalide' }, { status: 400 }) }
    const data = await fetchScan(parsed.href)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

function normalizeBrowserData(b: any) {
  const gtmContainers = b.gtmContainers || []
  const ga4Ids = b.ga4Ids || (gtmContainers.filter((k:string) => k.startsWith('G-')))
  const googleAdsIds = b.googleAdsIds || (gtmContainers.filter((k:string) => k.startsWith('AW-')))
  const metaPixelIds = b.metaPixelIds || (b.metaPixelId ? [b.metaPixelId] : [])
  const cookies: any[] = (b.cookies || []).map((name: string) => {
    let cat = 'other'
    if (name.startsWith('_ga') || name.startsWith('_gid')) cat = 'analytics'
    else if (name.startsWith('_gcl') || name.startsWith('_fbp') || name.startsWith('_fbc') || name.startsWith('FPLC')) cat = 'advertising'
    else if (name.toLowerCase().includes('consent') || name.toLowerCase().includes('cookie') || name.toLowerCase().includes('cky')) cat = 'cmp'
    return { name, value: '(from browser)', category: cat }
  })
  const networkRequests: any[] = []
  if (b.hasGTM) networkRequests.push({ url: 'https://www.googletagmanager.com/gtm.js', method: 'GET', status: 200, type: 'gtm', params: {} })
  if (ga4Ids.length) networkRequests.push({ url: 'https://www.google-analytics.com/g/collect', method: 'POST', status: 200, type: 'ga4', params: { tid: ga4Ids[0], en: 'page_view' } })
  if (metaPixelIds.length) {
    networkRequests.push({ url: 'https://www.facebook.com/tr', method: 'GET', status: 200, type: 'meta', params: { id: metaPixelIds[0], ev: 'PageView', ec: b.hasDoublePixel ? 'double' : '0' } })
  }
  if (googleAdsIds.length) networkRequests.push({ url: 'https://www.googleads.com/pagead/conversion', method: 'GET', status: 200, type: 'google_ads', params: {} })
  if (b.hasCAPI) networkRequests.push({ url: 'https://graph.facebook.com/v20.0/events', method: 'POST', status: 200, type: 'meta', params: { api_version: 'v20.0' } })

  return {
    url: b.url || '', finalUrl: b.url || '', title: b.title || '',
    timestamp: new Date().toISOString(),
    hasGTM: b.hasGTM || false,
    gtmContainers: gtmContainers.filter((k:string) => k.startsWith('GTM-')),
    ga4Ids, googleAdsIds, hasGtag: b.hasGtag || false,
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
    jsErrors: b.jsErrors || [],
    pageType: b.pageType || 'other',
    hasThankYouPage: b.hasThankYouPage || false,
    _source: 'browser',
  }
}

async function fetchScan(url: string) {
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), 12000)
  const res = await fetch(url, {
    signal: ctrl.signal,
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept': 'text/html,*/*' },
    redirect: 'follow',
  })
  const html = await res.text()
  const finalUrl = res.url
  const h = html.toLowerCase()
  const scriptSrcs = (html.match(/<script[^>]+src=['"]([^'"]+)['"]/gi) || []).map((m:string) => { const s = m.match(/src=['"]([^'"]+)['"]/i)?.[1]||''; if(!s) return ''; if(s.startsWith('http')) return s; if(s.startsWith('//')) return 'https:'+s; try{return new URL(s,finalUrl).href}catch{return ''} }).filter(Boolean)
  const allSrcs = scriptSrcs.join(' ').toLowerCase()
  const gtmMatch = [...new Set(html.match(/GTM-[A-Z0-9]+/g)||[])]
  const ga4Match = [...new Set(html.match(/G-[A-Z0-9]{8,12}/g)||[])]
  const awMatch = [...new Set(html.match(/AW-[0-9]{8,12}/g)||[])]
  const pixelMatches = [...html.matchAll(/fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{10,})['"]?/g)]
  const metaPixelIds = [...new Set(pixelMatches.map((m:any)=>m[1]))]
  let cmpDetected: string|null = null
  if(h.includes('onetrust')||allSrcs.includes('onetrust')) cmpDetected='OneTrust'
  else if(h.includes('cookieyes')||allSrcs.includes('cookieyes')) cmpDetected='CookieYes'
  else if(h.includes('didomi')||allSrcs.includes('didomi')) cmpDetected='Didomi'
  else if(h.includes('axeptio')||allSrcs.includes('axeptio')) cmpDetected='Axeptio'
  else if(h.includes('cookiebot')||allSrcs.includes('cookiebot')) cmpDetected='Cookiebot'
  else if(h.includes('tarteaucitron')||allSrcs.includes('tarteaucitron')) cmpDetected='Tarteaucitron'
  const hasCD = h.includes("consent','default'") || h.includes('consent","default"') || h.includes('gtag('+"'consent'")
  const allFour = h.includes('analytics_storage') && h.includes('ad_storage') && h.includes('ad_user_data') && h.includes('ad_personalization')
  const waitMatch = html.match(/wait_for_update['": ]+(\d+)/); const wfu = waitMatch?parseInt(waitMatch[1]):0
  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const path = new URL(finalUrl).pathname.toLowerCase()
  const formCount = (html.match(/<form[^>]*>/gi)||[]).length
  const networkRequests: any[] = []
  if(gtmMatch.length) networkRequests.push({url:'https://www.googletagmanager.com/gtm.js',method:'GET',status:200,type:'gtm',params:{}})
  if(ga4Match.length) networkRequests.push({url:'https://www.google-analytics.com/g/collect',method:'POST',status:200,type:'ga4',params:{tid:ga4Match[0],en:'page_view'}})
  if(metaPixelIds.length) networkRequests.push({url:'https://www.facebook.com/tr',method:'GET',status:200,type:'meta',params:{id:metaPixelIds[0],ev:'PageView'}})
  return {
    url, finalUrl, title: titleM?.[1]?.trim()||''  , timestamp: new Date().toISOString(),
    hasGTM: gtmMatch.length>0, gtmContainers: gtmMatch, ga4Ids: ga4Match, googleAdsIds: awMatch, hasGtag: h.includes('gtag('),
    dataLayerEvents: [], consentDefault: hasCD&&allFour?{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:wfu}:null,
    consentUpdate: null, metaPixelIds, fbqEvents: [], hasCAPI: false, cmpDetected, hasTCF: h.includes('__tcfapi'),
    cookieBannerVisible: !!cmpDetected, networkRequests,
    cookies: ga4Match.length?[{name:'_ga',value:'GA1.1.xxx',category:'analytics'}]:[],
    forms: Array.from({length:formCount},(_,i)=>({id:`form_${i}`,action:'',hasEmail:h.includes('type="email"'),hasTel:h.includes('type="tel"'),inputCount:3})),
    ctaElements: (html.match(/<button[^>]*>/gi)||[]).length, emailInputs: (html.match(/type=['"]email['"]/gi)||[]).length,
    telInputs: (html.match(/type=['"]tel['"]/gi)||[]).length, iframes: [], jsErrors: [],
    pageType: path==='/'?'home':path.includes('landing')?'landing':'other',
    hasThankYouPage: path.includes('thank')||path.includes('merci'), _source: 'fetch',
  }
}
