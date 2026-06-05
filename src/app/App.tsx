'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AuditReport, ScanRawData, PlatformData, CheckResult } from '@/types'

// ─── Status config ────────────────────────────────────────────────────────────
const ST = {
  ok:     { bg:'#f0fdf4', border:'#86efac', text:'#166534', dot:'#22c55e', icon:'✓', label:'OK' },
  warn:   { bg:'#fffbeb', border:'#fcd34d', text:'#92400e', dot:'#f59e0b', icon:'⚠', label:'Attention' },
  fail:   { bg:'#fff1f2', border:'#fca5a5', text:'#991b1b', dot:'#ef4444', icon:'✕', label:'Échec' },
  manual: { bg:'#f0f4ff', border:'#a5b4fc', text:'#3730a3', dot:'#818cf8', icon:'○', label:'Manuel' },
  na:     { bg:'#f8fafc', border:'#e2e8f0', text:'#64748b', dot:'#94a3b8', icon:'—', label:'N/A' },
}

const CAT_LABELS: Record<string, string> = {
  consent: '🔒 Consentement & RGPD',
  tag_base: '🏷️ Taggage de base',
  ga4: '📊 GA4 & Analytics',
  google_ads: '⚡ Google Ads',
  meta: '🎯 Meta',
  qa: '✅ Qualité & QA',
  user_journey: '🗺️ Parcours utilisateur',
  performance: '⚡ Performance',
}

const TAG_COLORS: Record<string, [string, string]> = {
  Privacy: ['#fef3c7', '#92400e'], CMP: ['#fef3c7', '#92400e'],
  TCF: ['#fef9c3', '#854d0e'], 'Consent Mode': ['#fef9c3', '#854d0e'],
  Google: ['#dbeafe', '#1e40af'], GTM: ['#dbeafe', '#1e40af'],
  'Google Ads': ['#e0e7ff', '#3730a3'], 'Enhanced Conversions': ['#e0e7ff', '#3730a3'],
  GA4: ['#d1fae5', '#065f46'], Events: ['#d1fae5', '#065f46'],
  Meta: ['#ede9fe', '#5b21b6'], CAPI: ['#ede9fe', '#5b21b6'], 'Advanced Matching': ['#ede9fe', '#5b21b6'],
  Attribution: ['#fce7f3', '#9d174d'], QA: ['#fee2e2', '#991b1b'],
  Conversions: ['#e0e7ff', '#3730a3'], 'Micro-signaux': ['#f0fdf4', '#065f46'],
  Performance: ['#fef3c7', '#92400e'], Platform: ['#dbeafe', '#1e40af'],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size/2}px ${size/2}px`, fill: '#0f172a', fontSize: size < 60 ? 14 : 18, fontWeight: 700, fontFamily: 'DM Sans, sans-serif' }}>
        {score}
      </text>
    </svg>
  )
}

function TagPill({ tag }: { tag: string }) {
  const [bg, tc] = TAG_COLORS[tag] || ['#f1f5f9', '#475569']
  return <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: bg, color: tc, border: `0.5px solid ${tc}22` }}>{tag}</span>
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800) }}
      style={{ position: 'absolute', top: 6, right: 6, background: done ? '#059669' : '#1e293b', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 700, color: done ? '#fff' : '#94a3b8', transition: 'all .2s' }}>
      {done ? '✓' : 'Copier'}
    </button>
  )
}

// ─── Connection status badge ──────────────────────────────────────────────────
function PlatformBadge({ name, icon, connected, onConnect }: { name: string; icon: string; connected: boolean; onConnect: () => void }) {
  return (
    <button onClick={onConnect} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
      background: connected ? '#f0fdf4' : '#f8fafc',
      border: `1px solid ${connected ? '#86efac' : '#e2e8f0'}`,
      borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600,
      color: connected ? '#166534' : '#64748b', transition: 'all .2s',
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      {name}
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#22c55e' : '#cbd5e1', flexShrink: 0 }} />
    </button>
  )
}

// ─── Check row ────────────────────────────────────────────────────────────────
function CheckRow({ check, onOpen }: { check: CheckResult; onOpen: (c: CheckResult) => void }) {
  const cfg = ST[check.status] || ST.na
  const rowBg = check.status === 'fail' ? '#fff8f8' : check.status === 'ok' ? '#fafffe' : 'white'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', borderBottom: '0.5px solid #f1f5f9', background: rowBg, transition: 'background .2s' }}>
      <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: cfg.text, marginTop: 2 }}>
        {cfg.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
          {check.impact === 'critical' && <span style={{ fontSize: 8, fontWeight: 800, background: '#fee2e2', color: '#991b1b', padding: '1px 5px', borderRadius: 3 }}>CRITIQUE</span>}
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{check.label}</span>
        </div>
        <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.5, marginBottom: 5 }}>{check.finding}</div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {check.tags.map(t => <TagPill key={t} tag={t} />)}
        </div>
      </div>
      <button onClick={() => onOpen(check)} style={{ flexShrink: 0, padding: '5px 11px', fontSize: 10, fontWeight: 700, border: '0.5px solid #e2e8f0', borderRadius: 6, background: 'white', color: '#6366f1', cursor: 'pointer' }}>
        Détails →
      </button>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function CheckModal({ check, onClose, onGoFix }: { check: CheckResult; onClose: () => void; onGoFix: () => void }) {
  const cfg = ST[check.status] || ST.na
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 300 }}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 40px 80px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '0.5px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
                {check.impact === 'critical' && <span style={{ fontSize: 8, fontWeight: 800, background: '#fee2e2', color: '#991b1b', padding: '1px 5px', borderRadius: 3 }}>CRITIQUE</span>}
                {check.tags.map(t => <TagPill key={t} tag={t} />)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>{check.label}</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '8px 11px', borderRadius: 8, background: cfg.bg, border: `0.5px solid ${cfg.border}` }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{cfg.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: cfg.text }}>{check.finding}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', fontSize: 15, color: '#64748b', flexShrink: 0 }}>×</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          {check.details?.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '.09em', textTransform: 'uppercase', marginBottom: 7 }}>Données analysées</div>
              {check.details.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, padding: '4px 0', borderBottom: '0.5px solid #f8fafc', fontSize: 11, color: '#334155', lineHeight: 1.55 }}>
                  <span style={{ color: '#6366f1', flexShrink: 0, fontSize: 9, marginTop: 2 }}>◆</span>
                  <span>{d}</span>
                </div>
              ))}
            </>
          )}
          {check.actions?.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '.09em', textTransform: 'uppercase', margin: '14px 0 7px' }}>Actions recommandées</div>
              {check.actions.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 10px', marginBottom: 4, background: '#fafafa', border: '0.5px solid #f1f5f9', borderRadius: 7, fontSize: 11, color: '#1e293b', lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700, color: '#6366f1', minWidth: 16, flexShrink: 0 }}>{i + 1}.</span>
                  <span>{a}</span>
                </div>
              ))}
            </>
          )}
          {check.consoleCommands?.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '.09em', textTransform: 'uppercase', margin: '14px 0 7px' }}>Commandes console DevTools</div>
              {check.consoleCommands.map((cmd, i) => (
                <div key={i} style={{ position: 'relative', marginBottom: 6 }}>
                  <pre style={{ background: '#0f172a', borderRadius: 7, padding: '10px 40px 10px 12px', fontSize: 10, color: '#7dd3fc', fontFamily: 'DM Mono, monospace', lineHeight: 1.6, overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {cmd}
                  </pre>
                  <CopyBtn text={cmd} />
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ padding: '10px 18px', borderTop: '0.5px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
          {(check.status === 'fail' || check.status === 'warn') && (
            <button onClick={onGoFix} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, background: '#6366f1', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
              Voir le plan de correction →
            </button>
          )}
          <button onClick={onClose} style={{ marginLeft: 'auto', padding: '7px 14px', fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Fix plan ─────────────────────────────────────────────────────────────────
function FixPlan({ checks }: { checks: CheckResult[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0)
  const issues = checks.filter(c => c.status === 'fail' || c.status === 'warn')
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 }
      return (order[a.impact || 'medium'] || 2) - (order[b.impact || 'medium'] || 2)
    })
  const [done, setDone] = useState<Set<string>>(new Set())

  if (issues.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Aucun problème détecté !</div>
    </div>
  )

  const urgencyColor = (imp?: string) => imp === 'critical' ? '#dc2626' : imp === 'high' ? '#d97706' : imp === 'medium' ? '#2563eb' : '#64748b'
  const urgencyBg = (imp?: string) => imp === 'critical' ? '#fee2e2' : imp === 'high' ? '#fef3c7' : imp === 'medium' ? '#dbeafe' : '#f1f5f9'
  const urgencyLabel = (imp?: string) => imp === 'critical' ? 'URGENT' : imp === 'high' ? 'HAUTE' : imp === 'medium' ? 'MOYENNE' : 'FAIBLE'

  return (
    <div>
      <div style={{ background: '#fff1f2', border: '0.5px solid #fca5a5', borderRadius: 9, padding: '11px 14px', marginBottom: 14, display: 'flex', gap: 9 }}>
        <span style={{ fontSize: 18 }}>🚨</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 2 }}>
            {issues.filter(i => i.impact === 'critical').length} critique(s) · {issues.filter(i => i.impact === 'high').length} haute(s) priorité
          </div>
          <div style={{ fontSize: 11, color: '#7f1d1d' }}>Commencer par les correctifs marqués URGENT.</div>
        </div>
      </div>
      {issues.map((issue, idx) => (
        <div key={issue.id} style={{ background: 'white', border: `0.5px solid ${issue.status === 'fail' ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
          <div onClick={() => setOpenIdx(openIdx === idx ? null : idx)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', cursor: 'pointer' }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, background: urgencyBg(issue.impact), color: urgencyColor(issue.impact) }}>
              {idx + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{issue.label}</span>
                <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 99, background: urgencyBg(issue.impact), color: urgencyColor(issue.impact) }}>{urgencyLabel(issue.impact)}</span>
              </div>
              <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.5 }}>{issue.finding}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {done.has(issue.id) && <span style={{ fontSize: 10, fontWeight: 700, color: '#059669' }}>✓ Corrigé</span>}
              <span style={{ fontSize: 10, color: '#cbd5e1' }}>{openIdx === idx ? '▲' : '▼'}</span>
            </div>
          </div>
          {openIdx === idx && (
            <div style={{ padding: '0 16px 14px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 7, marginTop: 4 }}>Plan d'action étape par étape</div>
              {issue.actions.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 10px', marginBottom: 5, background: '#fafafa', border: '0.5px solid #f1f5f9', borderRadius: 8, fontSize: 11, color: '#1e293b', lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 800, color: '#6366f1', minWidth: 18, flexShrink: 0 }}>{i + 1}.</span>
                  <span>{a}</span>
                </div>
              ))}
              {issue.consoleCommands && issue.consoleCommands.length > 0 && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6, marginTop: 10 }}>Vérification DevTools</div>
                  {issue.consoleCommands.map((cmd, i) => (
                    <div key={i} style={{ position: 'relative', marginBottom: 5 }}>
                      <pre style={{ background: '#0f172a', borderRadius: 7, padding: '9px 40px 9px 12px', fontSize: 10, color: '#7dd3fc', fontFamily: 'DM Mono, monospace', lineHeight: 1.6, overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                        {cmd}
                      </pre>
                      <CopyBtn text={cmd} />
                    </div>
                  ))}
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button onClick={() => setDone(prev => { const n = new Set(prev); done.has(issue.id) ? n.delete(issue.id) : n.add(issue.id); return n })}
                  style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, background: done.has(issue.id) ? '#059669' : '#f1f5f9', color: done.has(issue.id) ? 'white' : '#475569', border: '0.5px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', transition: 'all .2s' }}>
                  {done.has(issue.id) ? '✓ Correctif appliqué' : 'Marquer comme corrigé'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'analyzing' | 'done' | 'error'>('idle')
  const [phaseMsg, setPhaseMsg] = useState('')
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'audit' | 'fixes' | 'platforms'>('audit')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [modalCheck, setModalCheck] = useState<CheckResult | null>(null)
  const [connections, setConnections] = useState<{ google?: { accessToken: string; propertyName?: string; measurementId?: string }; meta?: { accessToken: string; pixelName?: string } }>({})

  // Handle OAuth callbacks
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const payload = params.get('payload')
    if (payload) {
      try {
        const data = JSON.parse(decodeURIComponent(payload))
        if (data.platform === 'google') {
          setConnections(prev => ({ ...prev, google: { accessToken: data.accessToken, propertyName: data.ga4PropertyName, measurementId: data.ga4MeasurementId } }))
        } else if (data.platform === 'meta') {
          setConnections(prev => ({ ...prev, meta: { accessToken: data.accessToken, pixelName: data.pixelName } }))
        }
      } catch (e) {}
      window.history.replaceState({}, '', '/')
    }
  }, [])

  // Init sections
  useEffect(() => {
    if (report) {
      const cats = [...new Set(report.checks.map(c => c.category))]
      setOpenSections(Object.fromEntries(cats.map(c => [c, true])))
    }
  }, [report])

  // Expose __trackaudit pour injection depuis Claude in Chrome
  // Reçoit les données navigateur et lance l'analyse complète
  useEffect(() => {
    const handleBrowserData = async (browserData: any) => {
      if (!browserData || browserData._source !== 'browser') return
      setUrl(browserData.url || '')
      setPhase('scanning')
      setPhaseMsg('Données navigateur reçues — analyse en cours...')
      setError('')
      setReport(null)
      try {
        const scanRes = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ browserData }),
        })
        const scanJson = await scanRes.json()
        if (!scanJson.success) throw new Error(scanJson.error || 'Erreur scan')
        setPhase('analyzing')
        setPhaseMsg('Analyse IA — 30+ vérifications...')
        let platformData: PlatformData | undefined
        if (connections.google?.accessToken) {
          try {
            const r = await fetch('/api/google/ga4', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: connections.google.accessToken }) })
            const j = await r.json()
            if (j.success) platformData = { ...platformData, ga4: j.ga4, googleAds: j.googleAds }
          } catch {}
        }
        if (connections.meta?.accessToken) {
          try {
            const r = await fetch('/api/meta/pixel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: connections.meta.accessToken }) })
            const j = await r.json()
            if (j.success) platformData = { ...platformData, meta: j.meta }
          } catch {}
        }
        const analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scanData: scanJson.data, platformData }),
        })
        const analyzeJson = await analyzeRes.json()
        if (!analyzeJson.success) throw new Error(analyzeJson.error || 'Erreur analyse')
        setReport(analyzeJson.report)
        setPhase('done')
      } catch (err: any) {
        setError(err.message || 'Erreur inconnue')
        setPhase('error')
      }
    }
    ;(window as any).__trackaudit = handleBrowserData
    return () => { delete (window as any).__trackaudit }
  }, [connections])

  const connectGoogle = async () => {
    const res = await fetch('/api/google')
    const { authUrl } = await res.json()
    window.location.href = authUrl
  }

  const connectMeta = async () => {
    const res = await fetch('/api/meta')
    const { authUrl } = await res.json()
    window.location.href = authUrl
  }

  const runAudit = useCallback(async () => {
    if (!url.trim()) return
    setPhase('scanning')
    setPhaseMsg('Chargement de la page et scan du DOM, cookies, réseau...')
    setError('')
    setReport(null)

    try {
      // 1. Scan
      const scanRes = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const scanJson = await scanRes.json()
      if (!scanJson.success) throw new Error(scanJson.error || 'Erreur de scan')
      const scanData: ScanRawData = scanJson.data

      // 2. Fetch platform data if connected
      setPhase('analyzing')
      setPhaseMsg('Connexion aux plateformes et analyse IA en cours...')
      let platformData: PlatformData | undefined

      if (connections.google?.accessToken) {
        try {
          const gRes = await fetch('/api/google/ga4', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: connections.google.accessToken }),
          })
          const gJson = await gRes.json()
          if (gJson.success) {
            platformData = { ...platformData, ga4: gJson.ga4, googleAds: gJson.googleAds }
          }
        } catch (e) {}
      }

      if (connections.meta?.accessToken) {
        try {
          const mRes = await fetch('/api/meta/pixel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: connections.meta.accessToken }),
          })
          const mJson = await mRes.json()
          if (mJson.success) {
            platformData = { ...platformData, meta: mJson.meta }
          }
        } catch (e) {}
      }

      // 3. Analyze
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanData, platformData }),
      })
      const analyzeJson = await analyzeRes.json()
      if (!analyzeJson.success) throw new Error(analyzeJson.error || 'Erreur d\'analyse')

      setReport(analyzeJson.report)
      setPhase('done')
    } catch (err: any) {
      setError(err.message || 'Erreur inconnue')
      setPhase('error')
    }
  }, [url, connections])

  const checks = report?.checks || []
  const categories = [...new Set(checks.map(c => c.category))]
  const failCount = checks.filter(c => c.status === 'fail').length
  const warnCount = checks.filter(c => c.status === 'warn').length
  const okCount = checks.filter(c => c.status === 'ok').length

  return (
    <div style={{ fontFamily: 'DM Sans, system-ui, sans-serif', background: '#f1f5f9', minHeight: '100vh' }}>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div style={{ background: '#0f172a', borderBottom: '1px solid #1e293b', padding: '14px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📡</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'white', letterSpacing: '-0.03em' }}>TrackAudit</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Diagnostic de tracking • RGPD • GA4 • Google Ads • Meta</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <PlatformBadge name="Google" icon="🔵" connected={!!connections.google} onConnect={connectGoogle} />
            <PlatformBadge name="Meta" icon="🔷" connected={!!connections.meta} onConnect={connectMeta} />
          </div>
        </div>
      </div>

      {/* ── HERO / URL INPUT ──────────────────────────────────────────────── */}
      {phase === 'idle' || phase === 'error' ? (
        <div style={{ background: '#0f172a', padding: '48px 24px 56px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'white', letterSpacing: '-0.04em', marginBottom: 12, lineHeight: 1.15 }}>
              Auditez votre tracking<br />
              <span style={{ background: 'linear-gradient(135deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>en 60 secondes</span>
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 32, lineHeight: 1.7 }}>
              Scan complet : RGPD / Consent Mode v2, GA4, Google Ads Enhanced Conversions,<br />
              Meta Advanced Matching, CAPI, parcours utilisateur et micro-signaux.
            </div>

            {/* URL Input */}
            <div style={{ display: 'flex', gap: 8, background: 'white', borderRadius: 12, padding: 6, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
              <input value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runAudit()}
                placeholder="https://votre-site.com ou landing-page.com"
                style={{ flex: 1, padding: '10px 14px', fontSize: 14, border: 'none', outline: 'none', color: '#0f172a', background: 'transparent' }}
              />
              <button onClick={runAudit} disabled={!url.trim()}
                style={{ padding: '10px 24px', fontSize: 13, fontWeight: 800, background: url.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#e2e8f0', color: url.trim() ? 'white' : '#94a3b8', border: 'none', borderRadius: 8, cursor: url.trim() ? 'pointer' : 'not-allowed', transition: 'all .2s', whiteSpace: 'nowrap' }}>
                Lancer l'audit →
              </button>
            </div>

            {/* Platform connection hint */}
            <div style={{ marginTop: 20, fontSize: 11, color: '#475569' }}>
              {!connections.google && !connections.meta ? (
                <span>💡 Connectez <button onClick={connectGoogle} style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>Google</button> et <button onClick={connectMeta} style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>Meta</button> pour un audit enrichi avec données réelles de vos comptes</span>
              ) : (
                <span style={{ color: '#22c55e' }}>✓ {connections.google ? 'Google connecté' : ''} {connections.meta ? '· Meta connecté' : ''} — audit enrichi activé</span>
              )}
            </div>

            {error && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#991b1b', textAlign: 'left' }}>
                ⚠ {error}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── SCANNING STATE ─────────────────────────────────────────────────── */}
      {(phase === 'scanning' || phase === 'analyzing') && (
        <div style={{ background: '#0f172a', padding: '48px 24px 56px' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, border: '3px solid #1e293b', borderTop: '3px solid #6366f1', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 8 }}>
              {phase === 'scanning' ? 'Scan en cours...' : 'Analyse IA en cours...'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{phaseMsg}</div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 8 }}>{url}</div>
          </div>
        </div>
      )}

      {/* ── REPORT ────────────────────────────────────────────────────────── */}
      {phase === 'done' && report && (
        <div>
          {/* Score header */}
          <div style={{ background: '#0f172a', padding: '20px 24px', borderBottom: '1px solid #1e293b' }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <ScoreRing score={report.score.global} size={80} />
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Score global</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'white', maxWidth: 280, lineHeight: 1.4 }}>{report.aiSummary.headline}</div>
                    <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{report.aiSummary.estimated_data_loss}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
                  {[{n:okCount,c:'#22c55e',l:'OK'},{n:warnCount,c:'#f59e0b',l:'Warn'},{n:failCount,c:'#ef4444',l:'Fail'},{n:checks.filter(c=>c.status==='manual').length,c:'#818cf8',l:'Manuel'}].map((s,i)=>(
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: s.c, lineHeight: 1 }}>{s.n}</div>
                      <div style={{ fontSize: 9, color: '#475569' }}>{s.l}</div>
                    </div>
                  ))}
                  <button onClick={() => { setPhase('idle'); setReport(null) }} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', marginLeft: 8 }}>
                    ← Nouvel audit
                  </button>
                </div>
              </div>

              {/* AI insights */}
              {report.aiSummary.priority_issues?.length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {report.aiSummary.priority_issues.slice(0, 2).map((issue, i) => (
                    <div key={i} style={{ fontSize: 10, padding: '5px 10px', background: '#fee2e2', border: '0.5px solid #fca5a5', borderRadius: 6, color: '#991b1b', maxWidth: 280 }}>
                      🚨 {issue}
                    </div>
                  ))}
                  {report.aiSummary.quick_wins?.slice(0, 1).map((win, i) => (
                    <div key={i} style={{ fontSize: 10, padding: '5px 10px', background: '#f0fdf4', border: '0.5px solid #86efac', borderRadius: 6, color: '#166534', maxWidth: 280 }}>
                      ⚡ {win}
                    </div>
                  ))}
                </div>
              )}

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 0, marginTop: 16 }}>
                {([['audit', 'Résultats d\'audit'], ['fixes', `Plan de correction (${failCount + warnCount})`], ['platforms', 'Plateformes connectées']] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setActiveTab(id)} style={{
                    padding: '7px 16px', fontSize: 11, fontWeight: activeTab === id ? 700 : 500,
                    color: activeTab === id ? 'white' : '#64748b', background: 'none', border: 'none',
                    cursor: 'pointer', borderBottom: `2px solid ${activeTab === id ? '#6366f1' : 'transparent'}`, transition: 'all .15s',
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 24px' }}>

            {/* Score breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Consentement', score: report.score.consent, icon: '🔒' },
                { label: 'Mesure GA4', score: report.score.measurement, icon: '📊' },
                { label: 'Conversions', score: report.score.conversion, icon: '⚡' },
                { label: 'Confidentialité', score: report.score.privacy, icon: '🛡️' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'white', border: '0.5px solid #e2e8f0', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.score >= 75 ? '#22c55e' : s.score >= 50 ? '#f59e0b' : '#ef4444', marginBottom: 3 }}>{s.score}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* ─ AUDIT TAB ─ */}
            {activeTab === 'audit' && categories.map(cat => {
              const catChecks = checks.filter(c => c.category === cat)
              const catFail = catChecks.filter(c => c.status === 'fail').length
              const catOk = catChecks.filter(c => c.status === 'ok').length
              const isOpen = openSections[cat] !== false
              return (
                <div key={cat} style={{ background: 'white', border: `0.5px solid ${catFail > 0 ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
                  <div onClick={() => setOpenSections(prev => ({ ...prev, [cat]: !prev[cat] }))} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', cursor: 'pointer', borderBottom: isOpen ? '0.5px solid #f1f5f9' : 'none' }}>
                    <span style={{ fontSize: 15 }}>{CAT_LABELS[cat]?.split(' ')[0]}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{CAT_LABELS[cat]?.slice(3)}</span>
                    {catFail > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: '#fee2e2', color: '#991b1b', padding: '1px 8px', borderRadius: 99 }}>{catFail} échec{catFail > 1 ? 's' : ''}</span>}
                    <span style={{ fontSize: 11, fontWeight: 600, background: catOk === catChecks.length ? '#dcfce7' : '#f1f5f9', color: catOk === catChecks.length ? '#166534' : '#64748b', padding: '1px 9px', borderRadius: 99 }}>
                      {catOk}/{catChecks.length}
                    </span>
                    <span style={{ fontSize: 10, color: '#cbd5e1' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                  {isOpen && catChecks.map(check => (
                    <CheckRow key={check.id} check={check} onOpen={c => setModalCheck(c)} />
                  ))}
                </div>
              )
            })}

            {/* ─ FIXES TAB ─ */}
            {activeTab === 'fixes' && <FixPlan checks={checks} />}

            {/* ─ PLATFORMS TAB ─ */}
            {activeTab === 'platforms' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
                {/* Google */}
                <div style={{ background: 'white', border: '0.5px solid #e2e8f0', borderRadius: 12, padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 24 }}>🔵</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Google</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>GA4 + Google Ads</div>
                    </div>
                    <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: connections.google ? '#22c55e' : '#cbd5e1' }} />
                  </div>
                  {connections.google ? (
                    <div>
                      {connections.google.propertyName && <div style={{ fontSize: 11, color: '#334155', marginBottom: 4 }}>📊 GA4 : {connections.google.propertyName}</div>}
                      {connections.google.measurementId && <div style={{ fontSize: 11, color: '#334155', marginBottom: 8 }}>ID : {connections.google.measurementId}</div>}
                      {report.platformData?.ga4 && (
                        <>
                          <div style={{ fontSize: 11, color: '#166534', background: '#f0fdf4', padding: '5px 8px', borderRadius: 6, marginBottom: 4 }}>✓ {report.platformData.ga4.conversionEvents.length} conversions configurées</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Events récents : {report.platformData.ga4.recentEvents?.slice(0, 3).map(e => e.name).join(', ')}</div>
                        </>
                      )}
                    </div>
                  ) : (
                    <button onClick={connectGoogle} style={{ width: '100%', padding: '10px', fontSize: 12, fontWeight: 700, background: '#f0f4ff', color: '#4f46e5', border: '1px solid #c7d7fe', borderRadius: 8, cursor: 'pointer' }}>
                      Connecter Google →
                    </button>
                  )}
                </div>

                {/* Meta */}
                <div style={{ background: 'white', border: '0.5px solid #e2e8f0', borderRadius: 12, padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 24 }}>🔷</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Meta</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>Pixel + CAPI + Advanced Matching</div>
                    </div>
                    <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: connections.meta ? '#22c55e' : '#cbd5e1' }} />
                  </div>
                  {connections.meta ? (
                    <div>
                      {connections.meta.pixelName && <div style={{ fontSize: 11, color: '#334155', marginBottom: 8 }}>Pixel : {connections.meta.pixelName}</div>}
                      {report.platformData?.meta && (
                        <>
                          <div style={{ fontSize: 11, color: report.platformData.meta.advancedMatchingEnabled ? '#166534' : '#991b1b', background: report.platformData.meta.advancedMatchingEnabled ? '#f0fdf4' : '#fee2e2', padding: '5px 8px', borderRadius: 6, marginBottom: 4 }}>
                            Advanced Matching : {report.platformData.meta.advancedMatchingEnabled ? '✓ Actif' : '✗ Inactif'}
                          </div>
                          <div style={{ fontSize: 11, color: report.platformData.meta.capiConnected ? '#166534' : '#991b1b', background: report.platformData.meta.capiConnected ? '#f0fdf4' : '#fee2e2', padding: '5px 8px', borderRadius: 6 }}>
                            CAPI : {report.platformData.meta.capiConnected ? '✓ Connectée' : '✗ Non connectée'}
                          </div>
                          {report.platformData.meta.matchRate && <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>Match rate : {report.platformData.meta.matchRate}%</div>}
                        </>
                      )}
                    </div>
                  ) : (
                    <button onClick={connectMeta} style={{ width: '100%', padding: '10px', fontSize: 12, fontWeight: 700, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 8, cursor: 'pointer' }}>
                      Connecter Meta →
                    </button>
                  )}
                </div>

                {/* Coming soon */}
                {['TikTok Ads', 'LinkedIn Ads'].map(name => (
                  <div key={name} style={{ background: '#fafafa', border: '0.5px dashed #e2e8f0', borderRadius: 12, padding: '18px', opacity: 0.6 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>{name}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Prochainement disponible</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL ─────────────────────────────────────────────────────────── */}
      {modalCheck && (
        <CheckModal check={modalCheck} onClose={() => setModalCheck(null)} onGoFix={() => { setActiveTab('fixes'); setModalCheck(null) }} />
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}input:focus{outline:none}button:active{transform:scale(.98)}`}</style>
    </div>
  )
}
