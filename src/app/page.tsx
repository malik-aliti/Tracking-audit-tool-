'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types inline ────────────────────────────────────────────────────────────
type CheckStatus = 'ok' | 'warn' | 'fail' | 'manual'

interface CheckResult {
  id: string
  label: string
  status: CheckStatus
  finding: string
  details: string[]
  actions: string[]
  consoleCommands?: string[]
  impact?: 'critical' | 'high' | 'medium' | 'low'
  category: string
  tags: string[]
}

interface AuditScore {
  global: number; consent: number; measurement: number; conversion: number; privacy: number
  okCount: number; warnCount: number; failCount: number; manualCount: number; total: number
}

interface AISummary {
  headline: string; priority_issues: string[]
  quick_wins: string[]; strengths: string[]; estimated_data_loss: string
}

interface AuditReport {
  id: string; url: string; createdAt: string
  score: AuditScore; checks: CheckResult[]; aiSummary: AISummary
  platformData?: { ga4?: any; googleAds?: any; meta?: any }
}

// ─── Constants ───────────────────────────────────────────────────────────────
const ST: Record<string, { bg: string; border: string; text: string; dot: string; icon: string; label: string }> = {
  ok:     { bg:'#f0fdf4', border:'#86efac', text:'#166534', dot:'#22c55e', icon:'✓', label:'OK' },
  warn:   { bg:'#fffbeb', border:'#fcd34d', text:'#92400e', dot:'#f59e0b', icon:'⚠', label:'Attention' },
  fail:   { bg:'#fff1f2', border:'#fca5a5', text:'#991b1b', dot:'#ef4444', icon:'✕', label:'Échec' },
  manual: { bg:'#f0f4ff', border:'#a5b4fc', text:'#3730a3', dot:'#818cf8', icon:'○', label:'Manuel' },
}

const CAT: Record<string, string> = {
  consent: '🔒 Consentement & RGPD',
  tag_base: '🏷️ Taggage de base',
  ga4: '📊 GA4 & Analytics',
  google_ads: '⚡ Google Ads',
  meta: '🎯 Meta',
  qa: '✅ QA & Qualité',
}

const TAG_COLORS: Record<string, [string, string]> = {
  Privacy: ['#fef3c7','#92400e'], CMP: ['#fef3c7','#92400e'],
  TCF: ['#fef9c3','#854d0e'], 'Consent Mode': ['#fef9c3','#854d0e'],
  Google: ['#dbeafe','#1e40af'], GTM: ['#dbeafe','#1e40af'],
  'Google Ads': ['#e0e7ff','#3730a3'], 'Enhanced Conversions': ['#e0e7ff','#3730a3'],
  GA4: ['#d1fae5','#065f46'], Events: ['#d1fae5','#065f46'],
  Meta: ['#ede9fe','#5b21b6'], CAPI: ['#ede9fe','#5b21b6'], 'Advanced Matching': ['#ede9fe','#5b21b6'],
  Attribution: ['#fce7f3','#9d174d'], QA: ['#fee2e2','#991b1b'],
  Conversions: ['#e0e7ff','#3730a3'], Performance: ['#fef3c7','#92400e'],
  Platform: ['#dbeafe','#1e40af'],
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={7} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        style={{ transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px`,
          fill: '#fff', fontSize: size < 60 ? 13 : 20, fontWeight: 700, fontFamily: 'system-ui' }}>
        {score}
      </text>
    </svg>
  )
}

function TagPill({ tag }: { tag: string }) {
  const [bg, tc] = TAG_COLORS[tag] || ['#f1f5f9','#475569']
  return (
    <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
      background: bg, color: tc, border: `0.5px solid ${tc}33` }}>
      {tag}
    </span>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800) }}
      style={{ position:'absolute', top:6, right:6, background: done?'#059669':'#334155',
        border:'none', borderRadius:4, padding:'2px 8px', cursor:'pointer',
        fontSize:9, fontWeight:700, color:'white', transition:'all .2s' }}>
      {done ? '✓ Copié' : 'Copier'}
    </button>
  )
}

function PlatformBtn({ icon, label, connected, onClick }: { icon: string; label: string; connected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
      background: connected ? '#052e16' : '#1e293b',
      border: `1px solid ${connected ? '#16a34a' : '#334155'}`,
      borderRadius:8, cursor:'pointer', fontSize:11, fontWeight:600,
      color: connected ? '#4ade80' : '#94a3b8', transition:'all .2s',
    }}>
      <span>{icon}</span>{label}
      <span style={{ width:6, height:6, borderRadius:'50%', background: connected?'#22c55e':'#475569' }} />
    </button>
  )
}

// ─── Check detail modal ───────────────────────────────────────────────────────
function CheckModal({ check, onClose, onGoFix }: { check: CheckResult; onClose: () => void; onGoFix: () => void }) {
  const cfg = ST[check.status] || ST.manual
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', backdropFilter:'blur(4px)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:500 }}>
      <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:16,
        width:'100%', maxWidth:640, maxHeight:'88vh', overflow:'hidden',
        display:'flex', flexDirection:'column', boxShadow:'0 40px 80px rgba(0,0,0,.6)' }}>

        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #1e293b' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
                {check.impact === 'critical' && (
                  <span style={{ fontSize:8, fontWeight:800, background:'#7f1d1d', color:'#fca5a5', padding:'1px 5px', borderRadius:3 }}>CRITIQUE</span>
                )}
                {check.tags.map(t => <TagPill key={t} tag={t} />)}
              </div>
              <div style={{ fontSize:15, fontWeight:700, color:'white', marginBottom:8 }}>{check.label}</div>
              <div style={{ display:'flex', gap:8, padding:'9px 12px', borderRadius:9,
                background: cfg.bg + '15', border:`1px solid ${cfg.border}44` }}>
                <span style={{ fontSize:16, flexShrink:0 }}>{cfg.icon}</span>
                <span style={{ fontSize:12, fontWeight:600, color: cfg.text === '#166534' ? '#4ade80' : cfg.text === '#991b1b' ? '#f87171' : cfg.text === '#92400e' ? '#fbbf24' : '#a5b4fc' }}>
                  {check.finding}
                </span>
              </div>
            </div>
            <button onClick={onClose}
              style={{ background:'#1e293b', border:'1px solid #334155', borderRadius:7, width:30, height:30,
                cursor:'pointer', fontSize:16, color:'#64748b', flexShrink:0 }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
          {check.details?.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:8 }}>
                Données analysées
              </div>
              {check.details.map((d, i) => (
                <div key={i} style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:'1px solid #1e293b', fontSize:12, color:'#94a3b8', lineHeight:1.6 }}>
                  <span style={{ color:'#6366f1', fontSize:8, flexShrink:0, marginTop:3 }}>◆</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          )}

          {check.actions?.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:8 }}>
                Plan d'action
              </div>
              {check.actions.map((a, i) => (
                <div key={i} style={{ display:'flex', gap:8, padding:'8px 12px', marginBottom:5,
                  background:'#1e293b', border:'1px solid #334155', borderRadius:8,
                  fontSize:12, color:'#e2e8f0', lineHeight:1.6 }}>
                  <span style={{ fontWeight:800, color:'#818cf8', minWidth:18, flexShrink:0 }}>{i+1}.</span>
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {check.consoleCommands && check.consoleCommands.length > 0 && (
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:8 }}>
                Commandes DevTools
              </div>
              {check.consoleCommands.map((cmd, i) => (
                <div key={i} style={{ position:'relative', marginBottom:8 }}>
                  <pre style={{ background:'#020617', border:'1px solid #0f172a', borderRadius:8,
                    padding:'10px 42px 10px 14px', fontSize:11, color:'#38bdf8',
                    fontFamily:'DM Mono, Menlo, monospace', lineHeight:1.7,
                    overflowX:'auto', margin:0, whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
                    {cmd}
                  </pre>
                  <CopyBtn text={cmd} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid #1e293b', display:'flex', justifyContent:'space-between' }}>
          {(check.status === 'fail' || check.status === 'warn') ? (
            <button onClick={onGoFix}
              style={{ padding:'8px 16px', fontSize:11, fontWeight:700, background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color:'white', border:'none', borderRadius:8, cursor:'pointer' }}>
              Voir le correctif →
            </button>
          ) : <div />}
          <button onClick={onClose}
            style={{ padding:'8px 14px', fontSize:11, fontWeight:600, background:'#1e293b',
              color:'#64748b', border:'1px solid #334155', borderRadius:8, cursor:'pointer' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Fix Plan ─────────────────────────────────────────────────────────────────
function FixPlan({ checks }: { checks: CheckResult[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0)
  const [done, setDone] = useState<Set<string>>(new Set())

  const issues = checks
    .filter(c => c.status === 'fail' || c.status === 'warn')
    .sort((a, b) => {
      const o = { critical:0, high:1, medium:2, low:3 }
      return (o[a.impact || 'medium'] ?? 2) - (o[b.impact || 'medium'] ?? 2)
    })

  if (issues.length === 0) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'#64748b' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
      <div style={{ fontSize:16, fontWeight:700, color:'#e2e8f0' }}>Aucun problème détecté !</div>
      <div style={{ fontSize:12, marginTop:8 }}>Votre tracking est correctement configuré.</div>
    </div>
  )

  const urgColor = (imp?: string) => imp==='critical'?'#ef4444':imp==='high'?'#f59e0b':imp==='medium'?'#818cf8':'#64748b'
  const urgBg = (imp?: string) => imp==='critical'?'#7f1d1d':imp==='high'?'#78350f':imp==='medium'?'#1e1b4b':'#1e293b'
  const urgLabel = (imp?: string) => imp==='critical'?'URGENT':imp==='high'?'HAUTE':imp==='medium'?'MOYENNE':'FAIBLE'

  return (
    <div>
      <div style={{ background:'#7f1d1d', border:'1px solid #ef4444', borderRadius:10,
        padding:'12px 16px', marginBottom:16, display:'flex', gap:10 }}>
        <span style={{ fontSize:20 }}>🚨</span>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:'#fca5a5', marginBottom:2 }}>
            {issues.filter(i => i.impact === 'critical').length} critique(s) · {issues.filter(i => i.impact === 'high').length} haute(s) priorité
          </div>
          <div style={{ fontSize:11, color:'#fca5a5', opacity:.8 }}>
            Commencer par les correctifs URGENT pour maximiser l'impact immédiat.
          </div>
        </div>
      </div>

      {issues.map((issue, idx) => (
        <div key={issue.id} style={{ background:'#0f172a', border:`1px solid ${issue.status==='fail'?'#991b1b':'#334155'}`,
          borderRadius:12, marginBottom:10, overflow:'hidden' }}>
          <div onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
            style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'14px 18px', cursor:'pointer' }}>
            <div style={{ width:28, height:28, borderRadius:7, display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0,
              background: urgBg(issue.impact), color: urgColor(issue.impact) }}>
              {idx + 1}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                <span style={{ fontSize:12, fontWeight:700, color:'#f1f5f9' }}>{issue.label}</span>
                <span style={{ fontSize:8, fontWeight:800, padding:'2px 7px', borderRadius:99,
                  background: urgBg(issue.impact), color: urgColor(issue.impact) }}>
                  {urgLabel(issue.impact)}
                </span>
              </div>
              <div style={{ fontSize:11, color:'#64748b', lineHeight:1.5 }}>{issue.finding}</div>
              <div style={{ display:'flex', gap:3, marginTop:6, flexWrap:'wrap' }}>
                {issue.tags.map(t => <TagPill key={t} tag={t} />)}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
              {done.has(issue.id) && <span style={{ fontSize:10, fontWeight:700, color:'#4ade80' }}>✓ Corrigé</span>}
              <span style={{ fontSize:10, color:'#475569' }}>{openIdx === idx ? '▲' : '▼'}</span>
            </div>
          </div>

          {openIdx === idx && (
            <div style={{ padding:'0 18px 16px', borderTop:'1px solid #1e293b' }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:'.1em',
                textTransform:'uppercase', margin:'14px 0 8px' }}>Étapes de correction</div>
              {issue.actions.map((a, i) => (
                <div key={i} style={{ display:'flex', gap:8, padding:'8px 12px', marginBottom:6,
                  background:'#1e293b', border:'1px solid #334155', borderRadius:8,
                  fontSize:12, color:'#e2e8f0', lineHeight:1.6 }}>
                  <span style={{ fontWeight:800, color:'#818cf8', minWidth:18, flexShrink:0 }}>{i+1}.</span>
                  <span>{a}</span>
                </div>
              ))}
              {issue.consoleCommands && issue.consoleCommands.length > 0 && (
                <>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:'.1em', textTransform:'uppercase', margin:'12px 0 8px' }}>Vérification console</div>
                  {issue.consoleCommands.map((cmd, i) => (
                    <div key={i} style={{ position:'relative', marginBottom:6 }}>
                      <pre style={{ background:'#020617', border:'1px solid #0f172a', borderRadius:8, padding:'9px 42px 9px 14px', fontSize:11, color:'#38bdf8', fontFamily:'Menlo, monospace', lineHeight:1.7, overflowX:'auto', margin:0, whiteSpace:'pre-wrap' }}>
                        {cmd}
                      </pre>
                      <CopyBtn text={cmd} />
                    </div>
                  ))}
                </>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
                <button onClick={() => setDone(prev => { const n = new Set(prev); done.has(issue.id) ? n.delete(issue.id) : n.add(issue.id); return n })}
                  style={{ padding:'7px 16px', fontSize:11, fontWeight:700,
                    background: done.has(issue.id) ? '#059669' : '#1e293b',
                    color: done.has(issue.id) ? 'white' : '#64748b',
                    border:`1px solid ${done.has(issue.id)?'#059669':'#334155'}`,
                    borderRadius:8, cursor:'pointer', transition:'all .2s' }}>
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
  const [phase, setPhase] = useState<'idle'|'scanning'|'analyzing'|'done'|'error'>('idle')
  const [phaseMsg, setPhaseMsg] = useState('')
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'audit'|'fixes'|'platforms'>('audit')
  const [openSections, setOpenSections] = useState<Record<string,boolean>>({})
  const [modalCheck, setModalCheck] = useState<CheckResult | null>(null)
  const [connections, setConnections] = useState<{
    google?: { accessToken: string; propertyName?: string; measurementId?: string }
    meta?: { accessToken: string; pixelName?: string }
  }>({})

  // Handle OAuth callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const payload = params.get('payload')
    if (payload) {
      try {
        const data = JSON.parse(decodeURIComponent(payload))
        if (data.platform === 'google') setConnections(p => ({ ...p, google: { accessToken: data.accessToken, propertyName: data.ga4PropertyName, measurementId: data.ga4MeasurementId } }))
        else if (data.platform === 'meta') setConnections(p => ({ ...p, meta: { accessToken: data.accessToken, pixelName: data.pixelName } }))
      } catch {}
      window.history.replaceState({}, '', '/')
    }
  }, [])

  useEffect(() => {
    if (report) {
      const cats = [...new Set(report.checks.map(c => c.category))]
      setOpenSections(Object.fromEntries(cats.map(c => [c, true])))
    }
  }, [report])

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
    setPhaseMsg('Chargement de la page et analyse du DOM, cookies, réseau...')
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

      // 2. Platform data
      setPhase('analyzing')
      setPhaseMsg('Analyse IA en cours — 30+ vérifications...')
      let platformData: any = undefined

      if (connections.google?.accessToken) {
        try {
          const r = await fetch('/api/google/ga4', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ accessToken: connections.google.accessToken }) })
          const j = await r.json()
          if (j.success) platformData = { ...platformData, ga4: j.ga4, googleAds: j.googleAds }
        } catch {}
      }

      if (connections.meta?.accessToken) {
        try {
          const r = await fetch('/api/meta/pixel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ accessToken: connections.meta.accessToken }) })
          const j = await r.json()
          if (j.success) platformData = { ...platformData, meta: j.meta }
        } catch {}
      }

      // 3. Analyze
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
  }, [url, connections])

  const checks = report?.checks || []
  const categories = [...new Set(checks.map(c => c.category))]
  const failCount = checks.filter(c => c.status === 'fail').length
  const warnCount = checks.filter(c => c.status === 'warn').length
  const okCount = checks.filter(c => c.status === 'ok').length
  const manualCount = checks.filter(c => c.status === 'manual').length

  return (
    <div style={{ fontFamily:'DM Sans, system-ui, sans-serif', background:'#020617', minHeight:'100vh', color:'white' }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background:'rgba(2,6,23,.9)', backdropFilter:'blur(12px)', borderBottom:'1px solid #0f172a',
        padding:'12px 24px', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ maxWidth:960, margin:'0 auto', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:34, height:34, background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
              borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>
              📡
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:800, letterSpacing:'-0.03em' }}>TrackAudit</div>
              <div style={{ fontSize:9, color:'#475569' }}>Diagnostic tracking · RGPD · GA4 · Meta</div>
            </div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <PlatformBtn icon="🔵" label="Google" connected={!!connections.google} onClick={connectGoogle} />
            <PlatformBtn icon="🔷" label="Meta" connected={!!connections.meta} onClick={connectMeta} />
          </div>
        </div>
      </nav>

      {/* ── HERO + INPUT ── */}
      {(phase === 'idle' || phase === 'error') && (
        <div style={{ padding:'72px 24px 80px', textAlign:'center',
          background:'radial-gradient(ellipse at 50% 0%, #1e1b4b 0%, #020617 60%)' }}>
          <div style={{ maxWidth:720, margin:'0 auto' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#1e1b4b',
              border:'1px solid #3730a3', borderRadius:99, padding:'4px 14px', fontSize:11,
              color:'#a5b4fc', marginBottom:24 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#6366f1', display:'inline-block' }} />
              Powered by Claude AI · Scan headless · 30+ vérifications
            </div>

            <h1 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight:800, letterSpacing:'-0.04em',
              lineHeight:1.1, marginBottom:20, margin:'0 0 20px' }}>
              Auditez votre tracking{' '}
              <span style={{ background:'linear-gradient(135deg,#818cf8,#c084fc,#f472b6)',
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                en 60 secondes
              </span>
            </h1>

            <p style={{ fontSize:16, color:'#64748b', lineHeight:1.7, marginBottom:36, maxWidth:560, margin:'0 auto 36px' }}>
              RGPD · Consent Mode v2 · GA4 · Google Ads Enhanced Conversions<br/>
              Meta Advanced Matching · CAPI · Parcours utilisateur · Micro-signaux
            </p>

            {/* URL input */}
            <div style={{ display:'flex', gap:0, background:'#0f172a', border:'1px solid #334155',
              borderRadius:14, padding:6, maxWidth:680, margin:'0 auto',
              boxShadow:'0 0 0 1px #1e293b, 0 20px 60px rgba(99,102,241,.15)' }}>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runAudit()}
                placeholder="https://votre-site.com ou landing-page.com"
                style={{ flex:1, padding:'12px 16px', fontSize:14, border:'none', outline:'none',
                  color:'#f1f5f9', background:'transparent', fontFamily:'inherit' }}
              />
              <button onClick={runAudit} disabled={!url.trim()}
                style={{ padding:'12px 28px', fontSize:13, fontWeight:800,
                  background: url.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#1e293b',
                  color: url.trim() ? 'white' : '#475569', border:'none', borderRadius:10,
                  cursor: url.trim() ? 'pointer' : 'not-allowed', transition:'all .2s',
                  whiteSpace:'nowrap', letterSpacing:'-0.01em' }}>
                Lancer l'audit →
              </button>
            </div>

            <div style={{ marginTop:20, fontSize:11, color:'#334155' }}>
              {!connections.google && !connections.meta ? (
                <>
                  💡 Connectez{' '}
                  <button onClick={connectGoogle} style={{ background:'none', border:'none', color:'#818cf8', cursor:'pointer', fontWeight:700, fontSize:11 }}>Google</button>
                  {' '}et{' '}
                  <button onClick={connectMeta} style={{ background:'none', border:'none', color:'#a78bfa', cursor:'pointer', fontWeight:700, fontSize:11 }}>Meta</button>
                  {' '}pour enrichir l'audit avec les données réelles de vos comptes
                </>
              ) : (
                <span style={{ color:'#4ade80' }}>
                  ✓ {connections.google ? 'Google connecté ' : ''}{connections.meta ? '· Meta connecté' : ''} — audit enrichi activé
                </span>
              )}
            </div>

            {error && (
              <div style={{ marginTop:20, padding:'12px 16px', background:'#7f1d1d',
                border:'1px solid #ef4444', borderRadius:10, fontSize:12, color:'#fca5a5',
                maxWidth:680, margin:'20px auto 0', textAlign:'left' }}>
                ⚠ {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SCANNING ── */}
      {(phase === 'scanning' || phase === 'analyzing') && (
        <div style={{ padding:'80px 24px', textAlign:'center',
          background:'radial-gradient(ellipse at 50% 0%, #1e1b4b 0%, #020617 60%)' }}>
          <div style={{ maxWidth:480, margin:'0 auto' }}>
            <div style={{ position:'relative', width:64, height:64, margin:'0 auto 28px' }}>
              <div style={{ position:'absolute', inset:0, border:'3px solid #1e293b', borderTop:'3px solid #6366f1',
                borderRadius:'50%', animation:'spin 1s linear infinite' }} />
              <div style={{ position:'absolute', inset:8, border:'2px solid #0f172a', borderTop:'2px solid #8b5cf6',
                borderRadius:'50%', animation:'spin 0.7s linear infinite reverse' }} />
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                📡
              </div>
            </div>
            <div style={{ fontSize:20, fontWeight:700, marginBottom:10 }}>
              {phase === 'scanning' ? 'Scan en cours...' : 'Analyse IA en cours...'}
            </div>
            <div style={{ fontSize:13, color:'#64748b', lineHeight:1.7 }}>{phaseMsg}</div>
            <div style={{ fontSize:12, color:'#334155', marginTop:8,
              background:'#0f172a', border:'1px solid #1e293b', borderRadius:8,
              padding:'6px 12px', display:'inline-block', marginTop:16 }}>
              {url}
            </div>
            {/* Progress steps */}
            <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:28 }}>
              {['DOM & Réseau', 'Cookies', 'DataLayer', 'Analyse IA'].map((step, i) => (
                <div key={step} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%',
                    background: i <= (phase==='scanning'?1:3) ? '#6366f1' : '#1e293b',
                    transition:'background .5s', transitionDelay:`${i*0.2}s` }} />
                  <span style={{ fontSize:10, color: i <= (phase==='scanning'?1:3) ? '#818cf8' : '#334155' }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── REPORT ── */}
      {phase === 'done' && report && (
        <div>
          {/* Score bar */}
          <div style={{ background:'#0f172a', borderBottom:'1px solid #1e293b', padding:'20px 24px', position:'sticky', top:57, zIndex:90 }}>
            <div style={{ maxWidth:960, margin:'0 auto' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:20, flexWrap:'wrap' }}>
                <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <ScoreRing score={report.score.global} size={80} />
                  <div>
                    <div style={{ fontSize:10, color:'#475569', marginBottom:4, letterSpacing:'.05em', textTransform:'uppercase' }}>Score global</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9', maxWidth:320, lineHeight:1.5 }}>
                      {report.aiSummary.headline}
                    </div>
                    {report.aiSummary.estimated_data_loss && (
                      <div style={{ fontSize:11, color:'#f87171', marginTop:4 }}>
                        ⚠ {report.aiSummary.estimated_data_loss}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display:'flex', gap:14, marginLeft:'auto', flexWrap:'wrap', alignItems:'center' }}>
                  {[{n:okCount,c:'#4ade80',l:'OK'},{n:warnCount,c:'#fbbf24',l:'Warn'},{n:failCount,c:'#f87171',l:'Fail'},{n:manualCount,c:'#a5b4fc',l:'Manuel'}].map((s,i) => (
                    <div key={i} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:22, fontWeight:800, color:s.c, lineHeight:1 }}>{s.n}</div>
                      <div style={{ fontSize:9, color:'#475569' }}>{s.l}</div>
                    </div>
                  ))}
                  <button onClick={() => { setPhase('idle'); setReport(null); setUrl('') }}
                    style={{ padding:'8px 14px', fontSize:11, fontWeight:700, background:'#1e293b',
                      color:'#64748b', border:'1px solid #334155', borderRadius:8, cursor:'pointer', marginLeft:6 }}>
                    ← Nouvel audit
                  </button>
                </div>
              </div>

              {/* AI insights pills */}
              {report.aiSummary.priority_issues?.length > 0 && (
                <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
                  {report.aiSummary.priority_issues.slice(0,2).map((issue, i) => (
                    <div key={i} style={{ fontSize:10, padding:'4px 10px', background:'#7f1d1d44',
                      border:'1px solid #ef444444', borderRadius:6, color:'#fca5a5', maxWidth:320 }}>
                      🚨 {issue}
                    </div>
                  ))}
                  {report.aiSummary.quick_wins?.slice(0,1).map((win, i) => (
                    <div key={i} style={{ fontSize:10, padding:'4px 10px', background:'#05260e44',
                      border:'1px solid #16a34a44', borderRadius:6, color:'#4ade80', maxWidth:320 }}>
                      ⚡ {win}
                    </div>
                  ))}
                </div>
              )}

              {/* Tabs */}
              <div style={{ display:'flex', gap:0, marginTop:16, borderBottom:'1px solid #1e293b' }}>
                {([['audit','Résultats d\'audit'],['fixes',`Plan de correction (${failCount+warnCount})`],['platforms','Plateformes']] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    style={{ padding:'8px 18px', fontSize:11, fontWeight: activeTab===id ? 700 : 500,
                      color: activeTab===id ? '#818cf8' : '#475569', background:'none', border:'none',
                      cursor:'pointer', borderBottom:`2px solid ${activeTab===id?'#6366f1':'transparent'}`,
                      marginBottom:-1, transition:'all .15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ maxWidth:960, margin:'0 auto', padding:'20px 24px' }}>

            {/* Score breakdown cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:10, marginBottom:20 }}>
              {[
                { label:'Consentement', score:report.score.consent, icon:'🔒' },
                { label:'Mesure GA4', score:report.score.measurement, icon:'📊' },
                { label:'Conversions', score:report.score.conversion, icon:'⚡' },
                { label:'Confidentialité', score:report.score.privacy, icon:'🛡️' },
              ].map((s, i) => (
                <div key={i} style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:12, padding:'14px', textAlign:'center' }}>
                  <div style={{ fontSize:18, marginBottom:8 }}>{s.icon}</div>
                  <div style={{ fontSize:24, fontWeight:800, color: s.score>=75?'#4ade80':s.score>=50?'#fbbf24':'#f87171', marginBottom:4 }}>
                    {s.score}
                  </div>
                  <div style={{ fontSize:10, color:'#475569' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* ── AUDIT TAB ── */}
            {activeTab === 'audit' && categories.map(cat => {
              const catChecks = checks.filter(c => c.category === cat)
              const catFail = catChecks.filter(c => c.status === 'fail').length
              const catOk = catChecks.filter(c => c.status === 'ok').length
              const isOpen = openSections[cat] !== false
              return (
                <div key={cat} style={{ background:'#0f172a', border:`1px solid ${catFail>0?'#991b1b':'#1e293b'}`,
                  borderRadius:12, marginBottom:10, overflow:'hidden' }}>
                  <div onClick={() => setOpenSections(p => ({ ...p, [cat]: !p[cat] }))}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px',
                      cursor:'pointer', borderBottom: isOpen ? '1px solid #1e293b' : 'none' }}>
                    <span style={{ fontSize:15 }}>{CAT[cat]?.split(' ')[0]}</span>
                    <span style={{ flex:1, fontSize:13, fontWeight:700, color:'#f1f5f9' }}>
                      {CAT[cat]?.slice(3) || cat}
                    </span>
                    {catFail > 0 && (
                      <span style={{ fontSize:9, fontWeight:800, background:'#7f1d1d', color:'#fca5a5',
                        padding:'2px 8px', borderRadius:99 }}>{catFail} échec{catFail>1?'s':''}</span>
                    )}
                    <span style={{ fontSize:11, fontWeight:600,
                      background: catOk===catChecks.length ? '#052e16' : '#1e293b',
                      color: catOk===catChecks.length ? '#4ade80' : '#475569',
                      padding:'1px 9px', borderRadius:99, border:`1px solid ${catOk===catChecks.length?'#16a34a':'#334155'}` }}>
                      {catOk}/{catChecks.length}
                    </span>
                    <span style={{ fontSize:9, color:'#334155', marginLeft:2 }}>{isOpen?'▲':'▼'}</span>
                  </div>

                  {isOpen && catChecks.map((check, idx) => {
                    const cfg = ST[check.status] || ST.manual
                    const rowBg = check.status==='fail' ? '#1a0000' : check.status==='ok' ? '#001a0a' : '#0f172a'
                    return (
                      <div key={check.id} style={{ display:'flex', alignItems:'flex-start', gap:10,
                        padding:'10px 16px', borderBottom: idx<catChecks.length-1?'1px solid #0f172a':'none',
                        background: rowBg, transition:'background .2s' }}>
                        <div style={{ flexShrink:0, width:22, height:22, borderRadius:6,
                          background: cfg.bg + '20', border:`1px solid ${cfg.border}55`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:11, fontWeight:700,
                          color: cfg.text==='#166534'?'#4ade80':cfg.text==='#991b1b'?'#f87171':cfg.text==='#92400e'?'#fbbf24':'#a5b4fc',
                          marginTop:2 }}>
                          {cfg.icon}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap', marginBottom:3 }}>
                            {check.impact === 'critical' && (
                              <span style={{ fontSize:8, fontWeight:800, background:'#7f1d1d', color:'#fca5a5', padding:'1px 5px', borderRadius:3 }}>CRITIQUE</span>
                            )}
                            <span style={{ fontSize:12, fontWeight:700, color:'#f1f5f9' }}>{check.label}</span>
                          </div>
                          <div style={{ fontSize:10, color:'#475569', lineHeight:1.6, marginBottom:5 }}>{check.finding}</div>
                          <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                            {check.tags.map(t => <TagPill key={t} tag={t} />)}
                          </div>
                        </div>
                        <button onClick={() => setModalCheck(check)}
                          style={{ flexShrink:0, padding:'5px 12px', fontSize:10, fontWeight:700,
                            border:'1px solid #334155', borderRadius:6, background:'#1e293b',
                            color:'#818cf8', cursor:'pointer', whiteSpace:'nowrap' }}>
                          Détails →
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* ── FIXES TAB ── */}
            {activeTab === 'fixes' && <FixPlan checks={checks} />}

            {/* ── PLATFORMS TAB ── */}
            {activeTab === 'platforms' && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14 }}>
                {/* Google */}
                <div style={{ background:'#0f172a', border:`1px solid ${connections.google?'#1d4ed8':'#1e293b'}`, borderRadius:14, padding:20 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                    <div style={{ fontSize:28 }}>🔵</div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700 }}>Google</div>
                      <div style={{ fontSize:10, color:'#475569' }}>GA4 + Google Ads</div>
                    </div>
                    <div style={{ marginLeft:'auto', width:8, height:8, borderRadius:'50%',
                      background: connections.google?'#22c55e':'#334155' }} />
                  </div>
                  {connections.google ? (
                    <div>
                      {connections.google.propertyName && <div style={{ fontSize:11, color:'#94a3b8', marginBottom:6 }}>📊 {connections.google.propertyName}</div>}
                      {connections.google.measurementId && <div style={{ fontSize:11, color:'#64748b', marginBottom:10 }}>ID : {connections.google.measurementId}</div>}
                      {report.platformData?.ga4 && (
                        <div style={{ fontSize:11, color:'#4ade80', background:'#052e16', border:'1px solid #16a34a', padding:'6px 10px', borderRadius:7 }}>
                          ✓ {report.platformData.ga4.conversionEvents?.length || 0} conversions configurées
                        </div>
                      )}
                    </div>
                  ) : (
                    <button onClick={connectGoogle}
                      style={{ width:'100%', padding:11, fontSize:12, fontWeight:700,
                        background:'#1e1b4b', color:'#818cf8', border:'1px solid #3730a3',
                        borderRadius:9, cursor:'pointer' }}>
                      Connecter Google Analytics & Ads →
                    </button>
                  )}
                </div>

                {/* Meta */}
                <div style={{ background:'#0f172a', border:`1px solid ${connections.meta?'#7c3aed':'#1e293b'}`, borderRadius:14, padding:20 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                    <div style={{ fontSize:28 }}>🔷</div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700 }}>Meta</div>
                      <div style={{ fontSize:10, color:'#475569' }}>Pixel + CAPI + Advanced Matching</div>
                    </div>
                    <div style={{ marginLeft:'auto', width:8, height:8, borderRadius:'50%',
                      background: connections.meta?'#22c55e':'#334155' }} />
                  </div>
                  {connections.meta ? (
                    <div>
                      {connections.meta.pixelName && <div style={{ fontSize:11, color:'#94a3b8', marginBottom:10 }}>Pixel : {connections.meta.pixelName}</div>}
                      {report.platformData?.meta && (
                        <div style={{ fontSize:11, color: report.platformData.meta.advancedMatchingEnabled?'#4ade80':'#f87171',
                          background: report.platformData.meta.advancedMatchingEnabled?'#052e16':'#450a0a',
                          border:`1px solid ${report.platformData.meta.advancedMatchingEnabled?'#16a34a':'#dc2626'}`,
                          padding:'6px 10px', borderRadius:7 }}>
                          Advanced Matching : {report.platformData.meta.advancedMatchingEnabled ? '✓ Actif' : '✗ Inactif'}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button onClick={connectMeta}
                      style={{ width:'100%', padding:11, fontSize:12, fontWeight:700,
                        background:'#2e1065', color:'#a78bfa', border:'1px solid #7c3aed',
                        borderRadius:9, cursor:'pointer' }}>
                      Connecter Meta Ads →
                    </button>
                  )}
                </div>

                {/* Coming soon */}
                {['TikTok Ads', 'LinkedIn Ads', 'Pinterest Ads'].map(name => (
                  <div key={name} style={{ background:'#0a0a0f', border:'1px dashed #1e293b',
                    borderRadius:14, padding:20, opacity:0.5 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#334155', marginBottom:6 }}>{name}</div>
                    <div style={{ fontSize:10, color:'#1e293b' }}>Prochainement disponible</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL ── */}
      {modalCheck && (
        <CheckModal
          check={modalCheck}
          onClose={() => setModalCheck(null)}
          onGoFix={() => { setActiveTab('fixes'); setModalCheck(null) }}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: #334155; }
        input:focus { outline: none; }
        button:active { transform: scale(0.97); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 99px; }
      `}</style>
    </div>
  )
}
