import type { ScanRawData, CheckResult, AuditScore, PlatformData } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function ok(id: string, label: string, category: CheckResult['category'], tags: string[], finding: string, details: string[], actions: string[]): CheckResult {
  return { id, label, status: 'ok', finding, details, actions, category, tags, impact: 'low' }
}
function warn(id: string, label: string, category: CheckResult['category'], tags: string[], finding: string, details: string[], actions: string[], impact: CheckResult['impact'] = 'medium'): CheckResult {
  return { id, label, status: 'warn', finding, details, actions, category, tags, impact }
}
function fail(id: string, label: string, category: CheckResult['category'], tags: string[], finding: string, details: string[], actions: string[], impact: CheckResult['impact'] = 'high'): CheckResult {
  return { id, label, status: 'fail', finding, details, actions, category, tags, impact }
}
function manual(id: string, label: string, category: CheckResult['category'], tags: string[], finding: string, details: string[], actions: string[]): CheckResult {
  return { id, label, status: 'manual', finding, details, actions, category, tags, impact: 'medium' }
}

// ─── Main analyzer ────────────────────────────────────────────────────────────
export function analyzeTrackingData(raw: ScanRawData, platform?: PlatformData): CheckResult[] {
  const results: CheckResult[] = []

  // ══ 1. CONSENT & CMP ══════════════════════════════════════════════════════
  // CMP présente
  if (raw.cmpDetected) {
    results.push(ok('c1', `CMP détectée : ${raw.cmpDetected}`, 'consent', ['Privacy', 'CMP'],
      `${raw.cmpDetected} identifié et actif sur la page.`,
      [`CMP : ${raw.cmpDetected}`, `Bannière visible : ${raw.cookieBannerVisible ? 'oui' : 'non (déjà accepté ou cachée)'}`, `TCF v2.2 : ${raw.hasTCF ? 'actif ✓' : 'non détecté'}`],
      ['Vérifier que la liste des cookies dans la bannière est à jour', 'Tester en navigation privée pour voir la bannière']
    ))
  } else {
    results.push(fail('c1', 'Aucune CMP détectée', 'consent', ['Privacy', 'CMP'],
      'Aucun gestionnaire de consentement (CMP) détecté sur la page. Non-conformité RGPD probable.',
      ['Aucune CMP reconnue dans le DOM', 'window.__tcfapi absent', 'Aucun élément de bannière cookie trouvé'],
      ['Installer une CMP certifiée Google : CookieYes, Didomi, OneTrust, Axeptio, Cookiebot', 'Configurer l\'intégration avec Consent Mode v2', 'Catégoriser correctement tous les cookies du site'],
      'critical'
    ))
  }

  // TCF v2.2
  if (raw.hasTCF) {
    results.push(ok('c2', 'TCF v2.2 actif', 'consent', ['Privacy', 'TCF'],
      'Framework TCF v2.2 (IAB) détecté. Signaux de consentement transmis aux partenaires IAB.',
      ['window.__tcfapi disponible', 'Conformité TCF v2.2 assurée'],
      ['Vérifier que la liste des vendeurs TCF est à jour dans la CMP']
    ))
  } else {
    results.push(warn('c2', 'TCF v2.2 non détecté', 'consent', ['Privacy', 'TCF'],
      `${raw.cmpDetected ? raw.cmpDetected + ' sans TCF v2.2' : 'Pas de TCF v2.2 actif'}. Important si la cible inclut des utilisateurs UE.`,
      ['window.__tcfapi : non défini', 'Les signaux IAB ne sont pas transmis aux partenaires'],
      ['Si cible UE/UK : activer TCF v2.2 dans votre CMP', 'Si cible MENA/UAE uniquement : non obligatoire mais recommandé'],
      'medium'
    ))
  }

  // Consent Mode v2
  const hasConsentDefault = !!raw.consentDefault
  const hasAllParams = raw.consentDefault &&
    raw.consentDefault.analytics_storage !== undefined &&
    raw.consentDefault.ad_storage !== undefined &&
    raw.consentDefault.ad_user_data !== undefined &&
    raw.consentDefault.ad_personalization !== undefined

  if (hasConsentDefault && hasAllParams) {
    const isAdvanced = !!(raw.consentDefault?.wait_for_update && raw.consentDefault.wait_for_update > 0)
    results.push(ok('c3', `Consent Mode v2 ${isAdvanced ? '(Mode Avancé)' : '(Mode Basique)'} configuré`, 'consent', ['Google', 'Consent Mode'],
      `Les 4 paramètres obligatoires sont définis${isAdvanced ? ` avec wait_for_update: ${raw.consentDefault?.wait_for_update}ms` : ''}.`,
      [
        `analytics_storage: ${raw.consentDefault?.analytics_storage}`,
        `ad_storage: ${raw.consentDefault?.ad_storage}`,
        `ad_user_data: ${raw.consentDefault?.ad_user_data}`,
        `ad_personalization: ${raw.consentDefault?.ad_personalization}`,
        isAdvanced ? `Mode Avancé actif — modélisation des conversions activée` : 'Mode Basique — tags bloqués avant consentement',
      ],
      isAdvanced ? ['Mode Avancé optimal. Surveiller le rapport de modélisation dans Google Ads.'] :
        ['Envisager le passage au Mode Avancé pour activer la modélisation des conversions manquantes']
    ))
  } else if (hasConsentDefault) {
    results.push(warn('c3', 'Consent Mode v2 — paramètres incomplets', 'consent', ['Google', 'Consent Mode'],
      'consent/default présent mais tous les 4 paramètres obligatoires ne sont pas définis.',
      ['Les 4 paramètres requis : analytics_storage, ad_storage, ad_user_data, ad_personalization'],
      ['Ajouter les paramètres manquants dans la configuration de votre CMP ou template GTM', 'Référencer le guide Consent Mode v2 Google'],
      'high'
    ))
  } else {
    results.push(fail('c3', 'Consent Mode v2 absent', 'consent', ['Google', 'Consent Mode'],
      'Aucun signal consent/default dans le dataLayer. Les tags Google ne sont pas conformes Consent Mode v2.',
      ['window.dataLayer : aucun appel gtag("consent","default") détecté', 'Depuis mars 2024, le Consent Mode v2 est obligatoire pour les utilisateurs UE'],
      ['Configurer Consent Mode v2 dans GTM via un template CMP certifié Google', 'Ou implémenter via : gtag("consent","default",{analytics_storage:"denied",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",wait_for_update:2000})'],
      'critical'
    ))
  }

  // Consent update
  if (raw.consentUpdate) {
    results.push(ok('c4', 'Mise à jour du consentement transmise', 'consent', ['Google', 'Consent Mode'],
      'consent/update déclenché après interaction avec la CMP.',
      [`ad_storage: ${raw.consentUpdate.ad_storage}`, `analytics_storage: ${raw.consentUpdate.analytics_storage}`],
      ['Vérifier que la mise à jour se déclenche immédiatement après le choix de l\'utilisateur']
    ))
  }

  // ══ 2. TAGGAGE DE BASE ════════════════════════════════════════════════════
  // GTM
  if (raw.hasGTM && raw.gtmContainers.some(c => c.startsWith('GTM-'))) {
    const gtmId = raw.gtmContainers.find(c => c.startsWith('GTM-'))
    results.push(ok('t1', `GTM ${gtmId} actif`, 'tag_base', ['Google', 'GTM'],
      `Conteneur GTM ${gtmId} chargé et opérationnel.`,
      [`Container : ${gtmId}`, `Containers détectés : ${raw.gtmContainers.filter(c => c.startsWith('GTM-')).join(', ')}`],
      ['Vérifier que le noscript GTM est présent juste après la balise <body>', 'Surveiller les versions publiées GTM']
    ))
  } else if (raw.hasGtag && !raw.hasGTM) {
    results.push(warn('t1', 'gtag.js sans GTM détecté', 'tag_base', ['Google', 'GTM'],
      'gtag.js utilisé sans GTM. Moins flexible pour gérer les tags.',
      ['window.gtag disponible mais pas de conteneur GTM', 'La gestion des tags est directement dans le code'],
      ['Envisager la migration vers GTM pour une gestion centralisée des tags', 'Si gtag intentionnel, vérifier la position dans le <head>'],
      'low'
    ))
  } else {
    results.push(fail('t1', 'Aucun tag manager Google détecté', 'tag_base', ['Google', 'GTM'],
      'Ni GTM ni gtag.js détecté sur la page. Aucun tracking Google en place.',
      ['window.google_tag_manager : non défini', 'window.gtag : non défini'],
      ['Installer Google Tag Manager : tagmanager.google.com', 'Ajouter le snippet GTM dans le <head> et le noscript après <body>', 'Ou implémenter gtag.js directement si GTM n\'est pas souhaité'],
      'critical'
    ))
  }

  // GA4
  if (raw.ga4Ids.length > 0) {
    results.push(ok('t2', `GA4 ${raw.ga4Ids[0]} configuré`, 'tag_base', ['GA4', 'Google'],
      `Propriété GA4 ${raw.ga4Ids[0]} liée au conteneur GTM.`,
      [`Measurement ID : ${raw.ga4Ids[0]}`, `IDs détectés : ${raw.ga4Ids.join(', ')}`],
      ['Confirmer les hits /g/collect dans Network (sans AdBlocker)', 'Vérifier que le tag GA4 se déclenche sur All Pages dans GTM']
    ))
  } else {
    const ga4InNetwork = raw.networkRequests.some(r => r.type === 'ga4')
    if (ga4InNetwork) {
      results.push(ok('t2', 'GA4 détecté (via réseau)', 'tag_base', ['GA4', 'Google'],
        'Hits GA4 détectés dans le réseau. Measurement ID à confirmer.',
        ['Requêtes /g/collect détectées dans le réseau'],
        ['Vérifier le Measurement ID dans GTM']
      ))
    } else {
      results.push(fail('t2', 'GA4 non détecté', 'tag_base', ['GA4', 'Google'],
        'Aucun Measurement ID GA4 ni requête /g/collect détecté.',
        ['Aucun G-XXXXXXXX dans les containers GTM', 'Aucune requête google-analytics.com dans le réseau'],
        ['Créer une propriété GA4 dans analytics.google.com', 'Ajouter un tag GA4 Configuration dans GTM avec le Measurement ID', 'Ou implémenter directement via gtag("config","G-XXXXXXXX")'],
        'critical'
      ))
    }
  }

  // Meta Pixel
  if (raw.metaPixelIds.length > 0) {
    const doublePixel = raw.networkRequests.filter(r => r.type === 'meta' && r.url.includes('ev=PageView')).length > 1
    if (doublePixel) {
      results.push(warn('t3', `Pixel Meta ${raw.metaPixelIds[0]} — double PageView détecté`, 'tag_base', ['Meta'],
        `Pixel ${raw.metaPixelIds[0]} actif mais PageView envoyé 2x. Double-comptabilisation probable.`,
        [`Pixel ID : ${raw.metaPixelIds.join(', ')}`, 'PageView détecté 2 fois dans le même chargement de page', 'Cause probable : pixel natif fbq() + template GTM simultanément'],
        ['Supprimer le pixel Meta natif du HTML et conserver uniquement le template GTM', 'Ou supprimer le template GTM et conserver le pixel HTML natif', 'Vérifier : Network → filtre facebook.com/tr → 1 seul hit PageView attendu'],
        'high'
      ))
    } else {
      results.push(ok('t3', `Pixel Meta ${raw.metaPixelIds[0]} actif`, 'tag_base', ['Meta'],
        `Pixel ${raw.metaPixelIds[0]} chargé et opérationnel.`,
        [`Pixel ID : ${raw.metaPixelIds.join(', ')}`, `CAPI connectée : ${raw.hasCAPI ? 'oui' : 'non'}`],
        ['Activer Advanced Matching dans le Gestionnaire d\'événements Meta', raw.hasCAPI ? 'CAPI connectée ✓' : 'Connecter la Conversions API pour récupérer les conversions Safari/iOS']
      ))
    }
  } else {
    results.push(warn('t3', 'Pixel Meta non détecté', 'tag_base', ['Meta'],
      'Aucun pixel Meta (facebook.com/tr, connect.facebook.net) détecté.',
      ['Aucune requête Meta dans le réseau', 'Aucun fbq() détecté dans le code'],
      ['Si campagnes Meta : installer le pixel via GTM (template Meta Pixel official)', 'Activer simultanément la Conversions API pour un tracking complet'],
      'medium'
    ))
  }

  // Conversion Linker
  const hasGclCookies = raw.cookies.some(c => c.name.startsWith('_gcl'))
  const hasConvLinker = raw.networkRequests.some(r => r.url.includes('pagead/landing'))
  if (hasGclCookies || hasConvLinker) {
    results.push(ok('t4', 'Conversion Linker actif (cookies _gcl_*)', 'tag_base', ['Google Ads', 'GTM'],
      'Cookies _gcl_* détectés. Le Conversion Linker capture correctement le GCLID.',
      [`Cookies : ${raw.cookies.filter(c => c.name.startsWith('_gcl')).map(c => c.name).join(', ')}`],
      ['Vérifier périodiquement que le cookie _gcl_aw est présent sur les pages post-clic Google Ads']
    ))
  } else {
    results.push(warn('t4', 'Conversion Linker — non confirmé', 'tag_base', ['Google Ads', 'GTM'],
      'Cookies _gcl_* non détectés. Le Conversion Linker n\'est peut-être pas configuré ou la visite vient d\'une navigation directe.',
      ['Aucun cookie _gcl_aw, _gcl_au, _gcl_dc détecté', 'Impossible de confirmer sans GCLID dans l\'URL'],
      ['Vérifier dans GTM qu\'un tag Conversion Linker est déclenché sur All Pages', 'Tester depuis un clic sur une annonce Google Ads réelle', 'DevTools → Application → Cookies → chercher _gcl_aw'],
      'medium'
    ))
  }

  // ══ 3. GA4 ════════════════════════════════════════════════════════════════
  const customEvents = raw.dataLayerEvents.filter(e => e.event && !e.event.startsWith('gtm.') && e.event !== 'cookie_consent_update')
  if (customEvents.length > 0) {
    results.push(ok('g1', `${customEvents.length} événement(s) custom dans le dataLayer`, 'ga4', ['GA4', 'Events'],
      `Événements détectés : ${customEvents.map(e => e.event).join(', ')}.`,
      customEvents.map(e => `Event : ${e.event} — clés : ${e.keys.slice(0,5).join(', ')}`),
      ['Vérifier que ces événements sont bien reçus dans GA4 → Temps réel', 'Marquer les événements business comme conversions dans GA4']
    ))
  } else {
    results.push(warn('g1', 'Aucun événement custom dans le dataLayer', 'ga4', ['GA4', 'Events'],
      'Seuls les événements GTM système détectés. Aucun événement business custom (clic CTA, form_submit, generate_lead).',
      ['dataLayer : seuls gtm.js, gtm.dom, gtm.load, cookie_consent_update', 'Aucun generate_lead, form_submit, cta_click détecté'],
      ['Identifier les actions clés de la page et créer des déclencheurs GTM', 'Pusher les événements : dataLayer.push({event:"generate_lead", ...})', 'Ajouter au minimum : page_view (automatique), cta_click, form_submit'],
      'high'
    ))
  }

  // UTM params
  const urlParams = new URLSearchParams(new URL(raw.finalUrl).search)
  const hasUtm = urlParams.has('utm_source')
  const hasGclid = urlParams.has('gclid') || urlParams.has('wbraid') || urlParams.has('gbraid')
  if (hasUtm || hasGclid) {
    results.push(ok('g2', 'Paramètres UTM/GCLID présents dans l\'URL', 'ga4', ['GA4', 'Attribution'],
      `Attribution détectée : ${hasGclid ? 'GCLID Google Ads' : ''} ${hasUtm ? `UTM source: ${urlParams.get('utm_source')}` : ''}.`,
      [
        hasUtm ? `utm_source: ${urlParams.get('utm_source')}, utm_medium: ${urlParams.get('utm_medium')}, utm_campaign: ${urlParams.get('utm_campaign')}` : '',
        hasGclid ? `GCLID présent — attribution Google Ads active` : '',
      ].filter(Boolean),
      ['Vérifier que les UTMs sont transmis dans GA4 → Acquisition → Source/Medium']
    ))
  } else {
    results.push(warn('g2', 'Aucun paramètre UTM/GCLID dans l\'URL', 'ga4', ['GA4', 'Attribution'],
      'Visite sans paramètres de tracking. Normal pour une navigation directe, à vérifier depuis les campagnes.',
      ['URL analysée sans paramètres UTM ni GCLID', 'Attribution de la visite : direct ou (none)'],
      ['Tester depuis un clic sur vos annonces payantes', 'Vérifier que les URLs de destination dans vos campagnes contiennent bien les UTMs', 'Activer l\'auto-tagging dans Google Ads'],
      'low'
    ))
  }

  // Forms & micro-signals
  if (raw.forms.length > 0 || raw.emailInputs > 0 || raw.ctaElements > 0) {
    const formsTracked = customEvents.some(e => ['form_submit', 'generate_lead', 'contact', 'signup'].includes(e.event || ''))
    if (formsTracked) {
      results.push(ok('g3', 'Formulaires et CTAs — tracking détecté', 'ga4', ['GA4', 'Conversions', 'Micro-signaux'],
        `${raw.forms.length} formulaire(s) et ${raw.ctaElements} CTA(s) détectés avec un event de conversion associé.`,
        [`Formulaires : ${raw.forms.length}`, `Champs email : ${raw.emailInputs}`, `CTAs : ${raw.ctaElements}`, `Événement de conversion : ${customEvents.find(e => ['form_submit','generate_lead'].includes(e.event||''))?.event}`],
        ['Vérifier que tous les formulaires sont couverts', 'Ajouter le tracking des micro-signaux (scroll, time on page, clic vidéo)']
      ))
    } else {
      results.push(fail('g3', 'Formulaires et CTAs — tracking absent', 'ga4', ['GA4', 'Conversions', 'Micro-signaux'],
        `${raw.forms.length} formulaire(s) et ${raw.ctaElements} CTA(s) détectés mais AUCUN événement de conversion associé.`,
        [`Formulaires détectés : ${raw.forms.length}`, `Champs email : ${raw.emailInputs}`, `CTAs : ${raw.ctaElements}`, 'Aucun event form_submit ou generate_lead dans le dataLayer'],
        ['GTM → Déclencheurs → Clic sur éléments → sélectionner les boutons CTA', 'Ajouter : dataLayer.push({event:"generate_lead", form_id:"...", ...}) sur soumission', 'Tracker aussi les micro-signaux : scroll 50%, temps sur page > 60s, clic vidéo'],
        'critical'
      ))
    }
  } else {
    results.push(warn('g3', 'Aucun formulaire HTML natif détecté', 'ga4', ['GA4', 'Conversions'],
      'Aucun <form> HTML dans le DOM. Formulaire probablement un embed externe (Typeform, HubSpot, etc.).',
      ['document.querySelectorAll("form").length = 0', 'Formulaire potentiellement dans un iFrame ou chargé dynamiquement'],
      ['Identifier l\'outil de formulaire (Typeform, HubSpot, Cal.com…)', 'Configurer le tracking via webhook ou intégration native de l\'outil', 'Déclencher dataLayer.push() depuis le callback onSubmit de l\'outil'],
      'medium'
    ))
  }

  // Mesure du parcours (enhanced measurement)
  const hasScrollTracking = customEvents.some(e => e.event === 'scroll')
  const hasClickTracking = customEvents.some(e => ['click', 'cta_click', 'outbound_click'].includes(e.event || ''))
  if (!hasScrollTracking && !hasClickTracking) {
    results.push(warn('g4', 'Micro-signaux — scroll et clics non trackés', 'ga4', ['GA4', 'Micro-signaux'],
      'Aucun tracking de scroll ni de clic détecté. Les signaux comportementaux sont manquants.',
      ['Aucun événement scroll dans le dataLayer', 'Aucun événement clic CTA détecté'],
      ['GA4 → Admin → Flux de données → Enhanced Measurement → Activer scrolls et clics sortants', 'GTM → Tag GA4 Configuration → Enhanced Measurement → cocher toutes les options', 'Ajouter des triggers manuels pour les clics CTA importants'],
      'medium'
    ))
  }

  // ══ 4. GOOGLE ADS ════════════════════════════════════════════════════════
  if (raw.googleAdsIds.length > 0 || raw.networkRequests.some(r => r.type === 'google_ads')) {
    results.push(ok('ga1', `Google Ads ${raw.googleAdsIds[0] || 'AW-?'} détecté`, 'google_ads', ['Google Ads'],
      'Tag Google Ads détecté sur la page.',
      [`IDs : ${raw.googleAdsIds.join(', ') || 'détecté via réseau'}`],
      ['Vérifier que le tag de conversion est sur la page de confirmation uniquement', 'Activer Enhanced Conversions dans Google Ads']
    ))
  } else {
    results.push(warn('ga1', 'Tag Google Ads non détecté sur cette page', 'google_ads', ['Google Ads'],
      'Aucun container AW-* dans GTM ni requête pagead/conversion. Normal si le tag est sur la page de confirmation uniquement.',
      ['Aucun AW-* dans window.google_tag_manager', 'Aucune requête pagead/conversion dans le réseau'],
      ['Vérifier sur la page de confirmation que le tag Google Ads Conversion est présent', 'GTM → Tag Conversion Google Ads → déclencheur sur URL de confirmation'],
      'medium'
    ))
  }

  // Enhanced Conversions — détection via user_data
  const hasUserData = raw.dataLayerEvents.some(e => e.keys.includes('user_data') || e.preview.includes('email'))
  if (hasUserData) {
    results.push(ok('ga2', 'Données first-party (user_data) détectées', 'google_ads', ['Google Ads', 'Enhanced Conversions'],
      'Un objet user_data avec données client a été trouvé dans le dataLayer.',
      ['user_data détecté dans le dataLayer', 'Les données seront hashées SHA256 par Google automatiquement'],
      ['Vérifier dans Google Ads → Diagnostic que les données sont correctement traitées', 'S\'assurer que l\'email est en clair (Google hashe automatiquement)']
    ))
  } else {
    results.push(manual('ga2', 'Enhanced Conversions — vérifier sur page de confirmation', 'google_ads', ['Google Ads', 'Enhanced Conversions'],
      'Les données user_data doivent être envoyées sur la page de confirmation, pas sur la LP d\'entrée.',
      ['La page analysée est probablement une LP d\'entrée sans soumission de formulaire', 'user_data à envoyer lors de la conversion : email, téléphone'],
      ['Page de confirmation : dataLayer.push({event:"generate_lead", user_data:{email:userEmail, phone_number:userPhone}})', 'GTM → Variable user_data → mapper sur les champs du formulaire', 'Google Ads → Objectifs → Suivi avancé des conversions pour le Web → Activer']
    ))
  }

  // ══ 5. META ══════════════════════════════════════════════════════════════
  if (raw.metaPixelIds.length > 0) {
    // Advanced Matching
    const metaNetworkReqs = raw.networkRequests.filter(r => r.type === 'meta')
    const hasEm = metaNetworkReqs.some(r => r.params?.em || r.url.includes('em='))
    const hasPh = metaNetworkReqs.some(r => r.params?.ph || r.url.includes('ph='))
    const hasHme = metaNetworkReqs.some(r => r.url.includes('hme='))

    if (hasEm || hasPh) {
      results.push(ok('m1', 'Advanced Matching — em/ph détectés', 'meta', ['Meta', 'Advanced Matching'],
        'Données de correspondance avancée (email et/ou téléphone hashés) transmises à Meta.',
        [`Email hashé (em) : ${hasEm ? '✓' : '✗'}`, `Téléphone hashé (ph) : ${hasPh ? '✓' : '✗'}`],
        ['Vérifier le match rate dans Meta Events Manager → Diagnostics']
      ))
    } else if (hasHme) {
      results.push(warn('m1', 'Advanced Matching — hash email annonceur présent (pas données utilisateur)', 'meta', ['Meta', 'Advanced Matching'],
        'hme= (hash email annonceur) détecté dans la config Meta. Advanced Matching utilisateur à vérifier sur page de conversion.',
        ['hme= présent dans signals/config — email annonceur configuré', 'Paramètres em/ph utilisateur non visibles (normal sans soumission formulaire)'],
        ['Activer Advanced Matching dans Meta Events Manager → pixel → Paramètres', 'Sélectionner : email, téléphone, prénom, nom', 'Vérifier lors d\'une soumission de formulaire que em et ph sont transmis']
      ))
    } else {
      results.push(fail('m1', 'Advanced Matching — non configuré', 'meta', ['Meta', 'Advanced Matching'],
        'Aucun paramètre de correspondance avancée détecté dans les hits Meta.',
        ['Paramètres em et ph absents de toutes les requêtes Meta', 'Le match rate sera faible sans Advanced Matching'],
        ['Meta Business Suite → Gestionnaire d\'événements → pixel → Paramètres → Correspondance automatique avancée → Activer', 'Sélectionner au minimum : email, numéro de téléphone'],
        'high'
      ))
    }

    // CAPI
    if (raw.hasCAPI) {
      results.push(ok('m2', 'Conversions API (CAPI) connectée', 'meta', ['Meta', 'CAPI'],
        'La Conversions API côté serveur est active. Les conversions Safari/iOS sont récupérées.',
        ['API_active détecté dans les paramètres des hits Meta'],
        ['Vérifier la déduplication entre pixel navigateur et CAPI (même event_id)', 'Surveiller le Quality Score dans Meta Events Manager']
      ))
    } else {
      results.push(fail('m2', 'Conversions API (CAPI) non connectée', 'meta', ['Meta', 'CAPI'],
        'cdl=API_unavailable dans les hits Meta. Les conversions iOS Safari et AdBlocker ne sont pas récupérées.',
        ['Paramètre cdl=API_unavailable confirmé dans les requêtes facebook.com/tr', 'Impact estimé : 20–40% de conversions perdues (marché mobile)'],
        ['Meta Business Suite → Gestionnaire d\'événements → pixel → Paramètres → Conversions API → Configurer', 'Option 1 : intégration partenaire (si Shopify, WordPress, etc.)', 'Option 2 : SDK Node.js Meta avec hachage SHA256 et event_id pour déduplication'],
        'high'
      ))
    }

    // Événements Meta
    const metaEvents = metaNetworkReqs.map(r => r.params?.ev || r.url.match(/ev=([^&]+)/)?.[1]).filter(Boolean)
    const uniqueEvents = [...new Set(metaEvents)]
    if (uniqueEvents.length > 0) {
      results.push(ok('m3', `Événements Meta détectés : ${uniqueEvents.join(', ')}`, 'meta', ['Meta', 'Events'],
        `${uniqueEvents.length} événement(s) Meta confirmé(s) dans le réseau.`,
        uniqueEvents.map(e => `ev=${e}`),
        ['Vérifier que l\'événement Lead ou Purchase est déclenché sur la page de confirmation', 'Configurer les événements de valeur pour l\'optimisation des campagnes']
      ))
    }
  }

  // ══ 6. PERFORMANCE & QUALITÉ ═════════════════════════════════════════════
  // Erreurs JS
  if (raw.jsErrors.length > 0) {
    results.push(fail('q1', `${raw.jsErrors.length} erreur(s) JavaScript détectée(s)`, 'qa', ['QA', 'Performance'],
      `Des erreurs JS peuvent perturber le tracking. Erreurs : ${raw.jsErrors.slice(0,2).join('; ')}`,
      raw.jsErrors.slice(0, 5),
      ['Corriger les erreurs JS qui peuvent bloquer l\'exécution des tags de tracking', 'Tester dans GTM Preview mode pour isoler les erreurs liées au tracking'],
      'medium'
    ))
  } else {
    results.push(ok('q1', 'Aucune erreur JavaScript détectée', 'qa', ['QA'],
      'Console JS propre — aucune erreur susceptible de perturber le tracking.',
      ['Console vide au moment du scan'],
      ['Tester en navigation privée pour capturer les erreurs du vrai premier chargement']
    ))
  }

  // Double comptabilisation
  const ga4Hits = raw.networkRequests.filter(r => r.type === 'ga4')
  const pageViews = ga4Hits.filter(r => r.params?.en === 'page_view')
  if (pageViews.length > 1) {
    results.push(fail('q2', `Double page_view GA4 détecté (${pageViews.length}x)`, 'qa', ['GA4', 'QA'],
      `${pageViews.length} hits page_view GA4 dans le même chargement. Données GA4 faussées.`,
      ['Cause probable : gtag.js en dur ET tag GTM GA4 simultanément', `${pageViews.length} requêtes /g/collect avec en=page_view`],
      ['Supprimer le snippet gtag.js du HTML et utiliser uniquement GTM', 'Ou supprimer le tag GTM GA4 Configuration et utiliser uniquement gtag.js'],
      'high'
    ))
  }

  // Platform data checks (si connecté)
  if (platform?.ga4) {
    const ga4 = platform.ga4
    if (ga4.conversionEvents.length === 0) {
      results.push(fail('p1', 'Aucune conversion configurée dans GA4', 'ga4', ['GA4', 'Platform'],
        `Propriété GA4 ${ga4.measurementId} connectée : 0 événement de conversion défini.`,
        [`Propriété : ${ga4.propertyName}`, `Streams : ${ga4.dataStreams.map(s => s.measurementId).join(', ')}`],
        ['GA4 → Admin → Données d\'affichage → Conversions → marquer les événements clés comme conversions'],
        'critical'
      ))
    } else {
      results.push(ok('p1', `${ga4.conversionEvents.length} conversion(s) configurée(s) dans GA4`, 'ga4', ['GA4', 'Platform'],
        `Conversions actives : ${ga4.conversionEvents.filter(e => e.isActive).map(e => e.name).join(', ')}.`,
        ga4.conversionEvents.map(e => `${e.name} : ${e.isActive ? 'actif' : 'inactif'}`),
        ['Vérifier que toutes les actions business importantes sont marquées comme conversions']
      ))
    }

    if (!ga4.enhancedMeasurement.streamEnabled) {
      results.push(warn('p2', 'Enhanced Measurement GA4 non activé', 'ga4', ['GA4', 'Platform'],
        'Le Enhanced Measurement n\'est pas activé sur le flux de données GA4.',
        ['scrollsEnabled: ' + ga4.enhancedMeasurement.scrollsEnabled, 'outboundClicksEnabled: ' + ga4.enhancedMeasurement.outboundClicksEnabled],
        ['GA4 → Admin → Flux de données → Enhanced Measurement → Activer toutes les options pertinentes']
      ))
    }
  }

  if (platform?.googleAds) {
    const gads = platform.googleAds
    if (!gads.enhancedConversionsEnabled) {
      results.push(fail('p3', 'Enhanced Conversions non activé (Google Ads)', 'google_ads', ['Google Ads', 'Platform'],
        `Compte Google Ads ${gads.customerName} : Enhanced Conversions désactivé.`,
        [`Compte : ${gads.customerName} (${gads.customerId})`, 'Auto-tagging : ' + (gads.autoTaggingEnabled ? 'activé' : 'désactivé')],
        ['Google Ads → Objectifs → Suivi avancé des conversions pour le Web → Activer', 'Accepter les conditions d\'utilisation Enhanced Conversions'],
        'critical'
      ))
    }

    gads.conversionActions.forEach(ca => {
      if (!ca.enhancedConversionsEnabled) {
        results.push(warn(`p4_${ca.id}`, `Enhanced Conversions désactivé : ${ca.name}`, 'google_ads', ['Google Ads', 'Platform'],
          `L'action de conversion "${ca.name}" n'a pas Enhanced Conversions activé.`,
          [`Conversion : ${ca.name}`, `Statut : ${ca.status}`, `Type : ${ca.type}`],
          [`Google Ads → Objectifs → "${ca.name}" → Paramètres → Activer le suivi avancé`]
        ))
      }
    })
  }

  if (platform?.meta) {
    const meta = platform.meta
    if (!meta.advancedMatchingEnabled) {
      results.push(fail('p5', 'Advanced Matching désactivé (Meta)', 'meta', ['Meta', 'Platform'],
        `Pixel ${meta.pixelId} : Advanced Matching non activé dans le Gestionnaire d'événements.`,
        [`Pixel : ${meta.pixelName} (${meta.pixelId})`, `CAPI : ${meta.capiConnected ? 'connectée' : 'non connectée'}`],
        ['Meta Events Manager → pixel → Paramètres → Correspondance automatique avancée → Activer']
      ))
    }
    if (meta.matchRate !== undefined && meta.matchRate < 40) {
      results.push(warn('p6', `Taux de correspondance Meta faible : ${meta.matchRate}%`, 'meta', ['Meta', 'Platform'],
        `Match rate ${meta.matchRate}% (objectif > 60%). Des conversions ne peuvent pas être attribuées.`,
        [`Match rate actuel : ${meta.matchRate}%`, 'Objectif recommandé : > 60%'],
        ['Ajouter plus de paramètres de correspondance : email, téléphone, prénom, nom, ville', 'Activer la Conversions API pour améliorer le match rate']
      ))
    }
  }

  return results
}

// ─── Score calculator ─────────────────────────────────────────────────────────
export function calculateScore(checks: CheckResult[]): AuditScore {
  const ok = checks.filter(c => c.status === 'ok').length
  const warn = checks.filter(c => c.status === 'warn').length
  const fail = checks.filter(c => c.status === 'fail').length
  const manual = checks.filter(c => c.status === 'manual').length
  const total = checks.length

  // Weighted scoring
  const points = ok * 100 + warn * 50 + fail * 0 + manual * 60
  const maxPoints = total * 100
  const global = Math.round(points / maxPoints * 100)

  const byCategory = (cat: CheckResult['category']) => {
    const cats = checks.filter(c => c.category === cat)
    if (cats.length === 0) return 100
    const catOk = cats.filter(c => c.status === 'ok').length
    const catWarn = cats.filter(c => c.status === 'warn').length
    const catManual = cats.filter(c => c.status === 'manual').length
    return Math.round((catOk * 100 + catWarn * 50 + catManual * 60) / (cats.length * 100) * 100)
  }

  return {
    global,
    consent: byCategory('consent'),
    measurement: byCategory('ga4'),
    conversion: byCategory('google_ads'),
    privacy: byCategory('consent'),
    okCount: ok,
    warnCount: warn,
    failCount: fail,
    manualCount: manual,
    total,
  }
}
