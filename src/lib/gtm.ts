import { google } from 'googleapis'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GTMTag {
  tagId: string
  name: string
  type: string
  firingTriggerId: string[]
  blockingTriggerId: string[]
  consentSettings?: { consentStatus: string; consentType?: Array<{ type: string }> }
  parameter?: Array<{ type: string; key: string; value?: string }>
  paused?: boolean
}

export interface GTMTrigger {
  triggerId: string
  name: string
  type: string
  filter?: Array<{ type: string; parameter: any[] }>
}

export interface GTMVariable {
  variableId: string
  name: string
  type: string
  parameter?: Array<{ type: string; key: string; value?: string }>
}

export interface GTMContainer {
  accountId: string
  containerId: string
  name: string
  publicId: string  // GTM-XXXXX
  usageContext: string[]
  domainName?: string[]
}

export interface GTMData {
  accountId: string
  accountName: string
  containers: GTMContainer[]
  // Pour le container analysé
  containerId?: string
  containerName?: string
  publicId?: string
  tags: GTMTag[]
  triggers: GTMTrigger[]
  variables: GTMVariable[]
  // Checks extraits
  checks: GTMChecks
}

export interface GTMChecks {
  // Consent Mode
  hasConsentModeTemplate: boolean
  consentModeTemplateName: string | null
  consentModeTemplateType: 'sgtm_cookie_cutter' | 'cookieyes' | 'onetrust' | 'didomi' | 'axeptio' | 'custom' | null

  // Tags essentiels
  hasGA4ConfigTag: boolean
  ga4ConfigTagName: string | null
  ga4MeasurementId: string | null
  hasMetaPixelTag: boolean
  metaPixelTagName: string | null
  metaPixelId: string | null
  hasConversionLinker: boolean
  hasGoogleAdsConversion: boolean
  googleAdsConversionTags: string[]

  // Enhanced Conversions
  hasEnhancedConversions: boolean
  enhancedConversionTagName: string | null

  // Triggers
  hasAllPagesTrigger: boolean
  allPagesTriggerName: string | null

  // Variables dataLayer
  dataLayerVariables: string[]
  hasUserDataVariable: boolean
  hasTransactionIdVariable: boolean

  // Qualité
  totalTagCount: number
  pausedTags: string[]
  tagsWithoutTrigger: string[]
  tagsWithConsentRequired: string[]
  tagsWithConsentExempt: string[]

  // Performance
  hasTooManyTags: boolean  // > 50 tags = warning

  // Dernière version publiée
  lastVersionDate: string | null
  lastVersionName: string | null
}

// ─── OAuth client ─────────────────────────────────────────────────────────────
function getOAuthClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/google/callback`
  )
  oauth2Client.setCredentials({ access_token: accessToken })
  return oauth2Client
}

// ─── Main fetch function ──────────────────────────────────────────────────────
export async function fetchGTMData(accessToken: string, targetContainerId?: string): Promise<GTMData | null> {
  try {
    const auth = getOAuthClient(accessToken)
    const tagmanager = google.tagmanager({ version: 'v2', auth })

    // 1. List accounts
    const accountsRes = await tagmanager.accounts.list()
    const accounts = accountsRes.data.account || []
    if (accounts.length === 0) return null

    const account = accounts[0]
    const accountId = account.accountId!

    // 2. List containers
    const containersRes = await tagmanager.accounts.containers.list({
      parent: `accounts/${accountId}`,
    })
    const containers = (containersRes.data.container || []).map(c => ({
      accountId: c.accountId || '',
      containerId: c.containerId || '',
      name: c.name || '',
      publicId: c.publicId || '',
      usageContext: c.usageContext || [],
      domainName: c.domainName || [],
    }))

    if (containers.length === 0) {
      return {
        accountId,
        accountName: account.name || '',
        containers,
        tags: [],
        triggers: [],
        variables: [],
        checks: buildEmptyChecks(),
      }
    }

    // 3. Use first web container (or the one matching targetContainerId)
    const webContainers = containers.filter(c =>
      c.usageContext.includes('web') ||
      c.usageContext.length === 0 ||
      (targetContainerId && c.containerId === targetContainerId)
    )
    const container = targetContainerId
      ? containers.find(c => c.containerId === targetContainerId) || webContainers[0]
      : webContainers[0] || containers[0]

    if (!container) {
      return { accountId, accountName: account.name || '', containers, tags: [], triggers: [], variables: [], checks: buildEmptyChecks() }
    }

    const cid = container.containerId

    // 4. Get default workspace
    const workspacesRes = await tagmanager.accounts.containers.workspaces.list({
      parent: `accounts/${accountId}/containers/${cid}`,
    })
    const workspaces = workspacesRes.data.workspace || []
    const workspace = workspaces.find(w => w.name === 'Default Workspace') || workspaces[0]
    if (!workspace) {
      return { accountId, accountName: account.name || '', containers, containerId: cid, containerName: container.name, publicId: container.publicId, tags: [], triggers: [], variables: [], checks: buildEmptyChecks() }
    }

    const wsPath = `accounts/${accountId}/containers/${cid}/workspaces/${workspace.workspaceId}`

    // 5. Fetch tags, triggers, variables in parallel
    const [tagsRes, triggersRes, variablesRes] = await Promise.allSettled([
      tagmanager.accounts.containers.workspaces.tags.list({ parent: wsPath }),
      tagmanager.accounts.containers.workspaces.triggers.list({ parent: wsPath }),
      tagmanager.accounts.containers.workspaces.variables.list({ parent: wsPath }),
    ])

    const rawTags = tagsRes.status === 'fulfilled' ? (tagsRes.value.data.tag || []) : []
    const rawTriggers = triggersRes.status === 'fulfilled' ? (triggersRes.value.data.trigger || []) : []
    const rawVariables = variablesRes.status === 'fulfilled' ? (variablesRes.value.data.variable || []) : []

    // 6. Normalize
    const tags: GTMTag[] = rawTags.map(t => ({
      tagId: t.tagId || '',
      name: t.name || '',
      type: t.type || '',
      firingTriggerId: t.firingTriggerId || [],
      blockingTriggerId: t.blockingTriggerId || [],
      consentSettings: t.consentSettings ? {
        consentStatus: (t.consentSettings as any).consentStatus || '',
        consentType: (t.consentSettings as any).consentType,
      } : undefined,
      parameter: (t.parameter || []).map((p: any) => ({ type: p.type, key: p.key, value: p.value })),
      paused: t.paused || false,
    }))

    const triggers: GTMTrigger[] = rawTriggers.map(t => ({
      triggerId: t.triggerId || '',
      name: t.name || '',
      type: t.type || '',
    }))

    const variables: GTMVariable[] = rawVariables.map(v => ({
      variableId: v.variableId || '',
      name: v.name || '',
      type: v.type || '',
      parameter: (v.parameter || []).map((p: any) => ({ type: p.type, key: p.key, value: p.value })),
    }))

    // 7. Get last published version info
    let lastVersionDate: string | null = null
    let lastVersionName: string | null = null
    try {
      const versionsRes = await tagmanager.accounts.containers.versions.live({
        parent: `accounts/${accountId}/containers/${cid}`,
      })
      lastVersionDate = versionsRes.data.version?.fingerprint || null
      lastVersionName = versionsRes.data.version?.name || null
    } catch {}

    // 8. Build checks
    const checks = buildChecks(tags, triggers, variables, lastVersionDate, lastVersionName)

    return {
      accountId,
      accountName: account.name || '',
      containers,
      containerId: cid,
      containerName: container.name,
      publicId: container.publicId,
      tags,
      triggers,
      variables,
      checks,
    }
  } catch (err) {
    console.error('GTM fetch error:', err)
    return null
  }
}

// ─── Build checks from raw GTM data ──────────────────────────────────────────
function buildChecks(
  tags: GTMTag[],
  triggers: GTMTrigger[],
  variables: GTMVariable[],
  lastVersionDate: string | null,
  lastVersionName: string | null
): GTMChecks {

  // ── All Pages trigger ─────────────────────────────────────────────────────
  const allPagesTrigger = triggers.find(t =>
    t.type === 'PAGEVIEW' || t.type === 'CUSTOM_EVENT' ||
    t.name.toLowerCase().includes('all pages') ||
    t.name.toLowerCase().includes('toutes les pages') ||
    t.name.toLowerCase().includes('page view')
  )

  // ── GA4 Config tag ────────────────────────────────────────────────────────
  const ga4Tag = tags.find(t =>
    t.type === 'googtag' || t.type === 'gaawc' ||
    t.name.toLowerCase().includes('ga4') ||
    t.name.toLowerCase().includes('google analytics 4') ||
    t.name.toLowerCase().includes('google tag')
  )
  const ga4MeasurementId = ga4Tag?.parameter?.find(p => p.key === 'tagId' || p.key === 'measurementId')?.value || null

  // ── Meta Pixel tag ────────────────────────────────────────────────────────
  const metaTag = tags.find(t =>
    t.type === 'fbpixel' || t.type === 'facebook_pixel' ||
    t.name.toLowerCase().includes('meta') ||
    t.name.toLowerCase().includes('facebook') ||
    t.name.toLowerCase().includes('pixel')
  )
  const metaPixelId = metaTag?.parameter?.find(p => p.key === 'pixelId' || p.key === 'pixel_id')?.value || null

  // ── Conversion Linker ─────────────────────────────────────────────────────
  const convLinker = tags.find(t =>
    t.type === 'gclidw' || t.type === 'awconv' ||
    t.name.toLowerCase().includes('conversion linker') ||
    t.name.toLowerCase().includes('linker')
  )

  // ── Google Ads Conversion tags ────────────────────────────────────────────
  const gAdsTags = tags.filter(t =>
    t.type === 'awct' || t.type === 'google_ads_conversion' ||
    t.name.toLowerCase().includes('google ads') ||
    t.name.toLowerCase().includes('adwords') ||
    t.name.toLowerCase().includes('conversion google')
  )

  // ── Enhanced Conversions ──────────────────────────────────────────────────
  const ecTag = tags.find(t =>
    t.parameter?.some(p => (p.key === 'enhancedConversions' || p.key === 'enhanced_conversions') && p.value === 'true') ||
    t.name.toLowerCase().includes('enhanced conversion') ||
    t.name.toLowerCase().includes('suivi avancé')
  )

  // ── Consent Mode template ─────────────────────────────────────────────────
  // Les templates de la galerie GTM ont un type 'cvt_XXXX', pas 'html'
  // On cherche sur le nom ET le type ET les paramètres
  const CMP_KEYWORDS = [
    'cookieyes', 'cookie yes', 'cookie-yes',
    'onetrust', 'one trust',
    'didomi',
    'axeptio',
    'cookiebot', 'cookie bot', 'cookie-bot',
    'consentmanager', 'consent manager',
    'usercentrics',
    'klaro',
    'quantcast',
    'consent mode', 'consent-mode', 'consentmode',
    'cmp',
    'rgpd', 'gdpr',
    'cookie banner', 'cookiebanner',
    'cookie consent', 'cookieconsent',
  ]

  const isConsentTag = (t: GTMTag): boolean => {
    const name = t.name.toLowerCase()
    const type = (t.type || '').toLowerCase()

    // Nom contient un mot-clé CMP
    if (CMP_KEYWORDS.some(k => name.includes(k))) return true

    // Type contient un mot-clé CMP (community templates: cvt_ prefix possible)
    if (CMP_KEYWORDS.some(k => type.includes(k))) return true

    // Tag de type communauté (cvt_) avec "consent" dans le nom
    if (type.startsWith('cvt_') && name.includes('consent')) return true

    // Type spécifique au Consent Mode GTM natif
    if (type === 'consent_init_tag' || type === 'gconsent') return true

    // Paramètre avec clé consent/cmp
    if (t.parameter?.some(p =>
      p.key?.toLowerCase().includes('consent') ||
      p.value?.toLowerCase().includes('consent_default') ||
      p.value?.toLowerCase().includes('analytics_storage')
    )) return true

    return false
  }

  const consentTemplateTag = tags.find(isConsentTag)

  let consentModeTemplateType: GTMChecks['consentModeTemplateType'] = null
  if (consentTemplateTag) {
    const n = consentTemplateTag.name.toLowerCase()
    const tp = (consentTemplateTag.type || '').toLowerCase()
    const combined = n + ' ' + tp
    if (combined.includes('cookieyes') || combined.includes('cookie-yes'))        consentModeTemplateType = 'cookieyes'
    else if (combined.includes('onetrust') || combined.includes('one trust'))     consentModeTemplateType = 'onetrust'
    else if (combined.includes('didomi'))                                          consentModeTemplateType = 'didomi'
    else if (combined.includes('axeptio'))                                         consentModeTemplateType = 'axeptio'
    else if (combined.includes('cookiebot') || combined.includes('cookie bot'))   consentModeTemplateType = 'cookieyes'
    else                                                                           consentModeTemplateType = 'custom'
  }

  // ── dataLayer variables ───────────────────────────────────────────────────
  const dlVars = variables.filter(v =>
    v.type === 'v' || // Data Layer Variable
    v.type === 'jsm'  // Custom JavaScript
  )
  const dlVarNames = dlVars.map(v => v.name)
  const hasUserDataVariable = dlVars.some(v =>
    v.name.toLowerCase().includes('email') ||
    v.name.toLowerCase().includes('user_data') ||
    v.name.toLowerCase().includes('phone')
  )
  const hasTransactionIdVariable = dlVars.some(v =>
    v.name.toLowerCase().includes('transaction') ||
    v.name.toLowerCase().includes('order_id') ||
    v.name.toLowerCase().includes('purchase')
  )

  // ── Quality checks ────────────────────────────────────────────────────────
  const pausedTags = tags.filter(t => t.paused).map(t => t.name)
  const tagsWithoutTrigger = tags.filter(t =>
    t.firingTriggerId.length === 0 && !t.paused
  ).map(t => t.name)

  const tagsWithConsentRequired = tags.filter(t =>
    t.consentSettings?.consentStatus === 'notNeeded' ||
    t.consentSettings?.consentStatus === 'needed'
  ).map(t => t.name)

  const tagsWithConsentExempt = tags.filter(t =>
    t.consentSettings?.consentStatus === 'notNeeded'
  ).map(t => t.name)

  return {
    hasConsentModeTemplate: !!consentTemplateTag,
    consentModeTemplateName: consentTemplateTag?.name || null,
    consentModeTemplateType,

    hasGA4ConfigTag: !!ga4Tag,
    ga4ConfigTagName: ga4Tag?.name || null,
    ga4MeasurementId,

    hasMetaPixelTag: !!metaTag,
    metaPixelTagName: metaTag?.name || null,
    metaPixelId,

    hasConversionLinker: !!convLinker,
    hasGoogleAdsConversion: gAdsTags.length > 0,
    googleAdsConversionTags: gAdsTags.map(t => t.name),

    hasEnhancedConversions: !!ecTag,
    enhancedConversionTagName: ecTag?.name || null,

    hasAllPagesTrigger: !!allPagesTrigger,
    allPagesTriggerName: allPagesTrigger?.name || null,

    dataLayerVariables: dlVarNames,
    hasUserDataVariable,
    hasTransactionIdVariable,

    totalTagCount: tags.length,
    pausedTags,
    tagsWithoutTrigger,
    tagsWithConsentRequired,
    tagsWithConsentExempt,

    hasTooManyTags: tags.length > 50,

    lastVersionDate,
    lastVersionName,
  }
}

function buildEmptyChecks(): GTMChecks {
  return {
    hasConsentModeTemplate: false, consentModeTemplateName: null, consentModeTemplateType: null,
    hasGA4ConfigTag: false, ga4ConfigTagName: null, ga4MeasurementId: null,
    hasMetaPixelTag: false, metaPixelTagName: null, metaPixelId: null,
    hasConversionLinker: false, hasGoogleAdsConversion: false, googleAdsConversionTags: [],
    hasEnhancedConversions: false, enhancedConversionTagName: null,
    hasAllPagesTrigger: false, allPagesTriggerName: null,
    dataLayerVariables: [], hasUserDataVariable: false, hasTransactionIdVariable: false,
    totalTagCount: 0, pausedTags: [], tagsWithoutTrigger: [], tagsWithConsentRequired: [],
    tagsWithConsentExempt: [], hasTooManyTags: false,
    lastVersionDate: null, lastVersionName: null,
  }
}
