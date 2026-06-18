import { google } from 'googleapis'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GTMTag {
  tagId: string
  name: string
  type: string
  firingTriggerId: string[]
  blockingTriggerId: string[]
  consentSettings?: { consentStatus: string; consentType?: Array<{ type: string }> }
  parameter?: Array<{ type: string; key: string; value?: string; list?: any[] }>
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

export interface GTMContainerData {
  containerId: string
  containerName: string
  publicId: string
  usageContext: 'web' | 'server'
  tags: GTMTag[]
  triggers: GTMTrigger[]
  variables: GTMVariable[]
  checks: GTMChecks
  lastVersionDate: string | null
  lastVersionName: string | null
}

export interface GTMData {
  accountId: string
  accountName: string
  containers: GTMContainer[]
  web?: GTMContainerData
  server?: GTMContainerData
  // Backward compat aliases for analyzer
  tags: GTMTag[]
  triggers: GTMTrigger[]
  variables: GTMVariable[]
  checks: GTMChecks
  containerId?: string
  containerName?: string
  publicId?: string
}

export interface GTMChecks {
  // Consent Mode
  hasConsentModeTemplate: boolean
  consentModeTemplateName: string | null
  consentModeTemplateType: 'sgtm_cookie_cutter' | 'cookieyes' | 'onetrust' | 'didomi' | 'axeptio' | 'custom' | null

  // Tags essentiels (Web)
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
  hasTooManyTags: boolean

  // Dernière version publiée
  lastVersionDate: string | null
  lastVersionName: string | null
}

export interface GTMServerChecks {
  // Container SS found
  hasServerContainer: boolean
  serverContainerName: string | null
  serverPublicId: string | null

  // Tags SS
  totalTagCount: number
  tags: GTMTag[]

  // GA4 SS
  hasGA4ServerTag: boolean
  ga4ServerTagName: string | null

  // Meta CAPI SS
  hasMetaCAPITag: boolean
  metaCAPITagName: string | null
  metaCAPIPixelId: string | null

  // Google Ads SS
  hasGoogleAdsServerTag: boolean
  googleAdsServerTagName: string | null

  // Enhanced Conversions SS
  hasEnhancedConversionsServer: boolean
  enhancedConversionsServerTagName: string | null

  // Qualité
  pausedTags: string[]
  tagsWithoutTrigger: string[]
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

// ─── Fetch container workspace data ──────────────────────────────────────────
async function fetchContainerWorkspace(
  tagmanager: ReturnType<typeof google.tagmanager>,
  accountId: string,
  containerId: string
): Promise<{ tags: GTMTag[]; triggers: GTMTrigger[]; variables: GTMVariable[]; lastVersionDate: string | null; lastVersionName: string | null }> {
  const workspacesRes = await tagmanager.accounts.containers.workspaces.list({
    parent: `accounts/${accountId}/containers/${containerId}`,
  })
  const workspaces = workspacesRes.data.workspace || []
  const workspace = workspaces.find(w => w.name === 'Default Workspace') || workspaces[0]
  if (!workspace) return { tags: [], triggers: [], variables: [], lastVersionDate: null, lastVersionName: null }

  const wsPath = `accounts/${accountId}/containers/${containerId}/workspaces/${workspace.workspaceId}`

  const [tagsRes, triggersRes, variablesRes] = await Promise.allSettled([
    tagmanager.accounts.containers.workspaces.tags.list({ parent: wsPath }),
    tagmanager.accounts.containers.workspaces.triggers.list({ parent: wsPath }),
    tagmanager.accounts.containers.workspaces.variables.list({ parent: wsPath }),
  ])

  const rawTags = tagsRes.status === 'fulfilled' ? (tagsRes.value.data.tag || []) : []
  const rawTriggers = triggersRes.status === 'fulfilled' ? (triggersRes.value.data.trigger || []) : []
  const rawVariables = variablesRes.status === 'fulfilled' ? (variablesRes.value.data.variable || []) : []

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
    parameter: (t.parameter || []).map((p: any) => ({ type: p.type, key: p.key, value: p.value, list: p.list })),
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

  let lastVersionDate: string | null = null
  let lastVersionName: string | null = null
  try {
    const versionsRes = await tagmanager.accounts.containers.versions.live({
      parent: `accounts/${accountId}/containers/${containerId}`,
    })
    lastVersionDate = (versionsRes.data as any).version?.fingerprint || null
    lastVersionName = (versionsRes.data as any).version?.name || null
  } catch {}

  return { tags, triggers, variables, lastVersionDate, lastVersionName }
}

// ─── Find containers matching a scanned GTM ID or URL ────────────────────────
function findContainersByGtmId(
  allContainers: GTMContainer[],
  scannedGtmIds: string[]
): { web: GTMContainer | null; server: GTMContainer | null; accountId: string | null } {
  // Find web container matching one of the scanned GTM IDs
  let webContainer: GTMContainer | null = null
  for (const gtmId of scannedGtmIds) {
    const match = allContainers.find(c =>
      c.publicId === gtmId && (c.usageContext.includes('web') || c.usageContext.length === 0)
    )
    if (match) { webContainer = match; break }
  }

  if (!webContainer) {
    // Fallback: first web container available
    webContainer = allContainers.find(c =>
      c.usageContext.includes('web') || c.usageContext.length === 0
    ) || null
  }

  const accountId = webContainer?.accountId || null

  // Find server container in the same account
  let serverContainer: GTMContainer | null = null
  if (accountId) {
    serverContainer = allContainers.find(c =>
      c.accountId === accountId && c.usageContext.includes('server')
    ) || null
  }

  // Also check: scanned IDs might include a server container ID
  if (!serverContainer) {
    for (const gtmId of scannedGtmIds) {
      const match = allContainers.find(c =>
        c.publicId === gtmId && c.usageContext.includes('server')
      )
      if (match) { serverContainer = match; break }
    }
  }

  return { web: webContainer, server: serverContainer, accountId }
}

// ─── Main fetch function ─────────────────────────────────────────────────────
export async function fetchGTMData(
  accessToken: string,
  targetContainerId?: string,
  scannedGtmIds?: string[]
): Promise<GTMData | null> {
  try {
    const auth = getOAuthClient(accessToken)
    const tagmanager = google.tagmanager({ version: 'v2', auth })

    // 1. List ALL accounts and ALL containers
    const accountsRes = await tagmanager.accounts.list()
    const accounts = accountsRes.data.account || []
    if (accounts.length === 0) return null

    const allContainers: GTMContainer[] = []
    for (const account of accounts) {
      const aid = account.accountId!
      try {
        const containersRes = await tagmanager.accounts.containers.list({
          parent: `accounts/${aid}`,
        })
        for (const c of (containersRes.data.container || [])) {
          allContainers.push({
            accountId: c.accountId || '',
            containerId: c.containerId || '',
            name: c.name || '',
            publicId: c.publicId || '',
            usageContext: c.usageContext || [],
            domainName: c.domainName || [],
          })
        }
      } catch {}
    }

    if (allContainers.length === 0) {
      return {
        accountId: accounts[0].accountId || '',
        accountName: accounts[0].name || '',
        containers: [],
        tags: [], triggers: [], variables: [],
        checks: buildEmptyChecks(),
      }
    }

    // 2. Find web + server containers
    const gtmIds = scannedGtmIds || (targetContainerId ? [targetContainerId] : [])
    const { web: webContainer, server: serverContainer, accountId } = findContainersByGtmId(allContainers, gtmIds)

    const matchedAccountId = accountId || accounts[0].accountId || ''
    const matchedAccountName = accounts.find(a => a.accountId === matchedAccountId)?.name || ''

    // 3. Fetch workspace data for both containers in parallel
    const [webData, serverData] = await Promise.allSettled([
      webContainer
        ? fetchContainerWorkspace(tagmanager, webContainer.accountId, webContainer.containerId)
        : Promise.resolve(null),
      serverContainer
        ? fetchContainerWorkspace(tagmanager, serverContainer.accountId, serverContainer.containerId)
        : Promise.resolve(null),
    ])

    const webResult = webData.status === 'fulfilled' ? webData.value : null
    const serverResult = serverData.status === 'fulfilled' ? serverData.value : null

    // 4. Build checks for web
    const webChecks = webResult
      ? buildChecks(webResult.tags, webResult.triggers, webResult.variables, webResult.lastVersionDate, webResult.lastVersionName)
      : buildEmptyChecks()

    // 5. Build checks for server
    const serverChecks = serverResult
      ? buildServerChecks(serverResult.tags, serverResult.triggers, serverResult.variables)
      : null

    // 6. Build container data objects
    const webContainerData: GTMContainerData | undefined = webContainer && webResult ? {
      containerId: webContainer.containerId,
      containerName: webContainer.name,
      publicId: webContainer.publicId,
      usageContext: 'web',
      tags: webResult.tags,
      triggers: webResult.triggers,
      variables: webResult.variables,
      checks: webChecks,
      lastVersionDate: webResult.lastVersionDate,
      lastVersionName: webResult.lastVersionName,
    } : undefined

    const serverContainerData: GTMContainerData | undefined = serverContainer && serverResult && serverChecks ? {
      containerId: serverContainer.containerId,
      containerName: serverContainer.name,
      publicId: serverContainer.publicId,
      usageContext: 'server',
      tags: serverResult.tags,
      triggers: serverResult.triggers,
      variables: serverResult.variables,
      checks: webChecks, // not used directly, serverChecks is the main one
      lastVersionDate: serverResult.lastVersionDate,
      lastVersionName: serverResult.lastVersionName,
    } : undefined

    // Merge server checks into the main checks object for backward compat
    const mergedChecks: GTMChecks & { server?: GTMServerChecks } = { ...webChecks }
    if (serverChecks) {
      (mergedChecks as any).server = serverChecks
    }

    console.log(`[GTM] Web: ${webContainer?.publicId || 'none'} (${webResult?.tags.length || 0} tags), Server: ${serverContainer?.publicId || 'none'} (${serverResult?.tags.length || 0} tags)`)
    if (serverResult) {
      console.log(`[GTM SS Tags]`, serverResult.tags.map(t => `${t.name} (type: ${t.type})`))
    }
    if (webResult) {
      console.log(`[GTM Web Tags]`, webResult.tags.map(t => `${t.name} (type: ${t.type})`))
    }

    return {
      accountId: matchedAccountId,
      accountName: matchedAccountName,
      containers: allContainers,
      web: webContainerData,
      server: serverContainerData,
      // Backward compat: expose web container data at root
      tags: webResult?.tags || [],
      triggers: webResult?.triggers || [],
      variables: webResult?.variables || [],
      checks: mergedChecks,
      containerId: webContainer?.containerId,
      containerName: webContainer?.name,
      publicId: webContainer?.publicId,
    }
  } catch (err) {
    console.error('GTM fetch error:', err)
    return null
  }
}

// ─── Build checks for WEB container ─────────────────────────────────────────
function buildChecks(
  tags: GTMTag[],
  triggers: GTMTrigger[],
  variables: GTMVariable[],
  lastVersionDate: string | null,
  lastVersionName: string | null
): GTMChecks {

  const allPagesTrigger = triggers.find(t =>
    t.type === 'PAGEVIEW' || t.type === 'CUSTOM_EVENT' ||
    t.name.toLowerCase().includes('all pages') ||
    t.name.toLowerCase().includes('toutes les pages') ||
    t.name.toLowerCase().includes('page view')
  )

  // GA4 Config tag — match by type first, but EXCLUDE tags whose name indicates Meta/FB
  const isMetaName = (name: string) => {
    const n = name.toLowerCase()
    return n.includes('fb_') || n.includes('facebook') || n.includes('conversions_api') || n.includes('capi') || n.includes('meta pixel')
  }
  const ga4Tag = tags.find(t => (t.type === 'googtag' || t.type === 'gaawc') && !isMetaName(t.name))
    || tags.find(t => {
      const n = t.name.toLowerCase()
      return !isMetaName(t.name) && (n.includes('ga4') || n.includes('google analytics 4') || n.includes('google tag'))
    })
  const ga4MeasurementId = ga4Tag?.parameter?.find(p => p.key === 'tagId' || p.key === 'measurementId')?.value || null

  // Meta Pixel tag — match by type first, then by name (excluding GA4-only tags)
  const metaTag = tags.find(t => t.type === 'fbpixel' || t.type === 'facebook_pixel')
    || tags.find(t => {
      const n = t.name.toLowerCase()
      const isGa4Only = t.type === 'googtag' || t.type === 'gaawc'
      return !isGa4Only && (n.includes('fb_') || n.includes('meta pixel') || n.includes('facebook pixel'))
    })
  const metaPixelId = metaTag?.parameter?.find(p => p.key === 'pixelId' || p.key === 'pixel_id')?.value || null

  const convLinker = tags.find(t =>
    t.type === 'gclidw' || t.type === 'awconv' ||
    t.name.toLowerCase().includes('conversion linker') ||
    t.name.toLowerCase().includes('linker')
  )

  const gAdsTags = tags.filter(t =>
    t.type === 'awct' || t.type === 'google_ads_conversion' ||
    t.name.toLowerCase().includes('google ads') ||
    t.name.toLowerCase().includes('adwords') ||
    t.name.toLowerCase().includes('conversion google')
  )

  const ecTag = tags.find(t =>
    t.parameter?.some(p => (p.key === 'enhancedConversions' || p.key === 'enhanced_conversions') && p.value === 'true') ||
    t.name.toLowerCase().includes('enhanced conversion') ||
    t.name.toLowerCase().includes('suivi avancé')
  )

  const consentTags = tags.filter(t =>
    t.type === 'html' &&
    (t.name.toLowerCase().includes('consent') ||
     t.name.toLowerCase().includes('cookieyes') ||
     t.name.toLowerCase().includes('onetrust') ||
     t.name.toLowerCase().includes('didomi') ||
     t.name.toLowerCase().includes('axeptio') ||
     t.name.toLowerCase().includes('cookiebot'))
  )
  const consentTemplateTag = tags.find(t =>
    t.type?.toLowerCase().includes('consent') ||
    t.type?.toLowerCase().includes('cmp') ||
    consentTags.some(ct => ct.tagId === t.tagId)
  ) || consentTags[0]

  let consentModeTemplateType: GTMChecks['consentModeTemplateType'] = null
  if (consentTemplateTag) {
    const n = consentTemplateTag.name.toLowerCase()
    if (n.includes('cookieyes')) consentModeTemplateType = 'cookieyes'
    else if (n.includes('onetrust')) consentModeTemplateType = 'onetrust'
    else if (n.includes('didomi')) consentModeTemplateType = 'didomi'
    else if (n.includes('axeptio')) consentModeTemplateType = 'axeptio'
    else consentModeTemplateType = 'custom'
  }

  const dlVars = variables.filter(v => v.type === 'v' || v.type === 'jsm')
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

// ─── Build checks for SERVER container ──────────────────────────────────────
function buildServerChecks(
  tags: GTMTag[],
  triggers: GTMTrigger[],
  variables: GTMVariable[]
): GTMServerChecks {

  // Meta CAPI tag — detect FIRST to exclude from GA4 matching
  // Types: community templates vary but names/types contain facebook, meta, capi, conversions_api, fb_conversions
  const metaCAPITag = tags.find(t => {
    const type = (t.type || '').toLowerCase()
    const name = t.name.toLowerCase()
    return type.includes('facebook') || type.includes('meta') || type.includes('capi')
      || type.includes('fb_conversions') || type.includes('conversion_api')
      || name.includes('fb_conversions') || name.includes('conversions_api')
      || name.includes('capi') || name.includes('conversion api')
      || (name.includes('meta') && !name.includes('metadata'))
      || (name.includes('facebook') && name.includes('server'))
  })
  const metaCAPIPixelId = metaCAPITag?.parameter?.find(p =>
    p.key === 'pixelId' || p.key === 'pixel_id' || p.key === 'pixelid' || p.key === 'datasetId'
  )?.value
    // Also try to extract pixel ID from tag name (e.g. FB_CONVERSIONS_API-993896383378275-Server-Tag)
    || metaCAPITag?.name.match(/(\d{10,})/)?.[1]
    || null

  // GA4 Server tag (sGTM) — exclude Meta CAPI tags
  const ga4ServerTag = tags.find(t => {
    if (metaCAPITag && t.tagId === metaCAPITag.tagId) return false
    const type = (t.type || '').toLowerCase()
    const name = t.name.toLowerCase()
    return type === 'sgtmgaaw' || type === 'sgtmga4' || type.includes('ga4')
      || type.includes('google_analytics') || type.includes('gaaw')
      || (name.includes('ga4') && !name.includes('fb_') && !name.includes('conversions_api'))
      || name.includes('google analytics')
  })

  // Google Ads Server tag
  const gAdsServerTag = tags.find(t =>
    t.type === 'sgtmawc' || t.type === 'sgtm_google_ads' ||
    t.type?.toLowerCase().includes('google_ads') ||
    t.name.toLowerCase().includes('google ads') ||
    t.name.toLowerCase().includes('adwords')
  )

  // Enhanced Conversions server-side
  const ecServerTag = tags.find(t =>
    t.parameter?.some(p => (p.key === 'enhancedConversions' || p.key === 'enhanced_conversions') && p.value === 'true') ||
    t.name.toLowerCase().includes('enhanced conversion')
  )

  const pausedTags = tags.filter(t => t.paused).map(t => t.name)
  const tagsWithoutTrigger = tags.filter(t =>
    t.firingTriggerId.length === 0 && !t.paused
  ).map(t => t.name)

  return {
    hasServerContainer: true,
    serverContainerName: null, // filled by caller
    serverPublicId: null,
    totalTagCount: tags.length,
    tags,
    hasGA4ServerTag: !!ga4ServerTag,
    ga4ServerTagName: ga4ServerTag?.name || null,
    hasMetaCAPITag: !!metaCAPITag,
    metaCAPITagName: metaCAPITag?.name || null,
    metaCAPIPixelId,
    hasGoogleAdsServerTag: !!gAdsServerTag,
    googleAdsServerTagName: gAdsServerTag?.name || null,
    hasEnhancedConversionsServer: !!ecServerTag,
    enhancedConversionsServerTagName: ecServerTag?.name || null,
    pausedTags,
    tagsWithoutTrigger,
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
