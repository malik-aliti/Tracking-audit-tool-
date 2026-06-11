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

export interface ServerContainerAnalysis {
  publicId: string
  name: string
  containerId: string
  // Clients (receive data)
  hasGA4Client: boolean
  ga4ClientName: string | null
  // Tags (forward data)
  hasMetaCapiTag: boolean
  hasGoogleAdsTag: boolean
  hasHttpRequestTag: boolean
  // Other
  serverDomain: string | null
  tagCount: number
  clientCount: number
  configured: boolean
}

export interface GTMData {
  accountId: string
  accountName: string
  containers: GTMContainer[]
  // Pour le container analysé (web)
  containerId?: string
  containerName?: string
  publicId?: string
  tags: GTMTag[]
  triggers: GTMTrigger[]
  variables: GTMVariable[]
  // Server container data
  serverContainerAnalysis: ServerContainerAnalysis[]
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

  // Server-side containers
  hasServerContainer: boolean
  serverContainers: Array<{ publicId: string; name: string; containerId: string }>

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isServerContainer(c: GTMContainer): boolean {
  // Multi-heuristic detection — usageContext value varies across accounts/regions
  const ctx = c.usageContext.map(u => u.toLowerCase())
  if (ctx.some(u => u.includes('server'))) return true
  const name = c.name.toLowerCase()
  if (['sgtm', 'server', 'server-side', 'serveur', 'server side', 'côté serveur', 'cote serveur', 'serverside']
    .some(k => name.includes(k))) return true
  return false
}

interface ServerWorkspaceData {
  tags: GTMTag[]
  clients: Array<{ name: string; type: string; parameter?: Array<{ type: string; key: string; value?: string }> }>
}

async function fetchServerContainerWorkspace(
  tagmanager: ReturnType<typeof google.tagmanager>,
  accountId: string,
  cid: string
): Promise<ServerWorkspaceData> {
  try {
    const wsRes = await tagmanager.accounts.containers.workspaces.list({
      parent: `accounts/${accountId}/containers/${cid}`,
    })
    const workspaces = wsRes.data.workspace || []
    const ws = workspaces.find(w => w.name === 'Default Workspace') || workspaces[0]
    if (!ws) return { tags: [], clients: [] }
    const wsPath = `accounts/${accountId}/containers/${cid}/workspaces/${ws.workspaceId}`

    const [tagsRes, clientsRes] = await Promise.allSettled([
      tagmanager.accounts.containers.workspaces.tags.list({ parent: wsPath }),
      (tagmanager.accounts.containers.workspaces as any).clients?.list({ parent: wsPath }),
    ])

    const tags: GTMTag[] = tagsRes.status === 'fulfilled'
      ? (tagsRes.value.data.tag || []).map((t: any) => ({
          tagId: t.tagId || '',
          name: t.name || '',
          type: t.type || '',
          firingTriggerId: t.firingTriggerId || [],
          blockingTriggerId: t.blockingTriggerId || [],
          parameter: (t.parameter || []).map((p: any) => ({ type: p.type, key: p.key, value: p.value })),
          paused: t.paused || false,
        }))
      : []

    const rawClients = clientsRes.status === 'fulfilled' && clientsRes.value?.data?.client
      ? clientsRes.value.data.client
      : []

    const clients = rawClients.map((cl: any) => ({
      name: cl.name || '',
      type: cl.type || '',
      parameter: (cl.parameter || []).map((p: any) => ({ type: p.type, key: p.key, value: p.value })),
    }))

    console.log('[GTM sGTM]', cid, '— tags:', tags.map(t => ({ name: t.name, type: t.type })), '— clients:', clients.map((cl: any) => ({ name: cl.name, type: cl.type })))

    return { tags, clients }
  } catch (err) {
    console.error('[GTM sGTM] fetch error for', cid, err)
    return { tags: [], clients: [] }
  }
}

function analyzeServerContainer(c: GTMContainer, data: ServerWorkspaceData): ServerContainerAnalysis {
  const { tags, clients } = data

  // GA4 Client: in sGTM it's a CLIENT not a tag
  // Type is typically 'gaawc' or contains 'ga4'/'google_analytics'
  const ga4ClientItem = clients.find(cl =>
    cl.type === 'gaawc' || cl.type === 'google_analytics_ga4' ||
    cl.name.toLowerCase().includes('ga4') ||
    cl.name.toLowerCase().includes('google analytics') ||
    cl.name.toLowerCase().includes('universal analytics')
  ) || tags.find(t =>
    t.type === 'gaawc' ||
    t.name.toLowerCase().includes('ga4 client') ||
    (t.name.toLowerCase().includes('ga4') && t.name.toLowerCase().includes('client'))
  )
  const hasGA4Client = !!ga4ClientItem

  // Meta CAPI: can be tag or client
  const hasMetaCapiTag = [...tags, ...clients].some(item =>
    item.name.toLowerCase().includes('meta') ||
    item.name.toLowerCase().includes('capi') ||
    item.name.toLowerCase().includes('facebook') ||
    item.name.toLowerCase().includes('conversions api') ||
    (item as any).type?.toLowerCase().includes('meta') ||
    (item as any).type?.toLowerCase().includes('facebook')
  )

  const hasGoogleAdsTag = tags.some(t =>
    t.name.toLowerCase().includes('google ads') ||
    t.name.toLowerCase().includes('adwords') ||
    t.type === 'awct'
  )

  const hasHttpRequestTag = tags.some(t =>
    t.type === 'http_request' || t.type === 'sp_http_request' ||
    t.name.toLowerCase().includes('http request') ||
    t.name.toLowerCase().includes('requête http')
  )

  // Server domain
  const domainFromParam = [...tags, ...clients]
    .flatMap(item => (item as any).parameter || [])
    .find((p: any) => p.key === 'taggingServerUrl' || p.key === 'serverContainerUrl' || p.key === 'requestPath')
    ?.value || null
  const serverDomain = (c.domainName && c.domainName.length > 0) ? c.domainName[0] : domainFromParam

  const configured = hasGA4Client || hasMetaCapiTag || hasGoogleAdsTag || hasHttpRequestTag || clients.length > 0

  return {
    publicId: c.publicId,
    name: c.name,
    containerId: c.containerId,
    hasGA4Client,
    ga4ClientName: ga4ClientItem?.name || null,
    hasMetaCapiTag,
    hasGoogleAdsTag,
    hasHttpRequestTag,
    serverDomain,
    tagCount: tags.length,
    clientCount: clients.length,
    configured,
  }
}

// ─── Main fetch function ──────────────────────────────────────────────────────
export async function fetchGTMData(accessToken: string, targetContainerId?: string, scannedContainerIds: string[] = []): Promise<GTMData | null> {
  try {
    const auth = getOAuthClient(accessToken)
    const tagmanager = google.tagmanager({ version: 'v2', auth })

    // 1. List ALL accounts
    const accountsRes = await tagmanager.accounts.list()
    const accounts = accountsRes.data.account || []
    if (accounts.length === 0) return null

    console.log('[GTM] accounts found:', accounts.map(a => ({ id: a.accountId, name: a.name })))

    // 2. List ALL containers across ALL accounts
    const allContainersRaw = await Promise.all(
      accounts.map(async (acct) => {
        try {
          const res = await tagmanager.accounts.containers.list({ parent: `accounts/${acct.accountId}` })
          return (res.data.container || [])
        } catch { return [] }
      })
    )

    // Find which account owns the scanned web container (or use first account with containers)
    let account = accounts[0]
    let accountContainersRaw = allContainersRaw[0] || []

    if (scannedContainerIds.length > 0) {
      for (let i = 0; i < accounts.length; i++) {
        const found = allContainersRaw[i].some(c => scannedContainerIds.includes(c.publicId || ''))
        if (found) { account = accounts[i]; accountContainersRaw = allContainersRaw[i]; break }
      }
    } else {
      // Use account with most containers
      const maxIdx = allContainersRaw.reduce((max, arr, i) => arr.length > allContainersRaw[max].length ? i : max, 0)
      account = accounts[maxIdx]
      accountContainersRaw = allContainersRaw[maxIdx]
    }

    const accountId = account.accountId!

    const containers: GTMContainer[] = accountContainersRaw.map(c => ({
      accountId: c.accountId || '',
      containerId: c.containerId || '',
      name: c.name || '',
      publicId: c.publicId || '',
      usageContext: c.usageContext || [],
      domainName: c.domainName || [],
    }))

    console.log('[GTM] containers in account', accountId, ':', containers.map(c => ({ publicId: c.publicId, name: c.name, usageContext: c.usageContext })))

    if (containers.length === 0) {
      return { accountId, accountName: account.name || '', containers, tags: [], triggers: [], variables: [], serverContainerAnalysis: [], checks: buildEmptyChecks() }
    }

    // 3. Classify containers
    // Strategy: scanned IDs = confirmed web containers. Everything else = server candidate.
    // Also apply usageContext + name heuristics as fallback.
    const classifyContainer = (c: GTMContainer): 'web' | 'server' | 'other' => {
      // If browser scan found this container ID, it's definitely a web container
      if (scannedContainerIds.length > 0 && scannedContainerIds.includes(c.publicId)) return 'web'

      const ctx = c.usageContext.map(u => u.toLowerCase())
      if (ctx.includes('web') || ctx.includes('amp')) return 'web'
      if (ctx.includes('androidsdk5') || ctx.includes('iossdk5')) return 'other'
      if (ctx.some(u => u.includes('server'))) return 'server'

      // Name-based heuristics
      const name = c.name.toLowerCase()
      if (['sgtm', 'server', 'server-side', 'serveur', 'server side', 'côté serveur', 'serverside']
        .some(k => name.includes(k))) return 'server'

      // If scanned IDs are known and this container is NOT among them → likely server
      if (scannedContainerIds.length > 0 && !scannedContainerIds.includes(c.publicId)) return 'server'

      // No scanned IDs available — treat empty/unknown usageContext as web
      return 'web'
    }

    const serverContainers = containers.filter(c => classifyContainer(c) === 'server')
    const webContainers = containers.filter(c => classifyContainer(c) === 'web')

    // 4. Analyze ALL server containers (fetch their tags)
    const serverContainerAnalysis: ServerContainerAnalysis[] = await Promise.all(
      serverContainers.map(async sc => {
        const data = await fetchServerContainerWorkspace(tagmanager, accountId, sc.containerId)
        return analyzeServerContainer(sc, data)
      })
    )

    // 5. Select web container to analyze
    const container = targetContainerId
      ? containers.find(c => c.containerId === targetContainerId || c.publicId === targetContainerId)
        || webContainers[0]
      : webContainers[0] || containers[0]

    if (!container) {
      return { accountId, accountName: account.name || '', containers, tags: [], triggers: [], variables: [], serverContainerAnalysis, checks: buildEmptyChecks() }
    }

    const cid = container.containerId

    // 6. Get default workspace for web container
    const workspacesRes = await tagmanager.accounts.containers.workspaces.list({
      parent: `accounts/${accountId}/containers/${cid}`,
    })
    const workspaces = workspacesRes.data.workspace || []
    const workspace = workspaces.find(w => w.name === 'Default Workspace') || workspaces[0]
    if (!workspace) {
      return { accountId, accountName: account.name || '', containers, containerId: cid, containerName: container.name, publicId: container.publicId, tags: [], triggers: [], variables: [], serverContainerAnalysis, checks: buildEmptyChecks() }
    }

    const wsPath = `accounts/${accountId}/containers/${cid}/workspaces/${workspace.workspaceId}`

    // 7. Fetch tags, triggers, variables in parallel
    const [tagsRes, triggersRes, variablesRes] = await Promise.allSettled([
      tagmanager.accounts.containers.workspaces.tags.list({ parent: wsPath }),
      tagmanager.accounts.containers.workspaces.triggers.list({ parent: wsPath }),
      tagmanager.accounts.containers.workspaces.variables.list({ parent: wsPath }),
    ])

    const rawTags = tagsRes.status === 'fulfilled' ? (tagsRes.value.data.tag || []) : []
    const rawTriggers = triggersRes.status === 'fulfilled' ? (triggersRes.value.data.trigger || []) : []
    const rawVariables = variablesRes.status === 'fulfilled' ? (variablesRes.value.data.variable || []) : []

    // 8. Normalize web container data
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

    // 9. Get last published version info
    let lastVersionDate: string | null = null
    let lastVersionName: string | null = null
    try {
      const versionsRes = await tagmanager.accounts.containers.versions.live({
        parent: `accounts/${accountId}/containers/${cid}`,
      })
      lastVersionDate = versionsRes.data.version?.fingerprint || null
      lastVersionName = versionsRes.data.version?.name || null
    } catch {}

    // 10. Build checks
    const checks = buildChecks(tags, triggers, variables, lastVersionDate, lastVersionName, serverContainerAnalysis)

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
      serverContainerAnalysis,
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
  lastVersionName: string | null,
  serverAnalysis: ServerContainerAnalysis[] = []
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

    hasServerContainer: serverAnalysis.length > 0,
    serverContainers: serverAnalysis.map(c => ({ publicId: c.publicId, name: c.name, containerId: c.containerId })),

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
    hasServerContainer: false, serverContainers: [],

    lastVersionDate: null, lastVersionName: null,
  }
}
