'use client'

import React, { useState, useEffect, useCallback } from 'react'
import type { AuditReport, ScanRawData, PlatformData, CheckResult } from '@/types'
import type { GTMData } from '@/lib/gtm'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  // Brand
  blue:       '#1877F2',
  blueDark:   '#0C5CC7',
  blueLight:  '#E7F0FD',
  // Semantic
  green:      '#1EA446',
  greenLight: '#E6F4EA',
  red:        '#E02020',
  redLight:   '#FDECEA',
  yellow:     '#E8900A',
  yellowLight:'#FEF3E2',
  purple:     '#7B2FF7',
  purpleLight:'#F3ECFE',
  // Neutrals (Stripe/Linear scale)
  gray50:     '#F9FAFB',
  gray100:    '#F3F4F6',
  gray200:    '#E5E7EB',
  gray300:    '#D1D5DB',
  gray400:    '#9CA3AF',
  gray500:    '#6B7280',
  gray600:    '#4B5563',
  gray700:    '#374151',
  gray800:    '#1F2937',
  gray900:    '#111827',
  // Sidebar (Meta Business Suite style)
  sidebarBg:  '#242526',
  sidebarText:'#E4E6EB',
  sidebarSub: '#B0B3B8',
  white:      '#FFFFFF',
}

const STATUS = {
  ok:     { color: C.green,  light: C.greenLight,  border: '#86EFAC', icon: 'check',  label: 'Conforme'  },
  warn:   { color: C.yellow, light: C.yellowLight, border: '#FCD34D', icon: 'warn',   label: 'Attention' },
  fail:   { color: C.red,    light: C.redLight,    border: '#FCA5A5', icon: 'x',      label: 'Échec'     },
  manual: { color: C.purple, light: C.purpleLight, border: '#C4B5FD', icon: 'info',   label: 'Manuel'    },
  na:     { color: C.gray400,light: C.gray100,     border: C.gray300, icon: 'dash',   label: 'N/A'       },
}

const TAG_COLORS: Record<string, [string, string]> = {
  Privacy: [C.yellowLight, C.yellow], CMP: [C.yellowLight, C.yellow],
  TCF: [C.yellowLight, '#B45309'], 'Consent Mode': [C.yellowLight, '#B45309'],
  Google: [C.blueLight, C.blueDark], GTM: [C.blueLight, C.blueDark],
  'Google Ads': ['#EDE9FE', '#5B21B6'], 'Enhanced Conversions': ['#EDE9FE', '#5B21B6'],
  GA4: [C.greenLight, '#065F46'], Events: [C.greenLight, '#065F46'],
  Meta: [C.purpleLight, C.purple], CAPI: [C.purpleLight, C.purple], 'Advanced Matching': [C.purpleLight, C.purple],
  Attribution: ['#FCE7F3', '#9D174D'], QA: [C.redLight, '#991B1B'],
  Conversions: ['#EDE9FE', '#5B21B6'], 'Micro-signaux': [C.greenLight, '#065F46'],
  Performance: [C.yellowLight, '#B45309'], Platform: [C.blueLight, C.blueDark],
}

const CAT_META: Record<string, { label: string; color: string }> = {
  consent:      { label: 'Consentement & RGPD',  color: C.yellow },
  tag_base:     { label: 'Taggage de base',       color: C.blue   },
  ga4:          { label: 'GA4 & Analytics',       color: C.green  },
  google_ads:   { label: 'Google Ads',            color: '#5B21B6'},
  meta:         { label: 'Meta',                  color: C.blue   },
  server_side:  { label: 'Tracking Server-Side',  color: '#059669'},
  qa:           { label: 'Qualité & QA',          color: C.gray500},
  user_journey: { label: 'Parcours utilisateur',  color: C.purple },
  performance:  { label: 'Performance',           color: C.yellow },
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const icons = {
  check: (c='currentColor', s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x:     (c='currentColor', s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  warn:  (c='currentColor', s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  info:  (c='currentColor', s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  dash:  (c='currentColor', s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  search:(c='currentColor', s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  arrow: (c='currentColor', s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  copy:  (c='currentColor', s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  chevD:(c='currentColor', s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  chevU:(c='currentColor', s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>,
  chart:(c='currentColor', s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  shield:(c='currentColor',s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  bolt:  (c='currentColor', s=16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  new:   (c='currentColor', s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
}

// ─── Brand logos ──────────────────────────────────────────────────────────────
function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

// Vrai logo Meta — forme infinity/M officielle
function MetaLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.53} viewBox="0 0 60 32" fill="none">
      <path d="M7.5 16C7.5 11.86 9.63 8.5 12.5 8.5C14.5 8.5 16.12 9.94 17.85 12.93C19.2 15.23 20.58 18.27 21.9 21.03L22.6 22.5C23.63 24.62 24.61 26.5 25.65 27.9C27.02 29.73 28.56 31 30.5 31C32.44 31 33.98 29.73 35.35 27.9C36.39 26.5 37.37 24.62 38.4 22.5L39.1 21.03C40.42 18.27 41.8 15.23 43.15 12.93C44.88 9.94 46.5 8.5 48.5 8.5C51.37 8.5 53.5 11.86 53.5 16C53.5 18.55 52.64 20.5 51.2 21.86L54.8 25.46C57.04 23.16 58.5 19.88 58.5 16C58.5 9.1 55.06 3.5 48.5 3.5C44.86 3.5 41.98 5.58 39.72 9.44C38.26 11.93 36.84 15.1 35.5 18L34.94 19.22C33.79 21.71 32.77 23.66 31.9 24.82C31.35 25.54 30.9 25.9 30.5 25.9C30.1 25.9 29.65 25.54 29.1 24.82C28.23 23.66 27.21 21.71 26.06 19.22L25.5 18C24.16 15.1 22.74 11.93 21.28 9.44C19.02 5.58 16.14 3.5 12.5 3.5C5.94 3.5 2.5 9.1 2.5 16C2.5 19.88 3.96 23.16 6.2 25.46L9.8 21.86C8.36 20.5 7.5 18.55 7.5 16Z" fill="#0081FB"/>
    </svg>
  )
}

// ─── Status icon ──────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const cfg = STATUS[status as keyof typeof STATUS] || STATUS.na
  const iconFn = icons[cfg.icon as keyof typeof icons]
  return (
    <div style={{ width: 22, height: 22, borderRadius: 6, background: cfg.light, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {iconFn(cfg.color, 12)}
    </div>
  )
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 75 ? C.green : score >= 50 ? C.yellow : C.red
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.gray200} strokeWidth={7} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size/2}px ${size/2}px`, fill: C.gray900, fontSize: size < 60 ? 13 : 18, fontWeight: 700 }}>
        {score}
      </text>
    </svg>
  )
}

// ─── Tag pill ─────────────────────────────────────────────────────────────────
function TagPill({ tag }: { tag: string }) {
  const [bg, tc] = TAG_COLORS[tag] || [C.gray100, C.gray500]
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: bg, color: tc, letterSpacing: '.01em' }}>
      {tag}
    </span>
  )
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000) }}
      style={{ position: 'absolute', top: 8, right: 8, background: done ? '#166534' : '#374151', border: 'none', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'background .2s' }}>
      {done ? icons.check('#86efac', 11) : icons.copy('#9CA3AF', 11)}
      <span style={{ fontSize: 10, fontWeight: 600, color: done ? '#86efac' : '#9CA3AF' }}>{done ? 'Copié' : 'Copier'}</span>
    </button>
  )
}

// ─── Impact badge ─────────────────────────────────────────────────────────────
function ImpactBadge({ impact }: { impact?: string }) {
  const map: Record<string, [string,string]> = {
    critical: [C.redLight,   C.red],
    high:     [C.yellowLight, C.yellow],
    medium:   [C.blueLight,   C.blue],
  }
  const cfg = map[impact || '']
  if (!cfg) return null
  const labels: Record<string,string> = { critical: 'Critique', high: 'Haute', medium: 'Moyenne' }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: cfg[0], color: cfg[1], letterSpacing: '.04em', textTransform: 'uppercase' }}>
      {labels[impact!]}
    </span>
  )
}

// ─── Check row ────────────────────────────────────────────────────────────────
function CheckRow({ check, onOpen }: { check: CheckResult; onOpen: (c: CheckResult) => void }) {
  const cfg = STATUS[check.status as keyof typeof STATUS] || STATUS.na
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 20px', borderBottom: `1px solid ${C.gray100}`, background: hov ? C.gray50 : C.white, transition: 'background .12s', borderLeft: `3px solid ${check.status === 'fail' ? C.red : check.status === 'warn' ? C.yellow : 'transparent'}` }}>
      <div style={{ marginTop: 2 }}><StatusDot status={check.status} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.gray900 }}>{check.label}</span>
          <ImpactBadge impact={check.impact} />
        </div>
        <div style={{ fontSize: 12, color: C.gray500, lineHeight: 1.55, marginBottom: 6 }}>{check.finding}</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {check.tags.map(t => <TagPill key={t} tag={t} />)}
        </div>
      </div>
      <button onClick={() => onOpen(check)} style={{ flexShrink: 0, padding: '5px 12px', fontSize: 12, fontWeight: 500, border: `1px solid ${hov ? C.blue : C.gray200}`, borderRadius: 6, background: hov ? C.blueLight : C.white, color: hov ? C.blue : C.gray500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all .12s', whiteSpace: 'nowrap' }}>
        Détails {icons.arrow(hov ? C.blue : C.gray400)}
      </button>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function CheckModal({ check, onClose, onGoFix }: { check: CheckResult; onClose: () => void; onGoFix: () => void }) {
  const cfg = STATUS[check.status as keyof typeof STATUS] || STATUS.na
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 300 }}>
      <div className="animate-in" style={{ background: C.white, borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 64px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.07)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.gray100}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.light, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {(icons[cfg.icon as keyof typeof icons] || icons.info)(cfg.color, 18)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                <ImpactBadge impact={check.impact} />
                {check.tags.map(t => <TagPill key={t} tag={t} />)}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.gray900, margin: 0 }}>{check.label}</h3>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: C.gray100, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              {icons.x(C.gray500, 14)}
            </button>
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: cfg.light, border: `1px solid ${cfg.border}`, fontSize: 12, color: cfg.color, lineHeight: 1.6 }}>
            {check.finding}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {check.details?.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.gray400, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 10 }}>Données analysées</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {check.details.map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 6, background: C.gray50, fontSize: 12, color: C.gray700, lineHeight: 1.6 }}>
                    <span style={{ color: C.blue, flexShrink: 0 }}>›</span><span>{d}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {check.actions?.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.gray400, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 10 }}>Actions recommandées</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {check.actions.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 8, fontSize: 12, color: C.gray800, lineHeight: 1.6 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: C.blue, color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i+1}</span>
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {check.consoleCommands?.length > 0 && (
            <section>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.gray400, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 10 }}>Commandes DevTools</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {check.consoleCommands.map((cmd, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <pre style={{ background: '#0D1117', borderRadius: 8, padding: '12px 48px 12px 14px', fontSize: 11, color: '#79C0FF', fontFamily: 'ui-monospace, "SF Mono", monospace', lineHeight: 1.7, margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {cmd}
                    </pre>
                    <CopyBtn text={cmd} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${C.gray100}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.gray50 }}>
          {(check.status === 'fail' || check.status === 'warn') ? (
            <button onClick={onGoFix} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, background: C.blue, color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              Plan de correction {icons.arrow('white', 13)}
            </button>
          ) : <span />}
          <button onClick={onClose} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, background: C.white, color: C.gray600, border: `1px solid ${C.gray200}`, borderRadius: 7, cursor: 'pointer' }}>
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
  const [done, setDone] = useState<Set<string>>(new Set())
  const issues = checks.filter(c => c.status === 'fail' || c.status === 'warn')
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
      return (order[a.impact || 'medium'] ?? 2) - (order[b.impact || 'medium'] ?? 2)
    })

  if (!issues.length) return (
    <div style={{ textAlign: 'center', padding: '64px 20px' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        {icons.check(C.green, 26)}
      </div>
      <p style={{ fontSize: 16, fontWeight: 700, color: C.gray900, marginBottom: 4 }}>Aucun problème détecté</p>
      <p style={{ fontSize: 13, color: C.gray500 }}>Votre configuration de tracking est conforme.</p>
    </div>
  )

  const crit = issues.filter(i => i.impact === 'critical').length
  const high = issues.filter(i => i.impact === 'high').length

  return (
    <div>
      {(crit > 0 || high > 0) && (
        <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: C.redLight, border: `1px solid #FECACA`, borderRadius: 8, marginBottom: 16, alignItems: 'flex-start' }}>
          {icons.warn(C.red, 16)}
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.red, margin: '0 0 2px' }}>
              {crit > 0 ? `${crit} problème${crit>1?'s':''} critique${crit>1?'s':''}` : ''}{crit && high ? ' · ' : ''}{high > 0 ? `${high} haute${high>1?'s':''} priorité` : ''}
            </p>
            <p style={{ fontSize: 12, color: '#991B1B', margin: 0 }}>Traitez ces problèmes en priorité pour éviter toute perte de données.</p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {issues.map((issue, idx) => {
          const isDone = done.has(issue.id)
          const isOpen = openIdx === idx
          return (
            <div key={issue.id} style={{ border: `1px solid ${isDone ? '#A7F3D0' : issue.status === 'fail' ? '#FECACA' : C.gray200}`, borderRadius: 10, overflow: 'hidden', background: isDone ? '#F0FDF4' : C.white, transition: 'all .2s' }}>
              <div onClick={() => setOpenIdx(isOpen ? null : idx)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0, background: isDone ? C.green : C.blue, color: 'white' }}>
                  {isDone ? icons.check('white', 13) : idx + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isDone ? '#065F46' : C.gray900 }}>{issue.label}</span>
                    <ImpactBadge impact={issue.impact} />
                  </div>
                  <span style={{ fontSize: 12, color: C.gray500 }}>{issue.finding}</span>
                </div>
                <span style={{ color: C.gray400 }}>{isOpen ? icons.chevU(C.gray400) : icons.chevD(C.gray400)}</span>
              </div>

              {isOpen && (
                <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.gray100}`, background: C.gray50 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.gray400, letterSpacing: '.07em', textTransform: 'uppercase', margin: '14px 0 10px' }}>Plan d'action</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {issue.actions.map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 12px', background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 8, fontSize: 12, color: C.gray800, lineHeight: 1.6 }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', background: C.blue, color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{i+1}</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                  {issue.consoleCommands?.length > 0 && (
                    <>
                      <p style={{ fontSize: 11, fontWeight: 700, color: C.gray400, letterSpacing: '.07em', textTransform: 'uppercase', margin: '14px 0 10px' }}>Vérification DevTools</p>
                      {issue.consoleCommands.map((cmd, i) => (
                        <div key={i} style={{ position: 'relative', marginBottom: 6 }}>
                          <pre style={{ background: '#0D1117', borderRadius: 8, padding: '10px 50px 10px 14px', fontSize: 11, color: '#79C0FF', fontFamily: 'ui-monospace, monospace', lineHeight: 1.6, margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{cmd}</pre>
                          <CopyBtn text={cmd} />
                        </div>
                      ))}
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                    <button onClick={() => setDone(prev => { const n = new Set(prev); isDone ? n.delete(issue.id) : n.add(issue.id); return n })}
                      style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: isDone ? C.green : C.white, color: isDone ? 'white' : C.gray600, border: `1px solid ${isDone ? C.green : C.gray300}`, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .2s' }}>
                      {isDone ? <>{icons.check('white', 12)} Appliqué</> : 'Marquer comme corrigé'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Loading view ─────────────────────────────────────────────────────────────
function LoadingView({ phase, url }: { phase: string; url: string }) {
  const steps = [
    { label: 'Scan de la page',     sub: 'DOM · cookies · réseau · scripts' },
    { label: 'Données plateformes', sub: 'GA4 · Google Ads · Meta' },
    { label: 'Analyse IA',          sub: '30+ vérifications RGPD & tracking' },
  ]
  const active = phase === 'scanning' ? 0 : 2

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '72px 24px', textAlign: 'center' }}>
      {/* Pulsing logo */}
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.blueLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 16, border: `2px solid ${C.blue}`, animation: 'pulse 1.5s ease infinite' }} />
        {icons.search(C.blue, 24)}
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.gray900, marginBottom: 6 }}>Analyse en cours</h2>
      <p style={{ fontSize: 13, color: C.gray400, marginBottom: 36, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{url}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => {
          const isActive = i === active
          const isDone = i < active
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', background: isActive ? C.blueLight : isDone ? C.greenLight : C.gray50, border: `1px solid ${isActive ? '#BFDBFE' : isDone ? '#A7F3D0' : C.gray200}`, borderRadius: 10, textAlign: 'left', transition: 'all .4s' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isDone ? C.green : isActive ? C.blue : C.gray300, transition: 'all .4s' }}>
                {isDone ? icons.check('white', 13)
                  : isActive ? <div style={{ width: 10, height: 10, border: '2px solid rgba(255,255,255,.4)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  : <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{i+1}</span>}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: isDone ? '#065F46' : isActive ? C.blue : C.gray400, margin: 0 }}>{step.label}</p>
                <p style={{ fontSize: 11, color: isActive ? '#93C5FD' : C.gray400, margin: 0 }}>{step.sub}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<'idle'|'scanning'|'analyzing'|'done'|'error'>('idle')
  const [phaseMsg, setPhaseMsg] = useState('')
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'audit'|'fixes'|'platforms'>('audit')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [modalCheck, setModalCheck] = useState<CheckResult | null>(null)
  const [connections, setConnections] = useState<{ google?: { accessToken: string; propertyName?: string; measurementId?: string }; meta?: { accessToken: string; pixelName?: string } }>(() => {
    try { return JSON.parse(sessionStorage.getItem('trackaudit_connections') || '{}') } catch { return {} }
  })

  useEffect(() => { try { sessionStorage.setItem('trackaudit_connections', JSON.stringify(connections)) } catch {} }, [connections])

  useEffect(() => {
    if (typeof window === 'undefined') return
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

  useEffect(() => {
    const handle = async (bd: any) => {
      if (!bd || bd._source !== 'browser') return
      setUrl(bd.url || ''); setPhase('scanning'); setError(''); setReport(null)
      try {
        const s = await (await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ browserData: bd }) })).json()
        if (!s.success) throw new Error(s.error)
        setPhase('analyzing')
        let pd: PlatformData | undefined, gtm: GTMData | undefined
        const scannedGtmIds = (s.data?.gtmContainers || []).filter((id: string) => id.startsWith('GTM-'))
        if (connections.google?.accessToken) try { const r = await (await fetch('/api/google/ga4', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: connections.google.accessToken, scannedContainerIds: scannedGtmIds }) })).json(); if (r.success) { pd = { ...pd, ga4: r.ga4, googleAds: r.googleAds }; if (r.gtm) gtm = r.gtm } } catch {}
        if (connections.meta?.accessToken) try { const r = await (await fetch('/api/meta/pixel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: connections.meta.accessToken }) })).json(); if (r.success) pd = { ...pd, meta: r.meta } } catch {}
        const a = await (await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scanData: s.data, platformData: pd, gtmData: gtm }) })).json()
        if (!a.success) throw new Error(a.error)
        setReport(a.report); setPhase('done')
      } catch (e: any) { setError(e.message); setPhase('error') }
    }
    ;(window as any).__trackaudit = handle
    return () => { delete (window as any).__trackaudit }
  }, [connections])

  const connectGoogle = async () => { const r = await (await fetch('/api/google')).json(); window.location.href = r.authUrl }
  const connectMeta   = async () => { const r = await (await fetch('/api/meta')).json();   window.location.href = r.authUrl }

  const runAudit = useCallback(async () => {
    if (!url.trim()) return
    setPhase('scanning'); setPhaseMsg('Scan DOM, cookies, réseau...'); setError(''); setReport(null)
    try {
      const s = await (await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) })).json()
      if (!s.success) throw new Error(s.error)
      setPhase('analyzing'); setPhaseMsg('Analyse IA...')
      let pd: PlatformData | undefined, gtm: GTMData | undefined
      const scannedGtmIds = (s.data?.gtmContainers || []).filter((id: string) => id.startsWith('GTM-'))
      if (connections.google?.accessToken) try { const r = await (await fetch('/api/google/ga4', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: connections.google.accessToken, scannedContainerIds: scannedGtmIds }) })).json(); if (r.success) { pd = { ...pd, ga4: r.ga4, googleAds: r.googleAds }; if (r.gtm) gtm = r.gtm } } catch {}
      if (connections.meta?.accessToken) try { const r = await (await fetch('/api/meta/pixel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: connections.meta.accessToken }) })).json(); if (r.success) pd = { ...pd, meta: r.meta } } catch {}
      const a = await (await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scanData: s.data, platformData: pd, gtmData: gtm }) })).json()
      if (!a.success) throw new Error(a.error)
      setReport(a.report); setPhase('done')
    } catch (e: any) { setError(e.message); setPhase('error') }
  }, [url, connections])

  const checks = report?.checks || []
  const categories = [...new Set(checks.map(c => c.category))]
  const failCount = checks.filter(c => c.status === 'fail').length
  const warnCount = checks.filter(c => c.status === 'warn').length
  const okCount = checks.filter(c => c.status === 'ok').length
  const isLoading = phase === 'scanning' || phase === 'analyzing'
  const showHero = phase === 'idle' || phase === 'error'

  return (
    <div style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif', minHeight: '100vh', background: C.gray50, display: 'flex', flexDirection: 'column' }}>

      {/* ── TOP BAR ───────────────────────────────────────────────────────── */}
      <header style={{ background: C.white, borderBottom: `1px solid ${C.gray200}`, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 0 rgba(0,0,0,.05)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 30, height: 30, background: C.blue, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {icons.search('white', 15)}
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.gray900, letterSpacing: '-0.03em' }}>TrackAudit</span>
            <span style={{ padding: '2px 8px', background: C.blueLight, color: C.blue, fontSize: 10, fontWeight: 700, borderRadius: 4, letterSpacing: '.03em' }}>BETA</span>
          </div>

          {phase === 'done' && report && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, margin: '0 24px' }}>
              <div style={{ flex: 1, maxWidth: 400, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 8 }}>
                {icons.search(C.gray400, 14)}
                <span style={{ fontSize: 12, color: C.gray500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
              </div>
              <button onClick={() => { setPhase('idle'); setReport(null) }} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: C.white, color: C.gray600, border: `1px solid ${C.gray200}`, borderRadius: 7, cursor: 'pointer' }}>
                Nouvel audit
              </button>
            </div>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Google chip */}
            <button onClick={connectGoogle} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', background: connections.google ? C.greenLight : C.white, border: `1px solid ${connections.google ? '#A7F3D0' : C.gray200}`, borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: connections.google ? '#065F46' : C.gray600, transition: 'all .15s' }}>
              <GoogleLogo size={14} />
              <span>Google</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: connections.google ? C.green : C.gray300 }} />
            </button>
            {/* Meta chip */}
            <button onClick={connectMeta} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', background: connections.meta ? C.greenLight : C.white, border: `1px solid ${connections.meta ? '#A7F3D0' : C.gray200}`, borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: connections.meta ? '#065F46' : C.gray600, transition: 'all .15s' }}>
              <MetaLogo size={14} />
              <span>Meta</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: connections.meta ? C.green : C.gray300 }} />
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      {showHero && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px' }}>
          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', background: C.blueLight, borderRadius: 20, marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, animation: 'pulse 2s ease infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>Diagnostic complet en ~60 secondes</span>
          </div>

          <h1 style={{ fontSize: 42, fontWeight: 800, color: C.gray900, letterSpacing: '-0.04em', textAlign: 'center', lineHeight: 1.15, marginBottom: 14 }}>
            Auditez votre tracking
          </h1>
          <p style={{ fontSize: 15, color: C.gray500, textAlign: 'center', lineHeight: 1.7, maxWidth: 500, marginBottom: 40 }}>
            RGPD · Consent Mode v2 · GA4 · Google Ads<br/>Enhanced Conversions · Meta CAPI · Advanced Matching
          </p>

          {/* Search bar — style Google / Meta */}
          <div style={{ width: '100%', maxWidth: 580 }}>
            <div style={{ display: 'flex', alignItems: 'center', background: C.white, border: `1.5px solid ${C.gray200}`, borderRadius: 12, padding: '6px 6px 6px 16px', boxShadow: '0 4px 20px rgba(0,0,0,.08)', transition: 'border-color .15s', gap: 8 }}>
              {icons.search(C.gray400, 18)}
              <input
                value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && runAudit()}
                placeholder="https://votre-site.com"
                style={{ flex: 1, fontSize: 15, border: 'none', outline: 'none', color: C.gray900, background: 'transparent', padding: '6px 0' }}
              />
              <button onClick={runAudit} disabled={!url.trim()} style={{ padding: '10px 22px', fontSize: 14, fontWeight: 700, background: url.trim() ? C.blue : C.gray200, color: url.trim() ? 'white' : C.gray400, border: 'none', borderRadius: 8, cursor: url.trim() ? 'pointer' : 'not-allowed', transition: 'all .15s', whiteSpace: 'nowrap', letterSpacing: '-.01em' }}>
                Lancer l'audit
              </button>
            </div>

            {/* Connection hint */}
            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: C.gray400 }}>
              {!connections.google && !connections.meta ? (
                <>Connectez{' '}
                  <button onClick={connectGoogle} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Google</button>
                  {' '}et{' '}
                  <button onClick={connectMeta} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Meta</button>
                  {' '}pour un audit enrichi avec vos données réelles
                </>
              ) : (
                <span style={{ color: C.green, fontWeight: 500 }}>
                  {icons.check(C.green, 12)}{' '}
                  {[connections.google && 'Google', connections.meta && 'Meta'].filter(Boolean).join(' · ')} connecté — audit enrichi activé
                </span>
              )}
            </div>

            {error && (
              <div style={{ marginTop: 14, display: 'flex', gap: 10, padding: '12px 14px', background: C.redLight, border: `1px solid #FECACA`, borderRadius: 8, fontSize: 13, color: C.red }}>
                {icons.warn(C.red, 16)}<span>{error}</span>
              </div>
            )}
          </div>

          {/* Feature pills */}
          <div style={{ display: 'flex', gap: 8, marginTop: 44, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['RGPD & ePrivacy', 'Consent Mode v2', 'GA4 / GTM', 'Google Ads EC', 'Meta CAPI', 'Advanced Matching', 'Déduplication'].map(f => (
              <span key={f} style={{ padding: '5px 12px', background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 20, fontSize: 11, fontWeight: 500, color: C.gray500 }}>{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── LOADING ───────────────────────────────────────────────────────── */}
      {isLoading && (
        <div style={{ flex: 1, background: C.white }}>
          <LoadingView phase={phase} url={url} />
        </div>
      )}

      {/* ── RESULTS ───────────────────────────────────────────────────────── */}
      {phase === 'done' && report && (
        <div className="animate-in" style={{ flex: 1 }}>

          {/* Score bar */}
          <div style={{ background: C.white, borderBottom: `1px solid ${C.gray200}` }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px 0' }}>

              {/* Scores row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 28, flexWrap: 'wrap', marginBottom: 18 }}>
                {/* Global */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <ScoreRing score={report.score.global} size={80} />
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: C.gray400, textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 4px' }}>Score global</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: C.gray900, maxWidth: 280, lineHeight: 1.4, margin: '0 0 6px' }}>{report.aiSummary.headline}</p>
                    {report.aiSummary.estimated_data_loss && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.red, fontWeight: 500 }}>
                        {icons.warn(C.red, 12)} {report.aiSummary.estimated_data_loss}
                      </div>
                    )}
                  </div>
                </div>

                {/* Category scores */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'flex-start' }}>
                  {[
                    { label: 'Consentement', score: report.score.consent,     icon: icons.shield },
                    { label: 'Mesure',        score: report.score.measurement, icon: icons.chart  },
                    { label: 'Conversions',   score: report.score.conversion,  icon: icons.bolt   },
                    { label: 'Confidentialité',score: report.score.privacy,    icon: icons.shield },
                  ].map((s, i) => {
                    const color = s.score >= 75 ? C.green : s.score >= 50 ? C.yellow : C.red
                    return (
                      <div key={i} style={{ padding: '10px 14px', background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 10, minWidth: 90, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>{s.score}</div>
                        <div style={{ height: 3, background: C.gray200, borderRadius: 2, marginBottom: 6 }}>
                          <div style={{ height: '100%', width: `${s.score}%`, background: color, borderRadius: 2, transition: 'width 1.2s cubic-bezier(.4,0,.2,1)' }} />
                        </div>
                        <div style={{ fontSize: 10, color: C.gray500, fontWeight: 500 }}>{s.label}</div>
                      </div>
                    )
                  })}
                  {/* Status counts */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '10px 0' }}>
                    {[
                      { n: okCount,    color: C.green,  label: 'OK'    },
                      { n: warnCount,  color: C.yellow, label: 'Warn'  },
                      { n: failCount,  color: C.red,    label: 'Fail'  },
                    ].map((s, i) => (
                      <div key={i} style={{ padding: '6px 10px', background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 8, textAlign: 'center', minWidth: 48 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.n}</div>
                        <div style={{ fontSize: 9, color: C.gray400, marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI chips */}
              {(report.aiSummary.priority_issues?.length > 0 || report.aiSummary.quick_wins?.length > 0) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {report.aiSummary.priority_issues?.slice(0, 2).map((issue, i) => (
                    <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 12px', background: C.redLight, border: `1px solid #FECACA`, borderRadius: 20, color: C.red }}>
                      {icons.warn(C.red, 11)} {issue}
                    </div>
                  ))}
                  {report.aiSummary.quick_wins?.slice(0, 1).map((win, i) => (
                    <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 12px', background: C.greenLight, border: `1px solid #A7F3D0`, borderRadius: 20, color: C.green }}>
                      {icons.check(C.green, 11)} {win}
                    </div>
                  ))}
                </div>
              )}

              {/* Tabs */}
              <div style={{ display: 'flex' }}>
                {([
                  ['audit',     `Résultats`,           checks.length],
                  ['fixes',     `Plan de correction`,   failCount + warnCount],
                  ['platforms', `Plateformes`,          null],
                ] as const).map(([id, label, count]) => (
                  <button key={id} onClick={() => setActiveTab(id)} style={{ padding: '10px 20px', fontSize: 13, fontWeight: activeTab === id ? 700 : 400, color: activeTab === id ? C.blue : C.gray500, background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === id ? C.blue : 'transparent'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'all .12s' }}>
                    {label}
                    {count !== null && count > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: activeTab === id ? C.blue : C.gray100, color: activeTab === id ? 'white' : C.gray500 }}>{count}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tab content */}
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px' }}>

            {/* ─ AUDIT ─ */}
            {activeTab === 'audit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {categories.map((cat: string) => {
                  const cc = checks.filter(c => c.category === cat)
                  const fail = cc.filter(c => c.status === 'fail').length
                  const ok = cc.filter(c => c.status === 'ok').length
                  const isOpen = openSections[cat] !== false
                  const meta = CAT_META[cat]
                  return (
                    <div key={cat} style={{ background: C.white, border: `1px solid ${fail > 0 ? '#FECACA' : C.gray200}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
                      <div onClick={() => setOpenSections(p => ({ ...p, [cat]: !p[cat] }))} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', cursor: 'pointer', borderBottom: isOpen ? `1px solid ${C.gray100}` : 'none' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta?.color || C.gray400, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.gray900 }}>{meta?.label || cat}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {fail > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: C.redLight, color: C.red, padding: '2px 9px', borderRadius: 20 }}>{fail} échec{fail > 1 ? 's' : ''}</span>}
                          <span style={{ fontSize: 11, fontWeight: 600, background: ok === cc.length ? C.greenLight : C.gray100, color: ok === cc.length ? '#065F46' : C.gray500, padding: '2px 9px', borderRadius: 20 }}>{ok}/{cc.length}</span>
                          <span style={{ color: C.gray300 }}>{isOpen ? icons.chevU(C.gray400) : icons.chevD(C.gray400)}</span>
                        </div>
                      </div>
                      {isOpen && cc.map(c => <CheckRow key={c.id} check={c} onOpen={c => setModalCheck(c)} />)}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ─ FIXES ─ */}
            {activeTab === 'fixes' && <FixPlan checks={checks} />}

            {/* ─ PLATFORMS ─ */}
            {activeTab === 'platforms' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
                {/* Google */}
                <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
                  <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.gray100}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: C.blueLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><GoogleLogo size={20} /></div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.gray900, margin: 0 }}>Google</p>
                      <p style={{ fontSize: 11, color: C.gray400, margin: 0 }}>GA4 · Google Ads · GTM</p>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: connections.google ? C.green : C.gray300 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: connections.google ? C.green : C.gray400 }}>{connections.google ? 'Connecté' : 'Non connecté'}</span>
                    </div>
                  </div>
                  <div style={{ padding: '16px 20px' }}>
                    {connections.google ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {connections.google.propertyName && <div style={{ padding: '8px 12px', background: C.gray50, borderRadius: 7, fontSize: 12, color: C.gray700 }}>GA4 : <strong>{connections.google.propertyName}</strong></div>}
                        {connections.google.measurementId && <div style={{ padding: '8px 12px', background: C.gray50, borderRadius: 7, fontSize: 11, color: C.gray500, fontFamily: 'ui-monospace, monospace' }}>{connections.google.measurementId}</div>}
                        {report.platformData?.ga4 && <div style={{ padding: '8px 12px', background: C.greenLight, borderRadius: 7, fontSize: 12, color: '#065F46', display: 'flex', alignItems: 'center', gap: 6 }}>{icons.check('#065F46', 12)} {report.platformData.ga4.conversionEvents.length} conversions configurées</div>}
                      </div>
                    ) : (
                      <button onClick={connectGoogle} style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 600, background: C.blueLight, color: C.blue, border: `1px solid #BFDBFE`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <GoogleLogo size={15} /> Connecter Google
                      </button>
                    )}
                  </div>
                </div>

                {/* Meta */}
                <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
                  <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.gray100}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: '#E7F0FD', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MetaLogo size={22} /></div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.gray900, margin: 0 }}>Meta</p>
                      <p style={{ fontSize: 11, color: C.gray400, margin: 0 }}>Pixel · CAPI · Advanced Matching</p>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: connections.meta ? C.green : C.gray300 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: connections.meta ? C.green : C.gray400 }}>{connections.meta ? 'Connecté' : 'Non connecté'}</span>
                    </div>
                  </div>
                  <div style={{ padding: '16px 20px' }}>
                    {connections.meta ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {connections.meta.pixelName && <div style={{ padding: '8px 12px', background: C.gray50, borderRadius: 7, fontSize: 12, color: C.gray700 }}>Pixel : <strong>{connections.meta.pixelName}</strong></div>}
                        {report.platformData?.meta && (
                          <>
                            <div style={{ padding: '8px 12px', background: report.platformData.meta.advancedMatchingEnabled ? C.greenLight : C.redLight, borderRadius: 7, fontSize: 12, color: report.platformData.meta.advancedMatchingEnabled ? '#065F46' : C.red, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {report.platformData.meta.advancedMatchingEnabled ? icons.check('#065F46', 12) : icons.x(C.red, 12)} Advanced Matching : {report.platformData.meta.advancedMatchingEnabled ? 'Actif' : 'Inactif'}
                            </div>
                            <div style={{ padding: '8px 12px', background: report.platformData.meta.capiConnected ? C.greenLight : C.redLight, borderRadius: 7, fontSize: 12, color: report.platformData.meta.capiConnected ? '#065F46' : C.red, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {report.platformData.meta.capiConnected ? icons.check('#065F46', 12) : icons.x(C.red, 12)} CAPI : {report.platformData.meta.capiConnected ? 'Connectée' : 'Non connectée'}
                            </div>
                            {report.platformData.meta.matchRate && <div style={{ padding: '8px 12px', background: C.gray50, borderRadius: 7, fontSize: 12, color: C.gray600 }}>Match rate : <strong style={{ color: C.gray900 }}>{report.platformData.meta.matchRate}%</strong></div>}
                          </>
                        )}
                      </div>
                    ) : (
                      <button onClick={connectMeta} style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 600, background: '#E7F0FD', color: '#0C5CC7', border: `1px solid #BFDBFE`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <MetaLogo size={16} /> Connecter Meta
                      </button>
                    )}
                  </div>
                </div>

                {['TikTok Ads', 'LinkedIn Ads'].map(name => (
                  <div key={name} style={{ background: C.gray50, border: `1px dashed ${C.gray200}`, borderRadius: 12, padding: '28px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.gray400, margin: 0 }}>{name}</p>
                    <span style={{ fontSize: 11, padding: '3px 10px', background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 20, color: C.gray400 }}>Prochainement</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {modalCheck && <CheckModal check={modalCheck} onClose={() => setModalCheck(null)} onGoFix={() => { setActiveTab('fixes'); setModalCheck(null) }} />}
    </div>
  )
}
