import type { ScanRawData, NetworkRequest, CookieInfo, FormInfo, IframeInfo, DataLayerEvent } from '@/types'

async function getBrowser() {
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    const puppeteer = await import('puppeteer-core')
    return puppeteer.default.launch({
      headless: true,
      executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  } else {
    const chromium = await import('@sparticuz/chromium')
    const puppeteer = await import('puppeteer-core')
    return puppeteer.default.launch({
      args: chromium.default.args,
      defaultViewport: chromium.default.defaultViewport,
      executablePath: await chromium.default.executablePath(),
      headless: chromium.default.headless as boolean | 'new',
    })
  }
}

export async function scanUrl(url: string): Promise<ScanRawData> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  const networkRequests: NetworkRequest[] = []

  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const u = req.url()
    let type: NetworkRequest['type'] = 'other'
    if (u.includes('google-analytics.com') || u.includes('/g/collect')) type = 'ga4'
    else if (u.includes('googletagmanager.com') || (u.includes('/gtm.js') && !u.includes('google'))) type = 'gtm'
    else if (u.includes('facebook.com/tr') || u.includes('connect.facebook.net')) type = 'meta'
    else if (u.includes('googleads') || u.includes('pagead')) type = 'google_ads'
    else if (u.includes('cookieyes') || u.includes('onetrust') || u.includes('didomi') || u.includes('axeptio') || u.includes('cookiebot')) type = 'cmp'

    if (type !== 'other') {
      const urlObj = new URL(u)
      const params: Record<string, string> = {}
      urlObj.searchParams.forEach((v, k) => { params[k] = v.slice(0, 200) })
      networkRequests.push({ url: u.slice(0, 300), method: req.method(), status: 0, type, params })
    }
    req.continue()
  })

  page.on('response', (res) => {
    const u = res.url().slice(0, 300)
    const found = networkRequests.find(r => r.url === u)
    if (found) found.status = res.status()
  })

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
  await new Promise(r => setTimeout(r, 2000))

  const extracted = await page.evaluate(() => {
    const w = window as any
    const dl: any[] = w.dataLayer || []

    const gtmContainers = w.google_tag_manager
      ? Object.keys(w.google_tag_manager).filter((k: string) =>
          k.startsWith('GTM-') || k.startsWith('G-') || k.startsWith('AW-'))
      : []

    // Detect GTM script URL (custom domain = sGTM proxy)
    let gtmScriptUrl: string | undefined
    document.querySelectorAll('script[src]').forEach((s: any) => {
      const src: string = s.src || ''
      if (src.includes('gtm.js') || src.includes('googletagmanager.com')) {
        gtmScriptUrl = src.slice(0, 200)
      }
    })

    const consentDefault = dl.find((e: any) => Array.isArray(e) && e[0] === 'consent' && e[1] === 'default')
    const consentUpdate  = dl.find((e: any) => Array.isArray(e) && e[0] === 'consent' && e[1] === 'update')

    const metaPixelIds: string[] = []
    document.querySelectorAll('script').forEach(s => {
      const m = s.textContent?.matchAll(/fbq\('init',\s*['"](\d+)['"]/g)
      if (m) for (const match of m) metaPixelIds.push(match[1])
    })

    let cmpDetected: string | null = null
    if ((w as any).OneTrust || document.getElementById('onetrust-banner-sdk')) cmpDetected = 'OneTrust'
    else if ((w as any).getCkyConsent || document.getElementById('cookieyes-banner')) cmpDetected = 'CookieYes'
    else if ((w as any).Didomi) cmpDetected = 'Didomi'
    else if ((w as any)._axcb) cmpDetected = 'Axeptio'
    else if ((w as any).Cookiebot) cmpDetected = 'Cookiebot'
    else if ((w as any).tarteaucitron) cmpDetected = 'Tarteaucitron'
    else if ((w as any).UC_UI) cmpDetected = 'Usercentrics'

    const forms: FormInfo[] = Array.from(document.querySelectorAll('form')).map(f => ({
      id: f.id || '',
      action: f.action || '',
      hasEmail: !!f.querySelector('input[type="email"]'),
      hasTel: !!f.querySelector('input[type="tel"]'),
      inputCount: f.querySelectorAll('input,select,textarea').length,
    }))

    const iframes: IframeInfo[] = Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src.slice(0, 200),
      hasTracking: f.src.includes('facebook') || f.src.includes('google') || f.src.includes('doubleclick'),
    }))

    const path = window.location.pathname.toLowerCase()
    let pageType: ScanRawData['pageType'] = 'other'
    if (path === '/' || path === '/index') pageType = 'home'
    else if (path.includes('landing') || path.includes('/lp')) pageType = 'landing'
    else if (path.includes('checkout') || path.includes('cart') || path.includes('panier')) pageType = 'checkout'
    else if (path.includes('product') || path.includes('produit')) pageType = 'product'
    else if (path.includes('blog') || path.includes('article')) pageType = 'blog'

    return {
      title: document.title,
      finalUrl: window.location.href,
      hasGTM: !!(w.google_tag_manager),
      gtmContainers,
      gtmScriptUrl,
      ga4Ids: gtmContainers.filter((k: string) => k.startsWith('G-')),
      googleAdsIds: gtmContainers.filter((k: string) => k.startsWith('AW-')),
      hasGtag: typeof w.gtag === 'function',
      dataLayerEvents: dl.map((e: any) => ({ event: e.event, keys: Object.keys(e), preview: JSON.stringify(e).slice(0, 150) })),
      consentDefault: consentDefault ? consentDefault[2] : null,
      consentUpdate: consentUpdate ? consentUpdate[2] : null,
      metaPixelIds: [...new Set(metaPixelIds)],
      fbqEvents: [] as string[],
      cmpDetected,
      hasTCF: typeof w.__tcfapi === 'function',
      cookieBannerVisible: !!(document.querySelector('[class*="cookie-banner"],[class*="cky-consent-container"]:not(.cky-hide)')),
      forms,
      ctaElements: document.querySelectorAll('[class*="cta"],button[class*="btn"],a[class*="btn"]').length,
      emailInputs: document.querySelectorAll('input[type="email"]').length,
      telInputs: document.querySelectorAll('input[type="tel"]').length,
      iframes,
      jsErrors: [] as string[],
      pageType,
      hasThankYouPage: window.location.pathname.includes('thank') || window.location.pathname.includes('merci'),
    }
  })

  let cookies: CookieInfo[] = []
  try {
    const client = await (page.target() as any).createCDPSession()
    const { cookies: raw } = await client.send('Network.getAllCookies')
    cookies = (raw as any[]).map(c => {
      let category: CookieInfo['category'] = 'other'
      if (c.name.startsWith('_ga') || c.name.startsWith('_gid')) category = 'analytics'
      else if (c.name.startsWith('_gcl') || c.name.startsWith('_fbp') || c.name.startsWith('_fbc')) category = 'advertising'
      else if (c.name.toLowerCase().includes('consent') || c.name.toLowerCase().includes('cookie')) category = 'cmp'
      return { name: c.name, value: c.value.slice(0, 100), category }
    })
  } catch {}

  await browser.close()

  return {
    url,
    finalUrl: extracted.finalUrl,
    title: extracted.title,
    timestamp: new Date().toISOString(),
    hasGTM: extracted.hasGTM,
    gtmContainers: extracted.gtmContainers,
    gtmScriptUrl: extracted.gtmScriptUrl,
    ga4Ids: extracted.ga4Ids,
    googleAdsIds: extracted.googleAdsIds,
    hasGtag: extracted.hasGtag,
    dataLayerEvents: extracted.dataLayerEvents,
    consentDefault: extracted.consentDefault,
    consentUpdate: extracted.consentUpdate,
    metaPixelIds: extracted.metaPixelIds,
    fbqEvents: extracted.fbqEvents,
    // CAPI is server-to-server — can't be detected from browser. Field kept for compatibility.
    hasCAPI: false,
    cmpDetected: extracted.cmpDetected,
    hasTCF: extracted.hasTCF,
    cookieBannerVisible: extracted.cookieBannerVisible,
    networkRequests,
    cookies,
    forms: extracted.forms,
    ctaElements: extracted.ctaElements,
    emailInputs: extracted.emailInputs,
    telInputs: extracted.telInputs,
    iframes: extracted.iframes,
    jsErrors: extracted.jsErrors,
    pageType: extracted.pageType,
    hasThankYouPage: extracted.hasThankYouPage,
  }
}
