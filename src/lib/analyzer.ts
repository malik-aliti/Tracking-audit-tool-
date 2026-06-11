import type { ScanRawData, CheckResult, AuditScore, PlatformData } from '@/types'
import type { GTMData } from '@/lib/gtm'

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

export function analyzeTrackingData(raw: ScanRawData, platform?: PlatformData, gtmData?: GTMData): CheckResult[] {
  const results: CheckResult[] = []

  // ─── 1. CONSENT ────────────────────────────────────────────────────────────
  // Priorité : vérification via GTM quand disponible, sinon scan navigateur

  // c1 — Présence CMP (scan navigateur, toujours disponible)
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

  // c2 — TCF v2.2 (scan navigateur)
  if (raw.hasTCF) {
    results.push(ok('c2', 'TCF v2.2 actif', 'consent', ['Privacy', 'TCF'],
      'Framework TCF v2.2 détecté.',
      ['window.__tcfapi disponible'],
      ['Vérifier que la liste des vendeurs TCF est à jour']))
  } else {
    results.push(warn('c2', 'TCF v2.2 non détecté', 'consent', ['Privacy', 'TCF'],
      `${raw.cmpDetected || 'Aucune CMP'} sans TCF v2.2.`,
      ['window.__tcfapi non défini'],
      ['Pour cible UE : activer TCF v2.2 dans votre CMP']))
  }

  // c3 — Consent Mode v2 : SOURCE PRIMAIRE = GTM (template + signaux)
  // Quand GTM n'est pas connecté, fallback sur scan navigateur
  const hasCD = !!raw.consentDefault
  const allParams = !!(raw.consentDefault &&
    raw.consentDefault.analytics_storage !== undefined &&
    raw.consentDefault.ad_storage !== undefined &&
    raw.consentDefault.ad_user_data !== undefined &&
    raw.consentDefault.ad_personalization !== undefined)
  const isAdvanced = !!(raw.consentDefault?.wait_for_update && raw.consentDefault.wait_for_update > 0)

  if (gtmData) {
    // GTM connecté : vérification authoritative via le conteneur
    const gtmHasTemplate = gtmData.checks.hasConsentModeTemplate
    const templateName   = gtmData.checks.consentModeTemplateName || ''
    const templateType   = gtmData.checks.consentModeTemplateType || ''

    if (gtmHasTemplate && hasCD && allParams) {
      // ✓ Template dans GTM ET signaux confirmés côté navigateur
      results.push(ok('c3', `Consent Mode v2 ${isAdvanced ? '(Mode Avancé)' : '(Mode Basique)'} — via GTM`, 'consent', ['GTM', 'Consent Mode'],
        `Template "${templateName}" dans GTM${isAdvanced ? ` + wait_for_update: ${raw.consentDefault?.wait_for_update}ms` : ''}.`,
        [
          `Template GTM : ${templateName} (${templateType})`,
          `analytics_storage: ${raw.consentDefault?.analytics_storage}`,
          `ad_storage: ${raw.consentDefault?.ad_storage}`,
          `ad_user_data: ${raw.consentDefault?.ad_user_data}`,
          `ad_personalization: ${raw.consentDefault?.ad_personalization}`,
          isAdvanced ? 'Mode Avancé — modélisation des conversions activée' : 'Mode Basique — tags bloqués avant consentement',
        ],
        isAdvanced ? ['Configuration optimale.'] : ['Passer au Mode Avancé : ajouter wait_for_update: 2000 dans le template']))
    } else if (gtmHasTemplate && !hasCD) {
      // Template présent dans GTM mais signaux absents côté navigateur → template mal configuré
      results.push(warn('c3', `Template "${templateName}" dans GTM — signaux non détectés`, 'consent', ['GTM', 'Consent Mode'],
        `Le template est dans GTM mais aucun signal consent/default détecté sur la page.`,
        [
          `Template GTM : ${templateName}`,
          'Cause possible : séquence de chargement, déclencheur incorrect, ou mode prévisualisation',
        ],
        [
          'Vérifier que le tag CMP se déclenche sur All Pages avec priorité haute (ex : 999)',
          'GTM Preview : confirmer que le tag se déclenche avant gtm.js',
          'Tester avec Tag Assistant : le template doit être le premier tag à se déclencher',
        ], 'high'))
    } else if (gtmHasTemplate && hasCD && !allParams) {
      // Template dans GTM + signaux partiels
      results.push(warn('c3', `Template "${templateName}" — 4 paramètres incomplets`, 'consent', ['GTM', 'Consent Mode'],
        'Template dans GTM mais les 4 paramètres requis ne sont pas tous définis.',
        ['Paramètres requis : analytics_storage, ad_storage, ad_user_data, ad_personalization'],
        [`Dans le template GTM "${templateName}" : activer les 4 paramètres de consentement`], 'high'))
    } else if (!gtmHasTemplate && hasCD && allParams) {
      // Signaux présents côté nav mais aucun template GTM → implémentation hors GTM (acceptable mais déconseillé)
      results.push(warn('c3', 'Consent Mode v2 actif — template CMP absent dans GTM', 'consent', ['GTM', 'Consent Mode'],
        'Consent Mode v2 détecté côté navigateur, mais aucun template CMP dans le conteneur GTM.',
        [`analytics_storage: ${raw.consentDefault?.analytics_storage}`, 'Implémentation probablement en dur dans le HTML ou via CMP externe'],
        [
          'Recommandé : installer le template officiel de votre CMP depuis la galerie GTM',
          'Cela centralise la gestion du consentement et facilite les mises à jour RGPD',
        ], 'medium'))
    } else {
      // Ni template GTM ni signaux navigateur → FAIL critique
      results.push(fail('c3', 'Consent Mode v2 absent — aucun template GTM', 'consent', ['GTM', 'Consent Mode'],
        `Aucun template CMP dans GTM et aucun signal consent/default. Tags Google non conformes.`,
        [`${gtmData.tags.length} tags analysés dans GTM — aucun template Consent Mode trouvé`],
        [
          'GTM > Galerie de templates > chercher votre CMP (Cookiebot, Didomi, OneTrust, Axeptio, CookieYes)',
          'Configurer le template avec les 4 paramètres : analytics_storage, ad_storage, ad_user_data, ad_personalization',
          'Déclencheur : All Pages, Priorité : 999 (avant tous les autres tags)',
          'Activer le Mode Avancé : wait_for_update: 2000',
        ], 'critical'))
    }
  } else {
    // GTM non connecté : fallback vérification navigateur (comportement précédent)
    if (hasCD && allParams) {
      results.push(ok('c3', `Consent Mode v2 ${isAdvanced ? '(Mode Avancé)' : '(Mode Basique)'}`, 'consent', ['Google', 'Consent Mode'],
        `4 paramètres définis${isAdvanced ? ` avec wait_for_update: ${raw.consentDefault?.wait_for_update}ms` : ''}.`,
        [
          `analytics_storage: ${raw.consentDefault?.analytics_storage}`,
          `ad_storage: ${raw.consentDefault?.ad_storage}`,
          `ad_user_data: ${raw.consentDefault?.ad_user_data}`,
          `ad_personalization: ${raw.consentDefault?.ad_personalization}`,
          isAdvanced ? 'Mode Avancé — modélisation des conversions activée' : 'Mode Basique — tags bloqués avant consentement',
          '⚠ Connecter Google pour vérification via GTM',
        ],
        isAdvanced ? ['Mode Avancé optimal. Connecter Google pour vérification du template GTM.'] : ['Passer au Mode Avancé. Connecter Google pour vérification via GTM.']))
    } else if (hasCD) {
      results.push(warn('c3', 'Consent Mode v2 — paramètres incomplets', 'consent', ['Google', 'Consent Mode'],
        'consent/default présent mais les 4 paramètres ne sont pas tous définis.',
        ['Paramètres requis : analytics_storage, ad_storage, ad_user_data, ad_personalization'],
        ['Connecter Google pour vérifier le template GTM', 'Ajouter les paramètres manquants dans le template CMP GTM'], 'high'))
    } else {
      results.push(fail('c3', 'Consent Mode v2 absent', 'consent', ['Google', 'Consent Mode'],
        'Aucun signal consent/default. Connecter Google pour vérification via GTM.',
        ['Aucun appel gtag("consent","default") détecté'],
        [
          'Connecter Google pour un audit complet du conteneur GTM',
          'GTM : installer le template de votre CMP depuis la galerie de templates',
          'gtag("consent","default",{analytics_storage:"denied",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",wait_for_update:2000})',
        ], 'critical'))
    }
  }

  // c4 — Mise à jour consentement (toujours via scan navigateur — événement temps réel)
  if (raw.consentUpdate) {
    results.push(ok('c4', 'Mise à jour consentement transmise', 'consent', ['Google', 'Consent Mode'],
      'consent/update déclenché après interaction utilisateur.',
      [`analytics_storage: ${raw.consentUpdate.analytics_storage}`],
      ['Vérifier dans GTM que le template envoie bien le consent/update après acceptation']))
  }

  // 2. TAG BASE
  if (raw.hasGTM && raw.gtmContainers.some(c => c.startsWith('GTM-'))) {
    const gtmId = raw.gtmContainers.find(c => c.startsWith('GTM-'))
    results.push(ok('t1', `GTM ${gtmId} actif`, 'tag_base', ['Google','GTM'],
      `Conteneur ${gtmId} chargé.`,
      [`Container : ${gtmId}`],
      ['Vérifier le noscript GTM après <body>']))
  } else if (raw.hasGtag) {
    results.push(warn('t1', 'gtag.js sans GTM', 'tag_base', ['Google','GTM'],
      'gtag.js détecté sans GTM. Moins flexible.',
      ['window.gtag disponible mais pas de GTM'],
      ['Envisager la migration vers GTM'], 'low'))
  } else {
    results.push(fail('t1', 'Aucun tag manager Google', 'tag_base', ['Google','GTM'],
      'Ni GTM ni gtag.js détecté. Aucun tracking Google.',
      ['window.google_tag_manager non défini'],
      ['Installer GTM : tagmanager.google.com'], 'critical'))
  }

  if (raw.ga4Ids.length > 0) {
    results.push(ok('t2', `GA4 ${raw.ga4Ids[0]}`, 'tag_base', ['GA4','Google'],
      `Propriété GA4 ${raw.ga4Ids[0]} liée au conteneur GTM.`,
      [`Measurement ID : ${raw.ga4Ids[0]}`],
      ['Confirmer les hits /g/collect dans Network']))
  } else {
    const ga4Net = raw.networkRequests.some(r => r.type === 'ga4')
    if (ga4Net) {
      results.push(ok('t2', 'GA4 détecté via réseau', 'tag_base', ['GA4','Google'],
        'Hits GA4 dans le réseau.', [], []))
    } else {
      results.push(fail('t2', 'GA4 non détecté', 'tag_base', ['GA4','Google'],
        'Aucun Measurement ID GA4.',
        ['Aucun G-XXXXXXXX dans GTM'],
        ['Créer une propriété GA4 et ajouter le tag GTM'], 'critical'))
    }
  }

  if (raw.metaPixelIds.length > 0) {
    const isDouble = raw.networkRequests.filter(r => r.type === 'meta' && r.params?.ec === 'double').length > 0
    if (isDouble) {
      results.push(warn('t3', `Pixel Meta ${raw.metaPixelIds[0]} — double PageView`, 'tag_base', ['Meta'],
        'PageView envoyé 2 fois. Double-comptabilisation probable.',
        ['Pixel natif ET template GTM simultanément'],
        ['Supprimer le pixel natif du HTML, garder uniquement GTM'], 'high'))
    } else {
      results.push(ok('t3', `Pixel Meta ${raw.metaPixelIds[0]}`, 'tag_base', ['Meta'],
        `Pixel ${raw.metaPixelIds[0]} actif.`,
        [`CAPI : ${raw.hasCAPI ? 'connectée' : 'non connectée'}`],
        [raw.hasCAPI ? 'CAPI active' : 'Connecter la Conversions API']))
    }
  } else {
    results.push(warn('t3', 'Pixel Meta non détecté', 'tag_base', ['Meta'],
      'Aucun pixel Meta détecté.', [],
      ['Installer via GTM (template Meta Pixel officiel)']))
  }

  const hasGcl = raw.cookies.some(c => c.name.startsWith('_gcl'))
  if (hasGcl) {
    results.push(ok('t4', 'Conversion Linker actif', 'tag_base', ['Google Ads','GTM'],
      'Cookies _gcl_* détectés.',
      [raw.cookies.filter(c => c.name.startsWith('_gcl')).map(c => c.name).join(', ')], []))
  } else {
    results.push(warn('t4', 'Conversion Linker non confirmé', 'tag_base', ['Google Ads','GTM'],
      'Cookies _gcl_* non détectés. Normal sans GCLID dans URL.',
      ['Vérifier depuis un clic sur une annonce Google Ads'],
      ['GTM : ajouter tag Conversion Linker sur All Pages']))
  }

  // 3. GA4
  const custom = raw.dataLayerEvents.filter(e => e.event && !e.event.startsWith('gtm.') && e.event !== 'cookie_consent_update')
  if (custom.length > 0) {
    results.push(ok('g1', `${custom.length} événement(s) custom`, 'ga4', ['GA4','Events'],
      `Events : ${custom.map(e => e.event).join(', ')}.`,
      custom.map(e => `event: ${e.event}`), []))
  } else {
    results.push(warn('g1', 'Aucun événement custom', 'ga4', ['GA4','Events'],
      'Aucun événement business (form_submit, generate_lead, cta_click).',
      ['dataLayer : seuls gtm.js, gtm.dom détectés'],
      ['Créer des déclencheurs GTM pour les actions clés',
       'dataLayer.push({event:"generate_lead", ...})'], 'high'))
  }

  const urlParams = new URLSearchParams(new URL(raw.finalUrl || raw.url).search)
  if (urlParams.has('utm_source')) {
    results.push(ok('g2', `UTM source: ${urlParams.get('utm_source')}`, 'ga4', ['GA4','Attribution'],
      'Paramètres UTM présents.', [`utm_medium: ${urlParams.get('utm_medium')}`], []))
  } else {
    results.push(warn('g2', 'Aucun paramètre UTM', 'ga4', ['GA4','Attribution'],
      'Visite directe sans UTMs.', [],
      ['Tester depuis un clic campagne'], 'low'))
  }

  if (raw.forms.length > 0 || raw.ctaElements > 0) {
    const hasConvEvent = custom.some(e => ['form_submit','generate_lead','contact','signup','purchase'].includes(e.event || ''))
    if (hasConvEvent) {
      results.push(ok('g3', 'Formulaires et CTAs trackés', 'ga4', ['GA4','Conversions','Micro-signaux'],
        `${raw.forms.length} form(s) et ${raw.ctaElements} CTA(s) avec événement de conversion.`,
        [`Forms : ${raw.forms.length}`, `CTAs : ${raw.ctaElements}`], []))
    } else {
      results.push(fail('g3', 'Formulaires et CTAs — tracking absent', 'ga4', ['GA4','Conversions','Micro-signaux'],
        `${raw.forms.length} form(s) et ${raw.ctaElements} CTA(s) sans événement de conversion.`,
        [`CTAs détectés : ${raw.ctaElements}`],
        ['GTM : déclencheur clic sur les boutons CTA',
         'dataLayer.push({event:"generate_lead"}) sur soumission formulaire'], 'critical'))
    }
  } else {
    results.push(warn('g3', 'Aucun formulaire HTML natif', 'ga4', ['GA4','Conversions'],
      'Formulaire probablement en embed externe (Typeform, HubSpot...).',
      ['document.querySelectorAll("form").length = 0'],
      ['Identifier la solution de formulaire et configurer le tracking via webhook']))
  }

  if (!custom.some(e => e.event === 'scroll')) {
    results.push(warn('g4', 'Scroll et clics non trackés', 'ga4', ['GA4','Micro-signaux'],
      'Aucun tracking de scroll ni de clic.',
      ['Aucun événement scroll détecté'],
      ['GA4 Admin : activer Enhanced Measurement (scrolls, clics sortants)']))
  }

  // 4. GOOGLE ADS
  if (raw.googleAdsIds.length > 0) {
    results.push(ok('ga1', `Google Ads ${raw.googleAdsIds[0]}`, 'google_ads', ['Google Ads'],
      'Tag Google Ads détecté.', [], []))
  } else {
    results.push(warn('ga1', 'Tag Google Ads non détecté', 'google_ads', ['Google Ads'],
      'Aucun AW-*. Normal si tag sur page de confirmation.',
      ['À vérifier sur la page thank-you'],
      ['GTM : tag Google Ads Conversion sur URL de confirmation']))
  }

  const hasUD = raw.dataLayerEvents.some(e => e.keys.includes('user_data') || e.preview.includes('email'))
  if (hasUD) {
    results.push(ok('ga2', 'Données user_data détectées', 'google_ads', ['Google Ads','Enhanced Conversions'],
      'Objet user_data présent dans le dataLayer.', [], []))
  } else {
    results.push(manual('ga2', 'Enhanced Conversions — vérifier page de confirmation', 'google_ads', ['Google Ads','Enhanced Conversions'],
      'user_data à envoyer lors de la conversion (pas sur LP entrée).',
      ['Page analysée sans soumission de formulaire'],
      ['Page de confirmation : dataLayer.push({event:"generate_lead", user_data:{email:..., phone_number:...}})']))
  }

  // 5. META
  if (raw.metaPixelIds.length > 0) {
    const metaReqs = raw.networkRequests.filter(r => r.type === 'meta')
    const hasAM = metaReqs.some(r => r.params?.em || r.params?.hme || r.params?.ph)
    if (hasAM) {
      results.push(ok('m1', 'Advanced Matching détecté', 'meta', ['Meta','Advanced Matching'],
        'Paramètres de correspondance avancée transmis.', [], []))
    } else {
      results.push(fail('m1', 'Advanced Matching non configuré', 'meta', ['Meta','Advanced Matching'],
        'Aucun paramètre em/ph dans les hits Meta.',
        ['Paramètres em et ph absents'],
        ['Meta Events Manager : pixel > Paramètres > Correspondance avancée > Activer'], 'high'))
    }

    if (raw.hasCAPI) {
      results.push(ok('m2', 'CAPI connectée', 'meta', ['Meta','CAPI'],
        'Conversions API active.', [], []))
    } else {
      results.push(fail('m2', 'CAPI non connectée', 'meta', ['Meta','CAPI'],
        'Conversions iOS Safari et AdBlocker non récupérées.',
        ['Impact : 20-40% de conversions perdues (mobile)'],
        ['Meta Events Manager : pixel > Paramètres > Conversions API > Configurer'], 'high'))
    }
  }

  // 6. GTM CHECKS (via API)
  if (gtmData) {
    const c = gtmData.checks

    // gtm1 — Template CMP dans GTM : check de configuration (complète c3)
    if (c.hasConsentModeTemplate) {
      const hasPriority = true // GTM API ne retourne pas la priorité, à valider manuellement
      results.push(ok('gtm1', `Template CMP "${c.consentModeTemplateName}" configuré dans GTM`, 'consent', ['GTM', 'Consent Mode', 'CMP'],
        `Template "${c.consentModeTemplateName}" (${c.consentModeTemplateType}) trouvé dans le conteneur GTM.`,
        [
          `Template : ${c.consentModeTemplateName}`,
          `Type CMP : ${c.consentModeTemplateType}`,
          'Source : API GTM (vérification côté conteneur)',
        ],
        [
          'Confirmer que le déclencheur est "All Pages" avec priorité ≥ 999',
          'Tag Assistant : vérifier que ce tag est le premier à se déclencher',
          'Tester le Mode Avancé (wait_for_update > 0) pour la modélisation des conversions',
        ]))
    } else if (raw.cmpDetected) {
      results.push(warn('gtm1', `Template CMP absent dans GTM (${raw.cmpDetected} détecté sur la page)`, 'consent', ['GTM', 'Consent Mode', 'CMP'],
        `${raw.cmpDetected} actif sur la page mais aucun template officiel trouvé dans le conteneur GTM.`,
        [
          `CMP détectée : ${raw.cmpDetected}`,
          'Le Consent Mode v2 peut être partiellement configuré ou implémenté hors GTM',
        ],
        [
          `GTM > Galerie de templates > rechercher "${raw.cmpDetected}" > installer le template officiel`,
          'Le template officiel garantit la compatibilité avec les futures évolutions du Consent Mode',
          'Vérifier que la CMP transmet bien les 4 signaux : analytics_storage, ad_storage, ad_user_data, ad_personalization',
        ], 'high'))
    } else {
      results.push(fail('gtm1', 'Aucun template CMP dans GTM', 'consent', ['GTM', 'Consent Mode', 'CMP'],
        'Ni template CMP ni CMP détectée sur la page. Configuration Consent Mode v2 absente.',
        [`${gtmData.tags.length} tags analysés dans GTM — aucun tag de type CMP/Consent trouvé`],
        [
          'GTM > Galerie de templates > installer le template de votre CMP',
          'CMPs certifiées Google : Cookiebot, Didomi, OneTrust, Axeptio, CookieYes',
          'Activer les 4 paramètres + Mode Avancé (wait_for_update: 2000)',
        ], 'critical'))
    }

    if (c.hasGA4ConfigTag) {
      results.push(ok('gtm2', `Tag GA4 "${c.ga4ConfigTagName}" dans GTM`, 'ga4', ['GA4','GTM'],
        `Tag GA4 Configuration actif${c.ga4MeasurementId ? ` (${c.ga4MeasurementId})` : ''}.`,
        [c.ga4ConfigTagName || ''], []))
    } else {
      results.push(fail('gtm2', 'Tag GA4 absent dans GTM', 'ga4', ['GA4','GTM'],
        'Aucun tag GA4 Configuration dans GTM.',
        [`${gtmData.tags.length} tags analysés`],
        ['GTM : Nouveau tag > Google Analytics GA4 Configuration'], 'critical'))
    }

    if (c.hasMetaPixelTag) {
      results.push(ok('gtm3', `Tag Meta Pixel dans GTM`, 'meta', ['Meta','GTM'],
        `Pixel${c.metaPixelId ? ` ${c.metaPixelId}` : ''} configuré dans GTM.`,
        [c.metaPixelTagName || ''], []))
    } else if (raw.metaPixelIds.length > 0) {
      results.push(warn('gtm3', 'Pixel Meta hors GTM (code en dur)', 'meta', ['Meta','GTM'],
        'Pixel dans le HTML directement, pas via GTM.',
        ['Moins flexible, risque de double comptage'],
        ['Migrer vers template Meta Pixel dans GTM']))
    }

    if (c.hasConversionLinker) {
      results.push(ok('gtm4', 'Conversion Linker dans GTM', 'google_ads', ['Google Ads','GTM'],
        'Tag Conversion Linker actif.', [], []))
    } else if (raw.googleAdsIds.length > 0) {
      results.push(fail('gtm4', 'Conversion Linker absent dans GTM', 'google_ads', ['Google Ads','GTM'],
        'Google Ads détecté mais pas de Conversion Linker. GCLID non capturé.',
        ['Sans Conversion Linker, attribution Google Ads impossible'],
        ['GTM : Nouveau tag > Conversion Linker > déclencheur All Pages'], 'high'))
    }

    if (c.hasEnhancedConversions) {
      results.push(ok('gtm5', `Enhanced Conversions dans GTM`, 'google_ads', ['Google Ads','GTM','Enhanced Conversions'],
        'Enhanced Conversions configuré.', [], []))
    }

    if (c.dataLayerVariables.length > 0) {
      results.push(ok('gtm6', `${c.dataLayerVariables.length} variable(s) dataLayer`, 'ga4', ['GTM','Events'],
        `Variables : ${c.dataLayerVariables.slice(0, 5).join(', ')}.`,
        c.dataLayerVariables.slice(0, 8).map(v => `Variable : ${v}`), []))
    }

    if (c.pausedTags.length > 0) {
      results.push(warn('gtm7', `${c.pausedTags.length} tag(s) en pause`, 'qa', ['GTM','QA'],
        `Tags en pause : ${c.pausedTags.slice(0, 3).join(', ')}.`,
        c.pausedTags.map(t => `${t}`),
        ['Vérifier si ces tags doivent être réactivés ou supprimés']))
    }

    if (c.tagsWithoutTrigger.length > 0) {
      results.push(warn('gtm8', `${c.tagsWithoutTrigger.length} tag(s) sans déclencheur`, 'qa', ['GTM','QA'],
        `Tags orphelins : ${c.tagsWithoutTrigger.slice(0, 3).join(', ')}.`,
        c.tagsWithoutTrigger.map(t => `${t}`),
        ['Ces tags ne se déclencheront jamais — supprimer ou ajouter un déclencheur']))
    }

    results.push(c.hasTooManyTags
      ? warn('gtm9', `${c.totalTagCount} tags — impact performance`, 'qa', ['GTM','QA','Performance'],
          `${c.totalTagCount} tags (>50). Impact potentiel sur le chargement.`,
          [`Total : ${c.totalTagCount} tags`],
          ['Auditer et supprimer les tags obsolètes'])
      : ok('gtm9', `${c.totalTagCount} tags GTM — volume correct`, 'qa', ['GTM','QA'],
          `${c.totalTagCount} tags. Volume nominal.`, [], []))
  }

  // 7. QA
  if (raw.jsErrors.length > 0) {
    results.push(fail('q1', `${raw.jsErrors.length} erreur(s) JS`, 'qa', ['QA'],
      `Erreurs : ${raw.jsErrors.slice(0,2).join('; ')}.`,
      raw.jsErrors.slice(0,5), ['Corriger les erreurs JS avant tout'], 'medium'))
  } else {
    results.push(ok('q1', 'Aucune erreur JavaScript', 'qa', ['QA'],
      'Console JS propre.', [], []))
  }

  // Platform data
  if (platform?.ga4) {
    const g = platform.ga4
    if (g.conversionEvents.length === 0) {
      results.push(fail('p1', 'Aucune conversion dans GA4', 'ga4', ['GA4','Platform'],
        `Propriété ${g.measurementId} : 0 conversion définie.`,
        [`Propriété : ${g.propertyName}`],
        ['GA4 Admin : Conversions > marquer les événements clés'], 'critical'))
    } else {
      results.push(ok('p1', `${g.conversionEvents.length} conversion(s) GA4`, 'ga4', ['GA4','Platform'],
        `Actives : ${g.conversionEvents.filter(e => e.isActive).map(e => e.name).join(', ')}.`,
        g.conversionEvents.map(e => `${e.name} : ${e.isActive ? 'actif' : 'inactif'}`), []))
    }
  }

  if (platform?.meta) {
    const m = platform.meta
    if (!m.advancedMatchingEnabled) {
      results.push(fail('p2', 'Advanced Matching désactivé (API Meta)', 'meta', ['Meta','Platform'],
        `Pixel ${m.pixelId} : Advanced Matching non activé.`,
        [`Pixel : ${m.pixelName}`],
        ['Meta Events Manager : pixel > Paramètres > Correspondance avancée > Activer']))
    }
    if (m.matchRate !== undefined && m.matchRate < 40) {
      results.push(warn('p3', `Match rate Meta : ${m.matchRate}%`, 'meta', ['Meta','Platform'],
        `Match rate ${m.matchRate}% (objectif >60%).`,
        [`Actuel : ${m.matchRate}%`],
        ['Ajouter email, téléphone, prénom dans les paramètres AM']))
    }
  }

  return results
}

export function calculateScore(checks: CheckResult[]): AuditScore {
  const total = checks.length
  if (total === 0) return { global: 0, consent: 0, measurement: 0, conversion: 0, privacy: 0, okCount: 0, warnCount: 0, failCount: 0, manualCount: 0, total: 0 }
  const okC = checks.filter(c => c.status === 'ok').length
  const warnC = checks.filter(c => c.status === 'warn').length
  const failC = checks.filter(c => c.status === 'fail').length
  const manualC = checks.filter(c => c.status === 'manual').length
  const global = Math.round((okC * 100 + warnC * 50 + manualC * 60) / (total * 100) * 100)
  const cat = (cat: CheckResult['category']) => {
    const cc = checks.filter(c => c.category === cat)
    if (!cc.length) return 100
    const p = cc.filter(c => c.status === 'ok').length * 100 + cc.filter(c => c.status === 'warn').length * 50 + cc.filter(c => c.status === 'manual').length * 60
    return Math.round(p / (cc.length * 100) * 100)
  }
  return { global, consent: cat('consent'), measurement: cat('ga4'), conversion: cat('google_ads'), privacy: cat('consent'), okCount: okC, warnCount: warnC, failCount: failC, manualCount: manualC, total }
}
