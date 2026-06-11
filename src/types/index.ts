export type CheckStatus = 'ok' | 'warn' | 'fail' | 'manual' | 'na'

export interface CheckResult {
  id: string
  label: string
  status: CheckStatus
  finding: string
  details: string[]
  actions: string[]
  consoleCommands?: string[]
  impact?: 'critical' | 'high' | 'medium' | 'low'
  category: CheckCategory
  tags: string[]
}

export type CheckCategory =
  | 'consent' | 'tag_base' | 'ga4' | 'google_ads' | 'meta' | 'server_side' | 'user_journey' | 'performance' | 'qa'

export interface ScanRawData {
  url: string
  finalUrl: string
  title: string
  timestamp: string
  hasGTM: boolean
  gtmContainers: string[]
  gtmScriptUrl?: string
  ga4Ids: string[]
  googleAdsIds: string[]
  hasGtag: boolean
  dataLayerEvents: DataLayerEvent[]
  consentDefault: ConsentState | null
  consentUpdate: ConsentState | null
  metaPixelIds: string[]
  fbqEvents: string[]
  hasCAPI: boolean
  cmpDetected: string | null
  hasTCF: boolean
  cookieBannerVisible: boolean
  networkRequests: NetworkRequest[]
  cookies: CookieInfo[]
  forms: FormInfo[]
  ctaElements: number
  emailInputs: number
  telInputs: number
  iframes: IframeInfo[]
  lcp?: number
  cls?: number
  ttfb?: number
  jsErrors: string[]
  pageType: 'landing' | 'checkout' | 'product' | 'blog' | 'home' | 'other'
  hasThankYouPage: boolean
}

export interface DataLayerEvent { event?: string; keys: string[]; preview: string }
export interface ConsentState {
  analytics_storage?: string; ad_storage?: string; ad_user_data?: string
  ad_personalization?: string; functionality_storage?: string
  personalization_storage?: string; security_storage?: string; wait_for_update?: number
}
export interface NetworkRequest {
  url: string; method: string; status: number
  type: 'ga4' | 'gtm' | 'meta' | 'google_ads' | 'cmp' | 'other'
  params?: Record<string, string>
}
export interface CookieInfo { name: string; value: string; category: 'analytics' | 'advertising' | 'functional' | 'cmp' | 'other' }
export interface FormInfo { id: string; action: string; hasEmail: boolean; hasTel: boolean; inputCount: number }
export interface IframeInfo { src: string; hasTracking: boolean }

export interface AuditReport {
  id: string; url: string; createdAt: string
  score: AuditScore; checks: CheckResult[]
  rawData: ScanRawData; aiSummary: AISummary
  connectedPlatforms: ConnectedPlatform[]
  platformData?: PlatformData
}

export interface AuditScore {
  global: number; consent: number; measurement: number; conversion: number; privacy: number
  okCount: number; warnCount: number; failCount: number; manualCount: number; total: number
}

export interface AISummary {
  headline: string; priority_issues: string[]
  quick_wins: string[]; strengths: string[]; estimated_data_loss: string
}

export type PlatformId = 'google_analytics' | 'google_ads' | 'meta'
export interface ConnectedPlatform { id: PlatformId; name: string; connected: boolean; accessToken?: string; accountId?: string; accountName?: string }

export interface PlatformData { ga4?: GA4Data; googleAds?: GoogleAdsData; meta?: MetaData }

export interface GA4Data {
  propertyId: string; propertyName: string; measurementId: string
  conversionEvents: GA4ConversionEvent[]; keyEvents: string[]
  dataStreams: GA4DataStream[]; recentEvents?: GA4RecentEvent[]
  enhancedMeasurement: GA4EnhancedMeasurement
}
export interface GA4ConversionEvent { name: string; isActive: boolean; countingMethod: string }
export interface GA4DataStream { id: string; name: string; measurementId: string; webStreamData?: { defaultUri: string } }
export interface GA4RecentEvent { name: string; count: number; timestamp: string }
export interface GA4EnhancedMeasurement {
  streamEnabled: boolean; scrollsEnabled: boolean; outboundClicksEnabled: boolean
  siteSearchEnabled: boolean; videoEngagementEnabled: boolean; fileDownloadsEnabled: boolean
  pageChangesEnabled: boolean; formInteractionsEnabled: boolean
}

export interface GoogleAdsData {
  customerId: string; customerName: string
  conversionActions: GoogleAdsConversion[]
  enhancedConversionsEnabled: boolean; autoTaggingEnabled: boolean
}
export interface GoogleAdsConversion { id: string; name: string; status: string; type: string; enhancedConversionsEnabled: boolean }

export interface MetaData {
  pixelId: string; pixelName: string
  advancedMatchingEnabled: boolean; capiConnected: boolean
  matchRate?: number; eventStats: MetaEventStat[]; recentEvents: string[]; qualityScore?: number
  serverEventsCount?: number; deduplicationEnabled?: boolean
}
export interface MetaEventStat { name: string; count: number; matchRate?: number }
