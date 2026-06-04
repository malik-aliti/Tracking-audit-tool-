import type { ScanRawData, CheckResult, AuditScore, PlatformData } from \'@/types\'
import type { GTMData } from \'@/lib/gtm\'

function ok(id: string, label: string, category: CheckResult[\'category\'], tags: string[], finding: string, details: string[], actions: string[]): CheckResult {
  return { id, label, status: \'ok\', finding, details, actions, category, tags, impact: \'low\' }
}
function warn(id: string, label: string, category: CheckResult[\'category\'], tags: string[], finding: string, details: string[], actions: string[], impact: CheckResult[\'impact\'] = \'medium\'): CheckResult {
  return { id, label, status: \'warn\', finding, details, actions, category, tags, impact }
}
function fail(id: string, label: string, category: CheckResult[\'category\'], tags: string[], finding: string, details: string[], actions: string[], impact: CheckResult[\'impact\'] = \'high\'): CheckResult {
  return { id, label, status: \'fail\', finding, details, actions, category, tags, impact }
}
function manual(id: string, label: string, category: CheckResult[\'category\'], tags: string[], finding: string, details: string[], actions: string[]): CheckResult {
  return { id, label, status: \'manual\', finding, details, actions, category, tags, impact: \'medium\' }
}

export function analyzeTrackingData(raw: ScanRawData, platform?: PlatformData, gtmData?: GTMData): CheckResult[] {
  const results: CheckResult[] = []

  // ══ 1. CONSENT ════════════════════════════════════════════════════════════
  if (raw.cmpDetected) {
    results.push(ok(\'c1\', `CMP détectée : ${raw.cmpDetected}`, \'consent\', [\'Privacy\',\'CMP\'],
      `${raw.cmpDetected} identifié et actif.`,
      [`CMP : ${raw.cmpDetected}`, `TCF v2.2 : ${raw.hasTCF ? \'actif ✓\' : \'non détecté\'}`],
      [\'Vérifier que la liste des cookies dans la bannière est à jour\']))
  } else {
    results.push(fail(\'c1\', \'Aucune CMP détectée\', \'consent\', [\'Privacy\',\'CMP\'],
      \'Aucun gestionnaire de consentement (CMP) détecté. Non-conformité RGPD probable.\',
      [\'Aucune CMP reconnue\', \'window.__tcfapi absent\'],
      [\'Installer une CMP certifiée Google : CookieYes, Didomi, OneTrust, Axeptio, Cookiebot\',
       \'Configurer l\'intégration avec Consent Mode v2\'], \'critical\'))
  }

  if (raw.hasTCF) {
    results.push(ok(\'c2\', \'TCF v2.2 actif\', \'consent\', [\'Privacy\',\'TCF\'],
      \'Framework TCF v2.2 détecté. Signaux de consentement transmis aux partenaires IAB.\',
      [\'window.__tcfapi disponible\'], [\'Vérifier que la liste des vendeurs TCF est à jour\']))
  } else {
    results.push(warn(\'c2\', \'TCF v2.2 non détecté\', \'consent\', [\'Privacy\',\'TCF\'],
      `${raw.cmpDetected ? raw.cmpDetected + \' sans TCF v2.2\' : \'Pas de TCF v2.2\'}.`,
      [\'window.__tcfapi : non défini\'],
      [\'Si cible UE/UK : activer TCF v2.2 dans votre CMP\']))
  }

  const hasConsentDefault = !!raw.consentDefault
  const allParams = raw.consentDefault &&
    raw.consentDefault.analytics_storage !== undefined &&
    raw.consentDefault.ad_storage !== undefined &&
    raw.consentDefault.ad_user_data !== undefined &&
    raw.consentDefault.ad_personalization !== undefined

  if (hasConsentDefault && allParams) {
    const isAdvanced = !!(raw.consentDefault?.wait_for_update && raw.consentDefault.wait_for_update > 0)
    results.push(ok(\'c3\', `Consent Mode v2 ${isAdvanced ? \'(Mode Avancé)\' : \'(Mode Basique)\'} configuré`, \'consent\', [\'Google\',\'Consent Mode\'],
      `Les 4 paramètres obligatoires définis${isAdvanced ? \` avec wait_for_update: ${raw.consentDefault?.wait_for_update}ms\` : \'\'}.`,
      [
        `analytics_storage: ${raw.consentDefault?.analytics_storage}`,
        `ad_storage: ${raw.consentDefault?.ad_storage}`,
        `ad_user_data: ${raw.consentDefault?.ad_user_data}`,
        `ad_personalization: ${raw.consentDefault?.ad_personalization}`,
        isAdvanced ? \'Mode Avancé — modélisation des conversions activée\' : \'Mode Basique — tags bloqués avant consentement\',
      ],
      isAdvanced ? [\'Mode Avancé optimal. Surveiller le rapport de modélisation dans Google Ads.\'] :
        [\'Envisager le Mode Avancé pour activer la modélisation des conversions manquantes\']))
  } else if (hasConsentDefault) {
    results.push(warn(\'c3\', \'Consent Mode v2 — paramètres incomplets\', \'consent\', [\'Google\',\'Consent Mode\'],
      \'consent/default présent mais les 4 paramètres obligatoires ne sont pas tous définis.\',
      [\'Paramètres requis : analytics_storage, ad_storage, ad_user_data, ad_personalization\'],
      [\'Ajouter les paramètres manquants dans la configuration de votre CMP ou template GTM\'], \'high\'))
  } else {
    results.push(fail(\'c3\', \'Consent Mode v2 absent\', \'consent\', [\'Google\',\'Consent Mode\'],
      \'Aucun signal consent/default. Les tags Google ne sont pas conformes Consent Mode v2.\',
      [\'Aucun appel gtag("consent","default") détecté\'],
      [\'Configurer Consent Mode v2 dans GTM via un template CMP certifié\',
       \'Implémenter : gtag("consent","default",{analytics_storage:"denied",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",wait_for_update:2000})\'], \'critical\'))
  }

  if (raw.consentUpdate) {
    results.push(ok(\'c4\', \'Mise à jour du consentement transmise\', \'consent\', [\'Google\',\'Consent Mode\'],
      \'consent/update déclenché après interaction avec la CMP.\',
      [`ad_storage: ${raw.consentUpdate.ad_storage}`, `analytics_storage: ${raw.consentUpdate.analytics_storage}`],
      [\'Vérifier que la mise à jour se déclenche immédiatement après le choix utilisateur\']))
  }

  // ══ 2. TAG BASE ═══════════════════════════════════════════════════════════
  if (raw.hasGTM && raw.gtmContainers.some(c => c.startsWith(\'GTM-\'))) {
    const gtmId = raw.gtmContainers.find(c => c.startsWith(\'GTM-\'))
    results.push(ok(\'t1\', `GTM ${gtmId} actif`, \'tag_base\', [\'Google\',\'GTM\'],
      `Conteneur GTM ${gtmId} chargé et opérationnel.`,
      [`Container : ${gtmId}`],
      [\'Vérifier que le noscript GTM est présent juste après la balise <body>\']))
  } else {
    results.push(fail(\'t1\', \'Aucun tag manager Google détecté\', \'tag_base\', [\'Google\',\'GTM\'],
      \'Ni GTM ni gtag.js détecté sur la page. Aucun tracking Google en place.\',
      [\'window.google_tag_manager : non défini\'],
      [\'Installer Google Tag Manager : tagmanager.google.com\'], \'critical\'))
  }

  if (raw.ga4Ids.length > 0) {
    results.push(ok(\'t2\', `GA4 ${raw.ga4Ids[0]} configuré`, \'tag_base\', [\'GA4\',\'Google\'],
      `Propriété GA4 ${raw.ga4Ids[0]} liée au conteneur GTM.`,
      [`Measurement ID : ${raw.ga4Ids[0]}`],
      [\'Confirmer les hits /g/collect dans Network\']))
  } else {
    const ga4InNetwork = raw.networkRequests.some(r => r.type === \'ga4\')
    if (ga4InNetwork) {
      results.push(ok(\'t2\', \'GA4 détecté (via réseau)\', \'tag_base\', [\'GA4\',\'Google\'],
        \'Hits GA4 détectés dans le réseau.\', [], [\'Vérifier le Measurement ID dans GTM\']))
    } else {
      results.push(fail(\'t2\', \'GA4 non détecté\', \'tag_base\', [\'GA4\',\'Google\'],
        \'Aucun Measurement ID GA4 ni requête /g/collect détecté.\',
        [\'Aucun G-XXXXXXXX dans les containers GTM\'],
        [\'Créer une propriété GA4 dans analytics.google.com\',
         \'Ajouter un tag GA4 Configuration dans GTM\'], \'critical\'))
    }
  }

  if (raw.metaPixelIds.length > 0) {
    const doublePixel = raw.networkRequests.filter(r => r.type === \'meta\' && r.params?.ev === \'PageView\' && r.params?.ec === \'double\').length > 0
    if (doublePixel) {
      results.push(warn(\'t3\', `Pixel Meta ${raw.metaPixelIds[0]} — double PageView`, \'tag_base\', [\'Meta\'],
        `Pixel ${raw.metaPixelIds[0]} actif mais PageView envoyé 2x. Double-comptabilisation probable.`,
        [\'Cause : pixel natif fbq() + template GTM simultanément\'],
        [\'Supprimer le pixel Meta natif du HTML, conserver uniquement le template GTM\'], \'high\'))
    } else {
      results.push(ok(\'t3\', `Pixel Meta ${raw.metaPixelIds[0]} actif`, \'tag_base\', [\'Meta\'],
        `Pixel ${raw.metaPixelIds[0]} chargé et opérationnel.`,
        [`Pixel ID : ${raw.metaPixelIds[0]}`, `CAPI : ${raw.hasCAPI ? \'oui\' : \'non\'}`],
        [raw.hasCAPI ? \'CAPI connectée ✓\' : \'Connecter la Conversions API\']))
    }
  } else {
    results.push(warn(\'t3\', \'Pixel Meta non détecté\', \'tag_base\', [\'Meta\'],
      \'Aucun pixel Meta détecté.\', [],
      [\'Installer le pixel via GTM (template Meta Pixel officiel)\']))
  }

  const hasGclCookies = raw.cookies.some(c => c.name.startsWith(\'_gcl\'))
  if (hasGclCookies) {
    results.push(ok(\'t4\', \'Conversion Linker actif\', \'tag_base\', [\'Google Ads\',\'GTM\'],
      \'Cookies _gcl_* détectés. Le Conversion Linker capture correctement le GCLID.\',
      [`Cookies : ${raw.cookies.filter(c => c.name.startsWith(\'_gcl\')).map(c => c.name).join(\', \')}`],
      []))
  } else {
    results.push(warn(\'t4\', \'Conversion Linker — non confirmé\', \'tag_base\', [\'Google Ads\',\'GTM\'],
      \'Cookies _gcl_* non détectés. Conversion Linker non confirmé.\',
      [\'Normal si visite directe sans GCLID\'],
      [\'Vérifier dans GTM qu\'un tag Conversion Linker est déclenché sur All Pages\']))
  }

  // ══ 3. GA4 ════════════════════════════════════════════════════════════════
  const customEvents = raw.dataLayerEvents.filter(e => e.event && !e.event.startsWith(\'gtm.\') && e.event !== \'cookie_consent_update\')
  if (customEvents.length > 0) {
    results.push(ok(\'g1\', `${customEvents.length} événement(s) custom détectés`, \'ga4\', [\'GA4\',\'Events\'],
      `Événements : ${customEvents.map(e => e.event).join(\', \')}.`,
      customEvents.map(e => `Event : ${e.event}`),
      [\'Vérifier dans GA4 → Temps réel que ces événements arrivent bien\']))
  } else {
    results.push(warn(\'g1\', \'Aucun événement custom dans le dataLayer\', \'ga4\', [\'GA4\',\'Events\'],
      \'Aucun événement business custom détecté (clic CTA, form_submit, generate_lead).\',
      [\'dataLayer : seuls gtm.js, gtm.dom, gtm.load détectés\'],
      [\'Identifier les actions clés de la page et créer des déclencheurs GTM\',
       \'Pusher les événements : dataLayer.push({event:"generate_lead", ...})\'], \'high\'))
  }

  const urlParams = new URLSearchParams(new URL(raw.finalUrl).search)
  const hasUtm = urlParams.has(\'utm_source\')
  if (hasUtm) {
    results.push(ok(\'g2\', \'Paramètres UTM présents\', \'ga4\', [\'GA4\',\'Attribution\'],
      `Attribution : utm_source=${urlParams.get(\'utm_source\')}.`,
      [`utm_medium: ${urlParams.get(\'utm_medium\')}, utm_campaign: ${urlParams.get(\'utm_campaign\')}`],
      []))
  } else {
    results.push(warn(\'g2\', \'Aucun paramètre UTM dans l\'URL\', \'ga4\', [\'GA4\',\'Attribution\'],
      \'Visite sans UTMs. Normal pour navigation directe, à vérifier depuis vos campagnes.\',
      [\'URL analysée sans paramètres UTM\'],
      [\'Tester depuis un clic sur vos annonces payantes\'], \'low\'))
  }

  if (raw.forms.length > 0 || raw.emailInputs > 0 || raw.ctaElements > 0) {
    const formsTracked = customEvents.some(e => [\'form_submit\',\'generate_lead\',\'contact\',\'signup\'].includes(e.event || \'\'))
    if (formsTracked) {
      results.push(ok(\'g3\', \'Formulaires et CTAs — tracking détecté\', \'ga4\', [\'GA4\',\'Conversions\',\'Micro-signaux\'],
        `${raw.forms.length} formulaire(s) et ${raw.ctaElements} CTA(s) avec événement de conversion.`,
        [`Formulaires : ${raw.forms.length}`, `CTAs : ${raw.ctaElements}`], []))
    } else {
      results.push(fail(\'g3\', \'Formulaires et CTAs — tracking absent\', \'ga4\', [\'GA4\',\'Conversions\',\'Micro-signaux\'],
        `${raw.forms.length} formulaire(s) et ${raw.ctaElements} CTA(s) détectés mais AUCUN événement de conversion associé.`,
        [`CTAs détectés : ${raw.ctaElements}`],
        [\'GTM → Déclencheurs → Clic sur éléments → sélectionner les boutons CTA\',
         \'Ajouter : dataLayer.push({event:"generate_lead", form_id:"..."}) sur soumission\'], \'critical\'))
    }
  }

  const hasScrollTracking = customEvents.some(e => e.event === \'scroll\')
  if (!hasScrollTracking) {
    results.push(warn(\'g4\', \'Micro-signaux — scroll et clics non trackés\', \'ga4\', [\'GA4\',\'Micro-signaux\'],
      \'Aucun tracking de scroll ni de clic détecté.\',
      [\'Aucun événement scroll dans le dataLayer\'],
      [\'GA4 → Admin → Flux de données → Enhanced Measurement → Activer scrolls\']))
  }

  // ══ 4. GOOGLE ADS ════════════════════════════════════════════════════════
  if (raw.googleAdsIds.length > 0 || raw.networkRequests.some(r => r.type === \'google_ads\')) {
    results.push(ok(\'ga1\', `Google Ads ${raw.googleAdsIds[0] || \'AW-?\'} détecté`, \'google_ads\', [\'Google Ads\'],
      \'Tag Google Ads détecté sur la page.\', [], []))
  } else {
    results.push(warn(\'ga1\', \'Tag Google Ads non détecté sur cette page\', \'google_ads\', [\'Google Ads\'],
      \'Aucun container AW-*. Normal si le tag est sur la page de confirmation uniquement.\', [],
      [\'Vérifier sur la page de confirmation\']))
  }

  const hasUserData = raw.dataLayerEvents.some(e => e.keys.includes(\'user_data\') || e.preview.includes(\'email\'))
  if (hasUserData) {
    results.push(ok(\'ga2\', \'Données first-party (user_data) détectées\', \'google_ads\', [\'Google Ads\',\'Enhanced Conversions\'],
      \'Un objet user_data avec données client trouvé dans le dataLayer.\', [], []))
  } else {
    results.push(manual(\'ga2\', \'Enhanced Conversions — vérifier sur page de confirmation\', \'google_ads\', [\'Google Ads\',\'Enhanced Conversions\'],
      \'Les données user_data doivent être envoyées sur la page de confirmation.\',
      [\'La page analysée est probablement une LP d\'entrée sans soumission\'],
      [\'Page de confirmation : dataLayer.push({event:"generate_lead", user_data:{email:..., phone_number:...}})\']))
  }

  // ══ 5. META ══════════════════════════════════════════════════════════════
  if (raw.metaPixelIds.length > 0) {
    const metaReqs = raw.networkRequests.filter(r => r.type === \'meta\')
    const hasEm = metaReqs.some(r => r.params?.em || r.params?.hme)
    if (hasEm) {
      results.push(ok(\'m1\', \'Advanced Matching — données détectées\', \'meta\', [\'Meta\',\'Advanced Matching\'],
        \'Paramètres de correspondance avancée transmis à Meta.\', [], []))
    } else {
      results.push(fail(\'m1\', \'Advanced Matching — non configuré\', \'meta\', [\'Meta\',\'Advanced Matching\'],
        \'Aucun paramètre de correspondance avancée détecté dans les hits Meta.\',
        [\'Paramètres em et ph absents\'],
        [\'Meta Business Suite → Gestionnaire d\'événements → pixel → Paramètres → Correspondance automatique avancée → Activer\'], \'high\'))
    }

    if (raw.hasCAPI) {
      results.push(ok(\'m2\', \'Conversions API (CAPI) connectée\', \'meta\', [\'Meta\',\'CAPI\'],
        \'La Conversions API est active.\', [], []))
    } else {
      results.push(fail(\'m2\', \'Conversions API (CAPI) non connectée\', \'meta\', [\'Meta\',\'CAPI\'],
        \'CAPI non connectée. Les conversions iOS Safari ne sont pas récupérées.\',
        [\'Impact estimé : 20–40% de conversions perdues\'],
        [\'Meta Business Suite → Gestionnaire d\'événements → CAPI → Configurer\'], \'high\'))
    }
  }

  // ══ 6. GTM CHECKS (via API) ═══════════════════════════════════════════════
  if (gtmData) {
    const c = gtmData.checks

    // Consent Mode template dans GTM
    if (c.hasConsentModeTemplate) {
      results.push(ok(\'gtm1\', `Template Consent Mode GTM : ${c.consentModeTemplateName}`, \'consent\', [\'GTM\',\'Consent Mode\'],
        `Template CMP "${c.consentModeTemplateName}" configuré dans GTM (type: ${c.consentModeTemplateType}).`,
        [`Type : ${c.consentModeTemplateType}`, \'Consent Mode v2 géré par GTM\'],
        [\'Vérifier que le template est déclenché avant les autres tags (priorité élevée)\']))
    } else if (raw.cmpDetected) {
      results.push(warn(\'gtm1\', \'Template Consent Mode absent dans GTM\', \'consent\', [\'GTM\',\'Consent Mode\'],
        `${raw.cmpDetected} détecté sur la page mais aucun template CMP dans GTM.`,
        [\'Les signaux de consentement peuvent ne pas être correctement transmis à GTM\'],
        [`Ajouter le template officiel ${raw.cmpDetected} depuis la galerie communautaire GTM`], \'medium\'))
    }

    // All Pages trigger
    if (!c.hasAllPagesTrigger) {
      results.push(warn(\'gtm2\', \'Déclencheur All Pages non confirmé\', \'tag_base\', [\'GTM\'],
        \'Aucun déclencheur "All Pages" clairement identifié dans le workspace GTM.\',
        [`${gtmData.triggers.length} déclencheurs analysés`],
        [\'GTM → Déclencheurs → vérifier qu\'un déclencheur Page Vue couvre toutes les pages\']))
    }

    // GA4 tag dans GTM
    if (c.hasGA4ConfigTag) {
      results.push(ok(\'gtm3\', `Tag GA4 "${c.ga4ConfigTagName}" configuré dans GTM`, \'ga4\', [\'GA4\',\'GTM\'],
        `Tag GA4 Configuration actif dans GTM${c.ga4MeasurementId ? \` (ID: ${c.ga4MeasurementId})\` : \'\'}.`,
        [`Tag : ${c.ga4ConfigTagName}`, c.ga4MeasurementId ? `Measurement ID : ${c.ga4MeasurementId}` : \'ID non lisible\'],
        []))
    } else {
      results.push(fail(\'gtm3\', \'Tag GA4 absent dans GTM\', \'ga4\', [\'GA4\',\'GTM\'],
        \'Aucun tag GA4 Configuration trouvé dans le workspace GTM.\',
        [`${gtmData.tags.length} tags analysés`],
        [\'GTM → Nouveau tag → Google Analytics : Configuration GA4\'], \'critical\'))
    }

    // Meta Pixel dans GTM
    if (c.hasMetaPixelTag) {
      results.push(ok(\'gtm4\', `Tag Meta Pixel "${c.metaPixelTagName}" dans GTM`, \'meta\', [\'Meta\',\'GTM\'],
        `Pixel Meta${c.metaPixelId ? \` ${c.metaPixelId}\` : \'\'} configuré dans GTM.`,
        [`Tag : ${c.metaPixelTagName}`], []))
    } else if (raw.metaPixelIds.length > 0) {
      results.push(warn(\'gtm4\', \'Pixel Meta détecté en dur (hors GTM)\', \'meta\', [\'Meta\',\'GTM\'],
        \'Le pixel Meta est implémenté directement dans le code, pas via GTM. Moins flexible.\',
        [\'Pixel détecté dans le HTML mais pas dans GTM\'],
        [\'Migrer le pixel Meta dans GTM via le template officiel Meta Pixel\']))
    }

    // Conversion Linker dans GTM
    if (c.hasConversionLinker) {
      results.push(ok(\'gtm5\', \'Conversion Linker configuré dans GTM\', \'google_ads\', [\'Google Ads\',\'GTM\'],
        \'Tag Conversion Linker présent et actif dans GTM.\', [], []))
    } else if (raw.googleAdsIds.length > 0 || raw.networkRequests.some(r => r.type === \'google_ads\')) {
      results.push(fail(\'gtm5\', \'Conversion Linker absent dans GTM\', \'google_ads\', [\'Google Ads\',\'GTM\'],
        \'Google Ads détecté mais aucun Conversion Linker dans GTM. Le GCLID n\'est pas capturé.\',
        [\'Sans Conversion Linker, les conversions ne peuvent pas être attribuées aux clics Google Ads\'],
        [\'GTM → Nouveau tag → Conversion Linker → déclencheur All Pages\'], \'high\'))
    }

    // Enhanced Conversions dans GTM
    if (c.hasEnhancedConversions) {
      results.push(ok(\'gtm6\', `Enhanced Conversions "${c.enhancedConversionTagName}" dans GTM`, \'google_ads\', [\'Google Ads\',\'GTM\',\'Enhanced Conversions\'],
        \'Tag Enhanced Conversions configuré dans GTM.\', [], []))
    } else if (raw.googleAdsIds.length > 0) {
      results.push(warn(\'gtm6\', \'Enhanced Conversions absent dans GTM\', \'google_ads\', [\'Google Ads\',\'GTM\',\'Enhanced Conversions\'],
        \'Aucun tag Enhanced Conversions trouvé dans GTM.\',
        [\'Les données first-party ne sont pas transmises à Google Ads\'],
        [\'GTM → Tag de conversion Google Ads → activer "Suivi avancé des conversions"\']))
    }

    // Variables dataLayer
    if (c.dataLayerVariables.length > 0) {
      results.push(ok(\'gtm7\', `${c.dataLayerVariables.length} variable(s) dataLayer configurées`, \'ga4\', [\'GTM\',\'Events\'],
        `Variables : ${c.dataLayerVariables.slice(0, 5).join(\', \')}${c.dataLayerVariables.length > 5 ? \' ...\' : \'\'}.`,
        c.dataLayerVariables.slice(0, 8).map(v => `Variable : ${v}`),
        []))
    }

    if (c.hasUserDataVariable) {
      results.push(ok(\'gtm8\', \'Variable user_data (email/téléphone) configurée\', \'google_ads\', [\'GTM\',\'Enhanced Conversions\'],
        \'Une variable dataLayer contenant des données utilisateur est présente dans GTM.\', [], []))
    }

    // Qualité
    if (c.pausedTags.length > 0) {
      results.push(warn(\'gtm9\', `${c.pausedTags.length} tag(s) GTM en pause`, \'qa\', [\'GTM\',\'QA\'],
        `Tags en pause : ${c.pausedTags.slice(0, 3).join(\', \')}.`,
        c.pausedTags.map(t => `⏸ ${t}`),
        [\'Vérifier si ces tags doivent être réactivés ou supprimés\']))
    }

    if (c.tagsWithoutTrigger.length > 0) {
      results.push(warn(\'gtm10\', `${c.tagsWithoutTrigger.length} tag(s) sans déclencheur`, \'qa\', [\'GTM\',\'QA\'],
        `Tags orphelins détectés : ${c.tagsWithoutTrigger.slice(0, 3).join(\', \')}.`,
        c.tagsWithoutTrigger.map(t => `⚠ ${t}`),
        [\'Ces tags ne se déclencheront jamais — les supprimer ou ajouter un déclencheur\']))
    }

    if (c.hasTooManyTags) {
      results.push(warn(\'gtm11\', `${c.totalTagCount} tags dans GTM — impact perf possible`, \'qa\', [\'GTM\',\'QA\',\'Performance\'],
        `${c.totalTagCount} tags actifs dans GTM. Au-delà de 50, l\'impact sur les performances peut être significatif.`,
        [`Total tags : ${c.totalTagCount}`],
        [\'Auditer les tags obsolètes et les supprimer\', \'Regrouper les tags GA4 event en un seul déclencheur\']))
    } else {
      results.push(ok(\'gtm11\', `${c.totalTagCount} tags dans GTM — volume correct`, \'qa\', [\'GTM\',\'QA\'],
        `${c.totalTagCount} tags actifs. Volume nominal sans impact sur les performances.`, [], []))
    }
  }

  // ══ 7. QA ══════════════════════════════════════════════════════════════════
  if (raw.jsErrors.length > 0) {
    results.push(fail(\'q1\', `${raw.jsErrors.length} erreur(s) JavaScript`, \'qa\', [\'QA\'],
      `Erreurs JS : ${raw.jsErrors.slice(0, 2).join(\'; \')}.`,
      raw.jsErrors.slice(0, 5),
      [\'Corriger les erreurs JS qui peuvent bloquer le tracking\'], \'medium\'))
  } else {
    results.push(ok(\'q1\', \'Aucune erreur JavaScript\', \'qa\', [\'QA\'],
      \'Console JS propre.\',[],[]))
  }

  // Platform data enrichment
  if (platform?.ga4) {
    const ga4 = platform.ga4
    if (ga4.conversionEvents.length === 0) {
      results.push(fail(\'p1\', \'Aucune conversion configurée dans GA4\', \'ga4\', [\'GA4\',\'Platform\'],
        `Propriété GA4 ${ga4.measurementId} : 0 événement de conversion défini.`,
        [`Propriété : ${ga4.propertyName}`],
        [\'GA4 → Admin → Conversions → marquer les événements clés\'], \'critical\'))
    } else {
      results.push(ok(\'p1\', `${ga4.conversionEvents.length} conversion(s) dans GA4`, \'ga4\', [\'GA4\',\'Platform\'],
        `Conversions actives : ${ga4.conversionEvents.filter(e => e.isActive).map(e => e.name).join(\', \')}.`,
        ga4.conversionEvents.map(e => `${e.name} : ${e.isActive ? \'actif\' : \'inactif\'}`), []))
    }
  }

  if (platform?.meta) {
    const meta = platform.meta
    if (!meta.advancedMatchingEnabled) {
      results.push(fail(\'p5\', \'Advanced Matching désactivé (Meta API)\', \'meta\', [\'Meta\',\'Platform\'],
        `Pixel ${meta.pixelId} : Advanced Matching non activé dans le Gestionnaire d\'événements.`,
        [`Pixel : ${meta.pixelName}`],
        [\'Meta Events Manager → pixel → Paramètres → Correspondance automatique avancée → Activer\']))
    }
    if (meta.matchRate !== undefined && meta.matchRate < 40) {
      results.push(warn(\'p6\', `Taux de correspondance Meta faible : ${meta.matchRate}%`, \'meta\', [\'Meta\',\'Platform\'],
        `Match rate ${meta.matchRate}% (objectif > 60%).`,
        [`Match rate actuel : ${meta.matchRate}%`],
        [\'Ajouter plus de paramètres : email, téléphone, prénom, nom\']))
    }
  }

  return results
}

export function calculateScore(checks: CheckResult[]): AuditScore {
  const ok = checks.filter(c => c.status === \'ok\').length
  const warn = checks.filter(c => c.status === \'warn\').length
  const fail = checks.filter(c => c.status === \'fail\').length
  const manual = checks.filter(c => c.status === \'manual\').length
  const total = checks.length
  const points = ok * 100 + warn * 50 + fail * 0 + manual * 60
  const global = Math.round(points / (total * 100) * 100)
  const byCategory = (cat: CheckResult[\'category\']) => {
    const cats = checks.filter(c => c.category === cat)
    if (!cats.length) return 100
    const p = cats.filter(c=>c.status===\'ok\').length*100 + cats.filter(c=>c.status===\'warn\').length*50 + cats.filter(c=>c.status===\'manual\').length*60
    return Math.round(p/(cats.length*100)*100)
  }
  return { global, consent: byCategory(\'consent\'), measurement: byCategory(\'ga4\'), conversion: byCategory(\'google_ads\'), privacy: byCategory(\'consent\'), okCount: ok, warnCount: warn, failCount: fail, manualCount: manual, total }
}
