import type { ScanRawData, CheckResult, AuditScore, PlatformData } from '@/types'
import type { GTMData, GTMTag, GTMTrigger } from '@/lib/gtm'

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

// ─── GTM tag helpers ──────────────────────────────────────────────────────────
function getGA4EventTags(tags: GTMTag[]): GTMTag[] {
  return tags.filter(t =>
    t.type === 'gaawe' ||
    t.type === 'google_analytics_ga4_event' ||
    (t.name.toLowerCase().includes('event') && t.type === 'gaawc') ||
    (t.name.toLowerCase().includes('ga4') && t.name.toLowerCase().includes('event'))
  )
}

function hasScrollTrigger(triggers: GTMTrigger[]): boolean {
  return triggers.some(t =>
    t.type === 'SCROLL_DEPTH' ||
    t.name.toLowerCase().includes('scroll')
  )
}

function hasFormTrigger(triggers: GTMTrigger[]): boolean {
  return triggers.some(t =>
    t.type === 'FORM_SUBMISSION' ||
    t.name.toLowerCase().includes('form') ||
    t.name.toLowerCase().includes('formulaire') ||
    t.name.toLowerCase().includes('submit') ||
    t.name.toLowerCase().includes('lead')
  )
}

function hasClickTrigger(triggers: GTMTrigger[]): boolean {
  return triggers.some(t =>
    t.type === 'CLICK' || t.type === 'LINK_CLICK' ||
    t.name.toLowerCase().includes('clic') ||
    t.name.toLowerCase().includes('click') ||
    t.name.toLowerCase().includes('cta') ||
    t.name.toLowerCase().includes('bouton') ||
    t.name.toLowerCase().includes('button')
  )
}

function metaTagHasAdvancedMatching(tag: GTMTag): boolean {
  return !!(tag.parameter?.some(p =>
    p.key?.toLowerCase().includes('email') ||
    p.key?.toLowerCase().includes('phone') ||
    p.key?.toLowerCase().includes('advanced') ||
    p.key?.toLowerCase().includes('matching') ||
    p.value?.toLowerCase().includes('email') ||
    p.value?.toLowerCase().includes('phone_number')
  ))
}

// ─── Main analyzer ────────────────────────────────────────────────────────────
export function analyzeTrackingData(raw: ScanRawData, platform?: PlatformData, gtmData?: GTMData): CheckResult[] {
  const results: CheckResult[] = []
  const hasGTM = !!gtmData

  // ─── 1. CONSENT ─────────────────────────────────────────────────────────────

  // c1 — Présence CMP (scan navigateur)
  if (raw.cmpDetected) {
    results.push(ok('c1', `CMP : ${raw.cmpDetected}`, 'consent', ['Privacy', 'CMP'],
      `${raw.cmpDetected} identifié et actif sur la page.`,
      [`CMP : ${raw.cmpDetected}`, `TCF v2.2 : ${raw.hasTCF ? 'actif' : 'non détecté'}`],
      ['Vérifier que la liste des cookies est à jour dans la bannière']))
  } else {
    results.push(fail('c1', 'Aucune CMP détectée', 'consent', ['Privacy', 'CMP'],
      'Aucun gestionnaire de consentement détecté. Non-conformité RGPD probable.',
      ['Aucune CMP reconnue dans le DOM'],
      ['Installer une CMP certifiée : CookieYes, Didomi, OneTrust, Axeptio, Cookiebot',
       'Configurer le template CMP dans GTM avec Consent Mode v2'], 'critical'))
  }

  // c2 — TCF v2.2
  if (raw.hasTCF) {
    results.push(ok('c2', 'TCF v2.2 actif', 'consent', ['Privacy', 'TCF'],
      'Framework TCF v2.2 détecté.', ['window.__tcfapi disponible'],
      ['Vérifier que la liste des vendeurs TCF est à jour']))
  } else {
    results.push(warn('c2', 'TCF v2.2 non détecté', 'consent', ['Privacy', 'TCF'],
      `${raw.cmpDetected || 'Aucune CMP'} sans TCF v2.2.`, ['window.__tcfapi non défini'],
      ['Pour cible UE : activer TCF v2.2 dans votre CMP']))
  }

  // c3 — Consent Mode v2 : SOURCE PRIMAIRE = GTM
  const hasCD    = !!raw.consentDefault
  const allParams = !!(raw.consentDefault &&
    raw.consentDefault.analytics_storage !== undefined &&
    raw.consentDefault.ad_storage !== undefined &&
    raw.consentDefault.ad_user_data !== undefined &&
    raw.consentDefault.ad_personalization !== undefined)
  const isAdvanced = !!(raw.consentDefault?.wait_for_update && raw.consentDefault.wait_for_update > 0)

  if (hasGTM) {
    const c = gtmData!.checks
    if (c.hasConsentModeTemplate && hasCD && allParams) {
      results.push(ok('c3', `Consent Mode v2 ${isAdvanced ? '(Mode Avancé)' : '(Mode Basique)'} — via GTM`, 'consent', ['GTM', 'Consent Mode'],
        `Template "${c.consentModeTemplateName}" dans GTM. 4 paramètres confirmés.`,
        [
          `Template GTM : ${c.consentModeTemplateName} (${c.consentModeTemplateType})`,
          `analytics_storage: ${raw.consentDefault?.analytics_storage}`,
          `ad_storage: ${raw.consentDefault?.ad_storage}`,
          `ad_user_data: ${raw.consentDefault?.ad_user_data}`,
          `ad_personalization: ${raw.consentDefault?.ad_personalization}`,
          isAdvanced ? 'Mode Avancé — modélisation activée' : 'Mode Basique',
        ],
        isAdvanced ? ['Configuration optimale.'] : ['Ajouter wait_for_update: 2000 pour activer le Mode Avancé']))
    } else if (c.hasConsentModeTemplate && !hasCD) {
      results.push(warn('c3', `Template "${c.consentModeTemplateName}" dans GTM — vérifier la priorité`, 'consent', ['GTM', 'Consent Mode'],
        `Template présent dans GTM mais les signaux consent/default n'ont pas été détectés lors du scan.`,
        [`Template : ${c.consentModeTemplateName}`, 'Cause possible : le tag ne se déclenche pas en premier'],
        ['Vérifier que le déclencheur est "All Pages" avec priorité ≥ 999',
         'GTM Preview > Tag Assistant : le template doit être le 1er tag déclenché'], 'medium'))
    } else if (c.hasConsentModeTemplate) {
      results.push(warn('c3', `Template "${c.consentModeTemplateName}" — 4 paramètres incomplets`, 'consent', ['GTM', 'Consent Mode'],
        'Template dans GTM mais les 4 paramètres requis ne sont pas tous définis.',
        ['analytics_storage, ad_storage, ad_user_data, ad_personalization requis'],
        [`Dans le template GTM : activer les 4 paramètres de consentement`], 'high'))
    } else {
      results.push(fail('c3', 'Consent Mode v2 absent — aucun template GTM', 'consent', ['GTM', 'Consent Mode'],
        `Aucun template CMP dans GTM et aucun signal consent/default.`,
        [`${gtmData!.tags.length} tags analysés — aucun template Consent Mode`],
        ['GTM > Galerie > installer template CMP (Cookiebot, Didomi, OneTrust, Axeptio, CookieYes)',
         'Paramètres requis : analytics_storage, ad_storage, ad_user_data, ad_personalization',
         'Déclencheur : All Pages, Priorité ≥ 999'], 'critical'))
    }
  } else {
    // Fallback scan navigateur
    if (hasCD && allParams) {
      results.push(ok('c3', `Consent Mode v2 ${isAdvanced ? '(Mode Avancé)' : '(Mode Basique)'}`, 'consent', ['Google', 'Consent Mode'],
        `4 paramètres définis. Connecter Google pour vérification via GTM.`,
        [`analytics_storage: ${raw.consentDefault?.analytics_storage}`,
         `ad_storage: ${raw.consentDefault?.ad_storage}`,
         `ad_user_data: ${raw.consentDefault?.ad_user_data}`,
         `ad_personalization: ${raw.consentDefault?.ad_personalization}`],
        ['Connecter Google pour un audit complet du conteneur GTM']))
    } else if (hasCD) {
      results.push(warn('c3', 'Consent Mode v2 — paramètres incomplets', 'consent', ['Google', 'Consent Mode'],
        'consent/default présent mais les 4 paramètres ne sont pas tous définis.',
        ['Paramètres requis : analytics_storage, ad_storage, ad_user_data, ad_personalization'],
        ['Connecter Google pour vérifier le template GTM'], 'high'))
    } else {
      results.push(fail('c3', 'Consent Mode v2 absent', 'consent', ['Google', 'Consent Mode'],
        'Aucun signal consent/default. Connecter Google pour vérification via GTM.',
        ['Aucun appel gtag("consent","default") détecté'],
        ['Connecter Google pour auditer le conteneur GTM',
         'GTM : installer le template CMP depuis la galerie'], 'critical'))
    }
  }

  // c4 — Consent update (temps réel, toujours scan navigateur)
  if (raw.consentUpdate) {
    results.push(ok('c4', 'Mise à jour consentement transmise', 'consent', ['Google', 'Consent Mode'],
      'consent/update déclenché après interaction utilisateur.',
      [`analytics_storage: ${raw.consentUpdate.analytics_storage}`],
      ['Vérifier dans GTM que le template envoie bien le consent/update après acceptation']))
  }

  // ─── 2. TAG BASE ─────────────────────────────────────────────────────────────

  // t1 — GTM container
  if (raw.hasGTM && raw.gtmContainers.some(c => c.startsWith('GTM-'))) {
    const gtmId = raw.gtmContainers.find(c => c.startsWith('GTM-'))
    const details = [`Container : ${gtmId}`]
    if (hasGTM) details.push(`${gtmData!.tags.length} tags · ${gtmData!.triggers.length} déclencheurs · ${gtmData!.variables.length} variables`)
    results.push(ok('t1', `GTM ${gtmId} actif`, 'tag_base', ['Google', 'GTM'],
      `Conteneur ${gtmId} chargé${hasGTM ? ' et analysé via API' : ''}.`, details,
      ['Vérifier le noscript GTM après <body>']))
  } else if (raw.hasGtag) {
    results.push(warn('t1', 'gtag.js sans GTM', 'tag_base', ['Google', 'GTM'],
      'gtag.js détecté sans GTM. Moins flexible.',
      ['window.gtag disponible mais pas de GTM'],
      ['Envisager la migration vers GTM'], 'low'))
  } else {
    results.push(fail('t1', 'Aucun tag manager Google', 'tag_base', ['Google', 'GTM'],
      'Ni GTM ni gtag.js détecté.',
      ['window.google_tag_manager non défini'],
      ['Installer GTM : tagmanager.google.com'], 'critical'))
  }

  // t2 — GA4 : SOURCE PRIMAIRE = GTM si connecté
  if (hasGTM) {
    const c = gtmData!.checks
    if (c.hasGA4ConfigTag) {
      results.push(ok('t2', `GA4 ${c.ga4MeasurementId || c.ga4ConfigTagName} — configuré dans GTM`, 'tag_base', ['GA4', 'GTM'],
        `Tag GA4 "${c.ga4ConfigTagName}" actif dans GTM${c.ga4MeasurementId ? ` (${c.ga4MeasurementId})` : ''}.`,
        [`Tag : ${c.ga4ConfigTagName}`, c.ga4MeasurementId ? `Measurement ID : ${c.ga4MeasurementId}` : 'ID non extrait'],
        ['Confirmer les hits /g/collect dans Network > Tag Assistant']))
    } else {
      results.push(fail('t2', 'Tag GA4 absent dans GTM', 'tag_base', ['GA4', 'GTM'],
        `Aucun tag GA4 Configuration trouvé dans les ${gtmData!.tags.length} tags du conteneur.`,
        [`${gtmData!.tags.length} tags analysés`],
        ['GTM : Nouveau tag > Google Analytics GA4 Configuration', 'Déclencheur : All Pages'], 'critical'))
    }
  } else if (raw.ga4Ids.length > 0) {
    results.push(ok('t2', `GA4 ${raw.ga4Ids[0]}`, 'tag_base', ['GA4', 'Google'],
      `Measurement ID ${raw.ga4Ids[0]} détecté. Connecter Google pour audit GTM complet.`,
      [`ID : ${raw.ga4Ids[0]}`], ['Connecter Google pour vérifier la configuration GTM']))
  } else {
    const ga4Net = raw.networkRequests.some(r => r.type === 'ga4')
    results.push(ga4Net
      ? ok('t2', 'GA4 détecté via réseau', 'tag_base', ['GA4', 'Google'], 'Hits GA4 détectés. Connecter Google pour audit GTM.', [], ['Connecter Google pour audit complet'])
      : fail('t2', 'GA4 non détecté', 'tag_base', ['GA4', 'Google'], 'Aucun Measurement ID GA4.', [], ['Créer une propriété GA4 et ajouter le tag GTM'], 'critical'))
  }

  // t3 — Pixel Meta : SOURCE PRIMAIRE = GTM si connecté
  if (hasGTM) {
    const c = gtmData!.checks
    const metaTag = gtmData!.tags.find(t => c.hasMetaPixelTag && (t.name === c.metaPixelTagName))
    const hasAM = metaTag ? metaTagHasAdvancedMatching(metaTag) : false
    if (c.hasMetaPixelTag) {
      const isDouble = raw.networkRequests.filter(r => r.type === 'meta').length > 1 && raw.metaPixelIds.length > 0
      if (isDouble) {
        results.push(warn('t3', `Pixel Meta ${c.metaPixelId || ''} — double déclenchement`, 'tag_base', ['Meta', 'GTM'],
          'Pixel configuré dans GTM ET code natif détecté sur la page. Double comptabilisation.',
          [`Tag GTM : ${c.metaPixelTagName}`, 'Pixel aussi présent en dur dans le HTML'],
          ['Supprimer le pixel natif du HTML — garder uniquement le tag GTM'], 'high'))
      } else {
        results.push(ok('t3', `Pixel Meta ${c.metaPixelId || ''} — configuré dans GTM`, 'tag_base', ['Meta', 'GTM'],
          `Tag "${c.metaPixelTagName}" dans GTM${c.metaPixelId ? ` (${c.metaPixelId})` : ''}.`,
          [`Tag : ${c.metaPixelTagName}`, `Advanced Matching : ${hasAM ? 'paramètres présents' : 'à vérifier dans le tag'}`],
          [hasAM ? 'Advanced Matching configuré dans le tag GTM.' : 'Vérifier les paramètres Advanced Matching dans le tag GTM']))
      }
    } else {
      results.push(warn('t3', 'Pixel Meta absent dans GTM', 'tag_base', ['Meta', 'GTM'],
        `Aucun tag Meta Pixel dans les ${gtmData!.tags.length} tags du conteneur.`,
        ['Aucun tag de type fbpixel/facebook_pixel trouvé'],
        ['GTM : Nouveau tag > template Meta Pixel officiel']))
    }
  } else {
    // Fallback scan navigateur
    if (raw.metaPixelIds.length > 0) {
      const isDouble = raw.networkRequests.filter(r => r.type === 'meta' && r.params?.ec === 'double').length > 0
      results.push(isDouble
        ? warn('t3', `Pixel Meta ${raw.metaPixelIds[0]} — double PageView`, 'tag_base', ['Meta'],
            'PageView envoyé 2 fois. Supprimer le pixel natif du HTML, garder GTM.', [], [], 'high')
        : ok('t3', `Pixel Meta ${raw.metaPixelIds[0]}`, 'tag_base', ['Meta'],
            `Pixel ${raw.metaPixelIds[0]} actif. Connecter Google/Meta pour audit GTM.`,
            [`CAPI : ${raw.hasCAPI ? 'connectée' : 'non connectée'}`],
            ['Connecter Meta pour un audit complet']))
    } else {
      results.push(warn('t3', 'Pixel Meta non détecté sur la page', 'tag_base', ['Meta'],
        'Pixel non détecté. Connecter Google pour vérifier la configuration GTM.',
        [], ['Connecter Google pour auditer le conteneur GTM']))
    }
  }

  // t4 — Conversion Linker : SOURCE PRIMAIRE = GTM si connecté
  if (hasGTM) {
    const c = gtmData!.checks
    if (c.hasConversionLinker) {
      results.push(ok('t4', 'Conversion Linker configuré dans GTM', 'tag_base', ['Google Ads', 'GTM'],
        'Tag Conversion Linker présent dans le conteneur GTM.', [],
        ['Vérifier le déclencheur All Pages avec priorité haute']))
    } else if (c.hasGoogleAdsConversion) {
      results.push(fail('t4', 'Conversion Linker absent — Google Ads configuré', 'tag_base', ['Google Ads', 'GTM'],
        'Tags Google Ads présents dans GTM mais pas de Conversion Linker. GCLID non capturé.',
        ['Sans Conversion Linker, attribution Google Ads impossible'],
        ['GTM : Nouveau tag > Conversion Linker > All Pages'], 'high'))
    } else {
      results.push(warn('t4', 'Conversion Linker non configuré dans GTM', 'tag_base', ['Google Ads', 'GTM'],
        'Aucun Conversion Linker dans GTM.', [],
        ['Si Google Ads : GTM > Nouveau tag > Conversion Linker > All Pages'], 'low'))
    }
  } else {
    const hasGcl = raw.cookies.some(c => c.name.startsWith('_gcl'))
    results.push(hasGcl
      ? ok('t4', 'Conversion Linker actif', 'tag_base', ['Google Ads', 'GTM'],
          'Cookies _gcl_* détectés.',
          [raw.cookies.filter(c => c.name.startsWith('_gcl')).map(c => c.name).join(', ')], [])
      : warn('t4', 'Conversion Linker non confirmé', 'tag_base', ['Google Ads', 'GTM'],
          'Cookies _gcl_* non détectés. Normal sans clic annonce.', [],
          ['Connecter Google pour vérifier GTM'], 'low'))
  }

  // ─── 3. GA4 ──────────────────────────────────────────────────────────────────

  // g1 — Événements custom : SOURCE PRIMAIRE = GTM
  if (hasGTM) {
    const eventTags = getGA4EventTags(gtmData!.tags)
    const eventNames = eventTags.map(t => {
      const nameParam = t.parameter?.find(p => p.key === 'eventName')
      return nameParam?.value || t.name
    })
    if (eventTags.length > 0) {
      results.push(ok('g1', `${eventTags.length} tag(s) événement GA4 dans GTM`, 'ga4', ['GA4', 'GTM', 'Events'],
        `${eventTags.length} tag(s) GA4 Event configurés : ${eventNames.slice(0, 4).join(', ')}.`,
        eventTags.map(t => `Tag : ${t.name}`),
        ['Vérifier les déclencheurs de chaque tag événement en mode Preview']))
    } else {
      results.push(warn('g1', 'Aucun tag événement GA4 dans GTM', 'ga4', ['GA4', 'GTM', 'Events'],
        `Aucun tag GA4 Event trouvé dans les ${gtmData!.tags.length} tags du conteneur.`,
        ['Seul le tag GA4 Configuration est présent'],
        ['GTM : Nouveau tag > GA4 Event > configurer les événements business (generate_lead, form_submit, purchase...)'], 'high'))
    }
  } else {
    const custom = raw.dataLayerEvents.filter(e => e.event && !e.event.startsWith('gtm.') && e.event !== 'cookie_consent_update')
    results.push(custom.length > 0
      ? ok('g1', `${custom.length} événement(s) custom détectés`, 'ga4', ['GA4', 'Events'],
          `Events : ${custom.map(e => e.event).join(', ')}. Connecter Google pour audit GTM.`,
          custom.map(e => `event: ${e.event}`), ['Connecter Google pour audit complet'])
      : warn('g1', 'Aucun événement custom — connecter Google pour audit GTM', 'ga4', ['GA4', 'Events'],
          'Connecter Google pour vérifier les tags événement dans GTM.', [],
          ['Connecter Google pour auditer les tags GA4 Event dans GTM'], 'medium'))
  }

  // g2 — UTM (toujours scan page — contexte de la visite)
  const urlParams = new URLSearchParams(new URL(raw.finalUrl || raw.url).search)
  if (urlParams.has('utm_source')) {
    results.push(ok('g2', `UTM source: ${urlParams.get('utm_source')}`, 'ga4', ['GA4', 'Attribution'],
      'Paramètres UTM présents.', [`utm_medium: ${urlParams.get('utm_medium')}`], []))
  } else {
    results.push(warn('g2', 'Aucun paramètre UTM', 'ga4', ['GA4', 'Attribution'],
      'Visite directe sans UTMs.', [], ['Tester depuis un clic campagne'], 'low'))
  }

  // g3 — Formulaires et CTAs : SOURCE PRIMAIRE = GTM
  if (hasGTM) {
    const hasForm = hasFormTrigger(gtmData!.triggers)
    const hasClick = hasClickTrigger(gtmData!.triggers)
    if (hasForm || hasClick) {
      const triggerTypes = [hasForm && 'formulaire', hasClick && 'clic/CTA'].filter(Boolean).join(', ')
      results.push(ok('g3', `Déclencheurs ${triggerTypes} configurés dans GTM`, 'ga4', ['GA4', 'GTM', 'Conversions'],
        `Déclencheurs détectés dans GTM : ${triggerTypes}.`,
        [hasForm ? 'Trigger formulaire présent' : '', hasClick ? 'Trigger clic/CTA présent' : ''].filter(Boolean),
        ['Vérifier en mode Preview que les triggers se déclenchent correctement']))
    } else if (raw.forms.length > 0 || raw.ctaElements > 0) {
      results.push(fail('g3', `${raw.forms.length} form(s) et ${raw.ctaElements} CTA(s) — aucun déclencheur GTM`, 'ga4', ['GA4', 'GTM', 'Conversions'],
        `Éléments détectés sur la page mais aucun trigger Form Submission ni Click dans GTM.`,
        [`${raw.forms.length} formulaire(s) HTML`, `${raw.ctaElements} CTA(s)`],
        ['GTM : Nouveau déclencheur > Envoi de formulaire', 'GTM : Nouveau déclencheur > Clic sur les CTA'], 'critical'))
    } else {
      results.push(warn('g3', 'Pas de formulaire HTML natif — vérifier les embeds', 'ga4', ['GA4', 'Conversions'],
        'Formulaire probablement en embed externe (Typeform, HubSpot...)',
        ['document.querySelectorAll("form").length = 0'],
        ['Identifier la solution de formulaire et configurer le tracking via webhook']))
    }
  } else {
    if (raw.forms.length > 0 || raw.ctaElements > 0) {
      const custom = raw.dataLayerEvents.filter(e => e.event && !e.event.startsWith('gtm.'))
      const hasConvEvent = custom.some(e => ['form_submit', 'generate_lead', 'contact', 'signup', 'purchase'].includes(e.event || ''))
      results.push(hasConvEvent
        ? ok('g3', 'Formulaires et CTAs trackés', 'ga4', ['GA4', 'Conversions'],
            `${raw.forms.length} form(s) et ${raw.ctaElements} CTA(s) avec événement de conversion.`,
            [`Forms : ${raw.forms.length}`, `CTAs : ${raw.ctaElements}`], [])
        : fail('g3', 'Formulaires et CTAs — tracking absent', 'ga4', ['GA4', 'Conversions'],
            `${raw.forms.length} form(s) et ${raw.ctaElements} CTA(s) sans événement. Connecter Google pour audit GTM.`,
            [], ['Connecter Google pour auditer les déclencheurs GTM'], 'critical'))
    } else {
      results.push(warn('g3', 'Aucun formulaire HTML natif', 'ga4', ['GA4', 'Conversions'],
        'Formulaire probablement en embed externe.', [],
        ['Identifier la solution de formulaire et configurer le tracking']))
    }
  }

  // g4 — Scroll et clics : SOURCE PRIMAIRE = GTM
  if (hasGTM) {
    const scrollOk = hasScrollTrigger(gtmData!.triggers)
    const clickOk  = hasClickTrigger(gtmData!.triggers)
    if (scrollOk || clickOk) {
      results.push(ok('g4', `Micro-signaux configurés dans GTM${scrollOk ? ' (scroll)' : ''}${clickOk ? ' (clics)' : ''}`, 'ga4', ['GA4', 'GTM', 'Micro-signaux'],
        `Déclencheurs micro-signaux présents dans GTM.`,
        [scrollOk ? 'Scroll Depth trigger configuré' : '', clickOk ? 'Click trigger configuré' : ''].filter(Boolean),
        ['Vérifier le seuil de scroll (25%, 50%, 75%, 90% recommandé)']))
    } else {
      results.push(warn('g4', 'Scroll et clics non configurés dans GTM', 'ga4', ['GA4', 'GTM', 'Micro-signaux'],
        'Aucun trigger Scroll Depth ni Click dans GTM.',
        ['Aucun déclencheur de type SCROLL_DEPTH ou CLICK trouvé'],
        ['GTM : Nouveau déclencheur > Profondeur de défilement (25/50/75/90%)',
         'OU : GA4 Admin > Enhanced Measurement > activer scroll tracking']))
    }
  } else {
    if (!raw.dataLayerEvents.some(e => e.event === 'scroll')) {
      results.push(warn('g4', 'Scroll et clics non trackés', 'ga4', ['GA4', 'Micro-signaux'],
        'Connecter Google pour vérifier dans GTM.',
        [], ['Connecter Google pour auditer les triggers GTM'], 'low'))
    }
  }

  // ─── 4. GOOGLE ADS ───────────────────────────────────────────────────────────

  // ga1 — Tag Google Ads : SOURCE PRIMAIRE = GTM
  if (hasGTM) {
    const c = gtmData!.checks
    if (c.hasGoogleAdsConversion) {
      results.push(ok('ga1', `Google Ads — ${c.googleAdsConversionTags.length} tag(s) dans GTM`, 'google_ads', ['Google Ads', 'GTM'],
        `Tags Google Ads configurés : ${c.googleAdsConversionTags.slice(0, 3).join(', ')}.`,
        c.googleAdsConversionTags.map(t => `Tag : ${t}`), []))
    } else if (raw.googleAdsIds.length > 0) {
      results.push(warn('ga1', 'Google Ads détecté — tag absent dans GTM', 'google_ads', ['Google Ads', 'GTM'],
        `ID ${raw.googleAdsIds[0]} détecté sur la page mais aucun tag dans GTM.`,
        ['Tag Google Ads probablement en dur dans le HTML'],
        ['Migrer vers un tag GTM pour centraliser la gestion']))
    } else {
      results.push(warn('ga1', 'Google Ads non configuré dans GTM', 'google_ads', ['Google Ads', 'GTM'],
        'Aucun tag Google Ads dans le conteneur GTM.', [],
        ['Si vous utilisez Google Ads : GTM > Nouveau tag > Conversion Google Ads'], 'low'))
    }
  } else {
    results.push(raw.googleAdsIds.length > 0
      ? ok('ga1', `Google Ads ${raw.googleAdsIds[0]}`, 'google_ads', ['Google Ads'],
          'Tag Google Ads détecté. Connecter Google pour audit GTM.', [], ['Connecter Google pour audit complet'])
      : warn('ga1', 'Tag Google Ads non détecté', 'google_ads', ['Google Ads'],
          'Connecter Google pour vérifier la configuration GTM.', [],
          ['Connecter Google pour auditer le conteneur GTM'], 'low'))
  }

  // ga2 — Enhanced Conversions : SOURCE PRIMAIRE = GTM
  if (hasGTM) {
    const c = gtmData!.checks
    if (c.hasEnhancedConversions) {
      results.push(ok('ga2', `Enhanced Conversions configuré dans GTM`, 'google_ads', ['Google Ads', 'GTM', 'Enhanced Conversions'],
        `Tag Enhanced Conversions : "${c.enhancedConversionTagName}".`,
        [`Tag : ${c.enhancedConversionTagName}`], []))
    } else {
      const hasUD = raw.dataLayerEvents.some(e => e.keys.includes('user_data') || e.preview.includes('email'))
      results.push(hasUD
        ? warn('ga2', 'user_data détecté — Enhanced Conversions à configurer dans GTM', 'google_ads', ['Google Ads', 'Enhanced Conversions'],
            'Données user_data présentes dans le dataLayer mais pas de tag EC dans GTM.',
            [], ['GTM : activer Enhanced Conversions dans le tag Google Ads'], 'medium')
        : manual('ga2', 'Enhanced Conversions — à configurer sur page de confirmation', 'google_ads', ['Google Ads', 'GTM', 'Enhanced Conversions'],
            'À vérifier sur la page de conversion (pas sur LP entrée).',
            ['Page analysée sans soumission de formulaire'],
            ['Page de confirmation : dataLayer.push({event:"generate_lead", user_data:{email:..., phone_number:...}})',
             'GTM : activer Enhanced Conversions dans le tag Google Ads']))
    }
  } else {
    const hasUD = raw.dataLayerEvents.some(e => e.keys.includes('user_data') || e.preview.includes('email'))
    results.push(hasUD
      ? ok('ga2', 'Données user_data détectées', 'google_ads', ['Google Ads', 'Enhanced Conversions'],
          'Objet user_data présent. Connecter Google pour vérifier EC dans GTM.', [], ['Connecter Google pour audit GTM'])
      : manual('ga2', 'Enhanced Conversions — vérifier page de confirmation', 'google_ads', ['Google Ads', 'Enhanced Conversions'],
          'À vérifier sur la page de conversion.',
          ['Page analysée sans soumission de formulaire'],
          ['Page de confirmation : dataLayer.push({event:"generate_lead", user_data:{email:..., phone_number:...}})']))
  }

  // ─── 5. META ─────────────────────────────────────────────────────────────────

  // m1 — Advanced Matching : SOURCE PRIMAIRE = GTM
  if (hasGTM && gtmData!.checks.hasMetaPixelTag) {
    const metaTag = gtmData!.tags.find(t => t.name === gtmData!.checks.metaPixelTagName)
    const hasAM = metaTag ? metaTagHasAdvancedMatching(metaTag) : false
    const metaNetAM = raw.networkRequests.filter(r => r.type === 'meta').some(r => r.params?.em || r.params?.hme || r.params?.ph)

    if (hasAM || metaNetAM) {
      results.push(ok('m1', 'Advanced Matching configuré', 'meta', ['Meta', 'GTM', 'Advanced Matching'],
        'Paramètres de correspondance avancée présents dans le tag GTM ou détectés sur la page.', [], []))
    } else {
      results.push(fail('m1', 'Advanced Matching non configuré', 'meta', ['Meta', 'GTM', 'Advanced Matching'],
        'Tag Meta dans GTM mais paramètres Advanced Matching absents.',
        [`Tag GTM : ${gtmData!.checks.metaPixelTagName}`],
        ['Dans le tag Meta GTM : ajouter les paramètres email / phone_number',
         'Ou : Meta Events Manager > pixel > Correspondance avancée'], 'high'))
    }
  } else if (!hasGTM && raw.metaPixelIds.length > 0) {
    const hasAM = raw.networkRequests.filter(r => r.type === 'meta').some(r => r.params?.em || r.params?.hme || r.params?.ph)
    results.push(hasAM
      ? ok('m1', 'Advanced Matching détecté', 'meta', ['Meta', 'Advanced Matching'], 'Paramètres de correspondance avancée transmis.', [], [])
      : fail('m1', 'Advanced Matching non configuré', 'meta', ['Meta', 'Advanced Matching'],
          'Aucun paramètre em/ph dans les hits Meta.', [],
          ['Meta Events Manager : pixel > Correspondance avancée > Activer'], 'high'))
  }

  // m2 — CAPI (source primaire = API Meta si connectée)
  if (raw.metaPixelIds.length > 0 || (hasGTM && gtmData!.checks.hasMetaPixelTag)) {
    if (platform?.meta) {
      // Meta API connectée : source authoritative
      results.push(platform.meta.capiConnected
        ? ok('m2', 'CAPI connectée (vérifié via API Meta)', 'meta', ['Meta', 'CAPI'],
            'Conversions API active — server access token configuré.',
            [`Pixel : ${platform.meta.pixelName}`], [])
        : fail('m2', 'CAPI non configurée (vérifié via API Meta)', 'meta', ['Meta', 'CAPI'],
            `Pixel ${platform.meta.pixelId} : aucun server access token. 20-40% de conversions perdues (iOS/AdBlockers).`,
            ['Aucun server access token sur le pixel Meta'],
            ['Meta Events Manager : pixel > Paramètres > Conversions API > Configurer',
             'Ou : Utiliser un partenaire d\'intégration (Shopify, WooCommerce...)'], 'high'))
    } else {
      // Meta non connectée — vérification manuelle nécessaire (CAPI est server-side, invisible du navigateur)
      results.push(manual('m2', 'CAPI — connecter Meta pour vérifier', 'meta', ['Meta', 'CAPI'],
        'La CAPI est server-to-server : impossible à détecter depuis le navigateur. Connecter Meta pour audit automatique.',
        ['La CAPI envoie des hits depuis votre serveur, pas depuis le navigateur du visiteur'],
        ['Connecter Meta (bouton Plateformes) pour vérifier automatiquement',
         'Ou vérifier manuellement : Meta Events Manager > pixel > Paramètres > Conversions API']))
    }
  }

  // ─── 6. SERVER-SIDE TRACKING ─────────────────────────────────────────────────

  // ss1 — sGTM (server-side GTM) : SOURCE PRIMAIRE = containers GTM API
  {
    // Detect via GTM API: server containers have usageContext containing 'server'
    const serverContainers = hasGTM
      ? gtmData!.containers.filter(c => c.usageContext.some(u => u.toLowerCase() === 'server'))
      : []
    const gtmUrl = raw.gtmScriptUrl || ''
    const isCustomDomain = gtmUrl && !gtmUrl.includes('googletagmanager.com') && gtmUrl.includes('gtm.js')

    if (serverContainers.length > 0) {
      const sc = serverContainers[0]
      results.push(ok('ss1', `sGTM configuré — container serveur détecté (${sc.publicId})`, 'server_side', ['GTM', 'Server-Side', 'Tracking'],
        `Container server-side "${sc.name}" (${sc.publicId}) présent dans votre compte GTM.`,
        [`Container : ${sc.name}`, `ID : ${sc.publicId}`, isCustomDomain ? `Domaine custom : ${new URL(gtmUrl).hostname}` : 'Déployer sur un domaine custom pour activer le first-party tracking'],
        ['Vérifier que le container sGTM transfère bien les tags GA4, Meta, Google Ads',
         isCustomDomain ? 'First-party cookies actifs ✓' : 'Configurer un domaine custom (Stape.io ou Cloud Run) pour les cookies 1st party']))
    } else if (isCustomDomain) {
      results.push(ok('ss1', `sGTM — domaine custom détecté`, 'server_side', ['GTM', 'Server-Side', 'Tracking'],
        `Script GTM chargé depuis un domaine custom : ${new URL(gtmUrl).hostname}`,
        [`URL : ${gtmUrl}`, 'First-party tracking actif — cookies 1st party durables'],
        ['Connecter Google pour identifier le container sGTM associé']))
    } else if (raw.hasGTM || hasGTM) {
      results.push(warn('ss1', 'GTM web uniquement — pas de container server-side', 'server_side', ['GTM', 'Server-Side'],
        'Aucun container sGTM détecté dans votre compte GTM. Le tracking web-only est limité par ITP et les bloqueurs.',
        [hasGTM ? `${gtmData!.containers.length} container(s) analysés, tous web` : 'GTM détecté sur la page sans accès API'],
        ['GTM > Créer un container de type "Serveur"',
         'Déployer sur Stape.io (simplifié) ou Google Cloud Run',
         'Avantages : cookies 1st party 400j, meilleure déduplication CAPI, contournement AdBlockers'], 'low'))
    }
  }

  // ss2 — Déduplication CAPI / Pixel (event_id)
  if (platform?.meta?.capiConnected || (hasGTM && gtmData!.checks.hasMetaPixelTag)) {
    const metaHits = raw.networkRequests.filter(r => r.type === 'meta')
    const hasEventId = metaHits.some(r => r.params?.event_id || r.params?.eid)
    if (platform?.meta?.capiConnected) {
      results.push(hasEventId
        ? ok('ss2', 'Déduplication CAPI configurée (event_id détecté)', 'server_side', ['Meta', 'CAPI', 'Déduplication'],
            'Paramètre event_id présent dans les hits Pixel — déduplication browser/serveur active.',
            ['event_id transmis dans les requêtes facebook.com/tr'],
            ['Vérifier que le même event_id est envoyé côté serveur pour chaque événement'])
        : fail('ss2', 'Déduplication CAPI manquante (event_id absent)', 'server_side', ['Meta', 'CAPI', 'Déduplication'],
            'CAPI configurée mais event_id absent dans les hits Pixel — risque de double comptage.',
            ['Sans event_id identique browser+serveur, Meta comptera 2x les événements'],
            ['Ajouter event_id dans le tag Pixel GTM (paramètre "Event ID")',
             'Utiliser la même valeur dans l\'appel CAPI côté serveur'], 'high'))
    } else {
      results.push(manual('ss2', 'Déduplication CAPI — CAPI non connectée', 'server_side', ['Meta', 'CAPI', 'Déduplication'],
        'Connecter Meta et configurer la CAPI pour activer la déduplication.',
        [], ['Configurer la CAPI puis ajouter event_id au tag Pixel GTM']))
    }
  }

  // ss3 — Match rate Meta (si Meta connectée)
  if (platform?.meta?.matchRate !== undefined) {
    const rate = platform.meta.matchRate
    if (rate >= 60) {
      results.push(ok('ss3', `Match rate Meta : ${rate}%`, 'server_side', ['Meta', 'Match Rate'],
        `Taux de correspondance ${rate}% — excellent (objectif >60%).`,
        [`Match rate actuel : ${rate}%`], []))
    } else if (rate >= 40) {
      results.push(warn('ss3', `Match rate Meta : ${rate}% — à améliorer`, 'server_side', ['Meta', 'Match Rate'],
        `Match rate ${rate}% (objectif >60%). Ajouter plus de paramètres d\'identification.`,
        [`Actuel : ${rate}%`, 'Objectif : >60%'],
        ['Ajouter email hashé, téléphone, prénom/nom dans Advanced Matching',
         'Si CAPI active : enrichir les événements serveur avec user_data'], 'medium'))
    } else {
      results.push(fail('ss3', `Match rate Meta : ${rate}% — critique`, 'server_side', ['Meta', 'Match Rate'],
        `Match rate ${rate}% (critique, <40%). Les audiences et l\'optimisation Meta sont fortement dégradées.`,
        [`Actuel : ${rate}%`, 'Impact : retargeting et lookalike audiences peu précis'],
        ['Activer Advanced Matching avec email et téléphone au minimum',
         'Configurer la CAPI pour envoyer user_data côté serveur'], 'high'))
    }
  }

  // ─── 7. GTM QA (uniquement quand GTM connecté) ───────────────────────────────
  if (hasGTM) {
    const c = gtmData!.checks

    // gtm1 — Template CMP
    if (c.hasConsentModeTemplate) {
      results.push(ok('gtm1', `Template CMP "${c.consentModeTemplateName}" dans GTM`, 'consent', ['GTM', 'Consent Mode', 'CMP'],
        `Template "${c.consentModeTemplateName}" (${c.consentModeTemplateType}) configuré.`,
        [`Template : ${c.consentModeTemplateName}`, `Type : ${c.consentModeTemplateType}`],
        ['Confirmer déclencheur All Pages avec priorité ≥ 999',
         'Tag Assistant : ce tag doit être le premier déclenché']))
    } else if (raw.cmpDetected) {
      results.push(warn('gtm1', `Template CMP absent dans GTM (${raw.cmpDetected} détecté)`, 'consent', ['GTM', 'Consent Mode', 'CMP'],
        `${raw.cmpDetected} sur la page mais aucun template dans GTM.`,
        [`CMP : ${raw.cmpDetected}`],
        [`GTM > Galerie > rechercher "${raw.cmpDetected}" > installer`], 'high'))
    } else {
      results.push(fail('gtm1', 'Aucun template CMP dans GTM', 'consent', ['GTM', 'Consent Mode', 'CMP'],
        'Ni template CMP ni CMP sur la page.',
        [`${gtmData!.tags.length} tags analysés`],
        ['GTM > Galerie > installer template de votre CMP'], 'critical'))
    }

    // gtm6 — Variables dataLayer
    if (c.dataLayerVariables.length > 0) {
      results.push(ok('gtm6', `${c.dataLayerVariables.length} variable(s) dataLayer`, 'ga4', ['GTM', 'Events'],
        `Variables : ${c.dataLayerVariables.slice(0, 5).join(', ')}.`,
        c.dataLayerVariables.slice(0, 8).map(v => `Variable : ${v}`), []))
    }

    // gtm7 — Tags en pause
    if (c.pausedTags.length > 0) {
      results.push(warn('gtm7', `${c.pausedTags.length} tag(s) en pause`, 'qa', ['GTM', 'QA'],
        `Tags en pause : ${c.pausedTags.slice(0, 3).join(', ')}.`,
        c.pausedTags.map(t => `${t}`),
        ['Vérifier si ces tags doivent être réactivés ou supprimés']))
    }

    // gtm8 — Tags sans déclencheur
    if (c.tagsWithoutTrigger.length > 0) {
      results.push(warn('gtm8', `${c.tagsWithoutTrigger.length} tag(s) sans déclencheur`, 'qa', ['GTM', 'QA'],
        `Tags orphelins : ${c.tagsWithoutTrigger.slice(0, 3).join(', ')}.`,
        c.tagsWithoutTrigger.map(t => `${t}`),
        ['Ces tags ne se déclencheront jamais — supprimer ou ajouter un déclencheur']))
    }

    // gtm9 — Volume de tags
    results.push(c.hasTooManyTags
      ? warn('gtm9', `${c.totalTagCount} tags — impact performance`, 'qa', ['GTM', 'QA', 'Performance'],
          `${c.totalTagCount} tags (>50).`, [`Total : ${c.totalTagCount} tags`],
          ['Auditer et supprimer les tags obsolètes'])
      : ok('gtm9', `${c.totalTagCount} tags GTM — volume correct`, 'qa', ['GTM', 'QA'],
          `${c.totalTagCount} tags. Volume nominal.`, [], []))
  }

  // ─── 7. QA ───────────────────────────────────────────────────────────────────
  if (raw.jsErrors.length > 0) {
    results.push(fail('q1', `${raw.jsErrors.length} erreur(s) JS`, 'qa', ['QA'],
      `Erreurs : ${raw.jsErrors.slice(0, 2).join('; ')}.`,
      raw.jsErrors.slice(0, 5), ['Corriger les erreurs JS avant tout'], 'medium'))
  } else {
    results.push(ok('q1', 'Aucune erreur JavaScript', 'qa', ['QA'], 'Console JS propre.', [], []))
  }

  // ─── 8. Données plateforme (API GA4 / Meta) ──────────────────────────────────
  if (platform?.ga4) {
    const g = platform.ga4
    results.push(g.conversionEvents.length === 0
      ? fail('p1', 'Aucune conversion dans GA4', 'ga4', ['GA4', 'Platform'],
          `Propriété ${g.measurementId} : 0 conversion définie.`,
          [`Propriété : ${g.propertyName}`],
          ['GA4 Admin : Conversions > marquer les événements clés'], 'critical')
      : ok('p1', `${g.conversionEvents.length} conversion(s) GA4`, 'ga4', ['GA4', 'Platform'],
          `Actives : ${g.conversionEvents.filter(e => e.isActive).map(e => e.name).join(', ')}.`,
          g.conversionEvents.map(e => `${e.name} : ${e.isActive ? 'actif' : 'inactif'}`), []))
  }

  if (platform?.meta) {
    const m = platform.meta
    if (!m.advancedMatchingEnabled) {
      results.push(fail('p2', 'Advanced Matching désactivé (API Meta)', 'meta', ['Meta', 'Platform'],
        `Pixel ${m.pixelId} : Advanced Matching non activé.`,
        [`Pixel : ${m.pixelName}`],
        ['Meta Events Manager : pixel > Paramètres > Correspondance avancée > Activer']))
    }
    if (m.matchRate !== undefined && m.matchRate < 40) {
      results.push(warn('p3', `Match rate Meta : ${m.matchRate}%`, 'meta', ['Meta', 'Platform'],
        `Match rate ${m.matchRate}% (objectif >60%).`,
        [`Actuel : ${m.matchRate}%`],
        ['Ajouter email, téléphone, prénom dans les paramètres Advanced Matching']))
    }
  }

  return results
}

export function calculateScore(checks: CheckResult[]): AuditScore {
  const total = checks.length
  if (total === 0) return { global: 0, consent: 0, measurement: 0, conversion: 0, privacy: 0, okCount: 0, warnCount: 0, failCount: 0, manualCount: 0, total: 0 }
  const okC     = checks.filter(c => c.status === 'ok').length
  const warnC   = checks.filter(c => c.status === 'warn').length
  const failC   = checks.filter(c => c.status === 'fail').length
  const manualC = checks.filter(c => c.status === 'manual').length
  const global  = Math.round((okC * 100 + warnC * 50 + manualC * 60) / (total * 100) * 100)
  const cat = (cat: CheckResult['category']) => {
    const cc = checks.filter(c => c.category === cat)
    if (!cc.length) return 100
    const p = cc.filter(c => c.status === 'ok').length * 100 + cc.filter(c => c.status === 'warn').length * 50 + cc.filter(c => c.status === 'manual').length * 60
    return Math.round(p / (cc.length * 100) * 100)
  }
  return { global, consent: cat('consent'), measurement: cat('ga4'), conversion: cat('google_ads'), privacy: cat('consent'), okCount: okC, warnCount: warnC, failCount: failC, manualCount: manualC, total }
}
