// TrackAudit Collector — injecté dans la page cible
(function() {
  var targetOrigin = 'http://localhost:3000';
  var w = window;
  var dl = w.dataLayer || [];

  var gtmKeys = w.google_tag_manager ? Object.keys(w.google_tag_manager) : [];
  var metaPixelIds = [];

  try {
    var allHtml = document.documentElement.innerHTML;
    var pixelMatches = allHtml.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{10,})['"]?/g) || [];
    pixelMatches.forEach(function(m) {
      var id = m.match(/(\d{10,})/);
      if (id && !metaPixelIds.includes(id[1])) metaPixelIds.push(id[1]);
    });
    var configMatches = allHtml.match(/signals\/config\/(\d{10,})/g) || [];
    configMatches.forEach(function(m) {
      var id = m.replace('signals/config/', '');
      if (!metaPixelIds.includes(id)) metaPixelIds.push(id);
    });
  } catch(e) {}

  var cmp = null;
  if (typeof w.getCkyConsent !== 'undefined' || document.getElementById('cookieyes-banner')) cmp = 'CookieYes';
  else if (typeof w.OneTrust !== 'undefined') cmp = 'OneTrust';
  else if (typeof w.Didomi !== 'undefined') cmp = 'Didomi';
  else if (typeof w._axcb !== 'undefined') cmp = 'Axeptio';
  else if (typeof w.Cookiebot !== 'undefined') cmp = 'Cookiebot';
  else if (typeof w.tarteaucitron !== 'undefined') cmp = 'Tarteaucitron';
  else if (typeof w.UC_UI !== 'undefined') cmp = 'Usercentrics';

  var consentDefault = null, consentUpdate = null;
  dl.forEach(function(e) {
    if (Array.isArray(e) && e[0] === 'consent' && e[1] === 'default') consentDefault = e[2];
    if (Array.isArray(e) && e[0] === 'consent' && e[1] === 'update') consentUpdate = e[2];
  });

  var forms = Array.from(document.querySelectorAll('form')).map(function(f) {
    return {
      id: f.id || '', action: f.action || '',
      hasEmail: !!f.querySelector('input[type=email]'),
      hasTel: !!f.querySelector('input[type=tel]'),
      inputCount: f.querySelectorAll('input').length
    };
  });

  var customEvents = dl.filter(function(e) {
    return e && e.event && !e.event.startsWith('gtm.') && e.event !== 'cookie_consent_update';
  }).map(function(e) {
    return { event: e.event, keys: Object.keys(e), preview: JSON.stringify(e).slice(0, 100) };
  });

  var urlParams = new URLSearchParams(window.location.search);
  var allCookieNames = document.cookie.split(';').map(function(c) { return c.trim().split('=')[0]; }).filter(Boolean);

  var hasDoublePixel = (document.documentElement.innerHTML.match(/fbq\s*\(\s*['"]init['"]/g) || []).length > 1;

  var payload = {
    url: window.location.href,
    title: document.title,
    gtmContainers: gtmKeys.filter(function(k) { return k.startsWith('GTM-'); }),
    ga4Ids: gtmKeys.filter(function(k) { return k.startsWith('G-'); }),
    googleAdsIds: gtmKeys.filter(function(k) { return k.startsWith('AW-'); }),
    hasGTM: gtmKeys.some(function(k) { return k.startsWith('GTM-'); }),
    hasGtag: typeof w.gtag === 'function',
    metaPixelIds: metaPixelIds,
    hasFbq: typeof w.fbq === 'function',
    cmpDetected: cmp,
    hasTCF: typeof w.__tcfapi === 'function',
    consentDefault: consentDefault,
    consentUpdate: consentUpdate,
    dataLayerEvents: customEvents,
    forms: forms,
    ctaElements: document.querySelectorAll('button,[class*=cta],[class*=btn]').length,
    emailInputs: document.querySelectorAll('input[type=email]').length,
    telInputs: document.querySelectorAll('input[type=tel]').length,
    iframes: Array.from(document.querySelectorAll('iframe')).map(function(f) {
      return { src: f.src.slice(0, 200), hasTracking: f.src.includes('facebook') || f.src.includes('google') };
    }),
    hasDoublePixel: hasDoublePixel,
    hasUTM: urlParams.has('utm_source'),
    hasGCLID: urlParams.has('gclid'),
    cookies: allCookieNames,
    pageType: (function() {
      var p = window.location.pathname.toLowerCase();
      if (p === '/' || p === '/index.html') return 'home';
      if (p.includes('landing') || p.includes('/lp')) return 'landing';
      if (p.includes('checkout') || p.includes('cart')) return 'checkout';
      return 'other';
    })(),
    hasThankYouPage: window.location.pathname.toLowerCase().includes('thank') || window.location.pathname.toLowerCase().includes('merci'),
    jsErrors: [],
    hasCAPI: false,
    _source: 'browser',
    _collectedAt: new Date().toISOString()
  };

  // Envoyer vers l'API TrackAudit
  fetch(targetOrigin + '/api/inject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    mode: 'no-cors',
    body: JSON.stringify(payload)
  });

  // Aussi poster vers l'opener si disponible
  if (window.opener) {
    window.opener.postMessage({ type: 'trackaudit-scan', payload: payload }, targetOrigin);
  }

  // Afficher confirmation
  var div = document.createElement('div');
  div.innerHTML = '📡 TrackAudit : données collectées !';
  div.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#6366f1;color:white;padding:12px 20px;border-radius:10px;font-family:sans-serif;font-size:13px;font-weight:600;z-index:999999;box-shadow:0 4px 20px rgba(0,0,0,.3)';
  document.body.appendChild(div);
  setTimeout(function() { div.remove(); }, 3000);

  console.log('TrackAudit collected:', payload);
})();
